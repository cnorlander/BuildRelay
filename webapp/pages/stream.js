import { useEffect, useState } from 'react';
import { github } from 'react-syntax-highlighter/dist/cjs/styles/hljs';
import SyntaxHighlighter from 'react-syntax-highlighter';
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

    const loadHistoryAndStream = async () => {
      try {
        const historyResponse = await fetch('/api/stream-history', {
          credentials: 'include',
        });

        if (!historyResponse.ok) {
          throw new Error(`History fetch failed: ${historyResponse.status}`);
        }

        const historyData = await historyResponse.json();
        setEntries(historyData.entries.reverse());
        
        const lastId = historyData.lastId;

        // Now start streaming new entries from where we left off
        await streamNewEntries(lastId);
      } catch (err) {
        setError(err.message || 'Failed to load history');
      }
    };

    const streamNewEntries = async (startFromId) => {
      try {
        abortController = new AbortController();
        
        const streamUrl = new URL('/api/stream', window.location.href);
        if (startFromId && startFromId !== '0-0') {
          streamUrl.searchParams.set('startId', startFromId);
        } else {
          streamUrl.searchParams.set('startId', '$');
        }
        
        const response = await fetch(streamUrl.toString(), {
          credentials: 'include',
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        setConnected(true);
        setLoading(false);
        setError(null);
        setDebug('Connected to live stream');

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
          
          buffer = lines.pop() || '';

          console.log('Split into', lines.length, 'lines');
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            console.log('Line', i, ':', line.substring(0, 80));
            
            if (line.trim() === '') {
              continue;
            }
            
            if (line.startsWith('data: ')) {
              try {
                const jsonStr = line.slice(6);
                console.log('Parsing JSON:', jsonStr.substring(0, 100));
                const message = JSON.parse(jsonStr);
                messageCount++;
                
                setDebug(`Received ${messageCount} new messages`);

                if (message.type === 'connected') {
                  console.log('Stream connected:', message);
                } else if (message.type === 'entry') {
                  console.log('Received new entry:', message.id);
                  setEntries((prev) => {
                    const newEntries = [message, ...prev]; // No limit
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
        
        reconnectTimeout = setTimeout(() => {
          if (!abortController?.signal.aborted) {
            console.log('Attempting to reconnect...');
            streamNewEntries(startFromId);
          }
        }, 3000);
      }
    };

    loadHistoryAndStream();

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
            <div className="log-container">
              <SyntaxHighlighter
                language="log"
                style={github}
                showLineNumbers
                lineNumberStyle={{ color: '#999', paddingRight: '20px' }}
                wrapLines
                wrapLongLines
                customStyle={{
                  padding: '12px',
                  margin: '0',
                  backgroundColor: '#f6f8fa',
                  borderRadius: '4px',
                  overflow: 'auto',
                  fontSize: '13px',
                }}
              >
                {entries
                  .slice()
                  .reverse()
                  .map((entry) => {
                    const isError = entry.data?.level === 'e';
                    const timestamp = entry.data?.timestamp;
                    const prefix = isError ? '[ERROR]' : '[INFO]';
                    return `${prefix} ${timestamp} ${entry.data?.line || ''}`;
                  })
                  .join('\n')}
              </SyntaxHighlighter>
            </div>
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

        .log-container {
          border-radius: 4px;
          overflow: hidden;
        }
      `}</style>
    </Layout>
  );
}
