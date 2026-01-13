import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import JobsList from '../components/JobsList'
import BuildsList from '../components/BuildsList'

export default function Home() {
  const [jobs, setJobs] = useState({ queuedJobs: [], runningJobs: [], completeJobs: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchJobs = async () => {
    try {
      const response = await fetch('/api/jobs')
      const data = await response.json()
      setJobs(data.jobs)
      setLastUpdated(new Date())
      if (loading) {
        setLoading(false)
      }
    } catch (err) {
      setError(err.message)
      if (loading) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    // Initial fetch
    fetchJobs()

    // Set up polling interval (10 seconds)
    const interval = setInterval(fetchJobs, 10000)

    // Cleanup interval on unmount
    return () => clearInterval(interval)
  }, [])

  if (error) return <div>Error: {error}</div>

  return (
    <Layout>
      <h1>Distribution Dashboard</h1>
      {lastUpdated && (
        <p style={{ fontSize: '12px', color: '#666', marginBottom: '20px' }}>
          Last updated: {lastUpdated.toLocaleTimeString()}
        </p>
      )}
      <BuildsList />
      <JobsList title="Queued Jobs" jobs={jobs.queuedJobs} />
      <JobsList title="Running Jobs" jobs={jobs.runningJobs} />
      <JobsList title="Complete Jobs (Last 20)" jobs={jobs.completeJobs} />
    </Layout>
  )
}
