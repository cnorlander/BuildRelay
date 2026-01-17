import Link from 'next/link'
import Layout from '../components/Layout'

export default function ChannelsIndex() {
  return (
    <Layout>
      <h1>Channels</h1>
      <p>Select a channel type from the menu to get started.</p>
      <div style={{ marginTop: '2rem' }}>
        <Link href="/channels/cdn" style={{ display: 'inline-block', padding: '12px 24px', background: '#2563eb', color: '#fff', marginRight: '1rem', borderRadius: '4px', textDecoration: 'none' }}>
          CDN Channels
        </Link>
        <Link href="/channels/steam" style={{ display: 'inline-block', padding: '12px 24px', background: '#2563eb', color: '#fff', borderRadius: '4px', textDecoration: 'none' }}>
          Steam Channels
        </Link>
      </div>
    </Layout>
  )
}

