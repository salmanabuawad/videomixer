import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Project } from "../types";
import * as api from "../api";

export function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => {
    setError(null);
    api
      .fetchProjects()
      .then(setProjects)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const p = await api.createProject(name.trim());
      setName("");
      setProjects((prev) => [p, ...prev]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <h1>Zym-Tec Production System</h1>
      <div className="card">
        <form onSubmit={onCreate}>
          <label htmlFor="name">Project name</label>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ minWidth: 280, flex: "1 1 200px" }}
              required
            />
            <button type="submit" className="primary" disabled={creating}>
              {creating ? "Creating…" : "Create project"}
            </button>
          </div>
        </form>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p>Loading projects…</p>}

      {!loading &&
        projects.map((p) => (
          <div key={p.id} className="card">
            <Link to={`/projects/${p.id}`}>
              <strong>{p.name}</strong>
            </Link>
            <div>Status: {p.status}</div>
            <div>Created: {new Date(p.created_at).toLocaleString()}</div>
          </div>
        ))}
    </>
  );
}
