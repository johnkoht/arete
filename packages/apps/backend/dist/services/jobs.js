/**
 * In-memory job store for background tasks (sync, process).
 */
import { randomUUID } from 'node:crypto';
const jobs = new Map();
export function createJob(type) {
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
export function getJob(id) {
    return jobs.get(id);
}
export function appendEvent(id, line) {
    const job = jobs.get(id);
    if (!job)
        return;
    job.events.push(line);
    job.updatedAt = new Date().toISOString();
}
export function setJobStatus(id, status) {
    const job = jobs.get(id);
    if (!job)
        return;
    job.status = status;
    job.updatedAt = new Date().toISOString();
}
