import { useEffect, useState } from 'react'
import Layout from '../components/Layout'

export default function Destinations() {
  const [destinations, setDestinations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({
    label: '',
    path: '',
    bucketName: '',
    region: '',
    accessKeyId: '',
    secretAccessKey: '',
    endpoint: '',
    filenameFormat: '',
    encryption: false,
  })

  useEffect(() => {
    fetchDestinations()
  }, [])

  async function fetchDestinations() {
    try {
      const response = await fetch('/api/destinations/cdn')
      const data = await response.json()
      setDestinations(data.destinations || [])
      setLoading(false)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  function handleInputChange(e) {
    const { name, value, type, checked } = e.target
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value,
    })
  }

  function resetForm() {
    setFormData({
      label: '',
      path: '',
      bucketName: '',
      region: '',
      accessKeyId: '',
      secretAccessKey: '',
      endpoint: '',
      filenameFormat: '',
      encryption: false,
    })
    setEditingId(null)
    setShowForm(false)
    setError(null)
  }

  function startEdit(destination) {
    setFormData(destination)
    setEditingId(destination.id)
    setShowForm(true)
    setError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    
    const method = editingId ? 'PUT' : 'POST'
    const body = editingId ? { ...formData, id: editingId } : formData

    try {
      const response = await fetch('/api/destinations/cdn', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || data.errors?.join(', ') || 'Failed to save destination')
        return
      }

      await fetchDestinations()
      resetForm()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Are you sure you want to delete this destination?')) return

    setError(null)

    try {
      const response = await fetch('/api/destinations/cdn', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to delete destination')
        return
      }

      await fetchDestinations()
    } catch (err) {
      setError(err.message)
    }
  }

  if (error) return <div>Error: {error}</div>

  return (
    <Layout>
      <h1>CDN Destinations</h1>
      
      {error && <div style={{ color: 'red', marginBottom: '1rem', padding: '8px', backgroundColor: '#fee' }}>{error}</div>}

      <button onClick={() => setShowForm(!showForm)} style={{ marginBottom: '1rem', padding: '8px 16px' }}>
        {showForm ? 'Cancel' : 'Add Destination'}
      </button>

      {showForm && (
        <form onSubmit={handleSubmit} className="form" style={{ maxWidth: '600px' }}>
          <label>
            Label
            <input
              type="text"
              name="label"
              value={formData.label}
              onChange={handleInputChange}
              required
            />
          </label>

          <label>
            Path
            <input
              type="text"
              name="path"
              value={formData.path}
              onChange={handleInputChange}
              required
            />
          </label>

          <label>
            Bucket Name
            <input
              type="text"
              name="bucketName"
              value={formData.bucketName}
              onChange={handleInputChange}
              required
            />
          </label>

          <label>
            Region
            <input
              type="text"
              name="region"
              value={formData.region}
              onChange={handleInputChange}
              required
            />
          </label>

          <label>
            Access Key ID
            <input
              type="text"
              name="accessKeyId"
              value={formData.accessKeyId}
              onChange={handleInputChange}
              required
            />
          </label>

          <label>
            Secret Access Key
            <input
              type="password"
              name="secretAccessKey"
              value={formData.secretAccessKey}
              onChange={handleInputChange}
              required
            />
          </label>

          <label>
            Endpoint (Optional)
            <input
              type="text"
              name="endpoint"
              value={formData.endpoint}
              onChange={handleInputChange}
              placeholder="https://example.com"
            />
          </label>

          <label>
            Filename Format
            <input
              type="text"
              name="filenameFormat"
              value={formData.filenameFormat}
              onChange={handleInputChange}
              placeholder="{project}-{platform}-{date}"
              required
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              name="encryption"
              checked={formData.encryption}
              onChange={handleInputChange}
            />
            Enable Encryption
          </label>

          <button type="submit">{editingId ? 'Update' : 'Create'} Destination</button>
        </form>
      )}

      <h2>Destinations</h2>
      {destinations.length === 0 ? (
        <p>No destinations yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e6e9ee' }}>
              <th style={{ textAlign: 'left', padding: '8px' }}>Label</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Bucket</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Region</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Encryption</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {destinations.map((dest) => (
              <tr key={dest.id} style={{ borderBottom: '1px solid #e6e9ee' }}>
                <td style={{ padding: '8px' }}>{dest.label}</td>
                <td style={{ padding: '8px' }}>{dest.bucketName}</td>
                <td style={{ padding: '8px' }}>{dest.region}</td>
                <td style={{ padding: '8px' }}>{dest.encryption ? 'Yes' : 'No'}</td>
                <td style={{ padding: '8px' }}>
                  <button
                    onClick={() => startEdit(dest)}
                    style={{ marginRight: '8px', padding: '4px 8px', cursor: 'pointer' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(dest.id)}
                    style={{ padding: '4px 8px', background: '#dc2626', color: '#fff', cursor: 'pointer', border: 'none', borderRadius: '4px' }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Layout>
  )
}
