import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'

export default function Header() {
  const router = useRouter()
  const [showChannelsDropdown, setShowChannelsDropdown] = useState(false)

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  function navigateTo(path) {
    router.push(path)
    setShowChannelsDropdown(false)
  }

  return (
    <header className="header">
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <Link href="/">Home</Link>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowChannelsDropdown(!showChannelsDropdown)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1rem',
                color: 'inherit',
                padding: '0'
              }}
            >
              Channels ▼
            </button>
            {showChannelsDropdown && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: '0',
                background: '#fff',
                border: '1px solid #e6e9ee',
                borderRadius: '4px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                minWidth: '150px',
                zIndex: 1000,
                marginTop: '4px'
              }}>
                <button
                  onClick={() => navigateTo('/channels/cdn')}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '12px 16px',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    borderBottom: '1px solid #e6e9ee'
                  }}
                >
                  CDN Channels
                </button>
                <button
                  onClick={() => navigateTo('/channels/steam')}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '12px 16px',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '1rem'
                  }}
                >
                  Steam Channels
                </button>
              </div>
            )}
          </div>
        </div>
        <button onClick={handleLogout} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
          Logout
        </button>
      </nav>
    </header>
  )
}
