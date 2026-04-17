interface Props {
  label: string;
  score?: number;     // 0-100
  comment?: string;
  icon?: React.ReactNode;
}

function hexColor(score: number): string {
  if (score >= 80) return '#10b981'; // emerald-500
  if (score >= 60) return '#3b82f6'; // blue-500
  if (score >= 40) return '#f59e0b'; // amber-500
  return '#ef4444';                   // red-500
}

export function ScoreBar({ label, score, comment, icon }: Props) {
  const s = typeof score === 'number' ? Math.max(0, Math.min(100, score)) : null;
  const color = s === null ? '#9ca3af' : hexColor(s);
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 text-sm text-theme-text-primary font-medium">
          {icon}{label}
        </div>
        <div className="text-sm font-mono tabular-nums" style={{ color }}>
          {s === null ? '—' : `${s}`}
        </div>
      </div>
      <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${s ?? 0}%`, background: color }}
        />
      </div>
      {comment && <p className="text-xs text-theme-text-muted mt-1 leading-snug">{comment}</p>}
    </div>
  );
}

export function OverallScorePill({ score, engine }: { score?: number; engine?: string }) {
  const s = typeof score === 'number' ? Math.max(0, Math.min(100, score)) : null;
  const color = s === null ? '#9ca3af' : hexColor(s);
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold shadow-md"
        style={{ background: color }}
      >
        <span className="text-xl tabular-nums">{s === null ? '—' : s}</span>
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-theme-text-muted">Overall</div>
        <div className="text-sm font-semibold text-theme-text-primary">
          {s === null ? 'Not evaluated' : s >= 80 ? 'Strong fit' : s >= 60 ? 'Good' : s >= 40 ? 'Marginal' : 'Weak'}
        </div>
        {engine && <div className="text-[10px] text-theme-text-muted uppercase tracking-wide">by {engine}</div>}
      </div>
    </div>
  );
}
