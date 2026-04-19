/**
 * SampleGrid — boilerplate for any AG Grid page.
 * Copy this file as starting point for each new grid page.
 */
import { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef } from 'ag-grid-community';
import { Plus, Download, RefreshCw } from 'lucide-react';

interface Row { id: number; name: string; status: string; value: number; date: string; }

const STATUS_COLORS: Record<string, string> = {
  Active:   'bg-green-100 text-green-700',
  Inactive: 'bg-gray-100 text-gray-600',
  Pending:  'bg-amber-100 text-amber-700',
};

function StatusCell({ value }: { value: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[value] ?? ''}`}>
      {value}
    </span>
  );
}

function generateRows(n = 80): Row[] {
  const statuses = ['Active', 'Inactive', 'Pending'];
  return Array.from({ length: n }, (_, i) => ({
    id:     i + 1,
    name:   `Item ${String(i + 1).padStart(3, '0')}`,
    status: statuses[i % 3],
    value:  Math.round(Math.random() * 10000) / 100,
    date:   new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10),
  }));
}

export function SampleGrid() {
  const rows = useMemo(() => generateRows(), []);

  const cols = useMemo<ColDef<Row>[]>(() => [
    { field: 'id',     headerName: '#',      width: 70,  sortable: true },
    { field: 'name',   headerName: 'Name',   flex: 1,    sortable: true, filter: true },
    { field: 'status', headerName: 'Status', width: 130, sortable: true, filter: true, cellRenderer: StatusCell },
    { field: 'value',  headerName: 'Value',  width: 130, sortable: true,
      valueFormatter: p => p.value != null ? `$${p.value.toFixed(2)}` : '' },
    { field: 'date',   headerName: 'Date',   width: 130, sortable: true },
  ], []);

  return (
    /* page-fill: flex column that fills the entire content area (no page scroll) */
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

      {/* Page header */}
      <div className="page-header px-4 py-3 flex items-center gap-3 shrink-0">
        <div className="page-header-icon"><Download className="w-4 h-4 text-white" /></div>
        <h2 className="page-header-title">Data Grid</h2>
        <span className="page-header-badge page-header-badge-default">{rows.length} rows</span>
      </div>

      {/* Action bar */}
      <div className="action-bar mx-4 mt-3 mb-2 flex items-center gap-2 shrink-0">
        <button className="btn btn-primary btn-md flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Add
        </button>
        <button className="btn btn-secondary btn-md flex items-center gap-1.5">
          <Download className="w-4 h-4" /> Export
        </button>
        <button className="btn btn-cancel btn-md flex items-center gap-1.5">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* AG Grid — fills remaining height exactly */}
      <div className="flex-1 min-h-0 px-4 pb-4">
        <div className="ag-theme-alpine h-full w-full rounded-lg overflow-hidden border border-gray-200 shadow-sm">
          <AgGridReact
            rowData={rows}
            columnDefs={cols}
            defaultColDef={{ resizable: true, suppressMovable: false }}
            animateRows={false}
            rowSelection="multiple"
            pagination
            paginationPageSize={25}
          />
        </div>
      </div>
    </div>
  );
}
