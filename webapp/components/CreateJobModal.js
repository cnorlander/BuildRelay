import { useState, useEffect } from 'react';

const UNITY_PLATFORMS = [
  { value: 'windows', label: 'Windows' },
  { value: 'macos', label: 'macOS' },
  { value: 'linux', label: 'Linux' },
  { value: 'ios', label: 'iOS' },
  { value: 'android', label: 'Android' },
  { value: 'webgl', label: 'WebGL' },
  { value: 'tvos', label: 'tvOS' },
];

function getBuildIcon(name, isDirectory) {
  if (isDirectory) return 'fa-folder';
  const extension = name.split('.').pop().toLowerCase();
  switch (extension) {
    case 'zip':
      return 'fa-file-archive';
    case 'apk':
      return 'fa-mobile-alt';
    case 'ipa':
      return 'fa-mobile-alt';
    case 'exe':
      return 'fa-file';
    case 'app':
      return 'fa-file';
    default:
      return 'fa-file';
  }
}

export default function CreateJobModal({ isOpen, onClose, onJobCreated }) {
  const [formData, setFormData] = useState({
    project: '',
    description: '',
    platform: 'windows',
    ingestPath: '',
    steam_channel_labels: [],
    cdn_channel_labels: [],
  });

  const [builds, setBuilds] = useState([]);
  const [steamChannels, setSteamChannels] = useState([]);
  const [cdnChannels, setCdnChannels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [buildsRes, steamRes, cdnRes] = await Promise.all([
        fetch('/api/builds'),
        fetch('/api/channels/steam'),
        fetch('/api/channels/cdn'),
      ]);

      if (!buildsRes.ok || !steamRes.ok || !cdnRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const buildsData = await buildsRes.json();
      const steamData = await steamRes.json();
      const cdnData = await cdnRes.json();

      setBuilds(buildsData.builds || []);
      setSteamChannels(steamData.channels || []);
      setCdnChannels(cdnData.channels || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleChannelToggle = (label, type) => {
    const key = type === 'steam' ? 'steam_channel_labels' : 'cdn_channel_labels';
    setFormData(prev => ({
      ...prev,
      [key]: prev[key].includes(label)
        ? prev[key].filter(l => l !== label)
        : [...prev[key], label],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/jobs/filesystem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project: formData.project,
          description: formData.description || undefined,
          platform: formData.platform,
          ingestPath: formData.ingestPath,
          steam_channel_labels: formData.steam_channel_labels,
          cdn_channel_labels: formData.cdn_channel_labels,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.errors?.join(', ') || 'Failed to create job');
      }

      // Reset form and close modal
      setFormData({
        project: '',
        description: '',
        platform: 'windows',
        ingestPath: '',
        steam_channel_labels: [],
        cdn_channel_labels: [],
      });
      
      if (onJobCreated) {
        onJobCreated(data.job);
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '8px',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '90vh',
        overflow: 'auto',
        padding: '24px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>Create Build Job</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#6b7280',
            }}
          >
            ×
          </button>
        </div>

        {error && (
          <div style={{
            backgroundColor: '#fee',
            border: '1px solid #fca5a5',
            color: '#dc2626',
            padding: '12px',
            borderRadius: '4px',
            marginBottom: '16px',
            fontSize: '14px',
          }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>Loading...</div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Project */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>
                Project Name <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                type="text"
                name="project"
                value={formData.project}
                onChange={handleInputChange}
                required
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
                placeholder="e.g., My Game"
              />
            </div>

            {/* Description */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>
                Description
              </label>
              <input
                type="text"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
                placeholder="e.g., V1.0.0 Beta"
              />
            </div>

            {/* Platform */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>
                Platform <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <select
                name="platform"
                value={formData.platform}
                onChange={handleInputChange}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              >
                {UNITY_PLATFORMS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            {/* Build */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>
                Build <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <select
                name="ingestPath"
                value={formData.ingestPath}
                onChange={handleInputChange}
                required
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              >
                <option value="">Select a build...</option>
                {builds.map(build => (
                  <option key={build.name} value={build.name}>
                    <i className={`fas ${getBuildIcon(build.name, build.isDirectory)}`} /> {build.name} {build.isDirectory ? '(dir)' : ''}
                  </option>
                ))}
              </select>
              {builds.length === 0 && (
                <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>
                  No builds available. Please upload a build first.
                </p>
              )}
            </div>

            {/* Steam Channels */}
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                Steam Channels
              </label>
              <div style={{ display: 'grid', gap: '8px', maxHeight: '120px', overflowY: 'auto' }}>
                {steamChannels.length === 0 ? (
                  <p style={{ fontSize: '12px', color: '#6b7280' }}>No Steam channels configured</p>
                ) : (
                  steamChannels.map(channel => (
                    <label key={channel.id} style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                      <input
                        type="checkbox"
                        checked={formData.steam_channel_labels.includes(channel.label)}
                        onChange={() => handleChannelToggle(channel.label, 'steam')}
                        style={{ marginRight: '8px' }}
                      />
                      {channel.label}
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* CDN Channels */}
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                CDN Channels
              </label>
              <div style={{ display: 'grid', gap: '8px', maxHeight: '120px', overflowY: 'auto' }}>
                {cdnChannels.length === 0 ? (
                  <p style={{ fontSize: '12px', color: '#6b7280' }}>No CDN channels configured</p>
                ) : (
                  cdnChannels.map(channel => (
                    <label key={channel.id} style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                      <input
                        type="checkbox"
                        checked={formData.cdn_channel_labels.includes(channel.label)}
                        onChange={() => handleChannelToggle(channel.label, 'cdn')}
                        style={{ marginRight: '8px' }}
                      />
                      {channel.label}
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* Form Actions */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  backgroundColor: '#fff',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '14px',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || builds.length === 0}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: '#2563eb',
                  color: '#fff',
                  cursor: submitting || builds.length === 0 ? 'not-allowed' : 'pointer',
                  fontWeight: '500',
                  fontSize: '14px',
                  opacity: submitting || builds.length === 0 ? 0.6 : 1,
                }}
              >
                {submitting ? 'Creating...' : 'Create Job'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
