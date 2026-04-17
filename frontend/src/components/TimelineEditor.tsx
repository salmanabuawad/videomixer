import { useState } from 'react';
import { Plus, Scissors, Replace, Layers, LayoutPanelLeft, Trash2 } from 'lucide-react';
import api from '../api';
import type { ClipOperation, SelectedClip } from '../types';

interface Props {
  clip: SelectedClip;
  operations: ClipOperation[];
  onCreated: () => void;
}

const OP_LABEL: Record<string, { icon: JSX.Element; color: string }> = {
  remove:        { icon: <Scissors        className="h-3.5 w-3.5" />, color: 'badge-red'    },
  replace:       { icon: <Replace         className="h-3.5 w-3.5" />, color: 'badge-blue'   },
  side_by_side:  { icon: <LayoutPanelLeft className="h-3.5 w-3.5" />, color: 'badge-yellow' },
  overlay:       { icon: <Layers          className="h-3.5 w-3.5" />, color: 'badge-green'  },
};

export function TimelineEditor({ clip, operations, onCreated }: Props) {
  const [form, setForm] = useState({
    op_type: 'remove',
    from_sec: 0,
    to_sec: 5,
    text_content: '',
    layout_mode: 'left_right',
  });

  async function createOperation() {
    await api.post(`/selected-clips/${clip.id}/operations`, {
      opType:      form.op_type,
      fromSec:     Number(form.from_sec),
      toSec:       Number(form.to_sec),
      textContent: form.text_content,
      layoutMode:  form.layout_mode,
    });
    await onCreated();
  }

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title"><Scissors className="h-5 w-5" /> Timeline Operations</div>
          <div className="card-subtitle">
            Clip {clip.id.slice(0, 8)} — {clip.source_start_sec}s → {clip.source_end_sec}s
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="label-base">Operation</label>
          <select value={form.op_type} onChange={e => setForm({ ...form, op_type: e.target.value })} className="input-base">
            <option value="remove">remove</option>
            <option value="replace">replace</option>
            <option value="side_by_side">side_by_side</option>
            <option value="overlay">overlay</option>
          </select>
        </div>
        <div>
          <label className="label-base">From (s)</label>
          <input type="number" value={form.from_sec}
                 onChange={e => setForm({ ...form, from_sec: Number(e.target.value) })}
                 className="input-base" />
        </div>
        <div>
          <label className="label-base">To (s)</label>
          <input type="number" value={form.to_sec}
                 onChange={e => setForm({ ...form, to_sec: Number(e.target.value) })}
                 className="input-base" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
        <div>
          <label className="label-base">Overlay Text / Note</label>
          <input value={form.text_content}
                 onChange={e => setForm({ ...form, text_content: e.target.value })}
                 className="input-base" placeholder="Optional text" />
        </div>
        <div>
          <label className="label-base">Layout</label>
          <select value={form.layout_mode}
                  onChange={e => setForm({ ...form, layout_mode: e.target.value })}
                  className="input-base">
            <option value="left_right">left_right</option>
            <option value="right_left">right_left</option>
            <option value="top_bottom">top_bottom</option>
            <option value="picture_in_picture">picture_in_picture</option>
          </select>
        </div>
      </div>

      <div className="flex justify-end mt-4">
        <button className="btn btn-md btn-primary" onClick={createOperation}>
          <Plus className="h-4 w-4" /> Add Operation
        </button>
      </div>

      <hr className="my-4 border-theme-card-border" />

      <div className="space-y-2">
        <div className="text-sm font-semibold text-theme-text-primary mb-1">Existing operations</div>
        {operations.length === 0 ? (
          <div className="text-sm text-theme-text-muted italic py-4 text-center">
            No operations yet. Add one above.
          </div>
        ) : (
          <ul className="divide-y divide-theme-card-border border border-theme-card-border rounded-lg overflow-hidden">
            {operations.map(op => {
              const cfg = OP_LABEL[op.op_type] || { icon: null, color: 'badge-gray' };
              return (
                <li key={op.id} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50">
                  <span className={`badge ${cfg.color}`}>{cfg.icon}{op.op_type}</span>
                  <span className="text-theme-text-primary font-mono text-xs">
                    {op.from_sec}s → {op.to_sec}s
                  </span>
                  {op.text_content && (
                    <span className="text-theme-text-muted text-xs truncate flex-1">“{op.text_content}”</span>
                  )}
                  {op.layout_mode && (
                    <span className="text-[11px] text-theme-text-muted">{op.layout_mode}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
