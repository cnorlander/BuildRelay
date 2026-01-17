import { validateAuth } from '@lib/auth';
const clientPromise = require('@lib/valkey');

// ============================================================================
// STREAM HISTORY API ROUTE
// ============================================================================
// Handles retrieval of historical stream data
// Fetches all entries from specified stream with complete history
// Returns entries sorted chronologically with metadata
//
// Supported Methods:
//   - GET: Retrieve complete stream history for specified stream name
// ============================================================================

export default async function handler(req, res) {
  // ========================================================================
  // Authentication & Method Validation
  // ========================================================================
  
  // Validate caller has either valid API key or JWT token
  if (!validateAuth(req)) {
    return res.status(401).json({ error: 'Invalid or missing authentication' });
  }

  // Only GET method is supported
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const client = await clientPromise;

    // ========================================================================
    // Retrieve Stream History
    // ========================================================================
    
    // Extract stream name from query parameters (default: test_stream)
    const streamName = req.query.stream || 'test_stream';

    // For some reason Valkey Glide client has issues supporting XRANGE directly
    // so we use customCommand to issue raw command
    // Fetch all entries from stream using XRANGE command (- to + = entire range)
    const result = await client.customCommand([
      'XRANGE',
      streamName,
      '-',
      '+',
      'COUNT',
      '1000' // Limit to 1000 most recent entries
    ]);

    // Parse stream entries into response format
    const entries = [];
    
    // Process each entry returned from Valkey
    if (result && Array.isArray(result)) {
      result.forEach((entry) => {
        if (entry && entry.key && entry.value) {
          const id = entry.key;
          // Convert Valkey response format to object
          const data = {};
          if (Array.isArray(entry.value)) {
            entry.value.forEach(([fieldName, fieldValue]) => {
              data[fieldName] = fieldValue;
            });
          }

          // Push entry to entries array
          entries.push({
            type: 'entry',
            id: id,
            data: data,
          });
        }
      });
    }

    // Return entries with metadata
    res.status(200).json({
      entries: entries,
      lastId: entries.length > 0 ? entries[entries.length - 1].id : '0-0', // ID of last entry
    });
  } 
  // ========================================================================
  // Error Handling
  // ========================================================================
  catch (err) {
    console.error('Stream history error:', err);
    res.status(500).json({ error: 'Failed to fetch stream history: ' + err.message });
  }
}
