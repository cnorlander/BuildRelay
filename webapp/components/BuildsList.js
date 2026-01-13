import { useEffect, useState } from 'react'

export default function BuildsList() {
  const [builds, setBuilds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let isMounted = true

    fetch('/api/builds')
      .then((r) => r.json())
      .then((data) => {
        if (isMounted) {
          setBuilds(data.builds || [])
          setLoading(false)
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  if (error) return <div>Error loading builds: {error}</div>
  if (loading) return null

  return (
    <>
      <h2>Available Builds</h2>
      <ul>
        {builds.map((build) => (
          <li key={build.name}>
            <strong>{build.name}</strong> -{' '}
            {new Date(build.createdAt).toLocaleString()}
            {build.isDirectory && ' (directory)'}
          </li>
        ))}
      </ul>
    </>
  )
}
