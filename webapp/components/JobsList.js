import Link from 'next/link';

export default function JobsList({ title, jobs }) {
  const isCompleted = title.includes('Complete');
  
  return (
    <>
      <h2>{title}</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {jobs.map((job) => {
          const href = isCompleted
            ? `/build-history/${job.id}`
            : `/build/${job.id}`;
          
          return (
            <li key={job.id} style={{ marginBottom: '8px' }}>
              <Link 
                href={href}
                style={{
                  color: '#0066cc',
                  textDecoration: 'none',
                  cursor: 'pointer',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  display: 'inline-block',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                {job.project} - {job.platform} - {job.status}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
