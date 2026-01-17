import { validateAuth } from '@lib/auth';
const clientPromise = require('@lib/valkey');
const { randomUUID } = require('crypto');

// ============================================================================
// STEAM CHANNELS API ROUTE
// ============================================================================
// Handles CRUD operations for Steam build channel configurations
// Stores Steam build metadata and depot information in Valkey (Redis)
//
// Supported Methods:
//   - GET: Retrieve all Steam channels
//   - POST: Create a new Steam channel
//   - PUT: Update an existing Steam channel
//   - DELETE: Remove a Steam channel
// ============================================================================

export default async function handler(req, res) {
  // ========================================================================
  // Authentication & Initialization
  // ========================================================================
  
  // Validate caller has either valid API key or JWT token
  if (!validateAuth(req)) {
    return res.status(401).json({ error: 'Invalid or missing authentication' });
  }

  const client = await clientPromise;
  const steamKey = 'steam:channels';

  // ========================================================================
  // GET - Retrieve all Steam channels
  // ========================================================================
  if (req.method === 'GET') {
    try {
      // Fetch all Steam channel entries from Redis list
      const steamChannels = await client.lrange(steamKey, 0, -1);
      // Parse JSON strings back to objects
      const channels = steamChannels.map(ch => JSON.parse(ch));
      return res.status(200).json({ channels });
    } catch (err) {
      console.error('Error fetching Steam channels:', err);
      return res.status(500).json({ error: 'Failed to fetch channels' });
    }
  }

  // ========================================================================
  // POST - Create a new Steam channel
  // ========================================================================
  if (req.method === 'POST') {
    // Extract and destructure channel configuration from request body
    const { label, appId, branch, depots } = req.body || {};

    // Input Validation
    const errors = [];
    if (!label || typeof label !== 'string' || label.trim().length < 1) {
      errors.push('label must be a non-empty string');
    }
    if (!appId || typeof appId !== 'string' || appId.trim().length < 1) {
      errors.push('appId must be a non-empty string');
    }
    if (branch && typeof branch !== 'string') {
      errors.push('branch must be a string');
    }
    if (!Array.isArray(depots) || depots.length === 0) {
      errors.push('depots must be a non-empty array');
    }
    if (Array.isArray(depots)) {
      for (let i = 0; i < depots.length; i++) {
        const depot = depots[i];
        if (!depot.id || typeof depot.id !== 'string' || depot.id.trim().length < 1) {
          errors.push(`depot[${i}].id must be a non-empty string`);
        }
        if (depot.path && typeof depot.path !== 'string') {
          errors.push(`depot[${i}].path must be a string`);
        }
      }
    }

    // Return validation errors if any exist
    if (errors.length) {
      return res.status(400).json({ errors });
    }

    // Create and Store New Channel
    const id = randomUUID();
    const newChannel = {
      id,
      label: label.trim(),
      appId: appId.trim(),
      branch: branch ? branch.trim() : null,
      depots: depots.map(d => ({
        id: d.id.trim(),
        path: d.path ? d.path.trim() : ''
      })),
      createdAt: new Date().toISOString(),
    };

    try {
      // Add channel to Redis list
      await client.rpush(steamKey, JSON.stringify(newChannel));
      return res.status(201).json({ channel: newChannel });
    } catch (err) {
      console.error('Error creating Steam channel:', err);
      return res.status(500).json({ error: 'Failed to create channel' });
    }
  }

  // ========================================================================
  // PUT - Update an existing Steam channel
  // ========================================================================
  if (req.method === 'PUT') {
    const { id, label, appId, branch, depots } = req.body || {};

    // Verify ID is provided
    if (!id) {
      return res.status(400).json({ error: 'ID is required' });
    }

    // Validate Update Fields
    const errors = [];
    if (label && typeof label !== 'string' || (label && label.trim().length < 1)) {
      errors.push('label must be a non-empty string');
    }
    if (appId && typeof appId !== 'string' || (appId && appId.trim().length < 1)) {
      errors.push('appId must be a non-empty string');
    }
    if (branch && typeof branch !== 'string') {
      errors.push('branch must be a string');
    }
    if (depots && (!Array.isArray(depots) || depots.length === 0)) {
      errors.push('depots must be a non-empty array if provided');
    }

    // Return validation errors if any exist
    if (errors.length) {
      return res.status(400).json({ errors });
    }

    try {
      // Find and Update Channel
      // Retrieve all channels from Redis
      const allChannels = await client.lrange(steamKey, 0, -1);
      const channels = allChannels.map(d => JSON.parse(d));
      const index = channels.findIndex(d => d.id === id);

      // Return 404 if channel not found
      if (index === -1) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      // Merge provided fields with existing channel (partial update support)
      const updatedChannel = {
        ...channels[index],
        label: label || channels[index].label,
        appId: appId || channels[index].appId,
        branch: branch !== undefined ? (branch ? branch.trim() : null) : channels[index].branch,
        depots: depots ? depots.map(d => ({
          id: d.id.trim(),
          path: d.path ? d.path.trim() : ''
        })) : channels[index].depots,
        updatedAt: new Date().toISOString(),
      };

      // Persist Updated List to Redis
      channels[index] = updatedChannel;
      // Clear and rebuild the Redis list with updated data
      await client.ltrim(steamKey, 1, 0);
      for (const ch of channels) {
        await client.rpush(steamKey, JSON.stringify(ch));
      }

      return res.status(200).json({ channel: updatedChannel });
    } catch (err) {
      console.error('Error updating Steam channel:', err);
      return res.status(500).json({ error: 'Failed to update channel' });
    }
  }

  // ========================================================================
  // DELETE - Remove a Steam channel
  // ========================================================================
  if (req.method === 'DELETE') {
    const { id } = req.body || {};

    // Verify ID is provided
    if (!id) {
      return res.status(400).json({ error: 'ID is required' });
    }

    try {
      // Find and Remove Channel
      // Retrieve all channels from Redis
      const allChannels = await client.lrange(steamKey, 0, -1);
      const channels = allChannels.map(d => JSON.parse(d));
      // Filter out the channel to be deleted
      const filtered = channels.filter(d => d.id !== id);

      // Return 404 if channel not found
      if (filtered.length === channels.length) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      // Persist Updated List to Redis
      
      // Clear and rebuild the Redis list without the deleted entry
      await client.ltrim(steamKey, 1, 0);
      for (const ch of filtered) {
        await client.rpush(steamKey, JSON.stringify(ch));
      }

      return res.status(200).json({ success: true, message: 'Channel deleted' });
    } catch (err) {
      console.error('Error deleting Steam channel:', err);
      return res.status(500).json({ error: 'Failed to delete channel' });
    }
  }

  // ========================================================================
  // Method Not Allowed
  // ========================================================================
  res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE'])
  res.status(405).end(`Method ${req.method} Not Allowed`)
}
