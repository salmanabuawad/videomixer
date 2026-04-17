import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { query } from './db.js';
import { encryptValue } from './utils/crypto.js';
import { enqueueRenderJob } from './queue/renderQueue.js';
import { enqueueAnalyzeJob } from './queue/analyzeQueue.js';
import { searchYoutubeCandidates, searchFacebookCandidates } from './services/searchService.js';
import { signSession, requireAuth } from './middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const app = express();
const upload = multer({ dest: uploadDir });

app.use(cors({ origin: process.env.FRONTEND_ORIGIN?.split(',') || true }));
app.use(express.json());
app.use('/uploads', express.static(uploadDir));

/* ── Public ────────────────────────────────────────────────── */

app.get('/api/health', async (_req, res) => {
  try {
    const db = await query('select now() as now');
    res.json({ ok: true, dbTime: db.rows[0].now });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  const result = await query(
    `select id, username, password_hash, role from users where username = $1`,
    [username],
  );
  if (!result.rowCount) return res.status(401).json({ error: 'invalid credentials' });

  const row = result.rows[0];
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });

  const payload = { user_id: row.id, user_name: row.username, user_role: row.role };
  const token = signSession(payload);
  res.json({ ...payload, token });
});

/* ── Everything below requires auth ────────────────────────── */
app.use('/api', requireAuth);

app.get('/api/me', (req, res) => res.json(req.user));

app.get('/api/config', async (_req, res) => {
  const result = await query(`select key, encrypted, updated_at from config order by key`);
  res.json(result.rows);
});

app.post('/api/config', async (req, res) => {
  const { key, value, encrypted = true } = req.body;
  if (!key) return res.status(400).json({ error: 'key is required' });
  const storedValue = encrypted ? encryptValue(String(value ?? '')) : String(value ?? '');
  const result = await query(
    `insert into config (key, value, encrypted) values ($1, $2, $3)
     on conflict (key) do update
       set value = excluded.value, encrypted = excluded.encrypted, updated_at = now()
     returning id, key, encrypted, updated_at`,
    [key, storedValue, encrypted],
  );
  res.json(result.rows[0]);
});

app.get('/api/projects', async (_req, res) => {
  const result = await query(`select * from projects order by created_at desc`);
  res.json(result.rows);
});

app.post('/api/projects', async (req, res) => {
  const { topic, script = '', projectType = 'generic', preferredLanguage = null } = req.body;
  if (!topic) return res.status(400).json({ error: 'topic is required' });
  const allowedTypes = ['generic', 'road_soil_stabilization'];
  const pType = allowedTypes.includes(projectType) ? projectType : 'generic';
  // ISO-639 two-letter sanity check (allow null)
  const lang = (typeof preferredLanguage === 'string' && /^[a-z]{2}$/i.test(preferredLanguage))
    ? preferredLanguage.toLowerCase()
    : null;
  const result = await query(
    `insert into projects (topic, script, project_type, preferred_language)
     values ($1, $2, $3, $4) returning *`,
    [topic, script, pType, lang],
  );
  res.status(201).json(result.rows[0]);
});

app.get('/api/projects/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const project = await query(`select * from projects where id = $1`, [projectId]);
  if (!project.rowCount) return res.status(404).json({ error: 'project not found' });

  const candidates = await query(
    `select * from candidate_videos where project_id = $1 order by created_at desc`,
    [projectId],
  );
  const clips = await query(
    `select * from selected_clips where project_id = $1 order by scene_order asc nulls last, created_at asc`,
    [projectId],
  );
  const assets = await query(
    `select * from assets where project_id = $1 order by created_at desc`,
    [projectId],
  );

  res.json({
    project:         project.rows[0],
    candidateVideos: candidates.rows,
    selectedClips:   clips.rows,
    assets:          assets.rows,
  });
});

app.post('/api/projects/:projectId/assets', upload.single('file'), async (req, res) => {
  const { projectId } = req.params;
  if (!req.file) return res.status(400).json({ error: 'file is required' });

  const assetType = req.body.type || 'file';
  const publicUrl = `/uploads/${req.file.filename}`;
  const result = await query(
    `insert into assets (project_id, type, url, metadata) values ($1, $2, $3, $4) returning *`,
    [projectId, assetType, publicUrl, JSON.stringify({
      originalName: req.file.originalname,
      mimeType:     req.file.mimetype,
      size:         req.file.size,
    })],
  );
  res.status(201).json(result.rows[0]);
});

const DOWNLOADS_DIR = process.env.VM_DOWNLOADS_DIR || '/home/videomixer/downloads';

