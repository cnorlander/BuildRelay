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

// Middleware to capture raw body for webhook signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk.toString();
    });
    req.on('end', () => {
      resolve(data);
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  // ========================================================================
  // Authentication & Verification
  // ========================================================================
  
  console.log('[Unity Cloud] Request received', { method: req.method, hasAuth: !!req.headers['authorization'] });
  
  // For POST requests from Unity Cloud webhooks, verify HMAC signature
  // Otherwise use standard API authentication
  if (req.method === 'POST') {
    const authHeader = req.headers['authorization'];
    const secret = process.env.UNITY_CLOUD_WEBHOOK_SECRET;

    console.log('[Unity Cloud] Secret configured:', !!secret);
    console.log('[Unity Cloud] Auth header:', authHeader?.substring(0, 50));

    // If webhook secret is configured and authorization header provided, verify it
    if (secret && authHeader) {
      console.log('[Unity Cloud] Verifying webhook signature...');
      // Capture raw body for signature verification
      const rawBody = await getRawBody(req);
      
      console.log('[Unity Cloud] Raw body length:', rawBody.length);
      console.log('[Unity Cloud] Raw body sample:', rawBody.substring(0, 100));
      
      if (!verifyWebhookSignature(rawBody, authHeader, secret)) {
        console.log('[Unity Cloud] Signature verification failed');
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
      
      // Parse the body for use in the rest of the handler
      try {
        req.body = JSON.parse(rawBody);
      } catch (err) {
        return res.status(400).json({ error: 'Invalid JSON' });
      }
    } else if (!validateAuth(req)) {
      // Fall back to standard auth if not a webhook request
      console.log('[Unity Cloud] Falling back to standard auth');
      return res.status(401).json({ error: 'Invalid or missing authentication' });
    } else {
      console.log('[Unity Cloud] Standard auth passed');
      // Parse body for standard auth requests
      try {
        const rawBody = await getRawBody(req);
        req.body = JSON.parse(rawBody);
      } catch (err) {
        return res.status(400).json({ error: 'Invalid JSON' });
      }
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
        ingestPath: null, // Will be set by worker after downloading artifact
        absoluteIngestPath: null, // Will be set by worker after downloading artifact
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
