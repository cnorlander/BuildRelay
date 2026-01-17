import { validateAuth } from '@lib/auth';
import { ensureInitialized } from '@lib/init';
const clientPromise = require('@lib/valkey');
const { randomUUID } = require('crypto');

// ============================================================================
// CDN CHANNELS API ROUTE
// ============================================================================
// Handles CRUD operations for CDN channel configurations
// Stores CDN channel metadata in Valkey (Redis) for job submission reference
//
// Supported Methods:
//   - GET: Retrieve all CDN channels
//   - POST: Create a new CDN channel
//   - PUT: Update an existing CDN channel
//   - DELETE: Remove a CDN channel
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
  const cdnKey = 'cdn:channels';

  // ========================================================================
  // GET - Retrieve all CDN channels
  // ========================================================================
  if (req.method === 'GET') {
    try {
      // Fetch all CDN channel entries from Redis list
      const cdnChannels = await client.lrange(cdnKey, 0, -1);
      // Parse JSON strings back to objects
      const channels = cdnChannels.map(ch => JSON.parse(ch));
      return res.status(200).json({ channels });
    } catch (err) {
      console.error('Error fetching CDN channels:', err);
      return res.status(500).json({ error: 'Failed to fetch channels' });
    }
  }

  // ========================================================================
  // POST - Create a new CDN channel
  // ========================================================================
  if (req.method === 'POST') {
    // Extract and destructure channel configuration from request body
    const { label, path, bucketName, region, accessKeyId, secretAccessKey, endpoint, filenameFormat, encryption, isPublic } = req.body || {};

    // Input Validation
    const errors = [];
    if (!label || typeof label !== 'string' || label.trim().length < 1) {
      errors.push('label must be a non-empty string');
    }
    if (!path || typeof path !== 'string' || path.trim().length < 1) {
      errors.push('path must be a non-empty string');
    }
    if (!bucketName || typeof bucketName !== 'string' || bucketName.trim().length < 1) {
      errors.push('bucketName must be a non-empty string');
    }
    if (!region || typeof region !== 'string' || region.trim().length < 1) {
      errors.push('region must be a non-empty string');
    }
    if (!accessKeyId || typeof accessKeyId !== 'string' || accessKeyId.trim().length < 1) {
      errors.push('accessKeyId must be a non-empty string');
    }
    if (!secretAccessKey || typeof secretAccessKey !== 'string' || secretAccessKey.trim().length < 1) {
      errors.push('secretAccessKey must be a non-empty string');
    }
    if (!filenameFormat || typeof filenameFormat !== 'string' || filenameFormat.trim().length < 1) {
      errors.push('filenameFormat must be a non-empty string');
    }
    if (typeof encryption !== 'boolean') {
      errors.push('encryption must be a boolean');
    }
    if (typeof isPublic !== 'boolean') {
      errors.push('isPublic must be a boolean');
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
      path: path.trim(),
      bucketName: bucketName.trim(),
      region: region.trim(),
      accessKeyId: accessKeyId.trim(),
      secretAccessKey: secretAccessKey.trim(),
      endpoint: endpoint ? endpoint.trim() : null,
      filenameFormat: filenameFormat.trim(),
      encryption: encryption,
      isPublic: isPublic,
      createdAt: new Date().toISOString(),
    };

    try {
      // Add channel to Redis list
      await client.rpush(cdnKey, JSON.stringify(newChannel));
      return res.status(201).json({ channel: newChannel });
    } catch (err) {
      console.error('Error creating CDN channel:', err);
      return res.status(500).json({ error: 'Failed to create channel' });
    }
  }

  // ========================================================================
  // PUT - Update an existing CDN channel
  // ========================================================================
  if (req.method === 'PUT') {
    const { id, label, path, bucketName, region, accessKeyId, secretAccessKey, endpoint, filenameFormat, encryption, isPublic } = req.body || {};

    // Verify ID is provided
    if (!id) {
      return res.status(400).json({ error: 'ID is required' });
    }

    // Find and Update Channel
    try {
      
      // Retrieve all channels from Redis
      const allChannels = await client.lrange(cdnKey, 0, -1);
      const channels = allChannels.map(c => JSON.parse(c));
      const index = channels.findIndex(c => c.id === id);

      // Return 404 if channel not found
      if (index === -1) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      // Merge provided fields with existing channel (partial update support)
      const updatedChannel = {
        ...channels[index],
        label: label || channels[index].label,
        path: path || channels[index].path,
        bucketName: bucketName || channels[index].bucketName,
        region: region || channels[index].region,
        accessKeyId: accessKeyId || channels[index].accessKeyId,
        secretAccessKey: secretAccessKey || channels[index].secretAccessKey,
        endpoint: endpoint !== undefined ? endpoint : channels[index].endpoint,
        filenameFormat: filenameFormat || channels[index].filenameFormat,
        encryption: encryption !== undefined ? encryption : channels[index].encryption,
        isPublic: isPublic !== undefined ? isPublic : channels[index].isPublic,
        updatedAt: new Date().toISOString(),
      };

      // Persist Updated List to Redis
      channels[index] = updatedChannel;
      // Clear and rebuild the Redis list with updated data
      await client.ltrim(cdnKey, 1, 0);
      for (const channel of channels) {
        await client.rpush(cdnKey, JSON.stringify(channel));
      }

      return res.status(200).json({ channel: updatedChannel });
    } catch (err) {
      console.error('Error updating CDN channel:', err);
      return res.status(500).json({ error: 'Failed to update channel' });
    }
  }

  // ========================================================================
  // DELETE - Remove a CDN channel
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
      const allChannels = await client.lrange(cdnKey, 0, -1);
      const channels = allChannels.map(c => JSON.parse(c));
      // Filter out the channel to be deleted
      const filtered = channels.filter(c => c.id !== id);

      // Return 404 if channel not found
      if (filtered.length === channels.length) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      // Persist Updated List to Redis
      // Clear and rebuild the Redis list without the deleted entry
      await client.ltrim(cdnKey, 1, 0);
      for (const channel of filtered) {
        await client.rpush(cdnKey, JSON.stringify(channel));
      }

      return res.status(200).json({ success: true, message: 'Channel deleted' });
    } catch (err) {
      console.error('Error deleting CDN channel:', err);
      return res.status(500).json({ error: 'Failed to delete channel' });
    }
  }

  // ========================================================================
  // Method Not Allowed
  // ========================================================================
  res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE'])
  res.status(405).end(`Method ${req.method} Not Allowed`)
}
