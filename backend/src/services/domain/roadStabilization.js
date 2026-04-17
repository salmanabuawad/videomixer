/**
 * Road / soil stabilization domain helpers.
 *
 * - expandTopic(topic) : return an array of road-engineering specific search phrases.
 * - inferTags({ title, description }) : infer domain tags + ranking adjustments.
 *
 * Keyword matching only (v1). A later classifier can replace this.
 */

const METHOD_KEYWORDS = {
  cement:     ['cement stabilization', 'cement stabilized', 'cement treated', 'cement-treated base', 'ctb'],
  lime:       ['lime stabilization', 'lime treated subgrade', 'lime modification'],
  polymer:    ['polymer stabilization', 'polymer soil', 'polymer binder', 'emulsion stabilization'],
  mechanical: ['mechanical stabilization', 'compaction', 'scarification', 'grading', 'proof rolling'],
  recycling:  ['full depth reclamation', 'fdr', 'reclaimed asphalt', 'rap stabilization', 'cold in-place recycling'],
  mixed:      ['geogrid', 'geocell', 'geosynthetic', 'chemical stabilization'],
};

const ROAD_STAGE_KEYWORDS = {
  survey:         ['geotechnical survey', 'site investigation', 'soil testing'],
  subgrade:       ['subgrade', 'weak soil', 'expansive clay', 'moisture conditioning'],
  subbase:        ['subbase', 'aggregate base'],
  base:           ['base course', 'stabilized base', 'cement stabilized base'],
  surface:        ['asphalt surface', 'wearing course', 'pavement surface'],
  rehabilitation: ['road rehabilitation', 'pavement rehabilitation', 'fdr', 'reclamation'],
};

const CONTENT_TYPE_KEYWORDS = {
  field_demo:    ['site', 'in action', 'field demo', 'on site', 'onsite'],
  lecture:       ['lecture', 'explained', 'introduction to', 'theory of'],
  animation:     ['animation', 'animated', 'visualization', 'visualisation'],
  comparison:    ['vs ', ' versus ', 'comparison', 'compared'],
  product_demo:  ['product demo', 'our product', 'we offer', 'company'],
  case_study:    ['case study', 'project story', 'how we'],
};

const EQUIPMENT_KEYWORDS = {
  recycler:  ['recycler', 'reclaimer', 'stabilizer machine', 'stabiliser machine', 'wr 240', 'wr 2500'],
  grader:    ['motor grader', 'grader'],
  roller:    ['vibratory roller', 'compactor', 'padfoot roller', 'smooth drum'],
  tanker:    ['water tanker', 'bitumen tanker', 'emulsion tanker'],
  paver:     ['paver'],
  excavator: ['excavator'],
  spreader:  ['spreader', 'lime spreader', 'cement spreader'],
};

const SOIL_ISSUE_KEYWORDS = {
  weak_soil:       ['weak soil', 'soft subgrade', 'low cbr', 'poor soil'],
  moisture:        ['moisture conditioning', 'optimum moisture'],
  rutting:         ['rutting', 'rut depth', 'rut'],
  dust:            ['dust', 'dust suppression', 'fugitive dust'],
  erosion:         ['erosion'],
  expansive_clay:  ['expansive clay', 'swelling soil', 'black cotton'],
};

const POSITIVE_KEYWORDS = [
  'road', 'highway', 'pavement', 'subgrade', 'base course', 'stabilization', 'stabilisation',
  'reclamation', 'compaction', 'grader', 'roller', 'cement', 'lime', 'polymer',
  'geogrid', 'geocell', 'cbr', 'embankment', 'subbase', 'asphalt',
];

const NEGATIVE_KEYWORDS = [
  'building foundation', 'house foundation', 'basement', 'drywall',
  'landscaping', 'gardening', 'residential concrete', 'swimming pool',
  'fashion', 'music video', 'trailer', 'game',
];

export function expandTopic(topic) {
  const t = (topic || '').trim();
  if (!t) return [];
  const base = t.toLowerCase();
  const list = new Set([
    t,
    `road ${base}`,
    `${base} road construction`,
    `${base} subgrade`,
    `${base} highway`,
    `${base} pavement`,
    `road ${base} methods`,
    `cement stabilized ${base}`,
    `lime treated ${base}`,
    `polymer stabilization ${base}`,
    `full depth reclamation ${base}`,
    `geogrid ${base}`,
    `road rehabilitation ${base}`,
    `field demo ${base}`,
  ]);
  return Array.from(list).slice(0, 12);
}

function matchAny(text, patterns) {
  const t = text.toLowerCase();
  for (const p of patterns) {
    if (t.includes(p)) return true;
  }
  return false;
}

function firstMatch(text, dict) {
  const t = text.toLowerCase();
  for (const [label, patterns] of Object.entries(dict)) {
    if (patterns.some((p) => t.includes(p))) return label;
  }
  return null;
}

/**
 * Infer road-domain tags from a candidate's title + description.
 * Returns { tags, scoreAdjustment, matchReason }.
 */
export function inferTags({ title = '', description = '' } = {}) {
  const text = `${title}\n${description}`;
  const tags = {};
  const reasons = [];

  const method = firstMatch(text, METHOD_KEYWORDS);
  if (method) { tags.method = method; reasons.push(`method:${method}`); }

  const roadStage = firstMatch(text, ROAD_STAGE_KEYWORDS);
  if (roadStage) { tags.road_stage = roadStage; reasons.push(`stage:${roadStage}`); }

  const contentType = firstMatch(text, CONTENT_TYPE_KEYWORDS);
  if (contentType) { tags.content_type = contentType; reasons.push(`type:${contentType}`); }

  const equipment = firstMatch(text, EQUIPMENT_KEYWORDS);
  if (equipment) { tags.equipment = equipment; reasons.push(`equipment:${equipment}`); }

  const soilIssue = firstMatch(text, SOIL_ISSUE_KEYWORDS);
  if (soilIssue) { tags.soil_issue = soilIssue; reasons.push(`issue:${soilIssue}`); }

  let scoreAdjustment = 0;
  if (matchAny(text, POSITIVE_KEYWORDS)) scoreAdjustment += 0.1;
  if (Object.keys(tags).length >= 2)     scoreAdjustment += 0.1;
  if (matchAny(text, NEGATIVE_KEYWORDS)) scoreAdjustment -= 0.3;

  return {
    tags,
    scoreAdjustment,
    matchReason: reasons.join(', ') || null,
  };
}
