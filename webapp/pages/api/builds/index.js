import { validateAuth } from '@lib/auth';
import { ensureInitialized } from '@lib/init';
import { readdir, stat } from 'fs/promises';
const clientPromise = require('@lib/valkey');
const { randomUUID } = require('crypto');
const env = require('@lib/env');

export default async function handler(req, res) {

  // Validate either API key or JWT
  if (!validateAuth(req)) {
    return res.status(401).json({ error: 'Invalid or missing authentication' });
  }

  const client = await clientPromise;

  if (req.method === 'GET') {
    try {
      const buildPath = env.BUILD_INGEST_PATH;
      const files = await readdir(buildPath);

      const fileStats = await Promise.all(
        files.map(async (file) => {
          const filePath = `${buildPath}/${file}`;
          const stats = await stat(filePath);
          return {
            name: file,
            createdAt: stats.birthtime,
            modified: stats.mtime,
            size: stats.size,
            isDirectory: stats.isDirectory(),
          };
        })
      );

      // Sort by creation time, newest first
      fileStats.sort((a, b) => b.createdAt - a.createdAt);

      return res.status(200).json({ builds: fileStats });
    } catch (err) {
      console.error('Error reading builds directory:', err);
      return res.status(500).json({ error: 'Failed to read builds' });
    }
  }

  res.setHeader('Allow', ['GET'])
  res.status(405).end(`Method ${req.method} Not Allowed`)
}
