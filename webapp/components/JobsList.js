import Link from 'next/link';
import { useState, useEffect } from 'react';

/**
 * JobsList Component
 * 
 * Displays a list of jobs grouped by status (Queued, Running, Failed, Complete).
 * Features:
 * - Shows job metadata (project name, platform, channels, description)
 * - Displays relative timestamps (e.g., "2h ago")
 * - Provides queue clearing functionality with confirmation modal
 * - Color-coded status badges
 * - Clickable job cards that link to detailed build view
 */

/**
 * Formats a timestamp to a relative time string (e.g., "2h ago", "30m ago")
 * 
 * @param {string} timestamp - ISO datetime string
 * @returns {string} - Relative time like "2h ago" or "N/A"
 */
function formatTimeAgo(timestamp) {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * JobsList Component
 * 
 * @param {string} title - Section title (e.g., "Queued Jobs")
 * @param {Array} jobs - Array of job objects to display
 * @param {boolean} clearable - Whether to show clear button
 * @param {function} onClear - Callback when queue is cleared
 * @param {string} queueName - Redis queue name for API calls (e.g., "queued_jobs")
 */
export default function JobsList({ title, jobs, clearable, onClear, queueName }) {
  const isCompleted = title.includes('Complete');
  const [, setTimeAgo] = useState({}); // Trigger re-renders for time updates
  const [showClearModal, setShowClearModal] = useState(false); // Clear confirmation modal
  const [isClearing, setIsClearing] = useState(false); // Disable buttons while clearing
  const [mounted, setMounted] = useState(false); // Track hydration for date formatting

  useEffect(() => {
    // Mark component as mounted to enable date formatting (prevents hydration mismatch)
    setMounted(true);
    
    // Refresh relative times every minute to keep "2h ago" current
    const interval = setInterval(() => {
      setTimeAgo({});
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  /**
   * Handles queue clearing
   * 
   * Process:
   * 1. Send DELETE request to /api/jobs with queue name
   * 2. Uses ltrim(queue, 1, 0) on server to clear Redis list
   * 3. Close modal and call onClear callback
   * 4. Handle errors gracefully
   */
  const handleClear = async () => {
    setIsClearing(true);
    try {
      const response = await fetch(`/api/jobs?queue=${queueName}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to clear queue');
      }

      setShowClearModal(false);
      if (onClear) {
        onClear();
      }
    } catch (err) {
      console.error('Clear error:', err);
      alert(`Error: ${err.message}`);
    } finally {
      setIsClearing(false);
    }
  };
  return (
    <>
      {/* Header with title and clear button */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px'
      }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        {/* Clear button - visible only for non-empty queues */}
        {clearable && jobs.length > 0 && (
          <button
            onClick={() => setShowClearModal(true)}
            title="Clear this queue"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#9ca3af',
              fontSize: '16px',
              padding: '4px 8px',
              borderRadius: '4px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.target.style.color = '#ef4444';
              e.target.style.backgroundColor = '#fee2e2';
            }}
            onMouseLeave={(e) => {
              e.target.style.color = '#9ca3af';
              e.target.style.backgroundColor = 'transparent';
            }}
          >
            <i className="fas fa-trash" />
          </button>
        )}
      </div>

      {/* Clear confirmation modal */}
      {showClearModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '400px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
          }}>
            <h3 style={{ margin: '0 0 12px 0', color: '#111827' }}>Clear {title}?</h3>
            <p style={{ color: '#6b7280', margin: '0 0 20px 0' }}>
              This will remove all {jobs.length} job{jobs.length !== 1 ? 's' : ''} from this queue. This action cannot be undone.
            </p>
            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end'
            }}>
              {/* Cancel button */}
              <button
                onClick={() => setShowClearModal(false)}
                disabled={isClearing}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#e5e7eb',
                  color: '#111827',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => !isClearing && (e.target.style.backgroundColor = '#d1d5db')}
                onMouseLeave={(e) => (e.target.style.backgroundColor = '#e5e7eb')}
              >
                Cancel
              </button>
              {/* Confirm clear button */}
              <button
                onClick={handleClear}
                disabled={isClearing}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isClearing ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                  transition: 'background-color 0.2s',
                  opacity: isClearing ? 0.7 : 1
                }}
                onMouseEnter={(e) => !isClearing && (e.target.style.backgroundColor = '#dc2626')}
                onMouseLeave={(e) => (e.target.style.backgroundColor = '#ef4444')}
              >
                {isClearing ? 'Clearing...' : 'Clear Queue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Jobs grid */}
      <div style={{
        display: 'grid',
        gap: '12px',
        marginBottom: '24px'
      }}>
        {/* Empty state */}
        {jobs.length === 0 ? (
          <p style={{ color: '#666', fontSize: '14px' }}>No jobs</p>
        ) : (
          /* Job cards grid */
          jobs.map((job) => {
            const href = `/build/${job.id}`;
            
            // Format timestamps
            const createdDate = new Date(job.createdAt);
            const completedDate = job.completedAt ? new Date(job.completedAt) : null;
            const timeElapsed = completedDate 
              ? formatTimeAgo(job.completedAt)
              : job.startedAt ? formatTimeAgo(job.startedAt) : '';
            
            return (
              // Clickable job card
              <Link
                key={job.id}
                href={href}
                style={{
                  padding: '12px 16px',
                  borderRadius: '6px',
                  border: '1px solid #e6e9ee',
                  backgroundColor: '#f9fafb',
                  textDecoration: 'none',
                  transition: 'all 0.2s',
                  cursor: 'pointer',
                  display: 'block'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#eef2ff';
                  e.currentTarget.style.borderColor = '#1d4ed8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                  e.currentTarget.style.borderColor = '#e6e9ee';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                  {/* Left side: Job details */}
                  <div style={{ flex: 1 }}>
                    {/* Project name */}
                    <div style={{
                      fontWeight: '600',
                      color: '#111827',
                      marginBottom: '4px',
                      fontSize: '15px'
                    }}>
                      {job.project}
                    </div>
                    {/* Job metadata: platform, description, channels */}
                    <div style={{
                      fontSize: '13px',
                      color: '#6b7280',
                      display: 'flex',
                      gap: '16px',
                      flexWrap: 'wrap'
                    }}>
                      <span><i className="fas fa-mobile-alt" style={{ marginRight: '6px' }} />{job.platform}</span>
                      {job.description && <span><i className="fas fa-note-sticky" style={{ marginRight: '6px' }} />{job.description}</span>}
                      {job.steam_channel_labels?.length > 0 && (
                        <span><i className="fab fa-steam" style={{ marginRight: '6px' }} />{job.steam_channel_labels.join(', ')}</span>
                      )}
                      {job.cdn_channel_labels?.length > 0 && (
                        <span><i className="fas fa-cloud" style={{ marginRight: '6px' }} />{job.cdn_channel_labels.join(', ')}</span>
                      )}
                    </div>
                  </div>
                  {/* Right side: Status and timestamps */}
                  <div style={{
                    textAlign: 'right',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    {/* Color-coded status badge */}
                    <div style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '600',
                      backgroundColor: 
                        job.status === 'complete' ? '#dcfce7' :
                        job.status === 'running' ? '#dbeafe' :
                        job.status === 'failed' ? '#fee2e2' :
                        '#fef3c7',
                      color:
                        job.status === 'complete' ? '#15803d' :
                        job.status === 'running' ? '#0c4a6e' :
                        job.status === 'failed' ? '#7f1d1d' :
                        '#92400e'
                    }}>
                      {job.status}
                    </div>
                    {/* Relative time (e.g., "2h ago") */}
                    {mounted && timeElapsed && (
                      <div style={{
                        fontSize: '12px',
                        color: '#9ca3af'
                      }}>
                        {timeElapsed}
                      </div>
                    )}
                    {/* Absolute creation time (only show after hydration) */}
                    <div style={{
                      fontSize: '12px',
                      color: '#9ca3af'
                    }}>
                      {mounted ? createdDate.toLocaleString() : 'Loading...'}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </>
  );
}