async function purgeProjectCandidates(projectId) {
  // Collect local file paths + candidate ids, then unlink files, then delete rows.
  const existing = await query(
    `select id, local_video_path, local_thumbnail_path from candidate_videos where project_id = $1`,
    [projectId],
  );
  await Promise.all(existing.rows.flatMap((row) => {
    const paths = [];
    // Anything under /downloads/<id>.* should go, regardless of extension
    paths.push(path.join(DOWNLOADS_DIR, `${row.id}.mp4`));
    paths.push(path.join(DOWNLOADS_DIR, `${row.id}.webm`));
    paths.push(path.join(DOWNLOADS_DIR, `${row.id}.mkv`));
    paths.push(path.join(DOWNLOADS_DIR, `${row.id}.mov`));
    paths.push(path.join(DOWNLOADS_DIR, `${row.id}.jpg`));
    // Also the backend-recorded paths, in case format differs
    for (const p of [row.local_video_path, row.local_thumbnail_path]) {
      if (p && p.startsWith('/downloads/')) {
        paths.push(path.join(DOWNLOADS_DIR, p.slice('/downloads/'.length)));
      }
    }
    return paths.map((fp) => fsp.unlink(fp).catch(() => {}));
  }));
  // Rows (selected_clips.candidate_video_id has on-delete set null, so this is safe)
  await query(`delete from candidate_videos where project_id = $1`, [projectId]);
  return existing.rowCount;
}

app.post('/api/projects/:projectId/search', async (req, res) => {
  const { projectId } = req.params;
  const { topic, includeFacebook = false } = req.body;
  const projRes = await query(
    `select topic, project_type, preferred_language from projects where id = $1`,
    [projectId],
  );
  const effectiveTopic = topic || projRes.rows[0]?.topic;
  const projectType    = projRes.rows[0]?.project_type || 'generic';
  const preferredLang  = projRes.rows[0]?.preferred_language || null;
  if (!effectiveTopic) return res.status(400).json({ error: 'topic is required' });

  // Replace-on-search: wipe old candidates + their downloads for this project
  const purged = await purgeProjectCandidates(projectId);

  const opts = { projectType, preferredLanguage: preferredLang };
  const youtubeResults  = await searchYoutubeCandidates(effectiveTopic, opts);
  const facebookResults = includeFacebook ? await searchFacebookCandidates(effectiveTopic, opts) : [];
  const merged = [...youtubeResults, ...facebookResults].sort(
    (a, b) => (b.searchScore ?? 0) - (a.searchScore ?? 0),
  );

  // Save pagination state for the "Next 20 videos" button
  const nextToken     = youtubeResults._nextPageToken  || null;
  const effectiveQ    = youtubeResults._effectiveQuery || effectiveTopic;
  await query(
    `update projects set last_search_query = $1, last_search_page_token = $2 where id = $3`,
    [effectiveQ, nextToken, projectId],
  );

  const inserted = [];
  for (const item of merged) {
    const result = await query(
      `insert into candidate_videos (
         project_id, source, source_video_id, title, url, thumbnail_url,
         duration_sec, description, published_at, status, search_score,
         domain_tags, match_reason
       )
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'discovered',$10,$11,$12)
       returning *`,
      [projectId, item.source, item.sourceVideoId, item.title, item.url, item.thumbnailUrl,
       item.durationSec, item.description, item.publishedAt, item.searchScore ?? 0,
       JSON.stringify(item.domainTags || {}), item.matchReason || null],
    );
    inserted.push(result.rows[0]);
  }
  res.json({
    purged,
    inserted:      inserted.length,
    candidates:    inserted,
    hasMore:       !!nextToken,
    nextPageToken: nextToken || null,
  });
});

app.post('/api/projects/:projectId/search/next', async (req, res) => {
  const { projectId } = req.params;
  const projRes = await query(
    `select project_type, preferred_language, last_search_query, last_search_page_token
       from projects where id = $1`,
    [projectId],
  );
  if (!projRes.rowCount) return res.status(404).json({ error: 'project not found' });

  const proj = projRes.rows[0];
  if (!proj.last_search_page_token || !proj.last_search_query) {
    return res.status(400).json({ error: 'no previous search; run Search first' });
  }

  const youtubeResults = await searchYoutubeCandidates(proj.last_search_query, {
    projectType:       proj.project_type,
    preferredLanguage: proj.preferred_language,
    pageToken:         proj.last_search_page_token,
  });

  // Filter out URLs we already have in the project to avoid duplicates
  const existingUrls = new Set((await query(
    `select url from candidate_videos where project_id = $1`, [projectId],
  )).rows.map(r => r.url));
  const fresh = youtubeResults.filter(r => !existingUrls.has(r.url));

  const inserted = [];
  for (const item of fresh) {
    const result = await query(
      `insert into candidate_videos (
         project_id, source, source_video_id, title, url, thumbnail_url,
         duration_sec, description, published_at, status, search_score,
         domain_tags, match_reason
       )
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'discovered',$10,$11,$12)
       returning *`,
      [projectId, item.source, item.sourceVideoId, item.title, item.url, item.thumbnailUrl,
       item.durationSec, item.description, item.publishedAt, item.searchScore ?? 0,
       JSON.stringify(item.domainTags || {}), item.matchReason || null],
    );
    inserted.push(result.rows[0]);
  }

  const nextToken = youtubeResults._nextPageToken || null;
  await query(
    `update projects set last_search_page_token = $1 where id = $2`,
    [nextToken, projectId],
  );

  res.json({
    inserted:      inserted.length,
    candidates:    inserted,
    hasMore:       !!nextToken,
    nextPageToken: nextToken || null,
  });
});

