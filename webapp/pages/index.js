import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import JobsList from '../components/JobsList'
import BuildsList from '../components/BuildsList'

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


  if (error) return <div>Error: {error}</div>

  return (
    <Layout>
      <h1>Distribution Dashboard</h1>
      <BuildsList />
      <JobsList title="Queued Jobs" jobs={jobs.queuedJobs} />
      <JobsList title="Running Jobs" jobs={jobs.runningJobs} />
      <JobsList title="Complete Jobs (Last 20)" jobs={jobs.completeJobs} />
    </Layout>
  )
}
