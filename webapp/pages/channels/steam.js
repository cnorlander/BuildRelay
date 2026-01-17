import { useEffect, useState } from 'react'
import Layout from '../../components/Layout'

// ============================================================================
// STEAM CHANNELS PAGE
// ============================================================================
// Manages Steam channel configuration UI
// Provides interface for creating, updating, and deleting Steam channels
// Each channel specifies Steam app ID, branch, and depot configuration
// ============================================================================

export default function SteamChannels() {
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
    appId: '',
    branch: '',
    depots: [],
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
  
  // Fetch all Steam channels from API
  async function fetchChannels() {
    try {
      const response = await fetch('/api/channels/steam')
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
  
  // Handle form input changes
  function handleInputChange(e) {
    const { name, value } = e.target
    setFormData({
      ...formData,
      [name]: value,
    })
  }

  // Add new empty depot to form
  function addDepot() {
    setFormData({
      ...formData,
      depots: [...formData.depots, { id: '', path: '' }]
    })
  }

  // Remove depot at specified index
  function removeDepot(index) {
    setFormData({
      ...formData,
      depots: formData.depots.filter((_, i) => i !== index)
    })
  }

  // Update specific depot field
  function updateDepot(index, field, value) {
    const newDepots = [...formData.depots]
    newDepots[index][field] = value
    setFormData({
      ...formData,
      depots: newDepots
    })
  }

  // Reset form to initial state
  function resetForm() {
    setFormData({
      label: '',
      appId: '',
      branch: '',
      depots: [],
    })
    setEditingId(null)
    setShowForm(false)
    setError(null)
  }

  // Load channel data into form for editing
  function startEdit(channel) {
    setFormData({
      label: channel.label,
      appId: channel.appId,
      branch: channel.branch || '',
      depots: channel.depots || [],
    })
    setEditingId(channel.id)
    setShowForm(true)
    setError(null)
  }

  // ========================================================================
  // Submit and Delete Handlers
  // ========================================================================
  
  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    // Validate at least one depot exists
    if (formData.depots.length === 0) {
      setError('At least one depot is required')
      return
    }

    // Determine POST (create) or PUT (update) based on edit mode
    const method = editingId ? 'PUT' : 'POST'
    
    // Build request body
    let body = {
      label: formData.label,
      appId: formData.appId,
      branch: formData.branch || null,
      depots: formData.depots,
    }
    if (editingId) body.id = editingId

    try {
      // Submit channel to API
      const response = await fetch('/api/channels/steam', {
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
      const response = await fetch('/api/channels/steam', {
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
      <h1>Steam Channels</h1>

      {/* Error message display */}
      {error && <div className="error-message">{error}</div>}

      {/* Toggle form visibility button */}
      <button onClick={() => setShowForm(!showForm)} className="action-button">
        {showForm ? 'Cancel' : 'Add Steam Channel'}
      </button>

      {/* Channel creation/editing form - only shown when showForm is true */}
      {showForm && (
        <form onSubmit={handleSubmit} className="channel-form">
          {/* Basic channel metadata */}
          <label>
            Label
            <input type="text" name="label" value={formData.label} onChange={handleInputChange} required />
          </label>

          {/* Steam application identifier */}
          <label>
            App ID
            <input type="text" name="appId" value={formData.appId} onChange={handleInputChange} placeholder="e.g., 1234567" required />
          </label>

          {/* Optional branch specification (e.g., beta, staging) */}
          <label>
            Branch (Optional)
            <input type="text" name="branch" value={formData.branch} onChange={handleInputChange} placeholder="e.g., beta" />
          </label>

          {/* Depot configuration section */}
          <div className="depot-section">
            <label className="depot-section-label">
              Depots {formData.depots.length > 0 && `(${formData.depots.length})`}
            </label>
            {/* List of configured depots with remove buttons */}
            {formData.depots.map((depot, idx) => (
              <div key={idx} className="depot-item">
                <div className="depot-inputs">
                  <input type="text" placeholder="Depot ID" value={depot.id} onChange={(e) => updateDepot(idx, 'id', e.target.value)} className="depot-input" />
                  <input type="text" placeholder="Path (optional)" value={depot.path} onChange={(e) => updateDepot(idx, 'path', e.target.value)} className="depot-input" />
                  <button type="button" onClick={() => removeDepot(idx)} className="remove-button">Remove</button>
                </div>
              </div>
            ))}
            {/* Add new depot button */}
            <button type="button" onClick={addDepot} className="add-depot-button">Add Depot</button>
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
        <p>No Steam channels yet.</p>
      ) : (
        <table className="channels-table">
          <thead>
            <tr>
              <th>Label</th>
              <th>App ID</th>
              <th>Branch</th>
              <th>Depots</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {/* Render each channel as a table row */}
            {channels.map((ch) => (
              <tr key={ch.id}>
                <td>{ch.label}</td>
                <td>{ch.appId}</td>
                <td>{ch.branch || '-'}</td>
                <td>{ch.depots.length}</td>
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
