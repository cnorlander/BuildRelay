import { validateAuth } from '@lib/auth';

const clientPromise = require('@lib/valkey');
const { randomUUID } = require('crypto');

// ============================================================================
// UNITY CLOUD MAPPINGS API ROUTE
// ============================================================================
// Manages UnityCloudMapping objects that link build targets to channels
// Each mapping specifies which Steam and CDN channels a build target uploads to
//
// Supported Methods:
//   - GET: Retrieve all mappings
//   - POST: Create a new mapping
// ============================================================================

export default async function handler(req, res) {
  // ========================================================================
  // Authentication
  // ========================================================================
  
  if (!validateAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = await clientPromise;

  // ========================================================================
  // GET - Retrieve all mappings
  // ========================================================================
  if (req.method === 'GET') {
    try {
      const mappingsRaw = await client.lrange('unity:cloud:mappings', 0, -1);
      const mappings = mappingsRaw.map(m => JSON.parse(m));
      return res.status(200).json({ mappings });
    } catch (err) {
      console.error('Error fetching mappings:', err);
      return res.status(500).json({ error: 'Failed to fetch mappings' });
    }
  }

  // ========================================================================
  // POST - Create a new mapping
  // ========================================================================
  if (req.method === 'POST') {
    const { build_target, project, description, steam_channel_labels, cdn_channel_labels } = req.body || {};

    // Input Validation
    const errors = [];
    if (!build_target || typeof build_target !== 'string' || build_target.trim().length < 1) {
      errors.push('build_target must be a non-empty string');
    }
    if (!project || typeof project !== 'string' || project.trim().length < 1) {
      errors.push('project must be a non-empty string');
    }
    if (description && typeof description !== 'string') {
      errors.push('description must be a string');
    }
    if (!Array.isArray(steam_channel_labels)) {
      errors.push('steam_channel_labels must be an array');
    }
    if (!Array.isArray(cdn_channel_labels)) {
      errors.push('cdn_channel_labels must be an array');
    }

    if (errors.length) {
      return res.status(400).json({ errors });
    }

    try {
      // Check for duplicate build_target
      const mappingsRaw = await client.lrange('unity:cloud:mappings', 0, -1);
      const mappings = mappingsRaw.map(m => JSON.parse(m));
      
      if (mappings.some(m => m.build_target === build_target.trim())) {
        return res.status(400).json({ errors: ['build_target must be unique'] });
      }

      // Validate channels exist
      const steamChannelsRaw = await client.lrange('steam:channels', 0, -1);
      const cdnChannelsRaw = await client.lrange('cdn:channels', 0, -1);
      
      const steamChannels = steamChannelsRaw.map(ch => JSON.parse(ch));
      const cdnChannels = cdnChannelsRaw.map(ch => JSON.parse(ch));

      for (const label of steam_channel_labels) {
        if (!steamChannels.find(ch => ch.label === label)) {
          errors.push(`Steam channel with label "${label}" not found`);
        }
      }

      for (const label of cdn_channel_labels) {
        if (!cdnChannels.find(ch => ch.label === label)) {
          errors.push(`CDN channel with label "${label}" not found`);
        }
      }

      if (errors.length) {
        return res.status(400).json({ errors });
      }

      // Create mapping
      const newMapping = {
        id: randomUUID(),
        build_target: build_target.trim(),
        project: project.trim(),
        description: description ? description.trim() : null,
        steam_channel_labels,
        cdn_channel_labels,
        createdAt: new Date().toISOString(),
      };

      await client.lpush('unity:cloud:mappings', JSON.stringify(newMapping));
      return res.status(201).json({ mapping: newMapping });
    } catch (err) {
      console.error('Error creating mapping:', err);
      return res.status(500).json({ error: 'Failed to create mapping' });
    }
  }

  // ========================================================================
  // Method Not Allowed
  // ========================================================================
  res.setHeader('Allow', ['GET', 'POST'])
  res.status(405).end(`Method ${req.method} Not Allowed`)
}
