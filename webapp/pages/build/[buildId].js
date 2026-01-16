import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';

export default function BuildStreamPage() {
  const router = useRouter();
  const { buildId } = router.query;
  const [entries, setEntries] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!buildId) return;

    let abortController = null;
    let reconnectTimeout = null;

    const streamKey = `job_stream:${buildId}`;

    const loadHistoryAndStream = async () => {
      try {
        const historyResponse = await fetch(`/api/stream-history?stream=${streamKey}`, {
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
        setLoading(false);
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
        streamUrl.searchParams.set('stream', streamKey);
        
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
  }, [buildId]);

  if (!buildId) {
    return (
      <Layout>
        <div className="stream-container">
          <div className="loading">Loading build stream...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="stream-container">
        <h1>Build Stream: {buildId}</h1>

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
              <pre className="log-output">
                {entries
                  .slice()
                  .reverse()
                  .map((entry, idx) => {
                    const isError = entry.data?.level === 'e';
                    let timestamp = entry.data?.timestamp || '';
                    
                    // Parse and format timestamp more compactly
                    if (timestamp) {
                      try {
                        const date = new Date(timestamp);
                        timestamp = date.toLocaleTimeString();
                      } catch (e) {
                        // Keep original if parse fails
                      }
                    }
                    
                    const prefix = isError ? '[ERROR]' : '[INFO]';
                    const line = (entry.data?.line || '').replace(/\n/g, ' ');
                    return `${String(idx + 1).padStart(4, ' ')} ${prefix} ${timestamp} ${line}`;
                  })
                  .join('\n')}
              </pre>
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
          background: #f6f8fa;
          max-height: 70vh;
        }

        .log-output {
          margin: 0;
          padding: 12px;
          font-size: 13px;
          font-family: 'Courier New', monospace;
          white-space: pre;
          overflow: auto;
          color: #333;
          background: #f6f8fa;
          border-radius: 4px;
          line-height: 1.5;
          max-height: 70vh;
        }
      `}</style>
    </Layout>
  );
}
