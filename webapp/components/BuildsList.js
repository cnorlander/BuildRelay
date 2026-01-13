import { useEffect, useState } from 'react'
import Link from 'next/link'

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
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {builds.map((build) => (
          <li key={build.name} style={{ marginBottom: '8px' }}>
            <Link 
              href={`/build-history/${build.name}`}
              style={{
                color: '#0066cc',
                textDecoration: 'none',
                cursor: 'pointer',
                padding: '8px 12px',
                borderRadius: '4px',
                display: 'inline-block',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
            >
              <strong>{build.name}</strong> - {new Date(build.createdAt).toLocaleString()}
              {build.isDirectory && ' (directory)'}
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
