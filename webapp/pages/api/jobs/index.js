import { validateAuth } from '@lib/auth';
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
//   - GET: Retrieve all jobs organized by status (queued, running, complete, failed)
//   - POST: Create a new job with project, services, and platform metadata
//   - DELETE: Clear a job queue (requires 'queue' query parameter: queued_jobs, running_jobs, complete_jobs, or failed_jobs)
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
      // Fetch jobs from all four status lists in parallel
      const [queuedJobsString, runningJobsString, completeJobsString, failedJobsString] = await Promise.all([
        client.lrange('queued_jobs', 0, -1),
        client.lrange('running_jobs', 0, -1),
        client.lrange('complete_jobs', 0, -1),
        client.lrange('failed_jobs', 0, -1),
      ]);

      // Parse JSON strings back to objects
      const queuedJobs = queuedJobsString.map(queuedJobsString => JSON.parse(queuedJobsString));
      const runningJobs = runningJobsString.map(runningJobsString => JSON.parse(runningJobsString));
      const completeJobs = completeJobsString.map(completeJobsString => JSON.parse(completeJobsString));
      const failedJobs = failedJobsString.map(failedJobsString => JSON.parse(failedJobsString));

      // Aggregate into single response object organized by status
      const jobs = {queuedJobs: queuedJobs, runningJobs: runningJobs, completeJobs: completeJobs, failedJobs: failedJobs};
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
  // DELETE - Clear a job queue
  // ========================================================================
  if (req.method === 'DELETE') {
    const { queue } = req.query;

    // Validate queue parameter
    const validQueues = ['queued_jobs', 'running_jobs', 'complete_jobs', 'failed_jobs'];
    if (!queue || !validQueues.includes(queue)) {
      return res.status(400).json({ 
        error: `Invalid queue. Must be one of: ${validQueues.join(', ')}` 
      });
    }

    try {
      // Get current length before deletion
      const lengthBefore = await client.llen(queue);
      
      // Clear the list by using ltrim with invalid range (start > stop clears the list)
      const trimResult = await client.ltrim(queue, 1, 0);
      
      // Verify it was cleared by checking length again
      const lengthAfter = await client.llen(queue);
      
      return res.status(200).json({ 
        success: true, 
        message: `Cleared ${queue}`,
        itemsRemoved: lengthBefore,
        lengthAfter: lengthAfter
      });
    } catch (err) {
      console.error(`Error clearing ${queue}:`, err);
      return res.status(500).json({ error: 'Failed to clear queue' });
    }
  }

  // ========================================================================
  // Method Not Allowed
  // ========================================================================
  res.setHeader('Allow', ['GET', 'POST', 'DELETE'])
  res.status(405).end(`Method ${req.method} Not Allowed`)
}
