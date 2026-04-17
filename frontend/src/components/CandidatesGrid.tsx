import { useMemo, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, ICellRendererParams, GridReadyEvent, RowClickedEvent } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import type { CandidateVideo } from '../types';

function secondsToMMSS(sec?: number): string {
  if (!sec && sec !== 0) return '';
  const mm = Math.floor(sec / 60);
  const ss = String(Math.floor(sec % 60)).padStart(2, '0');
  return `${mm}:${ss}`;
}

function analysisBadgeCls(s?: string): string {
  switch (s) {
    case 'done':       return 'badge badge-green';
    case 'processing': return 'badge badge-yellow';
    case 'queued':     return 'badge badge-blue';
    case 'failed':     return 'badge badge-red';
    default:           return 'badge badge-gray';
  }
}

function statusBadgeCls(s: string): string {
  switch (s) {
    case 'approved': return 'badge badge-green';
    case 'rejected': return 'badge badge-red';
    case 'reviewed': return 'badge badge-blue';
    default:         return 'badge badge-gray';
  }
}

interface Props {
  rows: CandidateVideo[];
  selectedId: string | null;
  onRowSelect: (v: CandidateVideo) => void;
}

export function CandidatesGrid({ rows, selectedId, onRowSelect }: Props) {
  const gridRef = useRef<AgGridReact>(null);

  const columnDefs = useMemo<ColDef<CandidateVideo>[]>(() => [
    {
      headerName: 'Thumb',
      field: 'local_thumbnail_path',
      width: 110,
      sortable: false, filter: false,
      cellRenderer: (p: ICellRendererParams<CandidateVideo>) => {
        const row  = p.data!;
        const src  = row.local_thumbnail_path || row.thumbnail_url;
        if (!src) return <div className="w-20 h-12 bg-gray-200 rounded text-[10px] flex items-center justify-center text-gray-500">no thumb</div>;
        return <img src={src} alt="" className="w-20 h-12 object-cover rounded"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />;
      },
    },
    {
      headerName: 'Title',
      field: 'title',
      flex: 2, minWidth: 220, tooltipField: 'title',
      cellRenderer: (p: ICellRendererParams<CandidateVideo>) => (
        <div className="py-1 leading-tight">
          <div className="font-medium text-theme-text-primary line-clamp-2">{p.data!.title}</div>
          {p.data!.match_reason && (
            <div className="text-[11px] text-theme-text-muted italic line-clamp-1">why: {p.data!.match_reason}</div>
          )}
        </div>
      ),
    },
    {
      headerName: 'Source',
      field: 'source',
      width: 100,
      cellRenderer: (p: ICellRendererParams<CandidateVideo>) => (
        <span className="capitalize text-xs">{p.data!.source}</span>
      ),
    },
    {
      headerName: 'Duration',
      field: 'duration_sec',
      width: 100,
      valueFormatter: (p) => secondsToMMSS(p.value as number),
    },
    {
      headerName: 'Score',
      field: 'search_score',
      width: 90,
      valueFormatter: (p) => (typeof p.value === 'number' ? p.value.toFixed(2) : ''),
    },
    {
      headerName: 'Method',
      valueGetter: (p) => p.data?.domain_tags?.method || '',
      width: 100,
    },
    {
      headerName: 'Stage',
      valueGetter: (p) => p.data?.domain_tags?.road_stage || '',
      width: 120,
    },
    {
      headerName: 'Equipment',
      valueGetter: (p) => p.data?.domain_tags?.equipment || '',
      width: 110,
    },
    {
      headerName: 'Review',
      field: 'status',
      width: 110,
      cellRenderer: (p: ICellRendererParams<CandidateVideo>) => (
        <span className={statusBadgeCls(p.data!.status)}>{p.data!.status}</span>
      ),
    },
    {
      headerName: 'Eval',
      valueGetter: (p) => p.data?.evaluation?.scores?.overall ?? null,
      width: 90,
      cellRenderer: (p: ICellRendererParams<CandidateVideo>) => {
        const s = p.data?.evaluation?.scores?.overall;
        if (typeof s !== 'number') return <span className="text-theme-text-muted text-xs">—</span>;
        const color = s >= 80 ? '#10b981' : s >= 60 ? '#3b82f6' : s >= 40 ? '#f59e0b' : '#ef4444';
        return (
          <span
            className="inline-flex items-center justify-center h-7 w-10 rounded-full text-white text-xs font-bold tabular-nums"
            style={{ background: color }}
            title={`overall ${s}/100`}
          >
            {s}
          </span>
        );
      },
    },
    {
      headerName: 'Status',
      field: 'analysis_status',
      width: 120,
      cellRenderer: (p: ICellRendererParams<CandidateVideo>) => (
        <span className={analysisBadgeCls(p.data!.analysis_status)}>
          {p.data!.analysis_status || 'pending'}
        </span>
      ),
    },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    filter:   true,
    resizable: true,
    suppressHeaderMenuButton: false,
  }), []);

  function onGridReady(e: GridReadyEvent) {
    e.api.sizeColumnsToFit();
  }

  function onRowClicked(e: RowClickedEvent<CandidateVideo>) {
    if (e.data) onRowSelect(e.data);
  }

  function getRowClass(params: any) {
    return params.data?.id === selectedId ? 'ag-row-selected-by-app' : '';
  }

  return (
    <div className="ag-theme-alpine" style={{ width: '100%', height: '100%' }}>
      <style>{`
        .ag-theme-alpine .ag-row-selected-by-app {
          background-color: rgb(var(--theme-highlight)) !important;
        }
        .ag-theme-alpine .ag-cell { display: flex; align-items: center; }
      `}</style>
      <AgGridReact
        ref={gridRef}
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        rowHeight={60}
        animateRows
        getRowId={(p: any) => p.data.id}
        getRowClass={getRowClass}
        onGridReady={onGridReady}
        onRowClicked={onRowClicked}
        suppressCellFocus
      />
    </div>
  );
}
