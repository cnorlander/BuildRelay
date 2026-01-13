const clientPromise = require('@lib/valkey'); // Import Valkey GLIDE client promise
const { randomUUID } = require('crypto');

export default async function handler(req, res) {
  const client = await clientPromise; // Await the client

  if (req.method === 'GET') {
    try {

      // Fetch jobs from Valkey lists
      const [queuedJobsString, runningJobsString, completeJobsString] = await Promise.all([
        client.lrange('queued_jobs', 0, -1),
        client.lrange('running_jobs', 0, -1),
        client.lrange('complete_jobs', 0, -1),
      ]);

      // Parse job strings into objects
      const queuedJobs = queuedJobsString.map(queuedJobsString => JSON.parse(queuedJobsString));
      const runningJobs = runningJobsString.map(runningJobsString => JSON.parse(runningJobsString));
      const completeJobs = completeJobsString.map(completeJobsString => JSON.parse(completeJobsString));

      // Format them into a single response object
      const jobs = {queuedJobs: queuedJobs, runningJobs: runningJobs, completeJobs: completeJobs};
      return res.status(200).json({ jobs });
    } catch (err) {
      console.error('Error getting jobs from Valkey:', err);
      return res.status(500).json({ error: 'Failed to get jobs' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST'])
  res.status(405).end(`Method ${req.method} Not Allowed`)
}
