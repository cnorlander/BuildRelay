import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { github } from 'react-syntax-highlighter/dist/cjs/styles/hljs';
import SyntaxHighlighter from 'react-syntax-highlighter';
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
