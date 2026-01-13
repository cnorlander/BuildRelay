import { validateAuth } from '@lib/auth';
const clientPromise = require('@lib/valkey');

export default async function handler(req, res) {
  console.log('Stream API: Received request');
  
  // Validate either API key or JWT
  if (!validateAuth(req)) {
    console.log('Stream API: Auth validation failed');
    console.log('Headers:', {
      'x-api-key': req.headers['x-api-key'],
      'cookie': req.headers.cookie ? 'present' : 'missing'
    });
    return res.status(401).json({ error: 'Invalid or missing authentication' });
  }

  console.log('Stream API: Auth validation passed');

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const client = await clientPromise;

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

    console.log('Stream API: Handler started, client connected');

    // Function to read and send stream entries
    const sendStreamEntries = async () => {
      try {
        console.log('XREAD: Reading from', startId);
        
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
          const entryCount = result[0].value.length;
          console.log('XREAD: Got', entryCount, 'entries');
          
          // Result format: [{ key: 'stream_name', value: [{ key: 'id', value: [['field', 'value'], ...] }, ...] }]
          result.forEach((streamData) => {
            if (streamData && streamData.value && Array.isArray(streamData.value)) {
              streamData.value.forEach((entry, idx) => {
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
                  
                  console.log('Sending entry', id, '- data keys:', Object.keys(data));
                  console.log('Writing to response:', message.length, 'bytes');
                  const writeResult = res.write(message);
                  console.log('Write result:', writeResult);
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
          console.error('Stream read error:', err.message);
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
      // Client disconnected, stream will end naturally
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
