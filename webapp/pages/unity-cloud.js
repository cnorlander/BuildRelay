// ============================================================================
// UNITY CLOUD MAPPINGS PAGE
// ============================================================================
// UI for managing UnityCloudMapping objects that link build targets to channels
// Allows creating, editing, and deleting mappings with channel selection
// ============================================================================

import { useEffect, useState } from 'react'
import Layout from '../components/Layout'

export default function UnityCloudPage() {
  // ========================================================================
  // STATE MANAGEMENT
  // ========================================================================
  const [mappings, setMappings] = useState([]) // All cloud mappings
  const [channels, setChannels] = useState({ steam: [], cdn: [] }) // Available channels
  const [loading, setLoading] = useState(true) // Page loading state
  const [error, setError] = useState(null) // Error messages
  const [showForm, setShowForm] = useState(false) // Form visibility toggle
  const [editingId, setEditingId] = useState(null) // ID of mapping being edited

  // Form data state
  const [formData, setFormData] = useState({
    build_target: '',
    project: '',
    description: '',
    steam_channel_labels: [],
    cdn_channel_labels: [],
  })

  // ========================================================================
  // EFFECT: Load mappings and channels on mount
  // ========================================================================
  useEffect(() => {
    fetchMappingsAndChannels()
  }, [])

  // ========================================================================
  // DATA FETCHING
  // ========================================================================

  // Fetch all mappings and available channels
  async function fetchMappingsAndChannels() {
    try {
      setLoading(true)
      
      // Fetch mappings
      const mappingsRes = await fetch('/api/unity-cloud-mappings')
      if (!mappingsRes.ok) throw new Error('Failed to fetch mappings')
      const mappingsData = await mappingsRes.json()
      setMappings(mappingsData.mappings || [])

      // Fetch channels (Steam and CDN) from existing endpoints
      const steamRes = await fetch('/api/channels/steam', { credentials: 'include' })
      if (!steamRes.ok) throw new Error('Failed to fetch steam channels')
      const steamData = await steamRes.json()
      
      const cdnRes = await fetch('/api/channels/cdn', { credentials: 'include' })
      if (!cdnRes.ok) throw new Error('Failed to fetch cdn channels')
      const cdnData = await cdnRes.json()
      
      setChannels({
        steam: steamData.channels.map(ch => ch.label),
        cdn: cdnData.channels.map(ch => ch.label),
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ========================================================================
  // FORM HANDLERS
  // ========================================================================

  // Handle text input changes
  function handleInputChange(e) {
    const { name, value } = e.target
    setFormData({ ...formData, [name]: value })
  }

  // Handle steam channel checkbox changes
  function handleSteamChannelChange(label) {
    setFormData(prev => ({
      ...prev,
      steam_channel_labels: prev.steam_channel_labels.includes(label)
        ? prev.steam_channel_labels.filter(l => l !== label)
        : [...prev.steam_channel_labels, label]
    }))
  }

  // Handle CDN channel checkbox changes
  function handleCdnChannelChange(label) {
    setFormData(prev => ({
      ...prev,
      cdn_channel_labels: prev.cdn_channel_labels.includes(label)
        ? prev.cdn_channel_labels.filter(l => l !== label)
        : [...prev.cdn_channel_labels, label]
    }))
  }

  // Reset form to initial state
  function resetForm() {
    setFormData({
      build_target: '',
      project: '',
      description: '',
      steam_channel_labels: [],
      cdn_channel_labels: [],
    })
    setEditingId(null)
    setShowForm(false)
    setError(null)
  }

  // Load mapping data into form for editing
  function startEdit(mapping) {
    setFormData({
      build_target: mapping.build_target,
      project: mapping.project,
      description: mapping.description || '',
      steam_channel_labels: mapping.steam_channel_labels,
      cdn_channel_labels: mapping.cdn_channel_labels,
    })
    setEditingId(mapping.id)
    setShowForm(true)
    setError(null)
  }

  // ========================================================================
  // SUBMIT AND DELETE HANDLERS
  // ========================================================================

  // Submit mapping (create or update)
  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    const method = editingId ? 'PUT' : 'POST'
    const url = editingId ? `/api/unity-cloud-mappings/${editingId}` : '/api/unity-cloud-mappings'
    const body = editingId
      ? { ...formData, id: editingId }
      : formData

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || data.errors?.join(', ') || 'Failed to save mapping')
        return
      }

      // Refresh mappings and reset form
      await fetchMappingsAndChannels()
      resetForm()
    } catch (err) {
      setError(err.message)
    }
  }

  // Delete mapping after confirmation
  async function handleDelete(id) {
    if (!confirm('Are you sure you want to delete this mapping?')) return

    setError(null)

    try {
      const response = await fetch(`/api/unity-cloud-mappings/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to delete mapping')
        return
      }

      // Refresh mappings list
      await fetchMappingsAndChannels()
    } catch (err) {
      setError(err.message)
    }
  }

  // ========================================================================
  // RENDER
  // ========================================================================

  if (loading) return <Layout><div>Loading...</div></Layout>

  return (
    <Layout>
      <h1>Unity Cloud Build Mappings</h1>

      {/* Error message display */}
      {error && <div className="error-message">{error}</div>}

      {/* Toggle form visibility button */}
      <button onClick={() => setShowForm(!showForm)} className="action-button">
        {showForm ? 'Cancel' : 'Add Mapping'}
      </button>

      {/* Mapping creation/editing form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="channel-form">
          {/* Build target field - unique identifier */}
          <label>
            Build Target
            <input
              type="text"
              name="build_target"
              value={formData.build_target}
              onChange={handleInputChange}
              placeholder="e.g., iOS, Android, Windows"
              required
            />
          </label>

          {/* Project field */}
          <label>
            Project
            <input
              type="text"
              name="project"
              value={formData.project}
              onChange={handleInputChange}
              required
            />
          </label>

          {/* Optional description */}
          <label>
            Description
            <input
              type="text"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="Optional notes about this mapping"
            />
          </label>

          {/* Steam channel selection */}
          <fieldset>
            <legend>Steam Channels</legend>
            {channels.steam.length === 0 ? (
              <p>No Steam channels configured</p>
            ) : (
              channels.steam.map(label => (
                <label key={label}>
                  <input
                    type="checkbox"
                    checked={formData.steam_channel_labels.includes(label)}
                    onChange={() => handleSteamChannelChange(label)}
                  />
                  {label}
                </label>
              ))
            )}
          </fieldset>

          {/* CDN channel selection */}
          <fieldset>
            <legend>CDN Channels</legend>
            {channels.cdn.length === 0 ? (
              <p>No CDN channels configured</p>
            ) : (
              channels.cdn.map(label => (
                <label key={label}>
                  <input
                    type="checkbox"
                    checked={formData.cdn_channel_labels.includes(label)}
                    onChange={() => handleCdnChannelChange(label)}
                  />
                  {label}
                </label>
              ))
            )}
          </fieldset>

          {/* Form action buttons */}
          <div className="form-actions">
            <button type="submit" className="submit-button">
              {editingId ? 'Update' : 'Create'} Mapping
            </button>
            <button type="button" onClick={resetForm} className="cancel-button">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Display mappings list or empty state */}
      {mappings.length === 0 ? (
        <p>No mappings yet.</p>
      ) : (
        <table className="channels-table">
          <thead>
            <tr>
              <th>Build Target</th>
              <th>Project</th>
              <th>Description</th>
              <th>Steam Channels</th>
              <th>CDN Channels</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map(mapping => (
              <tr key={mapping.id}>
                <td>{mapping.build_target}</td>
                <td>{mapping.project}</td>
                <td>{mapping.description || '-'}</td>
                <td>{mapping.steam_channel_labels.join(', ') || '-'}</td>
                <td>{mapping.cdn_channel_labels.join(', ') || '-'}</td>
                <td>
                  <div className="table-actions">
                    <button onClick={() => startEdit(mapping)} className="edit-button">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(mapping.id)} className="delete-button">
                      Delete
                    </button>
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
