import { validateAuth } from '@lib/auth';
const clientPromise = require('@lib/valkey');
const streamClientPromise = require('@lib/valkey').streamClient;

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
    const client = await streamClientPromise;

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Start from the latest entries
    let startId = req.query.startId || '$';

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Connected to stream', startId: startId })}\n\n`);
    
    // Flush the response explicitly
    if (res.flush) {
      res.flush();
    }

    // Function to read and send stream entries
    const sendStreamEntries = async () => {
      try {
        // Use customCommand for raw Redis XREAD command
        const result = await client.customCommand([
          'XREAD',
          'BLOCK',
          '2000',
          'COUNT',
          '10',
          'STREAMS',
          'test_stream',
          startId
        ]);

        if (result && Array.isArray(result) && result.length > 0) {
          // Result format: [{ key: 'stream_name', value: [{ key: 'id', value: [['field', 'value'], ...] }, ...] }]
          result.forEach((streamData) => {
            if (streamData && streamData.value && Array.isArray(streamData.value)) {
              streamData.value.forEach((entry) => {
                if (entry && entry.key && entry.value) {
                  const id = entry.key;
                  startId = id;
                  
                  const data = {};
                  if (Array.isArray(entry.value)) {
                    entry.value.forEach(([fieldName, fieldValue]) => {
                      data[fieldName] = fieldValue;
                    });
                  }

                  const message = `data: ${JSON.stringify({
                    type: 'entry',
                    id: id,
                    data: data,
                  })}\n\n`;
                  
                  const writeResult = res.write(message);
                  if (res.flush) {
                    res.flush();
                  }
                }
              });
            }
          });
        }

        if (!res.destroyed) {
          setImmediate(sendStreamEntries);
        }
      } catch (err) {
        if (!res.destroyed) {
          console.error('Stream error:', err.message);
          res.write(
            `data: ${JSON.stringify({
              type: 'error',
              message: err.message,
            })}\n\n`
          );
          setTimeout(sendStreamEntries, 1000);
        }
      }
    };

    // Handle client disconnect
    req.on('close', () => {
      // Client disconnected
    });

    // Send a heartbeat every 30 seconds to keep connection alive
    const heartbeatInterval = setInterval(() => {
      if (!res.destroyed) {
        res.write(`: heartbeat\n\n`);
        if (res.flush) {
          res.flush();
        }
      }
    }, 30000);

    // Clean up interval on close
    req.on('close', () => {
      clearInterval(heartbeatInterval);
    });

    // Start reading the stream
    sendStreamEntries();
  } catch (err) {
    console.error('Stream handler error:', err);
    res.status(500).json({ error: 'Failed to connect to stream' });
  }
}
