/**
 * Job routes — GET /api/jobs/:id
 */
import { Hono } from 'hono';
import * as jobsService from '../services/jobs.js';
const app = new Hono();
app.get('/:id', (c) => {
    const id = c.req.param('id');
    const job = jobsService.getJob(id);
    if (!job) {
        return c.json({ error: 'Job not found' }, 404);
    }
    return c.json({
        status: job.status,
        output: job.events.join('\n'),
    });
});
export default app;
