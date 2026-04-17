/**
 * Minimal YouTube Data API v3 client — search + enrich with durations.
 *
 * search.list costs 100 quota units per call, videos.list costs 1 unit.
 */

const BASE = 'https://www.googleapis.com/youtube/v3';

function iso8601DurationToSeconds(iso) {
  // PT#H#M#S
  if (!iso) return null;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return null;
  const [, h, mi, s] = m;
  return (Number(h) || 0) * 3600 + (Number(mi) || 0) * 60 + (Number(s) || 0);
}

/**
 * @returns {Promise<Array<{source:string,sourceVideoId:string,title:string,url:string,
 *          thumbnailUrl:string,durationSec:number|null,description:string,
 *          publishedAt:string}>>}
 */
export async function youtubeSearch({ apiKey, query, maxResults = 10, regionCode, relevanceLanguage }) {
  if (!apiKey) throw new Error('youtube api key required');
  const searchUrl = new URL(`${BASE}/search`);
  searchUrl.searchParams.set('key',        apiKey);
  searchUrl.searchParams.set('part',       'snippet');
  searchUrl.searchParams.set('q',          query);
  searchUrl.searchParams.set('type',       'video');
  searchUrl.searchParams.set('maxResults', String(Math.min(Math.max(maxResults, 1), 25)));
  searchUrl.searchParams.set('safeSearch', 'moderate');
  if (regionCode)         searchUrl.searchParams.set('regionCode',         regionCode);
  if (relevanceLanguage)  searchUrl.searchParams.set('relevanceLanguage',  relevanceLanguage);

  const sr = await fetch(searchUrl);
  if (!sr.ok) {
    const body = await sr.text();
    throw new Error(`search.list ${sr.status}: ${body.slice(0, 300)}`);
  }
  const sd = await sr.json();
  const items = Array.isArray(sd.items) ? sd.items : [];
  if (!items.length) return [];

  // Enrich with content details for duration
  const ids = items.map(i => i.id?.videoId).filter(Boolean);
  const durations = new Map();
  if (ids.length) {
    const vurl = new URL(`${BASE}/videos`);
    vurl.searchParams.set('key',  apiKey);
    vurl.searchParams.set('part', 'contentDetails');
    vurl.searchParams.set('id',   ids.join(','));
    const vr = await fetch(vurl);
    if (vr.ok) {
      const vd = await vr.json();
      for (const v of (vd.items || [])) {
        durations.set(v.id, iso8601DurationToSeconds(v.contentDetails?.duration));
      }
    }
  }

  return items.map((it, idx) => {
    const vid   = it.id?.videoId;
    const snip  = it.snippet || {};
    const thumb = snip.thumbnails?.high?.url
               || snip.thumbnails?.medium?.url
               || snip.thumbnails?.default?.url
               || null;
    return {
      source:         'youtube',
      sourceVideoId:  vid,
      title:          snip.title        || '',
      url:            vid ? `https://www.youtube.com/watch?v=${vid}` : '',
      thumbnailUrl:   thumb,
      durationSec:    durations.get(vid) ?? null,
      description:    snip.description  || '',
      publishedAt:    snip.publishedAt  || null,
      _channel:       snip.channelTitle || '',
      _rank:          idx,
    };
  }).filter(item => item.url);
}