app.get('/api/projects/:projectId/candidate-videos', async (req, res) => {
  const { projectId } = req.params;
  const result = await query(
    `select * from candidate_videos where project_id = $1 order by created_at desc`,
    [projectId],
  );
  res.json(result.rows);
});

async function deleteCandidatesByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const existing = await query(
    `select id, local_video_path, local_thumbnail_path
       from candidate_videos
      where id = ANY($1::uuid[])`,
    [ids],
  );
  await Promise.all(existing.rows.flatMap((row) => {
    const paths = [
      path.join(DOWNLOADS_DIR, `${row.id}.mp4`),
      path.join(DOWNLOADS_DIR, `${row.id}.webm`),
      path.join(DOWNLOADS_DIR, `${row.id}.mkv`),
      path.join(DOWNLOADS_DIR, `${row.id}.mov`),
      path.join(DOWNLOADS_DIR, `${row.id}.jpg`),
    ];
    for (const p of [row.local_video_path, row.local_thumbnail_path]) {
      if (p && p.startsWith('/downloads/')) {
        paths.push(path.join(DOWNLOADS_DIR, p.slice('/downloads/'.length)));
      }
    }
    return paths.map((fp) => fsp.unlink(fp).catch(() => {}));
  }));
  const del = await query(
    `delete from candidate_videos where id = ANY($1::uuid[])`,
    [ids],
  );
  return del.rowCount;
}

app.post('/api/candidate-videos/bulk-delete', async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' });
  }
  const deleted = await deleteCandidatesByIds(ids);
  res.json({ deleted });
});

app.get('/api/candidate-videos/:candidateVideoId', async (req, res) => {
  const { candidateVideoId } = req.params;
  const result = await query(
    `select * from candidate_videos where id = $1`,
    [candidateVideoId],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'not found' });
  res.json(result.rows[0]);
});

app.post('/api/candidate-videos/:candidateVideoId/analyze', async (req, res) => {
  const { candidateVideoId } = req.params;
  const existing = await query(
    `select id from candidate_videos where id = $1`,
    [candidateVideoId],
  );
  if (!existing.rowCount) return res.status(404).json({ error: 'not found' });
  await enqueueAnalyzeJob(candidateVideoId);
  res.status(202).json({ ok: true, analysis_status: 'queued' });
});

app.patch('/api/candidate-videos/:candidateVideoId', async (req, res) => {
  const { candidateVideoId } = req.params;
  const { status } = req.body;
  const allowed = ['discovered', 'reviewed', 'approved', 'rejected'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'invalid status' });
  const result = await query(
    `update candidate_videos set status = $1 where id = $2 returning *`,
    [status, candidateVideoId],
  );
  res.json(result.rows[0]);
});

app.post('/api/projects/:projectId/selected-clips', async (req, res) => {
  const { projectId } = req.params;
  const {
    candidateVideoId, sourceStartSec = 0, sourceEndSec = 30, sceneOrder = 1,
  } = req.body;
  const result = await query(
    `insert into selected_clips (project_id, candidate_video_id, source_start_sec, source_end_sec, scene_order)
     values ($1,$2,$3,$4,$5) returning *`,
    [projectId, candidateVideoId, sourceStartSec, sourceEndSec, sceneOrder],
  );
  res.status(201).json(result.rows[0]);
});

app.get('/api/selected-clips/:selectedClipId/operations', async (req, res) => {
  const result = await query(
    `select * from clip_operations where selected_clip_id = $1 order by op_order asc, created_at asc`,
    [req.params.selectedClipId],
  );
  res.json(result.rows);
});

app.post('/api/selected-clips/:selectedClipId/operations', async (req, res) => {
  const { selectedClipId } = req.params;
  const {
    opOrder = 1, opType, fromSec, toSec,
    replacementAssetId = null, layoutMode = null, textContent = null,
    muteOriginal = false, speedFactor = null, config = {},
  } = req.body;
  const result = await query(
    `insert into clip_operations (
       selected_clip_id, op_order, op_type, from_sec, to_sec,
       replacement_asset_id, layout_mode, text_content,
       mute_original, speed_factor, config
     )
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     returning *`,
    [selectedClipId, opOrder, opType, fromSec, toSec,
     replacementAssetId, layoutMode, textContent,
     muteOriginal, speedFactor, JSON.stringify(config)],
  );
  res.status(201).json(result.rows[0]);
});

app.post('/api/projects/:projectId/render', async (req, res) => {
  const { projectId } = req.params;
  const job = await query(
    `insert into render_jobs (project_id, status, logs) values ($1, 'pending', 'queued') returning *`,
    [projectId],
  );
  await enqueueRenderJob(job.rows[0].id, projectId);
  res.status(201).json(job.rows[0]);
});

app.get('/api/projects/:projectId/render-jobs', async (req, res) => {
  const { projectId } = req.params;
  const result = await query(
    `select * from render_jobs where project_id = $1 order by created_at desc`,
    [projectId],
  );
  res.json(result.rows);
});

/* ── Start ─────────────────────────────────────────────────── */
const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
