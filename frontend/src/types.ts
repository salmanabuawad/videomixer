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
  created_at: string;
};

export type Knowledge = {
  summary: string;
  process_steps: unknown[];
  key_claims: unknown[];
  benefits: unknown[];
  search_terms: unknown[];
  storyboard: Record<string, unknown>;
};

export type RenderJob = {
  id: number;
  project_id: number;
  status: string;
  output_path: string;
  error_text: string;
  /** "local" | "shotstack" — empty on jobs created before this field existed */
  render_engine: string;
  created_at: string;
  download_url: string | null;
};

export type ProjectDetail = {
  project: Project;
  assets: Asset[];
  knowledge: Knowledge | null;
  jobs: RenderJob[];
};
