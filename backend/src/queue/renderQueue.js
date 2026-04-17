import 'dotenv/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { query } from '../db.js';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null
});

export const renderQueue = new Queue('render-jobs', { connection });

export async function enqueueRenderJob(renderJobId, projectId) {
  await renderQueue.add('render-project', { renderJobId, projectId });
}

new Worker(
  'render-jobs',
  async (job) => {
    const { renderJobId } = job.data;
    await query(`update render_jobs set status = 'processing', logs = 'processing' where id = $1`, [renderJobId]);

    // Real implementation should call the Python worker here.
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await query(
      `update render_jobs set status = 'done', logs = 'finished', output_url = $2 where id = $1`,
      [renderJobId, '/outputs/demo-output.mp4']
    );
  },
  { connection }
);
