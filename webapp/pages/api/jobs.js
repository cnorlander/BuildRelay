const clientPromise = require('../../lib/valkey'); // Import Valkey GLIDE client promise
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

  if (req.method === 'POST') {
    const { project, services, platform } = req.body || {};

    const errors = [];
    if (!project || typeof project !== 'string' || project.trim().length < 1) {
      errors.push('project must be a non-empty string');
    }
    if (!Array.isArray(services) || services.length === 0) {
      errors.push('services must be a non-empty array');
    }
    if (!platform || typeof platform !== 'string' || platform.trim().length < 1) {
      errors.push('platform must be a non-empty string');
    }

    if (errors.length) {
      return res.status(400).json({ errors });
    }

    const newJob = {
      id: randomUUID(),
      project: project.trim(),
      services,
      platform: platform.trim(),
      status: 'Queued',
      buildStep: 'Waiting for worker assignment.',
      createdAt: new Date().toISOString(),
      completedAt: null,
      metadata: {}
    };

    try {
      await client.lpush('queued_jobs', JSON.stringify(newJob));
      return res.status(201).json({ job: newJob });
    } catch (err) {
      console.error('Error saving job to Valkey:', err);
      return res.status(500).json({ error: 'Failed to create job' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST'])
  res.status(405).end(`Method ${req.method} Not Allowed`)
}
