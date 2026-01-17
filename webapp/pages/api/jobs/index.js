import { validateAuth } from '@lib/auth';
import { ensureInitialized } from '@lib/init';
const clientPromise = require('@lib/valkey');
const { randomUUID } = require('crypto');

// ============================================================================
// JOBS API ROUTE
// ============================================================================
// Handles job queue management and retrieval
// Retrieves jobs from three Valkey lists: queued, running, and complete
// Returns aggregated job status across all phases
//
// Supported Methods:
//   - GET: Retrieve all jobs organized by status (queued, running, complete)
//   - POST: Create a new job with project, services, and platform metadata
// ============================================================================

export default async function handler(req, res) {
  // ========================================================================
  // Authentication & Initialization
  // ========================================================================
  
  // Validate caller has either valid API key or JWT token
  if (!validateAuth(req)) {
    return res.status(401).json({ error: 'Invalid or missing authentication' });
  }

  const client = await clientPromise;

  // ========================================================================
  // GET - Retrieve all jobs by status
  // ========================================================================
  if (req.method === 'GET') {
    try {
      // Fetch jobs from all three status lists in parallel
      const [queuedJobsString, runningJobsString, completeJobsString] = await Promise.all([
        client.lrange('queued_jobs', 0, -1),
        client.lrange('running_jobs', 0, -1),
        client.lrange('complete_jobs', 0, -1),
      ]);

      // Parse JSON strings back to objects
      const queuedJobs = queuedJobsString.map(queuedJobsString => JSON.parse(queuedJobsString));
      const runningJobs = runningJobsString.map(runningJobsString => JSON.parse(runningJobsString));
      const completeJobs = completeJobsString.map(completeJobsString => JSON.parse(completeJobsString));

      // Aggregate into single response object organized by status
      const jobs = {queuedJobs: queuedJobs, runningJobs: runningJobs, completeJobs: completeJobs};
      return res.status(200).json({ jobs });
    } catch (err) {
      console.error('Error getting jobs from Valkey:', err);
      return res.status(500).json({ error: 'Failed to get jobs' });
    }
  }

  // ========================================================================
  // POST - Create a new job
  // ========================================================================
  if (req.method === 'POST') {
    // Extract job metadata from request body
    const { project, services, platform } = req.body || {};

    // Input Validation
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

    // Create Job Object
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
      // Persist job to Valkey queue (LPUSH adds to head of list)
      await client.lpush('queued_jobs', JSON.stringify(newJob));
      return res.status(201).json({ job: newJob });
    } catch (err) {
      console.error('Error saving job to Valkey:', err);
      return res.status(500).json({ error: 'Failed to create job' });
    }
  }

  // ========================================================================
  // Method Not Allowed
  // ========================================================================
  res.setHeader('Allow', ['GET', 'POST'])
  res.status(405).end(`Method ${req.method} Not Allowed`)
}
