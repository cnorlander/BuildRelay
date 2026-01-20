import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import JobsList from '../components/JobsList'
import CreateJobModal from '../components/CreateJobModal'

/**
 * Home Page / Distribution Dashboard
 * 
 * Main page for monitoring and managing distribution jobs.
 * 
 * Props (from getServerSideProps):
 * - initialJobs: Jobs data rendered on server
 * - initialError: Any errors during server-side fetch
 */
export default function Home({ initialJobs, initialError }) {
  // State: Current jobs organized by status
  const [jobs, setJobs] = useState(initialJobs || { queuedJobs: [], runningJobs: [], completeJobs: [], failedJobs: [] })
  
  // State: Error message if job fetch fails
  const [error, setError] = useState(initialError || null)
  
  // State: Last time jobs were updated (for "Last updated" display)
  const [lastUpdated, setLastUpdated] = useState(null)
  
  // State: Toggle create job modal visibility
  const [showCreateJob, setShowCreateJob] = useState(false)

  // Fetch and update jobs from API
  const fetchJobs = async () => {
    try {
      const response = await fetch('/api/jobs')
      const data = await response.json()
      setJobs(data.jobs)
      setLastUpdated(new Date())
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  /**
   * Effect: Initialize polling and timestamps
   * 
   * Runs once on mount:
   * 1. Set initial timestamp after hydration (prevents hydration mismatch)
   * 2. Start polling interval (10 seconds)
   * 3. Cleanup interval on unmount
   */
  useEffect(() => {
    // Set initial timestamp after hydration
    setLastUpdated(new Date())

    // Set up polling interval (10 seconds) - updates after hydration
    const interval = setInterval(fetchJobs, 10000)

    // Cleanup interval on unmount
    return () => clearInterval(interval)
  }, [])

  /**
   * Error state: Show error message if no jobs loaded
   */
  if (error && !jobs.queuedJobs.length && !jobs.runningJobs.length) {
    return <div>Error: {error}</div>
  }

  return (
    <Layout>
      <h1>Distribution Dashboard</h1>
      
      {/* Header: Last updated timestamp and Create Job button */}
      <div className="page-header">
        {/* Last updated display */}
        <div>
          {lastUpdated && (
            <p className="header-subtitle">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
        
        {/* Create Job button - opens modal */}
        <button
          onClick={() => setShowCreateJob(true)}
          style={{
            padding: '10px 16px',
            backgroundColor: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '14px',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = '#1d4ed8'}
          onMouseLeave={(e) => e.target.style.backgroundColor = '#2563eb'}
        >
          <i className="fas fa-plus btn-icon-spacing" />
          Create Job
        </button>
      </div>
      
      {/* Create Job Modal */}
      <CreateJobModal
        isOpen={showCreateJob}
        onClose={() => setShowCreateJob(false)}
        onJobCreated={() => {
          setShowCreateJob(false);
          fetchJobs(); // Refresh jobs after creation
        }}
      />
      
      {/* Job Lists organized by status */}
      <JobsList title="Queued Jobs" jobs={jobs.queuedJobs} clearable={true} queueName="queued_jobs" onClear={fetchJobs} />
      <JobsList title="Running Jobs" jobs={jobs.runningJobs} clearable={true} queueName="running_jobs" onClear={fetchJobs} />
      <JobsList title="Failed Jobs" jobs={jobs.failedJobs} clearable={true} queueName="failed_jobs" onClear={fetchJobs} />
      <JobsList title="Complete Jobs (Last 20)" jobs={jobs.completeJobs} clearable={true} queueName="complete_jobs" onClear={fetchJobs} />
    </Layout>
  )
}

/**
 * Server-Side Rendering (SSR)
 * 
 * Fetches initial jobs data on the server before rendering the page.
 * Prevents loading state/waterfall since jobs are available immediately.
 */
export async function getServerSideProps(context) {
  try {
    // Reconstruct full URL for server-side fetch
    const protocol = context.req.headers['x-forwarded-proto'] || 'http'
    const host = context.req.headers['x-forwarded-host'] || context.req.headers.host
    const baseUrl = `${protocol}://${host}`

    // Fetch jobs from API with authentication cookies
    const response = await fetch(`${baseUrl}/api/jobs`, {
      headers: {
        Cookie: context.req.headers.cookie || '',
      },
    })

    // Check for HTTP errors
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`)
    }

    const data = await response.json()

    // Return jobs as initial props
    return {
      props: {
        initialJobs: data.jobs,
        initialError: null,
      },
    }
  } catch (err) {
    // On error, log and return error state
    console.error('Error fetching jobs in getServerSideProps:', err)
    return {
      props: {
        initialJobs: null,
        initialError: 'Failed to load initial jobs data',
      },
    }
  }
}
