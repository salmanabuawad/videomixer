export type Project = {
  id: number;
  name: string;
  status: string;
  created_at: string;
};

export type Asset = {
  id: number;
  project_id: number;
  asset_type: string;
  file_name: string;
  mime_type: string;
  source: string;
  width: number;
  height: number;
  duration_sec: number;
  fps: number;
  created_at: string;
};

export type GeneratedClipRequest = {
  role?: string;
  needed?: boolean;
  prompt?: string;
  duration_sec?: number;
};

export type Knowledge = {
  summary: string;
  process_steps: unknown[];
  key_claims: unknown[];
  benefits: unknown[];
  search_terms: unknown[];
  storyboard: Record<string, unknown>;
  narration_text: string;
  intro_script: string;
  closing_script: string;
  generated_clip_requests: GeneratedClipRequest[];
};

export type RenderJob = {
  id: number;
  project_id: number;
  status: string;
  output_path: string;
  error_text: string;
  /** "local" | "shotstack" — empty on jobs created before this field existed */
  render_engine: string;
  stage: string;
  progress_message: string;
  parent_job_id: number | null;
  enhancement_request: string;
  created_at: string;
  updated_at: string | null;
  download_url: string | null;
};

export type ProjectDetail = {
  project: Project;
  assets: Asset[];
  knowledge: Knowledge | null;
  jobs: RenderJob[];
};
