import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ProjectDetail } from "../types";
import * as api from "../api";

export function ProjectPage() {
  const { id } = useParams();
  const projectId = Number(id);
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    if (!Number.isFinite(projectId)) {
      setError("Invalid project id");
      setLoading(false);
      return;
    }
    setError(null);
    api
      .fetchProject(projectId)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const hasActiveJob = !!data?.jobs.some(
    (j) => j.status === "queued" || j.status === "running",
  );

  useEffect(() => {
    if (!hasActiveJob) return;
    const tick = setInterval(() => {
      load();
    }, 2000);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActiveJob, projectId]);

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem("files") as HTMLInputElement;
    if (!input.files?.length) return;
    setBusy("upload");
    setError(null);
    try {
      await api.uploadAssets(projectId, input.files);
      input.value = "";
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function onExtract() {
    setBusy("extract");
    setError(null);
    try {
      await api.extractKnowledge(projectId);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Extract failed");
    } finally {
      setBusy(null);
    }
  }

  async function onRender() {
    setBusy("render");
    setError(null);
    try {
      await api.renderProject(projectId);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Render failed");
    } finally {
      setBusy(null);
    }
  }

  const [enhanceText, setEnhanceText] = useState<Record<number, string>>({});

  async function onEnhance(jobId: number) {
    const text = (enhanceText[jobId] || "").trim();
    if (!text) return;
    setBusy(`enhance-${jobId}`);
    setError(null);
    try {
      await api.enhanceJob(jobId, text);
      setEnhanceText((m) => ({ ...m, [jobId]: "" }));
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Enhancement failed");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p>Loading…</p>;
  if (error && !data) return <p className="error">{error}</p>;
  if (!data) return null;

  const { project, assets, knowledge, jobs } = data;

  return (
    <>
      <p>
        <Link to="/">← Home</Link>
      </p>
      <h1>{project.name}</h1>
      {error && <p className="error">{error}</p>}

      <div className="grid">
        <div className="card">
          <h3>Upload files</h3>
          <form onSubmit={onUpload}>
            <input name="files" type="file" multiple required />
            <div style={{ marginTop: 8 }}>
              <button type="submit" disabled={busy === "upload"}>
                {busy === "upload" ? "Uploading…" : "Upload"}
              </button>
            </div>
          </form>
          <h4>Assets</h4>
          <ul>
            {assets.map((a) => {
              const isVideo = a.asset_type === "video";
              const aspect = isVideo && a.width && a.height ? a.width / a.height : 0;
              const narrow = aspect > 0 && aspect < 0.75;
              const short = isVideo && a.duration_sec > 0 && a.duration_sec < 10;
              return (
                <li key={a.id} style={{ marginBottom: 4 }}>
                  {a.asset_type} — {a.file_name}
                  {isVideo && a.width > 0 && (
                    <span style={{ color: "#57606a", fontSize: "0.85rem" }}>
                      {" "}
                      — {a.width}×{a.height} · {a.duration_sec.toFixed(1)}s · {a.fps.toFixed(1)}fps
                      {narrow && <span style={{ color: "#b54708" }}> · narrow</span>}
                      {short && <span style={{ color: "#b54708" }}> · short</span>}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="card">
          <h3>Actions</h3>
          <p>
            <button type="button" className="primary" onClick={onExtract} disabled={!!busy}>
              {busy === "extract" ? "Extracting…" : "Extract knowledge from docs"}
            </button>
          </p>
          <p>
            <button type="button" className="primary" onClick={onRender} disabled={!!busy}>
              {busy === "render" ? "Rendering…" : "Generate marketing clip"}
            </button>
          </p>
        </div>
      </div>

      <div className="card">
        <h3>Knowledge summary</h3>
        {knowledge ? (
          <>
            <p>
              <strong>Summary:</strong> {knowledge.summary}
            </p>
            <p>
              <strong>Process steps:</strong>
            </p>
            <pre className="json">{JSON.stringify(knowledge.process_steps, null, 2)}</pre>
            <p>
              <strong>Key claims:</strong>
            </p>
            <pre className="json">{JSON.stringify(knowledge.key_claims, null, 2)}</pre>
            <p>
              <strong>Benefits:</strong>
            </p>
            <pre className="json">{JSON.stringify(knowledge.benefits, null, 2)}</pre>
            <p>
              <strong>Search terms:</strong>
            </p>
            <pre className="json">{JSON.stringify(knowledge.search_terms, null, 2)}</pre>
            <h4>Storyboard</h4>
            <pre className="json">{JSON.stringify(knowledge.storyboard, null, 2)}</pre>
          </>
        ) : (
          <p>No knowledge extracted yet.</p>
        )}
      </div>

      <div className="card">
        <h3>Render jobs</h3>
        {jobs.length === 0 ? (
          <p>No jobs yet.</p>
        ) : (
          <ul>
            {jobs.map((j) => {
              const active = j.status === "queued" || j.status === "running";
              return (
              <li key={j.id} style={{ marginBottom: 12 }}>
                Job {j.id} — {j.status}
                {j.render_engine ? ` — ${j.render_engine}` : ""}
                {j.parent_job_id && <> — refined from Job {j.parent_job_id}</>}
                {j.download_url && (
                  <>
                    {" "}
                    —{" "}
                    <a href={api.downloadJobUrl(j.id)} download>
                      Download video
                    </a>
                  </>
                )}
                {j.enhancement_request && (
                  <p style={{ margin: "4px 0", color: "#57606a", fontSize: "0.9rem" }}>
                    <em>Request:</em> {j.enhancement_request}
                  </p>
                )}
                {active && (
                  <div
                    style={{
                      marginTop: 4,
                      padding: "6px 10px",
                      background: "#eef4ff",
                      border: "1px solid #b6d4fe",
                      borderRadius: 8,
                      fontSize: "0.9rem",
                    }}
                  >
                    <strong>{j.stage || "working"}</strong>
                    {j.progress_message && <> — {j.progress_message}</>}
                    <span
                      aria-hidden
                      style={{
                        display: "inline-block",
                        marginLeft: 8,
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: "#0969da",
                        animation: "pulse 1.2s ease-in-out infinite",
                      }}
                    />
                  </div>
                )}
                {j.error_text && <pre className="error json">{j.error_text}</pre>}
                {j.status === "done" && (
                  <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      placeholder="Ask for improvements (e.g. make the intro faster)"
                      value={enhanceText[j.id] || ""}
                      onChange={(e) =>
                        setEnhanceText((m) => ({ ...m, [j.id]: e.target.value }))
                      }
                      disabled={busy === `enhance-${j.id}`}
                      style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)" }}
                    />
                    <button
                      type="button"
                      onClick={() => onEnhance(j.id)}
                      disabled={
                        !enhanceText[j.id]?.trim() || busy === `enhance-${j.id}`
                      }
                    >
                      {busy === `enhance-${j.id}` ? "Revising…" : "Submit"}
                    </button>
                  </div>
                )}
              </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
