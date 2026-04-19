import type { Project, ProjectDetail, RenderJob } from "./types";

const apiBase = () => (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.detail === "string") return data.detail;
    if (data && Array.isArray(data.detail)) {
      return data.detail.map((d: { msg?: string }) => d.msg ?? "").filter(Boolean).join("; ");
    }
  } catch {
    /* ignore */
  }
  return res.statusText || `HTTP ${res.status}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${apiBase()}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function fetchProjects(): Promise<Project[]> {
  return request<Project[]>("/api/projects");
}

export async function createProject(name: string): Promise<Project> {
  return request<Project>("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function fetchProject(id: number): Promise<ProjectDetail> {
  return request<ProjectDetail>(`/api/projects/${id}`);
}

export async function uploadAssets(projectId: number, files: FileList | File[]): Promise<void> {
  const fd = new FormData();
  const list = Array.from(files);
  for (const f of list) fd.append("files", f);
  const res = await fetch(`${apiBase()}/api/projects/${projectId}/upload`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function extractKnowledge(projectId: number): Promise<void> {
  await request(`/api/projects/${projectId}/extract`, { method: "POST" });
}

export async function renderProject(projectId: number): Promise<void> {
  await request(`/api/projects/${projectId}/render`, { method: "POST" });
}

export async function enhanceJob(jobId: number, requestText: string): Promise<void> {
  await request(`/api/jobs/${jobId}/enhance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request: requestText }),
  });
}

export async function fetchJob(jobId: number): Promise<RenderJob> {
  const res = await request<{ ok: boolean; job: RenderJob }>(`/api/jobs/${jobId}`);
  return res.job;
}

export function downloadJobUrl(jobId: number): string {
  return `${apiBase()}/api/jobs/${jobId}/download`;
}

export type ConfigStatus = {
  openai_configured: boolean;
  openai_model: string;
  video_engine: string;
  /** Raw VIDEO_ENGINE from process env (when set, it overrides DB for engine selection). */
  video_engine_env: string;
  shotstack_configured: boolean;
  public_upload_url_configured: boolean;
  public_upload_url_prefix: string;
  shotstack_use_production: boolean;
  shotstack_api_env_effective: string;
  shotstack_api_env_override: string;
  heygen_configured: boolean;
  heygen_avatar_id: string;
  config_encryption_enabled: boolean;
};

export async function fetchConfigStatus(): Promise<ConfigStatus> {
  return request<ConfigStatus>("/api/config/status");
}

export async function saveOpenAIConfig(
  openai_api_key: string,
  openai_model: string,
  adminToken?: string
): Promise<{ ok: boolean }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (adminToken) {
    headers["X-Admin-Token"] = adminToken;
  }
  return request("/api/admin/openai", {
    method: "POST",
    headers,
    body: JSON.stringify({ openai_api_key, openai_model }),
  });
}

export type ShotstackConfigPayload = {
  video_engine: string;
  public_upload_url_prefix: string;
  shotstack_use_production: boolean;
  shotstack_api_key: string;
  shotstack_sandbox_key: string;
  shotstack_production_key: string;
  shotstack_api_env: string;
};

export async function saveShotstackConfig(
  body: ShotstackConfigPayload,
  adminToken?: string
): Promise<{ ok: boolean }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (adminToken) {
    headers["X-Admin-Token"] = adminToken;
  }
  return request("/api/admin/shotstack", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

export type HeyGenConfigPayload = {
  heygen_api_key: string;
  heygen_avatar_id: string;
};

export async function saveHeyGenConfig(
  body: HeyGenConfigPayload,
  adminToken?: string
): Promise<{ ok: boolean; heygen_configured: boolean; heygen_avatar_id: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (adminToken) {
    headers["X-Admin-Token"] = adminToken;
  }
  return request("/api/admin/heygen", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
