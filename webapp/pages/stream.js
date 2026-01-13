import { useEffect, useState } from 'react';
import Layout from '../components/Layout';

export default function StreamPage() {
  const [entries, setEntries] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [debug, setDebug] = useState('Initializing...');

  useEffect(() => {
    let abortController = null;
    let reconnectTimeout = null;

    const connectToStream = async () => {
      try {
        setDebug('Connecting...');
        abortController = new AbortController();
        
        const response = await fetch('/api/stream', {
          credentials: 'include', // Include cookies (JWT)
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        setConnected(true);
        setLoading(false);
        setError(null);
        setDebug('Connected, reading stream...');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let messageCount = 0;
        let chunkCount = 0;

        while (true) {
          const { done, value } = await reader.read();
          chunkCount++;
          
          if (done) {
            setDebug('Stream ended');
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          console.log('Chunk', chunkCount, ':', chunk.substring(0, 100), 'length:', chunk.length);
          
          buffer += chunk;
          const lines = buffer.split('\n');
          
          // Keep the last incomplete line in the buffer
          buffer = lines.pop() || '';

          console.log('Split into', lines.length, 'lines');
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            console.log('Line', i, ':', line.substring(0, 80));
            
            if (line.trim() === '') {
              continue; // Skip empty lines
            }
            
            if (line.startsWith('data: ')) {
              try {
                const jsonStr = line.slice(6);
                console.log('Parsing JSON:', jsonStr.substring(0, 100));
                const message = JSON.parse(jsonStr);
                messageCount++;
                
                setDebug(`Received ${messageCount} messages`);

                if (message.type === 'connected') {
                  console.log('Connected to stream:', message);
                  setConnected(true);
                  setLoading(false);
                  setError(null);
                  setDebug('Stream connected, waiting for entries...');
                } else if (message.type === 'entry') {
                  console.log('Received entry:', message.id);
                  setEntries((prev) => {
                    const newEntries = [message, ...prev].slice(0, 50);
                    console.log('Updated entries, total:', newEntries.length);
                    return newEntries;
                  });
                } else if (message.type === 'error') {
                  console.error('Stream error:', message.message);
                  setError(message.message);
                  setDebug('Stream error: ' + message.message);
                }
              } catch (parseErr) {
                console.error('Error parsing message:', parseErr, 'line:', line);
                setDebug('Parse error: ' + parseErr.message);
              }
            }
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          console.log('Stream connection aborted');
          return;
        }
        
        console.error('Stream connection error:', err);
        setConnected(false);
        setError(err.message || 'Connection failed');
        setDebug('Error: ' + (err.message || 'Connection failed'));
        
        // Attempt to reconnect after 3 seconds
        reconnectTimeout = setTimeout(() => {
          if (!abortController?.signal.aborted) {
            connectToStream();
          }
        }, 3000);
      }
    };

    connectToStream();

    return () => {
      if (abortController) {
        abortController.abort();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, []);

  return (
    <Layout>
      <div className="stream-container">
        <h1>Valkey Stream: test_stream</h1>

        <div className="status-bar">
          <span className={`status ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? '● Connected' : '● Disconnected'}
          </span>
          <span className="entry-count">{entries.length} entries</span>
        </div>

        <div className="debug-info">{debug}</div>

        {loading && <div className="loading">Connecting to stream...</div>}
        {error && !loading && <div className="error">Error: {error}</div>}

        <div className="entries-list">
          {entries.length === 0 ? (
            <div className="no-entries">No entries yet</div>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="entry-card">
                <div className="entry-header">
                  <span className="entry-id">{entry.id}</span>
                  <span className="entry-timestamp">
                    {new Date(parseInt(entry.id.split('-')[0])).toLocaleTimeString()}
                  </span>
                </div>
                <div className="entry-data">
                  {Object.entries(entry.data).map(([key, value]) => (
                    <div key={key} className="entry-field">
                      <span className="field-name">{key}:</span>
                      <span className="field-value">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <style jsx>{`
        .stream-container {
          max-width: 900px;
          margin: 0 auto;
          padding: 20px;
        }

        .status-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: #f5f5f5;
          border-radius: 6px;
          margin-bottom: 20px;
          font-size: 14px;
        }

        .status {
          font-weight: 500;
        }

        .status.connected {
          color: #22c55e;
        }

        .status.disconnected {
          color: #ef4444;
        }

        .entry-count {
          color: #666;
        }

        .debug-info {
          background: #f0f0f0;
          padding: 8px 12px;
          border-radius: 4px;
          margin-bottom: 12px;
          font-size: 12px;
          color: #666;
          font-family: monospace;
        }

        .loading {
          text-align: center;
          padding: 40px;
          color: #666;
          font-size: 16px;
        }

        .error {
          background: #fee2e2;
          color: #991b1b;
          padding: 12px 16px;
          border-radius: 6px;
          margin-bottom: 20px;
          font-size: 14px;
        }

        .no-entries {
          text-align: center;
          padding: 40px;
          color: #999;
        }

        .entries-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .entry-card {
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 16px;
          background: #fff;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }

        .entry-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          padding-bottom: 12px;
          border-bottom: 1px solid #f0f0f0;
        }

        .entry-id {
          font-family: monospace;
          font-weight: 600;
          color: #1f2937;
          font-size: 13px;
        }

        .entry-timestamp {
          font-size: 12px;
          color: #999;
        }

        .entry-data {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .entry-field {
          display: flex;
          gap: 8px;
          font-size: 14px;
        }

        .field-name {
          font-weight: 500;
          color: #4b5563;
          min-width: 120px;
        }

        .field-value {
          color: #1f2937;
          word-break: break-all;
          font-family: monospace;
          font-size: 13px;
        }
      `}</style>
    </Layout>
  );
}
