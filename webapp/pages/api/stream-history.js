import { validateAuth } from '@lib/auth';
const clientPromise = require('@lib/valkey');

export default async function handler(req, res) {
  // Validate either API key or JWT
  if (!validateAuth(req)) {
    return res.status(401).json({ error: 'Invalid or missing authentication' });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const client = await clientPromise;

    // Allow specifying which stream to read from, default to test_stream
    const streamName = req.query.stream || 'test_stream';

    // Get all entries from the stream
    const result = await client.customCommand([
      'XRANGE',
      streamName,
      '-',
      '+',
      'COUNT',
      '1000' // Adjust if you have more than 1000 entries
    ]);

    const entries = [];
    
    if (result && Array.isArray(result)) {
      result.forEach((entry) => {
        if (entry && entry.key && entry.value) {
          const id = entry.key;
          const data = {};
          
          if (Array.isArray(entry.value)) {
            entry.value.forEach(([fieldName, fieldValue]) => {
              data[fieldName] = fieldValue;
            });
          }

          entries.push({
            type: 'entry',
            id: id,
            data: data,
          });
        }
      });
    }

    res.status(200).json({
      entries: entries,
      lastId: entries.length > 0 ? entries[entries.length - 1].id : '0-0',
    });
  } catch (err) {
    console.error('Stream history error:', err);
    res.status(500).json({ error: 'Failed to fetch stream history: ' + err.message });
  }
}
