import 'dotenv/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { query } from '../db.js';
import { decryptValue } from '../utils/crypto.js';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

export const analyzeQueue = new Queue('analyze-videos', { connection });

export async function enqueueAnalyzeJob(candidateVideoId) {
  await query(
    `update candidate_videos set analysis_status = 'queued', analysis_error = null where id = $1`,
    [candidateVideoId],
  );
  await analyzeQueue.add('analyze', { candidateVideoId }, {
    attempts: 1,
    removeOnComplete: 500,
    removeOnFail:     500,
  });
}

async function readConfigValue(key) {
  const res = await query(`select value, encrypted from config where key = $1`, [key]);
  if (!res.rowCount) return null;
  const row = res.rows[0];
  try {
    return row.encrypted ? decryptValue(row.value) : row.value;
  } catch {
    return null;
  }
}

async function processAnalyze({ candidateVideoId }) {
  // Load candidate
  const res = await query(
    `select id, source, title, url, description, duration_sec, domain_tags
       from candidate_videos
      where id = $1`,
    [candidateVideoId],
  );
  if (!res.rowCount) return;
  const cand = res.rows[0];

  await query(
    `update candidate_videos set analysis_status = 'processing', analysis_error = null where id = $1`,
    [candidateVideoId],
  );

  // Pull API keys / cookies from config table
  const [openaiKey, anthropicKey, fbCookies, ytCookies] = await Promise.all([
    readConfigValue('openai_api_key'),
    readConfigValue('anthropic_api_key'),
    readConfigValue('facebook_cookies_txt'),
    readConfigValue('youtube_cookies_txt'),
  ]);

  let cookiesTxt = null;
  if (cand.source === 'facebook') cookiesTxt = fbCookies || null;
  else if (cand.source === 'youtube') cookiesTxt = ytCookies || null;

  const workerUrl = (process.env.WORKER_BASE_URL || 'http://127.0.0.1:8101').replace(/\/$/, '');
  const payload = {
    candidate_id: cand.id,
    url:          cand.url,
    source:       cand.source,
    title:        cand.title,
    description:  cand.description,
    duration_sec: cand.duration_sec,
    domain_tags:  cand.domain_tags || {},
    cookies_txt:       cookiesTxt,
    anthropic_api_key: anthropicKey || null,
    openai_api_key:    openaiKey    || null,
  };

  let result;
  try {
    const r = await fetch(`${workerUrl}/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(`worker HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
    result = await r.json();
  } catch (err) {
    await query(
      `update candidate_videos
          set analysis_status = 'failed',
              analysis_error  = $1,
              analyzed_at     = now()
        where id = $2`,
      [String(err?.message || err).slice(0, 1000), candidateVideoId],
    );
    return;
  }

  const status     = result.status === 'done' ? 'done' : 'failed';
  const strengths  = Array.isArray(result.strengths)  ? result.strengths  : [];
  const weaknesses = Array.isArray(result.weaknesses) ? result.weaknesses : [];
  const evaluation = result.evaluation && typeof result.evaluation === 'object'
    ? result.evaluation
    : {};

  // Prefer local thumbnail over source-provided thumbnail_url, if we have one
  const thumbUpdate = result.local_thumbnail_path
    ? `, thumbnail_url = $9`
    : '';
  const thumbArg = result.local_thumbnail_path ? [result.local_thumbnail_path] : [];

  await query(
    `update candidate_videos
        set analysis_status       = $1,
            analysis_error        = $2,
            local_video_path      = $3,
            local_thumbnail_path  = $4,
            summary               = $5,
            strengths             = $6,
            weaknesses            = $7,
            evaluation            = $8,
            analyzed_at           = now()
            ${thumbUpdate}
      where id = ${thumbUpdate ? '$10' : '$9'}`,
    [
      status,
      result.error || null,
      result.local_video_path     || null,
      result.local_thumbnail_path || null,
      result.summary              || null,
      JSON.stringify(strengths),
      JSON.stringify(weaknesses),
      JSON.stringify(evaluation),
      ...thumbArg,
      candidateVideoId,
    ],
  );
}

// Start a worker in this process
new Worker(
  'analyze-videos',
  async (job) => { await processAnalyze(job.data); },
  { connection, concurrency: 2 },
);
