import Link from 'next/link'

export default function Header() {
  return (
    <header className="header">
      <nav>
        <Link href="/">Home</Link>
        <span style={{ margin: '0 12px' }}>|</span>
        <Link href="/login">Login</Link>
      </nav>
    </header>
  )
}
