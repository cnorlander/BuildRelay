import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';

export default function BuildDetailPage() {
  const router = useRouter();
  const { buildId } = router.query;
  const [job, setJob] = useState(null);
  const [entries, setEntries] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!buildId) return;

    let abortController = null;
    let reconnectTimeout = null;

    const streamKey = `job_stream:${buildId}`;

    const loadJobAndContent = async () => {
      try {
        // Fetch job details
        const jobResponse = await fetch(`/api/jobs`, {
          credentials: 'include',
        });

        if (!jobResponse.ok) {
          throw new Error('Failed to fetch jobs');
        }

        const jobsData = await jobResponse.json();
        const allJobs = [
          ...jobsData.jobs.queuedJobs,
          ...jobsData.jobs.runningJobs,
          ...jobsData.jobs.completeJobs,
        ];

        const currentJob = allJobs.find(j => j.id === buildId);
        setJob(currentJob || {});

        // Load stream history
        const historyResponse = await fetch(`/api/stream-history?stream=${streamKey}`, {
          credentials: 'include',
        });

        if (!historyResponse.ok) {
          throw new Error(`History fetch failed: ${historyResponse.status}`);
        }

        const historyData = await historyResponse.json();
        setEntries(historyData.entries.reverse());

        // If job is not complete, start streaming
        if (currentJob && currentJob.status !== 'complete' && currentJob.status !== 'failed') {
          await streamNewEntries(historyData.lastId);
        } else {
          setLoading(false);
        }
      } catch (err) {
        setError(err.message || 'Failed to load build details');
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

    loadJobAndContent();

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
        <div className="container">
          <div className="loading">Loading build details...</div>
        </div>
      </Layout>
    );
  }

  const isStreaming = job?.status !== 'complete' && job?.status !== 'failed';
  const cdnUrls = job?.upload_results?.cdn || [];

  return (
    <Layout>
      <div className="container">
        <h1>Build: {job?.project || buildId}</h1>

        {/* Metadata Block */}
        <div className="metadata-block">
          <div className="metadata-row">
            <div className="metadata-item">
              <span className="label">Status</span>
              <span className={`value status-badge status-${job?.status || 'unknown'}`}>
                {job?.status || 'Unknown'}
              </span>
            </div>
            <div className="metadata-item">
              <span className="label">Platform</span>
              <span className="value">{job?.platform || 'N/A'}</span>
            </div>
            <div className="metadata-item">
              <span className="label">Project</span>
              <span className="value">{job?.project || 'N/A'}</span>
            </div>
          </div>

          {job?.description && (
            <div className="metadata-row">
              <div className="metadata-item full-width">
                <span className="label">Description</span>
                <span className="value">{job.description}</span>
              </div>
            </div>
          )}

          <div className="metadata-row">
            <div className="metadata-item">
              <span className="label">Created</span>
              <span className="value">{new Date(job?.createdAt).toLocaleString()}</span>
            </div>
            {job?.completedAt && (
              <div className="metadata-item">
                <span className="label">Completed</span>
                <span className="value">{new Date(job.completedAt).toLocaleString()}</span>
              </div>
            )}
          </div>

          {job?.steam_channel_labels?.length > 0 && (
            <div className="metadata-row">
              <div className="metadata-item full-width">
                <span className="label"><i className="fab fa-steam" style={{ marginRight: '6px' }} />Steam Channels</span>
                <span className="value">{job.steam_channel_labels.join(', ')}</span>
              </div>
            </div>
          )}

          {job?.cdn_channel_labels?.length > 0 && (
            <div className="metadata-row">
              <div className="metadata-item full-width">
                <span className="label"><i className="fas fa-cloud" style={{ marginRight: '6px' }} />CDN Channels</span>
                <span className="value">{job.cdn_channel_labels.join(', ')}</span>
              </div>
            </div>
          )}

          {cdnUrls.length > 0 && (
            <div className="metadata-row">
              <div className="metadata-item full-width">
                <span className="label"><i className="fas fa-download" style={{ marginRight: '6px' }} />CDN Downloads</span>
                <div className="cdn-urls">
                  {cdnUrls.map((cdn, idx) => (
                    <div key={idx} className="cdn-url-item">
                      <strong>{cdn.channel}:</strong>
                      <a href={cdn.url} target="_blank" rel="noopener noreferrer" className="cdn-link">
                        <i className="fas fa-external-link-alt" style={{ marginRight: '4px' }} />
                        Download
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Log Viewer */}
        <div className="status-bar">
          {isStreaming && (
            <span className={`status ${connected ? 'connected' : 'disconnected'}`}>
              {connected ? '● Connected' : '● Disconnected'}
            </span>
          )}
          <span className="entry-count">{entries.length} log entries</span>
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
        .container {
          max-width: 1000px;
          margin: 0 auto;
          padding: 20px;
        }

        .metadata-block {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 24px;
        }

        .metadata-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          margin-bottom: 16px;
        }

        .metadata-row:last-child {
          margin-bottom: 0;
        }

        .metadata-item {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .metadata-item.full-width {
          grid-column: 1 / -1;
        }

        .metadata-item .label {
          font-size: 12px;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .metadata-item .value {
          font-size: 14px;
          color: #111827;
        }

        .status-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 4px;
          font-weight: 600;
          font-size: 12px;
          width: fit-content;
        }

        .status-badge.status-complete {
          background: #dcfce7;
          color: #15803d;
        }

        .status-badge.status-running {
          background: #dbeafe;
          color: #0c4a6e;
        }

        .status-badge.status-failed {
          background: #fee2e2;
          color: #7f1d1d;
        }

        .status-badge.status-Queued {
          background: #fef3c7;
          color: #92400e;
        }

        .cdn-urls {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 8px;
        }

        .cdn-url-item {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .cdn-url-item strong {
          font-weight: 600;
          color: #374151;
        }

        .cdn-link {
          color: #2563eb;
          text-decoration: none;
          padding: 4px 8px;
          border-radius: 4px;
          transition: background-color 0.2s;
          font-size: 13px;
        }

        .cdn-link:hover {
          background-color: #dbeafe;
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
