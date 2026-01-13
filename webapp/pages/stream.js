import { useEffect, useState } from 'react';
import { github } from 'react-syntax-highlighter/dist/cjs/styles/hljs';
import SyntaxHighlighter from 'react-syntax-highlighter';
import Layout from '../components/Layout';

export default function StreamPage() {
  const [entries, setEntries] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

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

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          
          buffer += chunk;
          const lines = buffer.split('\n');
          
          buffer = lines.pop() || '';
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.trim() === '') {
              continue;
            }
            
            if (line.startsWith('data: ')) {
              try {
                const jsonStr = line.slice(6);
                const message = JSON.parse(jsonStr);

                if (message.type === 'entry') {
                  setEntries((prev) => {
                    const newEntries = [message, ...prev];
                    return newEntries;
                  });
                } else if (message.type === 'error') {
                  setError(message.message);
                }
              } catch (parseErr) {
                // Ignore parse errors
              }
            }
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          return;
        }
        
        setConnected(false);
        setError(err.message || 'Connection failed');
        
        reconnectTimeout = setTimeout(() => {
          if (!abortController?.signal.aborted) {
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
                    const timestamp = entry.data?.timestamp 
                      ? new Date(parseFloat(entry.data.timestamp) * 1000).toLocaleTimeString()
                      : '';
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
