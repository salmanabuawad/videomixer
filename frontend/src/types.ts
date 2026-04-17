export type CandidateStatus = 'discovered' | 'reviewed' | 'approved' | 'rejected';
export type ProjectType = 'generic' | 'road_soil_stabilization';

export interface DomainTags {
  method?:        'cement' | 'lime' | 'polymer' | 'mechanical' | 'recycling' | 'mixed';
  road_stage?:    'survey' | 'subgrade' | 'subbase' | 'base' | 'surface' | 'rehabilitation';
  content_type?:  'field_demo' | 'lecture' | 'animation' | 'comparison' | 'product_demo' | 'case_study';
  equipment?:     'recycler' | 'grader' | 'roller' | 'tanker' | 'paver' | 'excavator' | 'spreader';
  soil_issue?:    'weak_soil' | 'moisture' | 'rutting' | 'dust' | 'erosion' | 'expansive_clay';
}

export interface Project {
  id: string;
  topic: string;
  script?: string;
  voice_sample_url?: string | null;
  project_type: ProjectType;
  preferred_language?: string | null;
  status: string;
  created_at: string;
}

export type AnalysisStatus = 'pending' | 'queued' | 'processing' | 'done' | 'failed';

export type EvaluationAxis =
  | 'convincingness'
  | 'content_quality'
  | 'field_relevance'
  | 'video_quality';

export interface EvaluationScores {
  convincingness?:  number;
  content_quality?: number;
  field_relevance?: number;
  video_quality?:   number;
  overall?:         number;
}

export interface Evaluation {
  scores?:        EvaluationScores;
  comments?:      Record<EvaluationAxis, string>;
  video_metrics?: { width?: number; height?: number; bitrate?: number; fps?: number; duration_sec?: number };
  engine?:        'heuristic' | 'anthropic';
}

export interface CandidateVideo {
  id: string;
  project_id: string;
  source: 'youtube' | 'facebook' | 'upload';
  source_video_id?: string;
  title: string;
  url: string;
  thumbnail_url?: string;
  duration_sec?: number;
  description?: string;
  published_at?: string;
  status: CandidateStatus;
  search_score?: number;
  domain_tags?: DomainTags;
  match_reason?: string | null;
  local_video_path?: string | null;
  local_thumbnail_path?: string | null;
  summary?: string | null;
  strengths?: string[];
  weaknesses?: string[];
  analysis_status?: AnalysisStatus;
  analysis_error?: string | null;
  analyzed_at?: string | null;
  evaluation?: Evaluation;
  created_at: string;
}

export interface SelectedClip {
  id: string;
  project_id: string;
  candidate_video_id?: string | null;
  source_start_sec: number;
  source_end_sec: number;
  scene_order?: number | null;
  created_at: string;
}

export interface ClipOperation {
  id: string;
  selected_clip_id: string;
  op_order: number;
  op_type: 'remove' | 'replace' | 'side_by_side' | 'overlay';
  from_sec: number;
  to_sec: number;
  layout_mode?: string | null;
  text_content?: string | null;
  mute_original: boolean;
  speed_factor?: number | null;
  config: Record<string, unknown>;
  created_at: string;
}

export interface Asset {
  id: string;
  project_id: string;
  type: string;
  url: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface RenderJob {
  id: string;
  project_id: string;
  status: string;
  output_url?: string | null;
  logs?: string | null;
  created_at: string;
}
