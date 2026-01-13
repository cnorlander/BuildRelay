import { useEffect, useState } from 'react'
import Layout from '../components/Layout'

export default function Home() {
  const [jobs, setJobs] = useState({ queuedJobs: [], runningJobs: [], completeJobs: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/jobs')
      .then((r) => r.json())
      .then((data) => {
        setJobs(data.jobs)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>

  return (
    <Layout>
      <h1>Distribution Dashboard</h1>

      <h2>Queued Jobs</h2>
      <ul>
        {jobs.queuedJobs.map((job) => (
          <li key={job.id}>
            {job.project} - {job.platform} - {job.status}
          </li>
        ))}
      </ul>

      <h2>Running Jobs</h2>
      <ul>
        {jobs.runningJobs.map((job) => (
          <li key={job.id}>
            {job.project} - {job.platform} - {job.status}
          </li>
        ))}
      </ul>

      <h2>Complete Jobs (Last 20)</h2>
      <ul>
        {jobs.completeJobs.map((job) => (
          <li key={job.id}>
            {job.project} - {job.platform} - {job.status}
          </li>
        ))}
      </ul>
    </Layout>
  )
}
