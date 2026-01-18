import { useEffect, useState } from 'react';
import Layout from '../components/Layout';

/**
 * StreamPage Component
 * 
 * Displays a live stream of log entries from the Valkey 'test_stream' stream.
 * - Fetches historical stream entries on mount
 * - Establishes a Server-Sent Events (SSE) connection for live updates
 * - Automatically reconnects on connection failure with 3-second backoff
 * - Shows connection status, error messages, and entry count
 */
export default function StreamPage() {
  // State management
  const [entries, setEntries] = useState([]); // Array of stream log entries
  const [connected, setConnected] = useState(false); // SSE connection status
  const [error, setError] = useState(null); // Error message if any
  const [loading, setLoading] = useState(true); // Initial loading state
  const [debug, setDebug] = useState('Initializing...'); // Debug information display

  useEffect(() => {
    let abortController = null; // For canceling the fetch request
    let reconnectTimeout = null; // For delayed reconnection attempts

    /**
     * Loads historical stream entries and initiates live stream connection
     * 
     * Process:
     * 1. Fetch previous entries from /api/stream-history
     * 2. Extract the lastId (starting point for new entries)
     * 3. Initiate SSE connection to /api/stream from lastId onwards
     */
    const loadHistoryAndStream = async () => {
      try {
        const historyResponse = await fetch('/api/stream-history', {
          credentials: 'include',
        });

        if (!historyResponse.ok) {
          throw new Error(`History fetch failed: ${historyResponse.status}`);
        }

        const historyData = await historyResponse.json();
        // Reverse to show oldest entries first
        setEntries(historyData.entries.reverse());
        
        const lastId = historyData.lastId;

        // Start streaming new entries from where history left off
        await streamNewEntries(lastId);
      } catch (err) {
        setError(err.message || 'Failed to load history');
      }
    };

    /**
     * Establishes Server-Sent Events (SSE) connection to stream new entries
     * 
     * Parameters:
     * @param {string} startFromId - Valkey stream ID to start reading from (e.g., "1234-5" or "$" for new only)
     * 
     * Process:
     * 1. Create fetch request to /api/stream with startId parameter
     * 2. Handle response as text stream using getReader()
     * 3. Parse incoming data as Server-Sent Events format (data: JSON)
     * 4. Update entries state as new messages arrive
     * 5. Handle connection errors with automatic reconnection
     */
    const streamNewEntries = async (startFromId) => {
      try {
        abortController = new AbortController();
        
        // Build SSE stream URL with starting point
        const streamUrl = new URL('/api/stream', window.location.href);
        if (startFromId && startFromId !== '0-0') {
          // Resume from specific stream ID
          streamUrl.searchParams.set('startId', startFromId);
        } else {
          // '$' means only new entries (not historical)
          streamUrl.searchParams.set('startId', '$');
        }
        
        // Fetch with signal to allow cancellation
        const response = await fetch(streamUrl.toString(), {
          credentials: 'include',
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Update UI to show successful connection
        setConnected(true);
        setLoading(false);
        setError(null);
        setDebug('Connected to live stream');

        // Read response body as text stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = ''; // Buffer for incomplete lines
        let messageCount = 0;
        let chunkCount = 0;

        // Process stream chunks
        while (true) {
          const { done, value } = await reader.read();
          chunkCount++;
          
          if (done) {
            setDebug('Stream ended');
            break;
          }

          // Decode chunk and add to buffer
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          
          // Split by newlines, keeping incomplete line in buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          // Process complete lines
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Skip empty lines
            if (line.trim() === '') {
              continue;
            }
            
            // Parse Server-Sent Events format (data: JSON)
            if (line.startsWith('data: ')) {
              try {
                const jsonStr = line.slice(6);
                const message = JSON.parse(jsonStr);
                messageCount++;
                
                setDebug(`Received ${messageCount} new messages`);

                if (message.type === 'connected') {
                  // Connected handshake message (usually ignored)
                } else if (message.type === 'entry') {
                  // New log entry - add to top of list
                  setEntries((prev) => {
                    const newEntries = [message, ...prev];
                    return newEntries;
                  });
                } else if (message.type === 'error') {
                  // Error from stream server
                  setError(message.message);
                  setDebug('Stream error: ' + message.message);
                }
              } catch (parseErr) {
                setDebug('Parse error: ' + parseErr.message);
              }
            }
          }
        }
      } catch (err) {
        // Handle connection errors
        if (err.name === 'AbortError') {
          // Expected when cleanup happens
          return;
        }
        
        setConnected(false);
        setError(err.message || 'Connection failed');
        setDebug('Error: ' + (err.message || 'Connection failed'));
        
        // Attempt automatic reconnection after 3 seconds
        reconnectTimeout = setTimeout(() => {
          if (!abortController?.signal.aborted) {
            streamNewEntries(startFromId);
          }
        }, 3000);
      }
    };

    // Initiate stream loading on component mount
    loadHistoryAndStream();

    // Cleanup function: abort ongoing requests when component unmounts or effect re-runs
    return () => {
      if (abortController) {
        abortController.abort();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, []);

  /**
   * Render the stream viewer UI
   * 
   * Components:
   * - Status bar: Shows connection state and entry count
   * - Debug info: Displays status messages and message count
   * - Loading state: Shows while initial connection is being established
   * - Error display: Shows error messages if connection fails
   * - Log output: Displays all stream entries in reverse order (newest first)
   *   with colored errors, timestamps, and line numbers
   */

  return (
    <Layout>
      <div className="stream-container">
        <h1>Valkey Stream: test_stream</h1>

        {/* Connection status bar - shows live/disconnected indicator and entry count */}
        <div className="status-bar">
          <span className={`status ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? '● Connected' : '● Disconnected'}
          </span>
          <span className="entry-count">{entries.length} entries</span>
        </div>

        {/* Debug information - shows connection status and message count */}
        <div className="debug-info">{debug}</div>

        {/* Loading state - shown while connecting to stream */}
        {loading && <div className="loading">Connecting to stream...</div>}
        {/* Error display - shown if connection fails */}
        {error && !loading && <div className="error">Error: {error}</div>}

        {/* Main entries list */}
        <div className="entries-list">
          {entries.length === 0 ? (
            <div className="no-entries">No entries yet</div>
          ) : (
            // Log output container with scrollable pre-formatted text
            <div className="log-container">
              <pre className="log-output">
                {entries
                  .slice()
                  .reverse()
                  .map((entry, idx) => {
                    // Determine if this is an error entry
                    const isError = entry.data?.level === 'e';
                    let timestamp = entry.data?.timestamp || '';
                    
                    // Format timestamp to local time string
                    if (timestamp) {
                      try {
                        const date = new Date(timestamp);
                        timestamp = date.toLocaleTimeString();
                      } catch (e) {
                        // Keep original if parse fails
                      }
                    }
                    
                    // Build log line: [line number] [level] [timestamp] [message]
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

      {/* Scoped styles for stream UI */}
      <style jsx>{`
        /* Main container - centered, max-width layout */
        .stream-container {
          max-width: 900px;
          margin: 0 auto;
          padding: 20px;
        }

        /* Status bar - displays connection state and entry count */
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

        /* Status indicator text */
        .status {
          font-weight: 500;
        }

        /* Connected status - green indicator */
        .status.connected {
          color: #22c55e;
        }

        /* Disconnected status - red indicator */
        .status.disconnected {
          color: #ef4444;
        }

        /* Entry count display */
        .entry-count {
          color: #666;
        }

        /* Debug information box - shows status messages */
        .debug-info {
          background: #f0f0f0;
          padding: 8px 12px;
          border-radius: 4px;
          margin-bottom: 12px;
          font-size: 12px;
          color: #666;
          font-family: monospace;
        }

        /* Loading state message */
        .loading {
          text-align: center;
          padding: 40px;
          color: #666;
          font-size: 16px;
        }

        /* Error message display */
        .error {
          background: #fee2e2;
          color: #991b1b;
          padding: 12px 16px;
          border-radius: 6px;
          margin-bottom: 20px;
          font-size: 14px;
        }

        /* Empty state when no entries */
        .no-entries {
          text-align: center;
          padding: 40px;
          color: #999;
        }

        /* Container for scrollable log output */
        .log-container {
          border-radius: 4px;
          overflow: hidden;
          background: #f6f8fa;
          max-height: 70vh;
        }

        /* Pre-formatted log output with monospace font */
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

        /* Preserve whitespace for nested pre and code elements */
        .log-container :global(pre) {
          white-space: pre !important;
          word-break: normal !important;
          overflow-wrap: normal !important;
          word-wrap: normal !important;
        }

        .log-container :global(code) {
          white-space: pre !important;
          word-break: normal !important;
          overflow-wrap: normal !important;
          word-wrap: normal !important;
        }
      `}</style>
    </Layout>
  );
}
