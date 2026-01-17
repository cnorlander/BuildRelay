import { error } from 'console';
import { validateApiKey } from '@lib/auth';
import { stat } from "fs/promises";

const env = require('@lib/env');
const clientPromise = require('@lib/valkey');
const { randomUUID } = require('crypto');

// ============================================================================
// FILESYSTEM JOBS API ROUTE
// ============================================================================
// Handles job submission for filesystem-based builds
// Accepts CDN and/or Steam channel configurations for build processing
// Validates all input parameters and persists jobs to Valkey queue
//
// Supported Methods:
//   - POST: Submit a new build job with CDN/Steam upload destinations
// ============================================================================

function requireApiKey(req) {
  // Extract API key from request headers
  const apiKey = req.headers['x-api-key'];
  return apiKey && validateApiKey(apiKey);
}

export default async function handler(req, res) {
  // ========================================================================
  // Authentication & Initialization
  // ========================================================================
  
  // Require API key for all requests (stricter than JWT)
  if (!requireApiKey(req)) {
    return res.status(401).json({ error: 'API key required' });
  }

  const client = await clientPromise;

  // ========================================================================
  // POST - Submit a new job
  // ========================================================================
  if (req.method === 'POST') {
    // Extract job submission parameters from request body
    const { project, services, platform, ingestPath, cdn_destination, steam_build } = req.body || {};

    // Input Validation
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
    if (cdn_destination && typeof cdn_destination !== 'object') {
      errors.push('cdn_destination must be an object');
    }
    if (steam_build && typeof steam_build !== 'object') {
      errors.push('steam_build must be an object');
    }
    if (steam_build) {
      if (!steam_build.app_id) {
        errors.push('steam_build.app_id is required');
      }
      if (!Array.isArray(steam_build.depots) || steam_build.depots.length === 0) {
        errors.push('steam_build.depots must be a non-empty array');
      }
      if (steam_build.branch && typeof steam_build.branch !== 'string') {
        errors.push('steam_build.branch must be a string');
      }
      if (steam_build.description && typeof steam_build.description !== 'string') {
        errors.push('steam_build.description must be a string');
      }
    }
    if (!cdn_destination && !steam_build) {
      errors.push('at least one channel (cdn_destination or steam_build) must be provided');
    }

    // Verify ingest directory exists
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

    // Return validation errors if any exist
    if (errors.length) {
      return res.status(400).json({ errors });
    }

    // Create Job Object
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
      cdn_destination: cdn_destination || null,
      steam_build: steam_build || null,
      metadata: {}
    };

    try {
      // Persist job to Valkey queue
      await client.lpush('queued_jobs', JSON.stringify(newJob));
      return res.status(201).json({ job: newJob });
    } catch (err) {
      console.error('Error saving job to Valkey:', err);
      return res.status(500).json({ error: 'Failed to create job' });
    }
  }

  // ========================================================================
  // Method Not Allowed
  // ========================================================================
  res.setHeader('Allow', ['POST'])
  res.status(405).end(`Method ${req.method} Not Allowed`)
}
