import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';

export default function BuildHistoryPage() {
  const router = useRouter();
  const { buildId } = router.query;
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!buildId) return;

    const streamKey = `job_stream:${buildId}`;

    const loadHistory = async () => {
      try {
        const historyResponse = await fetch(`/api/stream-history?stream=${streamKey}`, {
          credentials: 'include',
        });

        if (!historyResponse.ok) {
          throw new Error(`History fetch failed: ${historyResponse.status}`);
        }

        const historyData = await historyResponse.json();
        setEntries(historyData.entries.reverse());
        setLoading(false);
      } catch (err) {
        setError(err.message || 'Failed to load history');
        setLoading(false);
      }
    };

    loadHistory();
  }, [buildId]);

  if (!buildId) {
    return (
      <Layout>
        <div className="stream-container">
          <div className="loading">Loading build log...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="stream-container">
        <h1>Build Log: {buildId}</h1>

        <div className="status-bar">
          <span className="entry-count">{entries.length} entries</span>
        </div>

        {loading && <div className="loading">Loading log...</div>}
        {error && !loading && <div className="error">Error: {error}</div>}

        <div className="entries-list">
          {entries.length === 0 ? (
            <div className="no-entries">No log entries</div>
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
