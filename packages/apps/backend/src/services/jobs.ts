/**
 * In-memory job store for background tasks (sync, process).
 */

import { randomUUID } from 'node:crypto';

export type JobStatus = 'running' | 'done' | 'error';

export type Job = {
  id: string;
  type: string;
  status: JobStatus;
  events: string[];
  createdAt: string;
  updatedAt: string;
};

const jobs = new Map<string, Job>();

export function createJob(type: string): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  jobs.set(id, {
    id,
    type,
    status: 'running',
    events: [],
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function appendEvent(id: string, line: string): void {
  const job = jobs.get(id);
  if (!job) return;
  job.events.push(line);
  job.updatedAt = new Date().toISOString();
}

export function setJobStatus(id: string, status: JobStatus): void {
  const job = jobs.get(id);
  if (!job) return;
  job.status = status;
  job.updatedAt = new Date().toISOString();
}
