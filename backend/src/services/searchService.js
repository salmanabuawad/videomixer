import 'dotenv/config';
import { expandTopic, inferTags } from './domain/roadStabilization.js';
import { youtubeSearch } from './youtubeApi.js';
import { query } from '../db.js';
import { decryptValue } from '../utils/crypto.js';

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

/**
 * YouTube candidate search.
 *
 * In production this should call the YouTube Data API. Until an API key is
 * configured, we return domain-aware demo results so the workflow is usable.
 */
export async function searchYoutubeCandidates(topic, { projectType = 'generic', preferredLanguage = null } = {}) {
  const phrases = projectType === 'road_soil_stabilization' ? expandTopic(topic) : [topic];

  // Real YouTube Data API v3 if a key is saved in the config table
  const apiKey = (await readConfigValue('youtube_api_key')) || process.env.YOUTUBE_API_KEY || null;
  if (apiKey) {
    try {
      const primary = phrases[0] || topic;
      const effectiveQuery = projectType === 'road_soil_stabilization'
        ? `${primary} road stabilization`
        : primary;
      const raw = await youtubeSearch({
        apiKey,
        query: effectiveQuery,
        maxResults: 20,
        relevanceLanguage: preferredLanguage || undefined,
      });
      return raw.map((item) => {
        const { tags, scoreAdjustment, matchReason } = inferTags({
          title:       item.title,
          description: item.description,
        });
        // Start with a mild baseline, boost by rank position and domain adjustment
        const baseline = Math.max(0.4, 0.9 - item._rank * 0.03);
        return {
          ...item,
          searchScore: Math.max(0, Math.min(1, baseline + scoreAdjustment)),
          domainTags:  tags,
          matchReason,
        };
      });
    } catch (err) {
      console.error('[youtubeSearch] real API failed, falling back to demo seeds:', err?.message || err);
      // fall through to demo seeds
    }
  }

  const seeds = [
    {
      titleTpl:   (q) => `Cement stabilized base construction for ${q}`,
      descTpl:    (q) => `Field demo showing cement spreader, recycler mixing, grading and compaction for a ${q} road.`,
      duration:   540,
      base:       0.88,
    },
    {
      titleTpl:   (q) => `Lime treated subgrade on weak soil — ${q}`,
      descTpl:    (q) => `Lime stabilization of expansive clay subgrade for a highway project related to ${q}. Shows moisture conditioning and curing.`,
      duration:   425,
      base:       0.82,
    },
    {
      titleTpl:   (q) => `Full Depth Reclamation (FDR) overview — ${q}`,
      descTpl:    (q) => `Reclaimer in action recycling existing pavement into a stabilized base. Comparison vs reconstruction for ${q}.`,
      duration:   612,
      base:       0.80,
    },
    {
      titleTpl:   (q) => `Polymer stabilization of rural road — ${q}`,
      descTpl:    (q) => `Polymer binder dosage, mixing with tanker + stabilizer, and roller compaction. Before/after comparison for ${q}.`,
      duration:   380,
      base:       0.74,
    },
    {
      titleTpl:   (q) => `Geogrid reinforcement of pavement foundation — ${q}`,
      descTpl:    (q) => `Laying geogrid over subgrade, aggregate placement, and compaction. Cross-section diagram of layers for ${q}.`,
      duration:   305,
      base:       0.70,
    },
  ];

  const q = phrases[0] || topic;
  return seeds.map((s, i) => {
    const title = s.titleTpl(q);
    const description = s.descTpl(q);
    const { tags, scoreAdjustment, matchReason } = inferTags({ title, description });
    const searchScore = Math.max(0, Math.min(1, s.base + scoreAdjustment));
    return {
      source:          'youtube',
      sourceVideoId:   `demo-yt-${i + 1}`,
      title,
      url:             `https://www.youtube.com/watch?v=demo-yt-${i + 1}`,
      thumbnailUrl:    null,
      durationSec:     s.duration,
      description,
      publishedAt:     new Date().toISOString(),
      searchScore,
      domainTags:      tags,
      matchReason,
    };
  });
}

export async function searchFacebookCandidates(topic, { projectType = 'generic', preferredLanguage = null } = {}) {
  const seeds = [
    {
      title:       `Road soil stabilization — site project ${topic}`,
      description: `On-site soil mixing, cement spreading, motor grader and roller compaction. Related to ${topic}.`,
      duration:    295,
      base:        0.72,
    },
    {
      title:       `Before and after rehabilitation — ${topic}`,
      description: `Failed road condition vs. stabilized and resurfaced result. Case study for ${topic}.`,
      duration:    210,
      base:        0.68,
    },
  ];

  return seeds.map((s, i) => {
    const { tags, scoreAdjustment, matchReason } = inferTags({ title: s.title, description: s.description });
    return {
      source:          'facebook',
      sourceVideoId:   `demo-fb-${i + 1}`,
      title:           s.title,
      url:             `https://www.facebook.com/watch/?v=demo-fb-${i + 1}`,
      thumbnailUrl:    null,
      durationSec:     s.duration,
      description:     s.description,
      publishedAt:     new Date().toISOString(),
      searchScore:     Math.max(0, Math.min(1, s.base + scoreAdjustment)),
      domainTags:      tags,
      matchReason,
    };
  });
}
