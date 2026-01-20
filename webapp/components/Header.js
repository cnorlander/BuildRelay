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
      <nav className="nav-bar">
        <div className="nav-left">
          <Link href="/">Home</Link>
          <div className="nav-relative">
            <button
              onClick={() => setShowChannelsDropdown(!showChannelsDropdown)}
              className="dropdown-toggle"
            >
              Channels ▼
            </button>
            {showChannelsDropdown && (
              <div className="dropdown-menu">
                <button
                  onClick={() => navigateTo('/channels/cdn')}
                  className="dropdown-item"
                >
                  CDN Channels
                </button>
                <button
                  onClick={() => navigateTo('/channels/steam')}
                  className="dropdown-item"
                >
                  Steam Channels
                </button>
              </div>
            )}
          </div>
        </div>
        <button onClick={handleLogout} className="logout-btn">
          Logout
        </button>
      </nav>
    </header>
  )
}
