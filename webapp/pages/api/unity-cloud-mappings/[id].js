import { validateAuth } from '@lib/auth';

const clientPromise = require('@lib/valkey');

// ============================================================================
// UNITY CLOUD MAPPING DETAIL API ROUTE
// ============================================================================
// Handles individual mapping updates and deletions
//
// Supported Methods:
//   - PUT: Update a mapping
//   - DELETE: Remove a mapping
// ============================================================================

export default async function handler(req, res) {
  // ========================================================================
  // Authentication
  // ========================================================================
  
  if (!validateAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.query;
  const client = await clientPromise;

  // ========================================================================
  // PUT - Update a mapping
  // ========================================================================
  if (req.method === 'PUT') {
    const { build_target, project, description, steam_channel_labels, cdn_channel_labels } = req.body || {};

    // Input Validation
    const errors = [];
    if (build_target !== undefined && (typeof build_target !== 'string' || build_target.trim().length < 1)) {
      errors.push('build_target must be a non-empty string');
    }
    if (project !== undefined && (typeof project !== 'string' || project.trim().length < 1)) {
      errors.push('project must be a non-empty string');
    }
    if (description !== undefined && typeof description !== 'string') {
      errors.push('description must be a string');
    }
    if (steam_channel_labels !== undefined && !Array.isArray(steam_channel_labels)) {
      errors.push('steam_channel_labels must be an array');
    }
    if (cdn_channel_labels !== undefined && !Array.isArray(cdn_channel_labels)) {
      errors.push('cdn_channel_labels must be an array');
    }

    if (errors.length) {
      return res.status(400).json({ errors });
    }

    try {
      // Fetch all mappings
      const mappingsRaw = await client.lrange('unity:cloud:mappings', 0, -1);
      const mappings = mappingsRaw.map(m => JSON.parse(m));

      // Find the mapping to update
      const mappingIndex = mappings.findIndex(m => m.id === id);
      if (mappingIndex === -1) {
        return res.status(404).json({ error: 'Mapping not found' });
      }

      const mapping = mappings[mappingIndex];

      // Check for duplicate build_target if changing it
      if (build_target && build_target.trim() !== mapping.build_target) {
        if (mappings.some(m => m.id !== id && m.build_target === build_target.trim())) {
          return res.status(400).json({ errors: ['build_target must be unique'] });
        }
      }

      // Validate channels if provided
      const steamChannelsRaw = await client.lrange('steam:channels', 0, -1);
      const cdnChannelsRaw = await client.lrange('cdn:channels', 0, -1);
      
      const steamChannels = steamChannelsRaw.map(ch => JSON.parse(ch));
      const cdnChannels = cdnChannelsRaw.map(ch => JSON.parse(ch));

      const labelsToCheck = steam_channel_labels || mapping.steam_channel_labels;
      for (const label of labelsToCheck) {
        if (!steamChannels.find(ch => ch.label === label)) {
          errors.push(`Steam channel with label "${label}" not found`);
        }
      }

      const cdnLabelsToCheck = cdn_channel_labels || mapping.cdn_channel_labels;
      for (const label of cdnLabelsToCheck) {
        if (!cdnChannels.find(ch => ch.label === label)) {
          errors.push(`CDN channel with label "${label}" not found`);
        }
      }

      if (errors.length) {
        return res.status(400).json({ errors });
      }

      // Update mapping
      const updatedMapping = {
        ...mapping,
        build_target: build_target !== undefined ? build_target.trim() : mapping.build_target,
        project: project !== undefined ? project.trim() : mapping.project,
        description: description !== undefined ? (description ? description.trim() : null) : mapping.description,
        steam_channel_labels: steam_channel_labels !== undefined ? steam_channel_labels : mapping.steam_channel_labels,
        cdn_channel_labels: cdn_channel_labels !== undefined ? cdn_channel_labels : mapping.cdn_channel_labels,
      };

      // Replace in Valkey
      mappings[mappingIndex] = updatedMapping;
      // Clear and rebuild the Redis list with updated data
      await client.ltrim('unity:cloud:mappings', 1, 0);
      for (const m of mappings) {
        await client.rpush('unity:cloud:mappings', JSON.stringify(m));
      }

      return res.status(200).json({ mapping: updatedMapping });
    } catch (err) {
      console.error('Error updating mapping:', err);
      return res.status(500).json({ error: 'Failed to update mapping' });
    }
  }

  // ========================================================================
  // DELETE - Remove a mapping
  // ========================================================================
  if (req.method === 'DELETE') {
    try {
      // Fetch all mappings
      const mappingsRaw = await client.lrange('unity:cloud:mappings', 0, -1);
      const mappings = mappingsRaw.map(m => JSON.parse(m));

      // Find and remove mapping
      const mappingIndex = mappings.findIndex(m => m.id === id);
      if (mappingIndex === -1) {
        return res.status(404).json({ error: 'Mapping not found' });
      }

      mappings.splice(mappingIndex, 1);

      // Update Valkey
      // Clear and rebuild the Redis list without the deleted entry
      await client.ltrim('unity:cloud:mappings', 1, 0);
      for (const m of mappings) {
        await client.rpush('unity:cloud:mappings', JSON.stringify(m));
      }

      return res.status(200).json({ message: 'Mapping deleted' });
    } catch (err) {
      console.error('Error deleting mapping:', err);
      return res.status(500).json({ error: 'Failed to delete mapping' });
    }
  }

  // ========================================================================
  // Method Not Allowed
  // ========================================================================
  res.setHeader('Allow', ['PUT', 'DELETE'])
  res.status(405).end(`Method ${req.method} Not Allowed`)
}
