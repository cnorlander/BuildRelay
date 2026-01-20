// ============================================================================
// LOGIN PAGE (login.js)
// ============================================================================
// Handles user authentication with username/password form
// Submits credentials to /api/auth/login and redirects on success
// ============================================================================

import { useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '../components/Layout'

export default function Login() {
  // ========================================================================
  // STATE MANAGEMENT
  // ========================================================================
  const [username, setUsername] = useState('') // Username input field
  const [password, setPassword] = useState('') // Password input field
  const [error, setError] = useState('') // Error message display
  const [loading, setLoading] = useState(false) // Form submission state
  const router = useRouter() // Next.js router for navigation

  // ========================================================================
  // FORM SUBMISSION HANDLER
  // ========================================================================
  // Sends username/password to backend for authentication
  // On success: redirects to dashboard (/)
  // On failure: displays error message
  async function handleSubmit(e) {
    e.preventDefault() // Prevent page reload
    setError('') // Clear previous errors
    setLoading(true) // Show loading state on button

    try {
      // Send login request to authentication endpoint
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!response.ok) {
        // Authentication failed - extract error message from response
        const data = await response.json()
        setError(data.error || 'Login failed')
        setLoading(false)
        return
      }

      // Login successful - navigate to dashboard
      router.push('/')
    } catch (err) {
      // Handle network or parsing errors
      setError('An error occurred. Please try again.')
      setLoading(false)
    }
  }

  // ========================================================================
  // RENDER: Login form UI
  // ========================================================================
  return (
    <div className="page">
      <div className="login-container">
        <div>
          <h1>BuildRelay</h1>
          {/* Display error messages if login fails */}
          {error && <div style={{ color: 'red', marginBottom: '1rem', textAlign: 'center' }}>{error}</div>}
          {/* Login form with username and password inputs */}
          <form onSubmit={handleSubmit} className="form">
            <label>
              Username
              {/* Text input for username */}
              <input
                type="text" value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="admin"
              />
            </label>
            <label>
              Password
              {/* Password input field */}
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="password"
                minLength={1}
              />
            </label>
            {/* Submit button - disabled during submission */}
            <button type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
      <footer className="footer">© {new Date().getFullYear()} BuildRelay</footer>
    </div>
  )
}
