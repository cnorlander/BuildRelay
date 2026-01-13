export default function JobsList({ title, jobs }) {
  return (
    <>
      <h2>{title}</h2>
      <ul>
        {jobs.map((job) => (
          <li key={job.id}>
            {job.project} - {job.platform} - {job.status}
          </li>
        ))}
      </ul>
    </>
  )
}
