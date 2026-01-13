import { error } from 'console';
import { stat } from "fs/promises";

const env = require('@lib/env');
const clientPromise = require('@lib/valkey'); // Import Valkey GLIDE client promise
const { randomUUID } = require('crypto');

export default async function handler(req, res) {
  const client = await clientPromise; // Await the client


  if (req.method === 'POST') {
    const { project, services, platform, ingestPath} = req.body || {};

    const errors = [];
    if (!project || typeof project !== 'string' || project.trim().length < 1) {
      errors.push('project must be a non-empty string');
    }
    if (!Array.isArray(services) || services.length === 0) {
      errors.push('services must be a non-empty array');
    }
    if (!platform || typeof platform !== 'string' || platform.trim().length < 1) {
      errors.push('platform must be a non-empty string');
    }
    if (!ingestPath || typeof ingestPath !== 'string' || ingestPath.trim().length < 1) {
      errors.push('ingestPath must be a non-empty string');
    }
    if (ingestPath && (ingestPath.includes('..') || ingestPath.startsWith('/'))) {
      errors.push('security error: ingestPath cannot be absolute or contain ".."');
    }


    const absoluteIngestPath = env.BUILD_INGEST_PATH + '/' +ingestPath.trim();
    console.log('absoluteIngestPath:', absoluteIngestPath);
    if (ingestPath) {
        try {
            const ingestPathStat = await stat(absoluteIngestPath);
            if (!ingestPathStat.isDirectory()) {
                errors.push('invalid ingestPath: directory does not exist');
            }
        } catch (err) {
            errors.push('invalid ingestPath: directory does not exist');
        }
    }


    if (errors.length) {
      return res.status(400).json({ errors });
    }

    const newJob = {
      id: randomUUID(),
      source: "filesystem",
      project: project.trim(),
      services,
      platform: platform.trim(),
      status: 'Queued',
      buildStep: 'Waiting for worker assignment.',
      createdAt: new Date().toISOString(),
      completedAt: null,
      ingestPath,
      absoluteIngestPath,
      metadata: {}
    };

    try {
      await client.lpush('queued_jobs', JSON.stringify(newJob));
      return res.status(201).json({ job: newJob });
    } catch (err) {
      console.error('Error saving job to Valkey:', err);
      return res.status(500).json({ error: 'Failed to create job' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST'])
  res.status(405).end(`Method ${req.method} Not Allowed`)
}
