// ============================================================================
// BUILD DETAIL PAGE
// ============================================================================
// Displays detailed information about a single build/job including:
// - Job metadata (status, platform, project, timestamps)
// - Channel configurations (Steam, CDN)
// - CDN download links
// - Real-time streaming log output
// - Connection status monitoring
// ============================================================================

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';

export default function BuildDetailPage() {
  // ========================================================================
  // ROUTER & STATE SETUP
  // ========================================================================
  
  const router = useRouter();
  const { buildId } = router.query; // Extract buildId from URL parameters
  
  // Job and log data state
  const [job, setJob] = useState(null); // Current job/build object
  const [entries, setEntries] = useState([]); // Array of log entries from stream
  const [connected, setConnected] = useState(false); // SSE connection status
  const [error, setError] = useState(null); // Error messages from API or stream
  const [loading, setLoading] = useState(true); // Initial data loading state

  // ========================================================================
  // EFFECT: Initialize and manage job data and streaming
  // ========================================================================
  // Runs when buildId changes; fetches job data and starts streaming if needed
  useEffect(() => {
    if (!buildId) return; // Wait for buildId to be available from router

    // Cleanup references for stream and reconnection attempts
    let abortController = null; // Used to cancel fetch streams
    let reconnectTimeout = null; // Used to cancel reconnection attempts

    const streamKey = `job_stream:${buildId}`; // Redis stream key for this job's logs

    // ====================================================================
    // FUNCTION: Load job metadata and initialize logging
    // ====================================================================
    // 1. Fetches all jobs from API and finds the matching buildId
    // 2. Loads historical log entries from Redis stream
    // 3. If job is still running, initiates real-time log streaming
    // 4. Handles errors and updates UI state accordingly
    const loadJobAndContent = async () => {
      try {
        // Fetch job details from API
        // Includes all job states: queued, running, and complete
        const jobResponse = await fetch(`/api/jobs`, {
          credentials: 'include', // Send auth cookies
        });

        if (!jobResponse.ok) {
          throw new Error('Failed to fetch jobs');
        }

        const jobsData = await jobResponse.json();
        // Combine all job lists into a single searchable array
        const allJobs = [
          ...jobsData.jobs.queuedJobs,
          ...jobsData.jobs.runningJobs,
          ...jobsData.jobs.completeJobs,
        ];

        // Find the specific job matching this buildId
        const currentJob = allJobs.find(j => j.id === buildId);
        setJob(currentJob || {});

        // Load historical log entries from Redis stream
        const historyResponse = await fetch(`/api/stream-history?stream=${streamKey}`, {
          credentials: 'include',
        });

        if (!historyResponse.ok) {
          throw new Error(`History fetch failed: ${historyResponse.status}`);
        }

        const historyData = await historyResponse.json();
        // Reverse to show oldest logs first in display
        setEntries(historyData.entries.reverse());

        // Start live streaming only if job is still in progress
        if (currentJob && currentJob.status !== 'complete' && currentJob.status !== 'failed') {
          await streamNewEntries(historyData.lastId);
        } else {
          // Job is already complete, no need to stream
          setLoading(false);
        }
      } catch (err) {
        setError(err.message || 'Failed to load build details');
        setLoading(false);
      }
    };

    // ====================================================================
    // FUNCTION: Stream new log entries in real-time
    // ====================================================================
    // Uses Server-Sent Events (SSE) to receive live log updates
    // - Establishes persistent connection to /api/stream endpoint
    // - Reads log entries as they're emitted by the backend
    // - Handles parsing of Server-Sent Event format (data: {...})
    // - Auto-reconnects on connection failure (3 second delay)
    // - Can be cancelled via abortController signal
    const streamNewEntries = async (startFromId) => {
      try {
        abortController = new AbortController();

        // Build stream URL with query parameters
        const streamUrl = new URL('/api/stream', window.location.href);
        // startId tells backend where to start reading from Redis stream
        // '$' means start from the latest messages
        if (startFromId && startFromId !== '0-0') {
          streamUrl.searchParams.set('startId', startFromId);
        } else {
          streamUrl.searchParams.set('startId', '$');
        }
        streamUrl.searchParams.set('stream', streamKey);

        const response = await fetch(streamUrl.toString(), {
          credentials: 'include',
          signal: abortController.signal, // Allow cancellation
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Connection established successfully
        setConnected(true);
        setLoading(false);
        setError(null);

        // Read streaming data from response body
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = ''; // Buffer for incomplete lines

        // Read stream chunks until connection closes
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          // Decode chunk and add to buffer
          const chunk = decoder.decode(value, { stream: true });

          buffer += chunk;
          // Split on newlines to process complete messages
          const lines = buffer.split('\n');

          // Keep incomplete line in buffer for next iteration
          buffer = lines.pop() || '';

          // Process each complete line
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.trim() === '') {
              continue; // Skip empty lines
            }

            // Check for Server-Sent Event format (data: {...})
            if (line.startsWith('data: ')) {
              try {
                // Parse JSON message from SSE data
                const jsonStr = line.slice(6);
                const message = JSON.parse(jsonStr);

                // Handle different message types
                if (message.type === 'entry') {
                  // Add new log entry to the beginning of the array
                  setEntries((prev) => {
                    const newEntries = [message, ...prev];
                    return newEntries;
                  });
                } else if (message.type === 'error') {
                  // Handle stream error messages
                  setError(message.message);
                }
              } catch (parseErr) {
                // Ignore JSON parse errors - corrupted messages
              }
            }
          }
        }
      } catch (err) {
        // Handle connection errors
        if (err.name === 'AbortError') {
          // Stream was intentionally aborted (cleanup)
          return;
        }

        // Connection lost - update UI and attempt reconnect
        setConnected(false);
        setError(err.message || 'Connection failed');

        // Schedule reconnection attempt after 3 seconds
        reconnectTimeout = setTimeout(() => {
          if (!abortController?.signal.aborted) {
            streamNewEntries(startFromId);
          }
        }, 3000);
      }
    };

    // Initialize data loading
    loadJobAndContent();

    // ====================================================================
    // CLEANUP: Cancel ongoing requests on unmount or buildId change
    // ====================================================================
    // Prevents memory leaks and orphaned requests
    return () => {
      // Abort any ongoing fetch streams
      if (abortController) {
        abortController.abort();
      }
      // Cancel any pending reconnection attempts
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [buildId]);

  // ========================================================================
  // GUARD: Wait for router to provide buildId before rendering
  // ========================================================================
  if (!buildId) {
    return (
      <Layout>
        <div className="container">
          <div className="loading">Loading build details...</div>
        </div>
      </Layout>
    );
  }

  // ========================================================================
  // COMPUTED VALUES
  // ========================================================================
  // Determine if job is actively streaming (still running)
  const isStreaming = job?.status !== 'complete' && job?.status !== 'failed';
  // Extract CDN download URLs from job results
  const cdnUrls = job?.upload_results?.cdn || [];

  // ========================================================================
  // RENDER: Build detail view with metadata and logs
  // ========================================================================
  return (
    <Layout>
      <div className="build-detail-container">
        <h1>Build: {job?.project || buildId}</h1>

        {/* ================================================================
            METADATA SECTION: Job information, timestamps, channels
            ================================================================ */}
        <div className="build-detail-metadata-block">
          <div className="build-detail-metadata-row">
            <div className="build-detail-metadata-item">
              <span className="label">Status</span>
              <span className={`value build-detail-status-badge status-${job?.status || 'unknown'}`}>
                {job?.status || 'Unknown'}
              </span>
            </div>
            <div className="build-detail-metadata-item">
              <span className="label">Platform</span>
              <span className="value\">{job?.platform || 'N/A'}</span>
            </div>
            <div className="build-detail-metadata-item">
              <span className="label">Project</span>
              <span className="value">{job?.project || 'N/A'}</span>
            </div>
          </div>

          {job?.description && (
            <div className="build-detail-metadata-row">
              <div className="build-detail-metadata-item full-width">
                <span className="label">Description</span>
                <span className="value">{job.description}</span>
              </div>
            </div>
          )}

          <div className="build-detail-metadata-row">
            <div className="build-detail-metadata-item">
              <span className="label">Created</span>
              <span className="value">{new Date(job?.createdAt).toLocaleString()}</span>
            </div>
            {job?.completedAt && (
              <div className="build-detail-metadata-item">
                <span className="label">Completed</span>
                <span className="value">{new Date(job.completedAt).toLocaleString()}</span>
              </div>
            )}
          </div>

          {job?.steam_channel_labels?.length > 0 && (
            <div className="build-detail-metadata-row">
              <div className="build-detail-metadata-item full-width">
                <span className="label"><i className="fab fa-steam" style={{ marginRight: '6px' }} />Steam Channels</span>
                <span className="value">{job.steam_channel_labels.join(', ')}</span>
              </div>
            </div>
          )}

          {job?.cdn_channel_labels?.length > 0 && (
            <div className="build-detail-metadata-row">
              <div className="build-detail-metadata-item full-width">
                <span className="label"><i className="fas fa-cloud" style={{ marginRight: '6px' }} />CDN Channels</span>
                <span className="value">{job.cdn_channel_labels.join(', ')}</span>
              </div>
            </div>
          )}

          {cdnUrls.length > 0 && (
            <div className="build-detail-metadata-row">
              <div className="build-detail-metadata-item full-width">
                <span className="label"><i className="fas fa-download" style={{ marginRight: '6px' }} />CDN Downloads</span>
                <div className="build-detail-cdn-urls">
                  {cdnUrls.map((cdn, idx) => (
                    <div key={idx} className="build-detail-cdn-url-item">
                      <strong>{cdn.channel}:</strong>
                      <a href={cdn.url} target="_blank" rel="noopener noreferrer" className="build-detail-cdn-link">
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

        {/* ================================================================
            LOG VIEWER SECTION: Real-time streaming log output
            ================================================================ */}
        {/* Connection status and entry count */}
        <div className="build-detail-status-bar">
          {isStreaming && (
            <span className={`build-detail-status ${connected ? 'connected' : 'disconnected'}`}>
              {connected ? '● Connected' : '● Disconnected'}
            </span>
          )}
          <span className="build-detail-entry-count">{entries.length} log entries</span>
        </div>

        {/* Loading and error states */}
        {loading && <div className="build-detail-loading">Loading log...</div>}
        {error && !loading && <div className="build-detail-error">Error: {error}</div>}

        {/* Log entries list */}
        <div className="build-detail-entries-list">
          {entries.length === 0 ? (
            <div className="build-detail-no-entries">No log entries</div>
          ) : (
            <div className="build-detail-log-container">
              <pre className="build-detail-log-output">
                {/* Format and display log entries in reverse order (newest first) */}
                {entries
                  .slice()
                  .reverse()
                  .map((entry, idx) => {
                    // Check if entry is an error (level === 'e')
                    const isError = entry.data?.level === 'e';
                    // Extract and parse timestamp
                    let timestamp = entry.data?.timestamp || '';

                    if (timestamp) {
                      try {
                        const date = new Date(timestamp);
                        // Format timestamp as local time (HH:MM:SS)
                        timestamp = date.toLocaleTimeString();
                      } catch (e) {
                        // Keep original timestamp if parsing fails
                      }
                    }

                    // Prefix indicates log level
                    const prefix = isError ? '[ERROR]' : '[INFO]';
                    // Remove actual newlines and replace with spaces for display
                    const line = (entry.data?.line || '').replace(/\n/g, ' ');
                    // Format: line number (4 digits) | level | time | message
                    return `${String(idx + 1).padStart(4, ' ')} ${prefix} ${timestamp} ${line}`;
                  })
                  .join('\n')}
              </pre>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
