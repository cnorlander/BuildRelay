import { useState } from 'react'
import Layout from '../components/Layout'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    // Intentionally no auth logic — just a placeholder
    console.log('Login attempt', { email, password })
    alert('Login flow not implemented (placeholder).')
  }

  return (
    <Layout>
      <h1>Login</h1>
      <form onSubmit={handleSubmit} className="form">
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="password"
            minLength={6}
          />
        </label>
        <button type="submit">Sign in</button>
      </form>
    </Layout>
  )
}
