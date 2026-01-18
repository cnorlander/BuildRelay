import { error } from 'console';
import { validateApiKey, validateAuth } from '@lib/auth';
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

export default async function handler(req, res) {
  // ========================================================================
  // Authentication & Initialization
  // ========================================================================
  
  // Require API key or valid JWT session
  const isValidApiKey = validateApiKey(req.headers['x-api-key']);
  const isValidJwt = validateAuth(req);
  
  if (!isValidApiKey && !isValidJwt) {
    return res.status(401).json({ error: 'Invalid or missing authentication' });
  }

  const client = await clientPromise;

  // ========================================================================
  // POST - Submit a new job
  // ========================================================================
  if (req.method === 'POST') {
    // Extract job submission parameters from request body
    const { project, description, platform, ingestPath, steam_channel_labels, cdn_channel_labels } = req.body || {};

    // Input Validation
    const errors = [];
    if (!project || typeof project !== 'string' || project.trim().length < 1) {
      errors.push('project must be a non-empty string');
    }
    if (description && typeof description !== 'string') {
      errors.push('description must be a string');
    }
    if (!platform || typeof platform !== 'string' || platform.trim().length < 1) {
      errors.push('platform must be a non-empty string');
    }
    if (!ingestPath || typeof ingestPath !== 'string' || ingestPath.trim().length < 1) {
      errors.push('ingestPath must be a non-empty string');
    }
    // Enhanced path traversal protection
    if (ingestPath) {
      const trimmedPath = ingestPath.trim();
      if (trimmedPath.includes('..') || trimmedPath.startsWith('/') || trimmedPath.includes('\0') || trimmedPath.includes('~')) {
        errors.push('security error: ingestPath contains invalid characters');
      }
      // Ensure path only contains alphanumeric, hyphens, underscores, and forward slashes
      if (!/^[a-zA-Z0-9._\-/]+$/.test(trimmedPath)) {
        errors.push('security error: ingestPath contains invalid characters');
      }
    }
    if (!Array.isArray(steam_channel_labels)) {
      errors.push('steam_channel_labels must be an array');
    }
    if (!Array.isArray(cdn_channel_labels)) {
      errors.push('cdn_channel_labels must be an array');
    }
    if (!steam_channel_labels || steam_channel_labels.length === 0) {
      if (!cdn_channel_labels || cdn_channel_labels.length === 0) {
        errors.push('at least one channel label (steam or cdn) must be provided');
      }
    }

    // Verify ingest directory exists
    const absoluteIngestPath = env.BUILD_INGEST_PATH + '/' +ingestPath.trim();
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

    // ====================================================================
    // Channel Lookup & Validation
    // ====================================================================

    try {
      // Fetch all steam and cdn channels from Valkey
      const steamChannelsRaw = await client.lrange('steam:channels', 0, -1);
      const cdnChannelsRaw = await client.lrange('cdn:channels', 0, -1);
      
      const steamChannels = steamChannelsRaw.map(ch => JSON.parse(ch));
      const cdnChannels = cdnChannelsRaw.map(ch => JSON.parse(ch));

      // Validate and collect steam channels
      const foundSteamChannels = [];
      for (const label of steam_channel_labels || []) {
        const channel = steamChannels.find(ch => ch.label === label);
        if (!channel) {
          errors.push(`Steam channel with label "${label}" not found`);
        } else {
          foundSteamChannels.push(channel);
        }
      }

      // Validate and collect cdn channels
      const foundCdnChannels = [];
      for (const label of cdn_channel_labels || []) {
        const channel = cdnChannels.find(ch => ch.label === label);
        if (!channel) {
          errors.push(`CDN channel with label "${label}" not found`);
        } else {
          foundCdnChannels.push(channel);
        }
      }

      // Return channel lookup errors if any exist
      if (errors.length) {
        return res.status(400).json({ errors });
      }

      // Create Job Object
      const newJob = {
        id: randomUUID(),
        source: "filesystem",
        project: project.trim(),
        description: description ? description.trim() : null,
        platform: platform.trim(),
        status: 'Queued',
        buildStep: 'Waiting for worker assignment.',
        createdAt: new Date().toISOString(),
        completedAt: null,
        ingestPath,
        absoluteIngestPath,
        steam_channel_labels,
        steam_channels: foundSteamChannels,
        cdn_channel_labels,
        cdn_channels: foundCdnChannels,
        metadata: {}
      };

      // Persist job to Valkey queue
      await client.lpush('queued_jobs', JSON.stringify(newJob));
      
      // Return job WITHOUT channel information (security)
      const jobResponse = {
        id: newJob.id,
        source: newJob.source,
        project: newJob.project,
        description: newJob.description,
        platform: newJob.platform,
        status: newJob.status,
        buildStep: newJob.buildStep,
        createdAt: newJob.createdAt,
        ingestPath: newJob.ingestPath,
        steam_channel_labels: newJob.steam_channel_labels,
        cdn_channel_labels: newJob.cdn_channel_labels,
      };

      return res.status(201).json({ job: jobResponse });
    } catch (err) {
      console.error('Error creating job:', err);
      return res.status(500).json({ error: 'Failed to create job' });
    }
  }

  // ========================================================================
  // Method Not Allowed
  // ========================================================================
  res.setHeader('Allow', ['POST'])
  res.status(405).end(`Method ${req.method} Not Allowed`)
}
