import { validateAuth, verifyWebhookSignature } from '@lib/auth';

const clientPromise = require('@lib/valkey');
const { randomUUID } = require('crypto');

// ============================================================================
// UNITY CLOUD BUILD JOBS API ROUTE
// ============================================================================
// Handles job submission from Unity Cloud Build webhooks
// Matches build targets to UnityCloudMappings and creates distribution jobs
//
// Authentication Methods:
//   - Standard API key/JWT via validateAuth()
//   - HMAC-SHA256 signature verification (for Unity Cloud webhooks)
//
// Supported Methods:
//   - POST: Submit a new job from Unity Cloud Build webhook
// ============================================================================

export default async function handler(req, res) {
  // ========================================================================
  // Authentication & Verification
  // ========================================================================
  
  // For POST requests from Unity Cloud webhooks, verify HMAC signature
  // Otherwise use standard API authentication
  if (req.method === 'POST') {
    const signature = req.headers['x-signature'];
    const secret = process.env.UNITY_CLOUD_WEBHOOK_SECRET;

    // If webhook secret is configured and signature provided, verify it
    if (secret && signature) {
      // Get raw body for signature verification
      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      
      if (!verifyWebhookSignature(rawBody, signature, secret)) {
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
    } else if (!validateAuth(req)) {
      // Fall back to standard auth if not a webhook request
      return res.status(401).json({ error: 'Invalid or missing authentication' });
    }
  } else if (!validateAuth(req)) {
    // Standard auth for non-POST methods
    return res.status(401).json({ error: 'Invalid or missing authentication' });
  }

  const client = await clientPromise;

  // ========================================================================
  // POST - Submit a new job from Unity Cloud Build webhook
  // ========================================================================
  if (req.method === 'POST') {
    // The entire Unity Cloud Build webhook payload
    const payload = req.body || {};
    
    // Extract key fields from webhook
    const { buildTargetName, buildNumber, platform } = payload;

    // Input Validation
    const errors = [];
    if (!buildTargetName || typeof buildTargetName !== 'string') {
      errors.push('buildTargetName is required');
    }
    if (buildNumber === undefined || typeof buildNumber !== 'number') {
      errors.push('buildNumber is required');
    }
    if (!platform || typeof platform !== 'string') {
      errors.push('platform is required');
    }

    if (errors.length) {
      return res.status(400).json({ errors });
    }

    // ====================================================================
    // Find matching UnityCloudMapping
    // ====================================================================
    try {
      const mappingsRaw = await client.lrange('unity:cloud:mappings', 0, -1);
      const mappings = mappingsRaw.map(m => JSON.parse(m));
      
      // Find mapping with matching build_target
      const mapping = mappings.find(m => m.build_target === buildTargetName);
      
      if (!mapping) {
        console.log(`[Unity Cloud] No mapping found for build target: ${buildTargetName}`);
        return res.status(404).json({ error: `No mapping found for build target: ${buildTargetName}` });
      }

      console.log(`[Unity Cloud] Found mapping for ${buildTargetName}:`, mapping);

      // ====================================================================
      // Validate and collect channels
      // ====================================================================
      
      const steamChannelsRaw = await client.lrange('steam:channels', 0, -1);
      const cdnChannelsRaw = await client.lrange('cdn:channels', 0, -1);
      
      const steamChannels = steamChannelsRaw.map(ch => JSON.parse(ch));
      const cdnChannels = cdnChannelsRaw.map(ch => JSON.parse(ch));

      const foundSteamChannels = [];
      for (const label of mapping.steam_channel_labels || []) {
        const channel = steamChannels.find(ch => ch.label === label);
        if (channel) {
          foundSteamChannels.push(channel);
        } else {
          errors.push(`Steam channel with label "${label}" not found`);
        }
      }

      const foundCdnChannels = [];
      for (const label of mapping.cdn_channel_labels || []) {
        const channel = cdnChannels.find(ch => ch.label === label);
        if (channel) {
          foundCdnChannels.push(channel);
        } else {
          errors.push(`CDN channel with label "${label}" not found`);
        }
      }

      if (errors.length) {
        return res.status(400).json({ errors });
      }

      // ====================================================================
      // Create Job Object
      // ====================================================================
      
      const newJob = {
        id: randomUUID(),
        source: "unity-cloud",
        project: mapping.project,
        description: mapping.description || `Build ${buildNumber}`,
        platform: platform,
        status: 'Queued',
        buildStep: 'Waiting for worker assignment.',
        createdAt: new Date().toISOString(),
        completedAt: null,
        steam_channel_labels: mapping.steam_channel_labels,
        steam_channels: foundSteamChannels,
        cdn_channel_labels: mapping.cdn_channel_labels,
        cdn_channels: foundCdnChannels,
        metadata: payload, // Store entire webhook payload as metadata
      };

      // Persist job to Valkey queue
      await client.lpush('queued_jobs', JSON.stringify(newJob));
      
      console.log(`[Unity Cloud] Job created: ${newJob.id}`);

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
        steam_channel_labels: newJob.steam_channel_labels,
        cdn_channel_labels: newJob.cdn_channel_labels,
      };

      return res.status(201).json({ job: jobResponse });
    } catch (err) {
      console.error('Error creating Unity Cloud job:', err);
      return res.status(500).json({ error: 'Failed to create job' });
    }
  }

  // ========================================================================
  // Method Not Allowed
  // ========================================================================
  res.setHeader('Allow', ['POST'])
  res.status(405).end(`Method ${req.method} Not Allowed`)
}
