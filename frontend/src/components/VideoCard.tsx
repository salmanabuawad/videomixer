import { Check, X, Scissors, Clock, Youtube, Facebook, Upload, Truck, Layers3, Tag } from 'lucide-react';
import type { CandidateVideo } from '../types';

/** Inline SVG fallback — no network dependency. */
function placeholderDataUri(label: string): string {
  const safe = label.replace(/[<>&"]/g, '').slice(0, 32);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180' viewBox='0 0 320 180'>
    <rect width='320' height='180' fill='#e5e7eb'/>
    <g fill='#9ca3af' font-family='Arial, sans-serif' text-anchor='middle'>
      <text x='160' y='92' font-size='16' font-weight='600'>${safe || 'No thumbnail'}</text>
      <text x='160' y='114' font-size='12'>320 x 180</text>
    </g>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

interface Props {
  video: CandidateVideo;
  onApprove: () => void;
  onReject: () => void;
  onSelectClip: () => void;
}

function statusBadgeClass(status: string) {
  switch (status) {
    case 'approved': return 'badge badge-green';
    case 'rejected': return 'badge badge-red';
    case 'reviewed': return 'badge badge-blue';
    default:         return 'badge badge-gray';
  }
}

function sourceIcon(source: string) {
  switch (source) {
    case 'youtube':  return <Youtube   className="h-3.5 w-3.5" />;
    case 'facebook': return <Facebook  className="h-3.5 w-3.5" />;
    default:         return <Upload    className="h-3.5 w-3.5" />;
  }
}

export function VideoCard({ video, onApprove, onReject, onSelectClip }: Props) {
  const dur = video.duration_sec ?? 0;
  const mm  = Math.floor(dur / 60);
  const ss  = String(Math.floor(dur % 60)).padStart(2, '0');

  return (
    <div className="bg-white rounded-xl overflow-hidden border border-theme-card-border shadow-sm hover:shadow-md transition-all duration-200 flex flex-col">
      <div className="relative aspect-video bg-gray-100">
        <img
          src={video.thumbnail_url || placeholderDataUri(video.source || 'No thumbnail')}
          alt={video.title}
          className="w-full h-full object-cover"
          onError={(e) => {
            const el = e.currentTarget;
            const fallback = placeholderDataUri(video.source || 'No thumbnail');
            if (el.src !== fallback) el.src = fallback;
          }}
        />
        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[11px] px-1.5 py-0.5 rounded flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>{mm}:{ss}</span>
        </div>
        <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 text-white text-[11px] px-1.5 py-0.5 rounded capitalize">
          {sourceIcon(video.source)}
          <span>{video.source}</span>
        </div>
      </div>

      <div className="p-3 flex-1 flex flex-col">
        <h3 className="text-sm font-semibold text-theme-text-primary line-clamp-2 mb-1.5">{video.title}</h3>
        <div className="flex items-center gap-2 mb-2">
          <span className={statusBadgeClass(video.status)}>{video.status}</span>
          {typeof video.search_score === 'number' && (
            <span className="text-[11px] text-theme-text-muted">score {video.search_score.toFixed(2)}</span>
          )}
        </div>
        {video.description && (
          <p className="text-xs text-theme-text-muted line-clamp-2 mb-2">{video.description}</p>
        )}

        {video.domain_tags && Object.keys(video.domain_tags).length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {video.domain_tags.method && (
              <span className="badge badge-blue" title="Method">
                <Layers3 className="h-3 w-3" /> {video.domain_tags.method}
              </span>
            )}
            {video.domain_tags.road_stage && (
              <span className="badge badge-yellow" title="Road stage">
                <Tag className="h-3 w-3" /> {video.domain_tags.road_stage}
              </span>
            )}
            {video.domain_tags.equipment && (
              <span className="badge badge-gray" title="Equipment">
                <Truck className="h-3 w-3" /> {video.domain_tags.equipment}
              </span>
            )}
            {video.domain_tags.content_type && (
              <span className="badge badge-gray" title="Content type">
                {video.domain_tags.content_type}
              </span>
            )}
            {video.domain_tags.soil_issue && (
              <span className="badge badge-red" title="Soil issue">
                {video.domain_tags.soil_issue}
              </span>
            )}
          </div>
        )}
        {video.match_reason && (
          <p className="text-[11px] text-theme-text-muted italic mb-3 line-clamp-1" title={video.match_reason}>
            why matched: {video.match_reason}
          </p>
        )}

        <div className="mt-auto grid grid-cols-3 gap-1.5">
          <button className="btn btn-sm btn-success" onClick={onApprove} title="Approve">
            <Check className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Approve</span>
          </button>
          <button className="btn btn-sm btn-danger" onClick={onReject} title="Reject">
            <X className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Reject</span>
          </button>
          <button className="btn btn-sm btn-primary" onClick={onSelectClip} title="Use clip">
            <Scissors className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Use</span>
          </button>
        </div>
      </div>
    </div>
  );
}
