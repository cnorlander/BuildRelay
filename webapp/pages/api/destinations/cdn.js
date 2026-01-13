import { validateAuth } from '@lib/auth';
import { ensureInitialized } from '@lib/init';
const clientPromise = require('@lib/valkey');
const { randomUUID } = require('crypto');

export default async function handler(req, res) {

  // Validate either API key or JWT
  if (!validateAuth(req)) {
    return res.status(401).json({ error: 'Invalid or missing authentication' });
  }

  const client = await clientPromise;
  const cdnKey = 'cdn:destinations';

  if (req.method === 'GET') {
    try {
      const cdnDestinations = await client.lrange(cdnKey, 0, -1);
      const destinations = cdnDestinations.map(dest => JSON.parse(dest));
      return res.status(200).json({ destinations });
    } catch (err) {
      console.error('Error fetching CDN destinations:', err);
      return res.status(500).json({ error: 'Failed to fetch destinations' });
    }
  }

  if (req.method === 'POST') {
    const { label, path, bucketName, region, accessKeyId, secretAccessKey, endpoint, filenameFormat, encryption } = req.body || {};

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

    if (errors.length) {
      return res.status(400).json({ errors });
    }

    const id = randomUUID();
    const newDestination = {
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
      createdAt: new Date().toISOString(),
    };

    try {
      await client.rpush(cdnKey, JSON.stringify(newDestination));
      return res.status(201).json({ destination: newDestination });
    } catch (err) {
      console.error('Error creating CDN destination:', err);
      return res.status(500).json({ error: 'Failed to create destination' });
    }
  }

  if (req.method === 'PUT') {
    const { id, label, path, bucketName, region, accessKeyId, secretAccessKey, endpoint, filenameFormat, encryption } = req.body || {};

    if (!id) {
      return res.status(400).json({ error: 'ID is required' });
    }

    try {
      const allDestinations = await client.lrange(cdnKey, 0, -1);
      const destinations = allDestinations.map(d => JSON.parse(d));
      const index = destinations.findIndex(d => d.id === id);

      if (index === -1) {
        return res.status(404).json({ error: 'Destination not found' });
      }

      const updatedDestination = {
        ...destinations[index],
        label: label || destinations[index].label,
        path: path || destinations[index].path,
        bucketName: bucketName || destinations[index].bucketName,
        region: region || destinations[index].region,
        accessKeyId: accessKeyId || destinations[index].accessKeyId,
        secretAccessKey: secretAccessKey || destinations[index].secretAccessKey,
        endpoint: endpoint !== undefined ? endpoint : destinations[index].endpoint,
        filenameFormat: filenameFormat || destinations[index].filenameFormat,
        encryption: encryption !== undefined ? encryption : destinations[index].encryption,
        updatedAt: new Date().toISOString(),
      };

      destinations[index] = updatedDestination;

      await client.ltrim(cdnKey, 1, 0);
      for (const dest of destinations) {
        await client.rpush(cdnKey, JSON.stringify(dest));
      }

      return res.status(200).json({ destination: updatedDestination });
    } catch (err) {
      console.error('Error updating CDN destination:', err);
      return res.status(500).json({ error: 'Failed to update destination' });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};

    if (!id) {
      return res.status(400).json({ error: 'ID is required' });
    }

    try {
      const allDestinations = await client.lrange(cdnKey, 0, -1);
      const destinations = allDestinations.map(d => JSON.parse(d));
      const filtered = destinations.filter(d => d.id !== id);

      if (filtered.length === destinations.length) {
        return res.status(404).json({ error: 'Destination not found' });
      }

      await client.ltrim(cdnKey, 1, 0);
      for (const dest of filtered) {
        await client.rpush(cdnKey, JSON.stringify(dest));
      }

      return res.status(200).json({ success: true, message: 'Destination deleted' });
    } catch (err) {
      console.error('Error deleting CDN destination:', err);
      return res.status(500).json({ error: 'Failed to delete destination' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE'])
  res.status(405).end(`Method ${req.method} Not Allowed`)
}
