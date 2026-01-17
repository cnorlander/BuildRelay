import { validateAuth } from '@lib/auth';
const clientPromise = require('@lib/valkey');
const streamClientPromise = require('@lib/valkey').streamClient;

// ============================================================================
// STREAM API ROUTE
// ============================================================================
// Handles Server-Sent Events (SSE) for real-time stream data delivery
// Establishes persistent connection and streams job updates as they occur
// Supports filtering by stream name and starting from specific entry ID
//
// Supported Methods:
//   - GET: Establish SSE connection and stream live job updates
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
    const client = await streamClientPromise;

    // ========================================================================
    // Configure Server-Sent Events
    // ========================================================================
    
    // Set up SSE headers for persistent connection
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Extract stream parameters from query string
    let startId = req.query.startId || '$';
    const streamName = req.query.stream;;

    // Send initial connection message to client
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Connected to stream', startId: startId })}\n\n`);
    
    // Flush the response explicitly
    if (res.flush) {
      res.flush();
    }

    // ========================================================================
    // Stream Entry Reader Loop
    // ========================================================================
    
    // Function to read and send stream entries to client
    const sendStreamEntries = async () => {
      try {
        // For some reason Valkey Glide client has issues supporting XRANGE directly
        // so we use customCommand to issue raw command
        // Use XREAD command to fetch new entries (blocks for 2 seconds)
        const result = await client.customCommand([
          'XREAD',
          'BLOCK',
          '2000',
          'COUNT',
          '10',
          'STREAMS',
          streamName,
          startId
        ]);

        // Process and send each entry to client
        if (result && Array.isArray(result) && result.length > 0) {
          // Result format: [{ key: 'stream_name', value: [{ key: 'id', value: [['field', 'value'], ...] }, ...] }]
          result.forEach((streamData) => {
            // Process each stream's data
            if (streamData && streamData.value && Array.isArray(streamData.value)) {
              streamData.value.forEach((entry) => {
                // Process each entry
                if (entry && entry.key && entry.value) {
                  const id = entry.key;
                  startId = id;
                  
                  // Convert Valkey response format to object
                  const data = {};
                  if (Array.isArray(entry.value)) {
                    entry.value.forEach(([fieldName, fieldValue]) => {
                      data[fieldName] = fieldValue;
                    });
                  }

                  // Format and send SSE message to client
                  const message = `data: ${JSON.stringify({
                    type: 'entry',
                    id: id,
                    data: data,
                  })}\n\n`;
                  
                  // Write message to SSE response
                  res.write(message);
                  if (res.flush) {
                    res.flush();
                  }
                }
              });
            }
          });
        }

        // Continue polling for new entries
        if (!res.destroyed) {
          setImmediate(sendStreamEntries);
        }
      } catch (err) {
        if (!res.destroyed) {
          console.error('Stream error:', err.message);
          // Send error event to client
          res.write(
            `data: ${JSON.stringify({
              type: 'error',
              message: err.message,
            })}\n\n`
          );
          // Retry after 1 second
          setTimeout(sendStreamEntries, 1000);
        }
      }
    };

    // ========================================================================
    // Connection Lifecycle Management
    // ========================================================================
    
    // Handle client disconnect
    req.on('close', () => {
      // Client disconnected - cleanup happens on heartbeat interval clear
    });

    // Send heartbeat every 30 seconds to keep connection alive
    const heartbeatInterval = setInterval(() => {
      if (!res.destroyed) {
        res.write(`: heartbeat\n\n`);
        if (res.flush) {
          res.flush();
        }
      }
    }, 30000);

    // Clear heartbeat interval on close
    req.on('close', () => {
      clearInterval(heartbeatInterval);
    });

    // Start reading the stream
    sendStreamEntries();
  } 
  
  // ========================================================================
  // Error Handling
  // ========================================================================
  catch (err) {
    console.error('Stream handler error:', err);
    res.status(500).json({ error: 'Failed to connect to stream' });
  }
}
