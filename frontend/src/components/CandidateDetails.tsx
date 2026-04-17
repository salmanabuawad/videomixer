import { useEffect, useState } from 'react';
import {
  Check, X, Scissors, Sparkles, Loader2, AlertCircle, Play,
  ThumbsUp, ThumbsDown, RefreshCw, ExternalLink, Clock, Film,
  Award, BookOpen, Target, Video as VideoIcon,
} from 'lucide-react';
import type { CandidateVideo } from '../types';
import { ScoreBar, OverallScorePill } from './ScoreBar';

interface Props {
  candidate: CandidateVideo | null;
  onApprove:     (id: string) => void;
  onReject:      (id: string) => void;
  onUseClip:     (id: string) => void;
  onAnalyze:     (id: string) => void;
  onRefreshOne:  (id: string) => void;
}

function secondsToMMSS(sec?: number): string {
  if (!sec && sec !== 0) return '—';
  const mm = Math.floor(sec / 60);
  const ss = String(Math.floor(sec % 60)).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function CandidateDetails({
  candidate, onApprove, onReject, onUseClip, onAnalyze, onRefreshOne,
}: Props) {
  // Auto-poll every 3s while analysis is processing or queued
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!candidate) return;
    const s = candidate.analysis_status;
    if (s !== 'queued' && s !== 'processing') return;
    const t = setInterval(() => {
      onRefreshOne(candidate.id);
      forceTick((n) => n + 1);
    }, 3000);
    return () => clearInterval(t);
  }, [candidate?.id, candidate?.analysis_status, onRefreshOne]);

  if (!candidate) {
    return (
      <div className="card h-full flex items-center justify-center">
        <div className="text-center text-theme-text-muted">
          <Film className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p>Select a candidate to see details.</p>
        </div>
      </div>
    );
  }

  const c = candidate;
  const analyzing = c.analysis_status === 'queued' || c.analysis_status === 'processing';
  const analyzed  = c.analysis_status === 'done';
  const failed    = c.analysis_status === 'failed';

  return (
    <div className="card h-full overflow-y-auto">
      {/* Header */}
      <div className="mb-3">
        <h3 className="text-base font-semibold text-theme-text-primary line-clamp-2">{c.title}</h3>
        <div className="flex items-center flex-wrap gap-2 mt-1 text-xs text-theme-text-muted">
          <span className="capitalize">{c.source}</span>
          <span>•</span>
          <Clock className="h-3 w-3" /><span>{secondsToMMSS(c.duration_sec)}</span>
          {typeof c.search_score === 'number' && <><span>•</span><span>score {c.search_score.toFixed(2)}</span></>}
          <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-theme-link hover:underline">
            <ExternalLink className="h-3 w-3" /> open source
          </a>
        </div>
      </div>

      {/* Video player */}
      <div className="mb-4 rounded-lg overflow-hidden border border-theme-card-border bg-black aspect-video flex items-center justify-center">
        {c.local_video_path ? (
          <video
            src={c.local_video_path}
            poster={c.local_thumbnail_path || c.thumbnail_url || undefined}
            controls
            preload="metadata"
            className="w-full h-full"
          />
        ) : c.local_thumbnail_path || c.thumbnail_url ? (
          <img src={c.local_thumbnail_path || c.thumbnail_url || ''} alt="" className="w-full h-full object-cover opacity-60" />
        ) : (
          <div className="text-white/70 text-sm flex flex-col items-center gap-2">
            <Play className="h-10 w-10 opacity-60" />
            <span>No local video yet</span>
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          className="btn btn-md btn-primary"
          onClick={() => onAnalyze(c.id)}
          disabled={analyzing}
          title="Download + screenshot + score on convincingness / content / field / video quality"
        >
          {analyzing
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Evaluating…</>
            : analyzed
              ? <><RefreshCw className="h-4 w-4" /> Re-evaluate</>
              : <><Sparkles className="h-4 w-4" /> Evaluate Video</>}
        </button>
        <button className="btn btn-md btn-success" onClick={() => onApprove(c.id)}>
          <Check className="h-4 w-4" /> Approve
        </button>
        <button className="btn btn-md btn-danger" onClick={() => onReject(c.id)}>
          <X className="h-4 w-4" /> Reject
        </button>
        <button className="btn btn-md btn-secondary" onClick={() => onUseClip(c.id)}>
          <Scissors className="h-4 w-4" /> Use Clip
        </button>
      </div>

      {/* Evaluation — 4 axes + overall */}
      {(c.evaluation?.scores || analyzing) && (
        <div className="mb-4 p-3 border border-theme-card-border rounded-xl bg-gray-50">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold uppercase text-theme-text-muted">Evaluation</div>
            {analyzing && <Loader2 className="h-3.5 w-3.5 animate-spin text-theme-text-muted" />}
          </div>
          <div className="mb-3">
            <OverallScorePill score={c.evaluation?.scores?.overall} engine={c.evaluation?.engine} />
          </div>
          <ScoreBar
            label="Convincingness"
            score={c.evaluation?.scores?.convincingness}
            comment={c.evaluation?.comments?.convincingness}
            icon={<Award className="h-3.5 w-3.5 text-purple-600" />}
          />
          <ScoreBar
            label="Content Quality"
            score={c.evaluation?.scores?.content_quality}
            comment={c.evaluation?.comments?.content_quality}
            icon={<BookOpen className="h-3.5 w-3.5 text-blue-600" />}
          />
          <ScoreBar
            label="Field Relevance"
            score={c.evaluation?.scores?.field_relevance}
            comment={c.evaluation?.comments?.field_relevance}
            icon={<Target className="h-3.5 w-3.5 text-emerald-600" />}
          />
          <ScoreBar
            label="Video Quality"
            score={c.evaluation?.scores?.video_quality}
            comment={c.evaluation?.comments?.video_quality}
            icon={<VideoIcon className="h-3.5 w-3.5 text-slate-600" />}
          />
          {c.evaluation?.video_metrics?.height && (
            <div className="mt-1 text-[11px] text-theme-text-muted font-mono">
              {c.evaluation.video_metrics.width}×{c.evaluation.video_metrics.height}
              {c.evaluation.video_metrics.fps ? `  ·  ${c.evaluation.video_metrics.fps.toFixed(0)}fps` : ''}
              {c.evaluation.video_metrics.bitrate ? `  ·  ${(c.evaluation.video_metrics.bitrate / 1_000_000).toFixed(1)} Mbps` : ''}
            </div>
          )}
        </div>
      )}

      {failed && c.analysis_error && (
        <div className="mb-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold mb-0.5">Analysis failed</div>
            <div className="break-words">{c.analysis_error}</div>
          </div>
        </div>
      )}

      {/* Domain tags */}
      {c.domain_tags && Object.keys(c.domain_tags).length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {c.domain_tags.method      && <span className="badge badge-blue">method: {c.domain_tags.method}</span>}
          {c.domain_tags.road_stage  && <span className="badge badge-yellow">stage: {c.domain_tags.road_stage}</span>}
          {c.domain_tags.equipment   && <span className="badge badge-gray">equipment: {c.domain_tags.equipment}</span>}
          {c.domain_tags.content_type && <span className="badge badge-gray">{c.domain_tags.content_type}</span>}
          {c.domain_tags.soil_issue  && <span className="badge badge-red">issue: {c.domain_tags.soil_issue}</span>}
        </div>
      )}

      {/* Summary */}
      <div className="mb-4">
        <div className="text-xs font-semibold uppercase text-theme-text-muted mb-1">Summary</div>
        {c.summary
          ? <p className="text-sm text-theme-text-primary whitespace-pre-line">{c.summary}</p>
          : <p className="text-sm text-theme-text-muted italic">
              {analyzing ? 'Generating…' : 'Not analyzed yet. Click Analyze.'}
            </p>}
      </div>

      {/* Strengths */}
      <div className="mb-4">
        <div className="text-xs font-semibold uppercase text-emerald-700 mb-1 flex items-center gap-1">
          <ThumbsUp className="h-3.5 w-3.5" /> Strengths
        </div>
        {c.strengths && c.strengths.length > 0 ? (
          <ul className="text-sm space-y-1">
            {c.strengths.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-emerald-600 flex-shrink-0">•</span>
                <span className="text-theme-text-primary">{s}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-theme-text-muted italic">—</p>
        )}
      </div>

      {/* Weaknesses */}
      <div className="mb-2">
        <div className="text-xs font-semibold uppercase text-red-700 mb-1 flex items-center gap-1">
          <ThumbsDown className="h-3.5 w-3.5" /> Weaknesses
        </div>
        {c.weaknesses && c.weaknesses.length > 0 ? (
          <ul className="text-sm space-y-1">
            {c.weaknesses.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-red-600 flex-shrink-0">•</span>
                <span className="text-theme-text-primary">{s}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-theme-text-muted italic">—</p>
        )}
      </div>
    </div>
  );
}
