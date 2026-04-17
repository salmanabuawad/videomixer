import { useEffect, useMemo, useState } from 'react';
import {
  FolderKanban, Search, Plus, Sparkles, Upload, Film, Clapperboard,
  Scissors, RefreshCw, PlayCircle, Trash2, CheckSquare, ListPlus,
} from 'lucide-react';
import api from '../api';
import type { CandidateVideo, ClipOperation, Project, ProjectType, RenderJob, SelectedClip, Asset } from '../types';
import { CandidatesGrid } from '../components/CandidatesGrid';
import { CandidateDetails } from '../components/CandidateDetails';
import { TimelineEditor } from '../components/TimelineEditor';

export function ProjectsPage() {
  const [projects,        setProjects]        = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [topic,           setTopic]           = useState('soil stabilization');
  const [script,          setScript]          = useState('Explain the selected methods and add customized engineering notes.');
  const [projectType,     setProjectType]     = useState<ProjectType>('road_soil_stabilization');
  const [preferredLanguage, setPreferredLanguage] = useState<string>(''); // '' = any
  const [candidateVideos, setCandidateVideos] = useState<CandidateVideo[]>([]);
  const [selectedClips,   setSelectedClips]   = useState<SelectedClip[]>([]);
  const [assets,          setAssets]          = useState<Asset[]>([]);
  const [renderJobs,      setRenderJobs]      = useState<RenderJob[]>([]);
  const [activeClipId,    setActiveClipId]    = useState<string>('');
  const [operations,      setOperations]      = useState<ClipOperation[]>([]);
  const [includeFacebook, setIncludeFacebook] = useState(true);
  const [loading,         setLoading]         = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [checkedIds,          setCheckedIds]          = useState<string[]>([]);
  const [canLoadMore,         setCanLoadMore]         = useState(false);
  const [loadingMore,         setLoadingMore]         = useState(false);

  const selectedCandidate = useMemo(
    () => candidateVideos.find(v => v.id === selectedCandidateId) || null,
    [candidateVideos, selectedCandidateId],
  );

  const activeClip = useMemo(
    () => selectedClips.find(c => c.id === activeClipId) || null,
    [selectedClips, activeClipId],
  );

  async function loadProjects() {
    const res = await api.get<Project[]>('/projects');
    setProjects(res.data);
    if (!activeProjectId && res.data[0]) setActiveProjectId(res.data[0].id);
  }

  async function loadProject(projectId: string) {
    const res = await api.get(`/projects/${projectId}`);
    setCandidateVideos(res.data.candidateVideos);
    setSelectedClips(res.data.selectedClips);
    setAssets(res.data.assets);
    const jobs = await api.get(`/projects/${projectId}/render-jobs`);
    setRenderJobs(jobs.data);
  }

  useEffect(() => { void loadProjects(); }, []);
  useEffect(() => { if (activeProjectId) void loadProject(activeProjectId); }, [activeProjectId]);

  async function createProject() {
    if (!topic.trim()) return;
    const res = await api.post<Project>('/projects', {
      topic, script, projectType,
      preferredLanguage: preferredLanguage || null,
    });
    await loadProjects();
    setActiveProjectId(res.data.id);
  }

  async function searchCandidates() {
    if (!activeProjectId) return;
    setLoading(true);
    try {
      const res = await api.post<{ hasMore?: boolean }>(`/projects/${activeProjectId}/search`, { includeFacebook });
      setCanLoadMore(!!res.data?.hasMore);
      setSelectedCandidateId(null); // previous selection is gone
      setCheckedIds([]);
      await loadProject(activeProjectId);
    } finally { setLoading(false); }
  }

  async function loadMoreCandidates() {
    if (!activeProjectId || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.post<{ hasMore?: boolean }>(`/projects/${activeProjectId}/search/next`);
      setCanLoadMore(!!res.data?.hasMore);
      await loadProject(activeProjectId);
    } finally { setLoadingMore(false); }
  }

  async function deleteSelected(ids: string[]) {
    if (!ids.length) return;
    await api.post('/candidate-videos/bulk-delete', { ids });
    if (selectedCandidateId && ids.includes(selectedCandidateId)) {
      setSelectedCandidateId(null);
    }
    setCheckedIds([]);
    await loadProject(activeProjectId);
  }

  async function keepSelectedOnly() {
    const keep = new Set(checkedIds);
    const idsToDelete = candidateVideos.filter(c => !keep.has(c.id)).map(c => c.id);
    if (!idsToDelete.length) return;
    await deleteSelected(idsToDelete);
  }

  async function updateCandidateStatus(candidateVideoId: string, status: CandidateVideo['status']) {
    await api.patch(`/candidate-videos/${candidateVideoId}`, { status });
    await loadProject(activeProjectId);
  }

  async function analyzeCandidate(candidateVideoId: string) {
    await api.post(`/candidate-videos/${candidateVideoId}/analyze`);
    // Mark as queued immediately in local state so the UI reflects it
    setCandidateVideos(prev => prev.map(c => c.id === candidateVideoId ? { ...c, analysis_status: 'queued', analysis_error: null } : c));
  }

  async function refreshOneCandidate(candidateVideoId: string) {
    try {
      const res = await api.get<CandidateVideo>(`/candidate-videos/${candidateVideoId}`);
      setCandidateVideos(prev => prev.map(c => c.id === candidateVideoId ? res.data : c));
    } catch { /* ignore transient errors */ }
  }

  async function createSelectedClip(candidateVideoId: string) {
    await api.post(`/projects/${activeProjectId}/selected-clips`, {
      candidateVideoId,
      sourceStartSec: 0,
      sourceEndSec:   20,
      sceneOrder:     selectedClips.length + 1,
    });
    await loadProject(activeProjectId);
  }

  async function uploadAsset(file: File, type: string) {
    if (!activeProjectId) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    await api.post(`/projects/${activeProjectId}/assets`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    await loadProject(activeProjectId);
  }

  async function loadOperations(selectedClipId: string) {
    setActiveClipId(selectedClipId);
    const res = await api.get<ClipOperation[]>(`/selected-clips/${selectedClipId}/operations`);
    setOperations(res.data);
  }

  async function createRenderJob() {
    if (!activeProjectId) return;
    await api.post(`/projects/${activeProjectId}/render`);
    await loadProject(activeProjectId);
  }

  return (
    <div className="space-y-5 max-w-[1500px] mx-auto">
      {/* ── Project creation / selection ── */}
      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title"><FolderKanban className="h-5 w-5" /> Project</div>
            <div className="card-subtitle">Pick an existing project, or create a new one to start.</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_260px_220px] gap-3">
          <div>
            <label className="label-base">Topic</label>
            <input value={topic} onChange={e => setTopic(e.target.value)} className="input-base"
                   placeholder="e.g. cement stabilization, FDR rehabilitation" />
          </div>
          <div>
            <label className="label-base">Project Type</label>
            <select value={projectType}
                    onChange={e => setProjectType(e.target.value as ProjectType)}
                    className="input-base">
              <option value="road_soil_stabilization">Road / Soil Stabilization</option>
              <option value="generic">Generic</option>
            </select>
          </div>
          <div>
            <label className="label-base">Active Project</label>
            <select value={activeProjectId} onChange={e => setActiveProjectId(e.target.value)} className="input-base">
              <option value="">— Select project —</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>{project.topic}</option>
              ))}
            </select>
          </div>
        </div>

        {projectType === 'road_soil_stabilization' && (
          <div className="mt-3 text-xs text-theme-text-muted bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            Domain mode: searches will expand into road-engineering phrases
            (cement / lime / polymer / FDR / geogrid / rehabilitation) and results
            will be tagged and ranked by engineering relevance.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-3 mt-3">
          <div>
            <label className="label-base">Script</label>
            <textarea rows={3} value={script} onChange={e => setScript(e.target.value)} className="input-base" />
          </div>
          <div>
            <label className="label-base">
              Preferred Language <span className="text-[11px] font-normal text-theme-text-muted">(optional)</span>
            </label>
            <select
              value={preferredLanguage}
              onChange={e => setPreferredLanguage(e.target.value)}
              className="input-base"
              title="Biases YouTube search toward this language; empty = any"
            >
              <option value="">Any language</option>
              <option value="en">English</option>
              <option value="ar">Arabic</option>
              <option value="fr">French</option>
              <option value="es">Spanish</option>
              <option value="de">German</option>
              <option value="pt">Portuguese</option>
              <option value="it">Italian</option>
              <option value="hi">Hindi</option>
              <option value="ru">Russian</option>
              <option value="tr">Turkish</option>
              <option value="zh">Chinese</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button className="btn btn-md btn-primary" onClick={createProject} disabled={!topic.trim()}>
            <Plus className="h-4 w-4" /> Create Project
          </button>
          <button className="btn btn-md btn-secondary" onClick={searchCandidates} disabled={!activeProjectId || loading}>
            {loading
              ? <><Sparkles className="h-4 w-4 animate-pulse" /> Searching…</>
              : <><Search className="h-4 w-4" /> Search Candidate Videos</>}
          </button>
          <label className="inline-flex items-center gap-2 px-3 py-2 border border-theme-card-border rounded-lg text-sm bg-white cursor-pointer">
            <input
              type="checkbox"
              checked={includeFacebook}
              onChange={e => setIncludeFacebook(e.target.checked)}
              className="rounded"
            />
            Include Facebook connector
          </label>
        </div>
      </section>

      {/* ── Assets + Render jobs ── */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Upload className="h-5 w-5" /> Upload Assets</div>
              <div className="card-subtitle">Voice sample, custom videos or images to use in the final render.</div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label-base">Video</label>
              <input type="file" accept="video/*" onChange={e => { const f = e.target.files?.[0]; if (f) void uploadAsset(f, 'video'); }} className="input-base" />
            </div>
            <div>
              <label className="label-base">Image</label>
              <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) void uploadAsset(f, 'image'); }} className="input-base" />
            </div>
            <div>
              <label className="label-base">Audio</label>
              <input type="file" accept="audio/*" onChange={e => { const f = e.target.files?.[0]; if (f) void uploadAsset(f, 'audio'); }} className="input-base" />
            </div>
          </div>

          <div className="mt-4">
            <div className="text-sm font-semibold text-theme-text-primary mb-2">Uploaded</div>
            {assets.length === 0 ? (
              <div className="text-sm text-theme-text-muted italic">No assets yet.</div>
            ) : (
              <ul className="divide-y divide-theme-card-border border border-theme-card-border rounded-lg overflow-hidden">
                {assets.map(asset => (
                  <li key={asset.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                    <span className="badge badge-gray capitalize">{asset.type}</span>
                    <span className="text-theme-text-muted truncate flex-1 font-mono text-xs">{asset.url}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Clapperboard className="h-5 w-5" /> Render Jobs</div>
              <div className="card-subtitle">Queue a render from the approved clips + operations.</div>
            </div>
            <button className="btn btn-md btn-primary" onClick={createRenderJob} disabled={!activeProjectId}>
              <PlayCircle className="h-4 w-4" /> Queue Render
            </button>
          </div>

          {renderJobs.length === 0 ? (
            <div className="text-sm text-theme-text-muted italic py-4 text-center">No render jobs yet.</div>
          ) : (
            <ul className="divide-y divide-theme-card-border border border-theme-card-border rounded-lg overflow-hidden">
              {renderJobs.map(job => {
                const cls = job.status === 'done'        ? 'badge-green'
                          : job.status === 'processing'  ? 'badge-yellow'
                          : job.status === 'failed'      ? 'badge-red'
                          : 'badge-gray';
                return (
                  <li key={job.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className={`badge ${cls} capitalize`}>{job.status}</span>
                    <span className="text-theme-text-muted font-mono text-xs truncate flex-1">
                      {job.output_url || '— pending output —'}
                    </span>
                    <span className="text-[11px] text-theme-text-muted">
                      {new Date(job.created_at).toLocaleString()}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* ── Candidate videos ── grid + details side panel */}
      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title"><Film className="h-5 w-5" /> Candidate Videos</div>
            <div className="card-subtitle">
              Click a row to see details, analyze it (download + screenshot + summary), and act on it.
            </div>
          </div>
          <button className="btn btn-md btn-neutral" onClick={() => activeProjectId && loadProject(activeProjectId)} disabled={!activeProjectId}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>

        {candidateVideos.length === 0 ? (
          <div className="text-sm text-theme-text-muted italic py-8 text-center">
            No candidates yet. Click <strong>Search Candidate Videos</strong> above.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4" style={{ minHeight: '600px' }}>
            <div className="flex flex-col gap-2" style={{ height: '600px' }}>
              {/* Toolbar: selection count + actions */}
              <div className="flex items-center flex-wrap gap-2 p-2 border border-theme-card-border rounded-lg bg-gray-50">
                <span className="text-sm text-theme-text-primary font-medium pl-1">
                  {checkedIds.length > 0
                    ? <>{checkedIds.length} selected</>
                    : <span className="text-theme-text-muted">No selection</span>}
                  <span className="text-theme-text-muted"> / {candidateVideos.length} total</span>
                </span>
                <div className="flex-1" />
                <button
                  className="btn btn-sm btn-success"
                  onClick={() => void keepSelectedOnly()}
                  disabled={checkedIds.length === 0 || checkedIds.length === candidateVideos.length}
                  title="Delete every row that is NOT checked"
                >
                  <CheckSquare className="h-3.5 w-3.5" /> Keep Selected
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => void deleteSelected(checkedIds)}
                  disabled={checkedIds.length === 0}
                  title="Delete the checked rows (and their downloads)"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete Selected
                </button>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => void loadMoreCandidates()}
                  disabled={!canLoadMore || loadingMore}
                  title="Fetch the next 10 results from YouTube and append them"
                >
                  {loadingMore
                    ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading…</>
                    : <><ListPlus className="h-3.5 w-3.5" /> Next 10 Videos</>}
                </button>
              </div>
              <div className="flex-1 border border-theme-card-border rounded-lg overflow-hidden">
                <CandidatesGrid
                  rows={candidateVideos}
                  selectedId={selectedCandidateId}
                  onRowSelect={(v) => setSelectedCandidateId(v.id)}
                  onCheckedChange={setCheckedIds}
                />
              </div>
            </div>
            <div style={{ height: '600px' }}>
              <CandidateDetails
                candidate={selectedCandidate}
                onApprove={(id)    => void updateCandidateStatus(id, 'approved')}
                onReject={(id)     => void updateCandidateStatus(id, 'rejected')}
                onUseClip={(id)    => void createSelectedClip(id)}
                onAnalyze={(id)    => void analyzeCandidate(id)}
                onRefreshOne={(id) => void refreshOneCandidate(id)}
              />
            </div>
          </div>
        )}
      </section>

      {/* ── Selected clips + timeline ── */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Scissors className="h-5 w-5" /> Selected Clips</div>
              <div className="card-subtitle">Pick one to customize its timeline.</div>
            </div>
          </div>
          {selectedClips.length === 0 ? (
            <div className="text-sm text-theme-text-muted italic py-4 text-center">No clips selected yet.</div>
          ) : (
            <ul className="divide-y divide-theme-card-border border border-theme-card-border rounded-lg overflow-hidden">
              {selectedClips.map(clip => {
                const active = activeClipId === clip.id;
                return (
                  <li key={clip.id}
                      className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer ${active ? 'bg-theme-highlight' : 'hover:bg-gray-50'}`}
                      onClick={() => void loadOperations(clip.id)}>
                    <span className="badge badge-gray">#{clip.scene_order ?? '-'}</span>
                    <span className="font-mono text-xs text-theme-text-muted">{clip.id.slice(0, 8)}</span>
                    <span className="text-theme-text-primary">
                      {clip.source_start_sec}s → {clip.source_end_sec}s
                    </span>
                    <button className="btn btn-sm btn-neutral ml-auto" onClick={e => { e.stopPropagation(); void loadOperations(clip.id); }}>
                      Customize
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {activeClip ? (
          <TimelineEditor clip={activeClip} operations={operations} onCreated={() => loadOperations(activeClip.id)} />
        ) : (
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title"><Scissors className="h-5 w-5" /> Timeline Editor</div>
                <div className="card-subtitle">Pick a selected clip to add interval-based customizations.</div>
              </div>
            </div>
            <div className="text-sm text-theme-text-muted italic py-8 text-center">
              Nothing selected.
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
