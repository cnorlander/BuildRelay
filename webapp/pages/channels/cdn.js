import { useEffect, useState } from 'react'
import Layout from '../../components/Layout'

// ============================================================================
// CDN CHANNELS PAGE
// ============================================================================
// Manages CDN channel configuration UI
// Provides interface for creating, updating, and deleting CDN channels
// Each channel specifies S3/CDN upload parameters and access credentials
// ============================================================================

export default function CDNChannels() {
  // ========================================================================
  // State Management
  // ========================================================================
  
  // Channel data and loading/error states
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // Form visibility and edit mode
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  
  // Form data for channel creation/editing
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
    isPublic: false,
  })

  // ========================================================================
  // Lifecycle Hooks
  // ========================================================================
  
  // Load channels on component mount
  useEffect(() => {
    fetchChannels()
  }, [])

  // ========================================================================
  // Data Fetching
  // ========================================================================
  
  // Fetch all CDN channels from API
  async function fetchChannels() {
    try {
      const response = await fetch('/api/channels/cdn')
      const data = await response.json()
      setChannels(data.channels || [])
      setLoading(false)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  // ========================================================================
  // Form Handlers
  // ========================================================================
  
  // Handle form input and checkbox changes
  function handleInputChange(e) {
    const { name, value, type, checked } = e.target
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value,
    })
  }

  // Reset form to initial state
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
      isPublic: false,
    })
    setEditingId(null)
    setShowForm(false)
    setError(null)
  }

  // Load channel data into form for editing
  function startEdit(channel) {
    setFormData(channel)
    setEditingId(channel.id)
    setShowForm(true)
    setError(null)
  }

  // ========================================================================
  // Submit and Delete Handlers
  // ========================================================================
  
  // Submit channel (create or update)
  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    
    // Determine POST (create) or PUT (update) based on edit mode
    const method = editingId ? 'PUT' : 'POST'
    const body = editingId ? { ...formData, id: editingId } : formData

    try {
      // Submit channel to API
      const response = await fetch('/api/channels/cdn', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || data.errors?.join(', ') || 'Failed to save channel')
        return
      }

      // Refresh channels list and reset form
      await fetchChannels()
      resetForm()
    } catch (err) {
      setError(err.message)
    }
  }

  // Delete channel after confirmation
  async function handleDelete(id) {
    if (!confirm('Are you sure you want to delete this channel?')) return

    setError(null)

    try {
      const response = await fetch('/api/channels/cdn', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to delete channel')
        return
      }

      // Refresh channels list after deletion
      await fetchChannels()
    } catch (err) {
      setError(err.message)
    }
  }

  // ========================================================================
  // Render
  // ========================================================================
  
  if (loading) return <Layout><div>Loading...</div></Layout>

  return (
    <Layout>
      <h1>CDN Channels</h1>

      {/* Error message display */}
      {error && <div className="error-message">{error}</div>}

      {/* Toggle form visibility button */}
      <button onClick={() => setShowForm(!showForm)} className="action-button">
        {showForm ? 'Cancel' : 'Add CDN Channel'}
      </button>

      {/* Channel creation/editing form - only shown when showForm is true */}
      {showForm && (
        <form onSubmit={handleSubmit} className="channel-form">
          {/* Basic channel metadata fields */}
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

          {/* S3/CDN storage configuration fields */}
          <label>
            Path
            <input type="text" name="path" value={formData.path} onChange={handleInputChange} required />
          </label>

          <label>
            Bucket Name
            <input type="text" name="bucketName" value={formData.bucketName} onChange={handleInputChange} required />
          </label>

          <label>
            Region
            <input type="text" name="region" value={formData.region} onChange={handleInputChange} required />
          </label>

          {/* AWS/S3 authentication credentials */}
          <label>
            Access Key ID
            <input type="text" name="accessKeyId" value={formData.accessKeyId} onChange={handleInputChange} required />
          </label>

          <label>
            Secret Access Key
            <input type="password" name="secretAccessKey" value={formData.secretAccessKey} onChange={handleInputChange} required />
          </label>

          {/* Optional endpoint override for S3-compatible services */}
          <label>
            Endpoint (Optional)
            <input type="text" name="endpoint" value={formData.endpoint} onChange={handleInputChange} placeholder="https://example.com" />
          </label>

          {/* Output filename format template */}
          <label>
            Filename Format
            <input type="text" name="filenameFormat" value={formData.filenameFormat} onChange={handleInputChange} placeholder="{project}-{platform}-{date}" required />
          </label>

          {/* Security and access control toggles */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input type="checkbox" name="encryption" checked={formData.encryption} onChange={handleInputChange} />
            <span>Enable Encryption</span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input type="checkbox" name="isPublic" checked={formData.isPublic} onChange={handleInputChange} />
            <span>Public</span>
          </div>

          {/* Form action buttons */}
          <div className="form-actions">
            <button type="submit" className="submit-button">{editingId ? 'Update' : 'Create'} Channel</button>
            <button type="button" onClick={resetForm} className="cancel-button">Cancel</button>
          </div>
        </form>
      )}

      {/* Display channels list or empty state */}
      {channels.length === 0 ? (
        <p>No CDN channels yet.</p>
      ) : (
        <table className="channels-table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Bucket</th>
              <th>Region</th>
              <th>Encryption</th>
              <th>Public</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {/* Render each channel as a table row */}
            {channels.map((ch) => (
              <tr key={ch.id}>
                <td>{ch.label}</td>
                <td>{ch.bucketName}</td>
                <td>{ch.region}</td>
                <td>{ch.encryption ? 'Yes' : 'No'}</td>
                <td>{ch.isPublic ? 'Yes' : 'No'}</td>
                {/* Edit and Delete action buttons per channel */}
                <td>
                  <div className="table-actions">
                    <button onClick={() => startEdit(ch)} className="edit-button">Edit</button>
                    <button onClick={() => handleDelete(ch.id)} className="delete-button">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Layout>
  )
}
