import { useEffect, useState } from 'react';
import { KeyRound, Youtube, Facebook, Save, Shield, CheckCircle2, Sparkles } from 'lucide-react';
import api from '../api';

interface ConfigRow { key: string; encrypted: boolean; updated_at: string }

export function ConfigPage() {
  const [rows, setRows] = useState<ConfigRow[]>([]);
  const [form, setForm] = useState({
    facebook_email:       '',
    facebook_password:    '',
    facebook_cookies_txt: '',
    youtube_email:        '',
    youtube_password:     '',
    youtube_api_key:      '',
    youtube_cookies_txt:  '',
    anthropic_api_key:    '',
  });
  const [saving, setSaving] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function load() {
    const res = await api.get('/config');
    setRows(res.data);
  }

  useEffect(() => { void load(); }, []);

  async function saveBatch(keys: Array<keyof typeof form>, label: string) {
    setSaving(label);
    try {
      await Promise.all(keys.map(k => api.post('/config', { key: k, value: form[k], encrypted: true })));
      await load();
      setSavedAt(label);
      setTimeout(() => setSavedAt(null), 2200);
    } finally { setSaving(null); }
  }

  return (
    <div className="space-y-5 max-w-[1500px] mx-auto">
      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title"><Shield className="h-5 w-5" /> Managed Credentials</div>
            <div className="card-subtitle">Stored encrypted in the database <code>config</code> table.</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Anthropic LLM */}
          <div className="border border-theme-card-border rounded-xl p-4 lg:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-5 w-5 text-purple-600" />
              <h3 className="font-semibold text-theme-text-primary">Anthropic (LLM analysis)</h3>
            </div>
            <p className="text-xs text-theme-text-muted mb-3">
              When set, candidate analysis (summary / strengths / weaknesses) uses Anthropic Claude.
              If left empty, a built-in heuristic analyzer is used instead.
            </p>
            <div className="space-y-3">
              <div>
                <label className="label-base">API Key</label>
                <input type="password" value={form.anthropic_api_key}
                       onChange={e => setForm({ ...form, anthropic_api_key: e.target.value })}
                       className="input-base" placeholder="sk-ant-…" autoComplete="off" />
              </div>
              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  className="btn btn-md btn-primary"
                  disabled={saving === 'anthropic'}
                  onClick={() => void saveBatch(['anthropic_api_key'], 'anthropic')}
                >
                  <Save className="h-4 w-4" />
                  {saving === 'anthropic' ? 'Saving…' : 'Save Key'}
                </button>
                {savedAt === 'anthropic' && (
                  <span className="inline-flex items-center gap-1 text-sm text-emerald-600 font-medium">
                    <CheckCircle2 className="h-4 w-4" /> Saved
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Facebook */}
          <div className="border border-theme-card-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Facebook className="h-5 w-5 text-blue-600" />
              <h3 className="font-semibold text-theme-text-primary">Facebook</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label-base">Email</label>
                <input value={form.facebook_email}
                       onChange={e => setForm({ ...form, facebook_email: e.target.value })}
                       className="input-base" placeholder="you@example.com" />
              </div>
              <div>
                <label className="label-base">Password</label>
                <input type="password" value={form.facebook_password}
                       onChange={e => setForm({ ...form, facebook_password: e.target.value })}
                       className="input-base" placeholder="••••••••" />
              </div>
              <div>
                <label className="label-base">
                  Cookies (Netscape format)
                  <span className="ml-2 text-[11px] font-normal text-theme-text-muted">
                    required to download logged-in FB videos via yt-dlp
                  </span>
                </label>
                <textarea
                  value={form.facebook_cookies_txt}
                  onChange={e => setForm({ ...form, facebook_cookies_txt: e.target.value })}
                  className="input-base font-mono text-xs"
                  rows={5}
                  placeholder="# Netscape HTTP Cookie File
.facebook.com	TRUE	/	TRUE	1234567890	c_user	..."
                />
              </div>
              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  className="btn btn-md btn-primary"
                  disabled={saving === 'facebook'}
                  onClick={() => void saveBatch(['facebook_email', 'facebook_password', 'facebook_cookies_txt'], 'facebook')}
                >
                  <Save className="h-4 w-4" />
                  {saving === 'facebook' ? 'Saving…' : 'Save Facebook'}
                </button>
                {savedAt === 'facebook' && (
                  <span className="inline-flex items-center gap-1 text-sm text-emerald-600 font-medium">
                    <CheckCircle2 className="h-4 w-4" /> Saved
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* YouTube */}
          <div className="border border-theme-card-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Youtube className="h-5 w-5 text-red-600" />
              <h3 className="font-semibold text-theme-text-primary">YouTube</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label-base">API Key</label>
                <input value={form.youtube_api_key}
                       onChange={e => setForm({ ...form, youtube_api_key: e.target.value })}
                       className="input-base" placeholder="AIzaSy…" />
              </div>
              <div>
                <label className="label-base">Email (for scraper fallback)</label>
                <input value={form.youtube_email}
                       onChange={e => setForm({ ...form, youtube_email: e.target.value })}
                       className="input-base" placeholder="you@gmail.com" />
              </div>
              <div>
                <label className="label-base">Password</label>
                <input type="password" value={form.youtube_password}
                       onChange={e => setForm({ ...form, youtube_password: e.target.value })}
                       className="input-base" placeholder="••••••••" />
              </div>
              <div>
                <label className="label-base">
                  Cookies (Netscape format)
                  <span className="ml-2 text-[11px] font-normal text-theme-text-muted">
                    required — YouTube now blocks anonymous yt-dlp downloads
                  </span>
                </label>
                <textarea
                  value={form.youtube_cookies_txt}
                  onChange={e => setForm({ ...form, youtube_cookies_txt: e.target.value })}
                  className="input-base font-mono text-xs"
                  rows={5}
                  placeholder="# Netscape HTTP Cookie File
.youtube.com	TRUE	/	TRUE	1234567890	SID	..."
                />
                <p className="text-[11px] text-theme-text-muted mt-1">
                  Export with the <strong>Get cookies.txt LOCALLY</strong> or <strong>cookies.txt</strong> browser extension while logged into YouTube, then paste the whole file here.
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  className="btn btn-md btn-primary"
                  disabled={saving === 'youtube'}
                  onClick={() => void saveBatch(['youtube_api_key', 'youtube_email', 'youtube_password', 'youtube_cookies_txt'], 'youtube')}
                >
                  <Save className="h-4 w-4" />
                  {saving === 'youtube' ? 'Saving…' : 'Save YouTube'}
                </button>
                {savedAt === 'youtube' && (
                  <span className="inline-flex items-center gap-1 text-sm text-emerald-600 font-medium">
                    <CheckCircle2 className="h-4 w-4" /> Saved
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title"><KeyRound className="h-5 w-5" /> Stored Config Keys</div>
            <div className="card-subtitle">Keys currently in the database. Values are never displayed.</div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="text-sm text-theme-text-muted italic py-4 text-center">No config saved yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-theme-text-muted border-b border-theme-card-border">
                  <th className="py-2 px-3 font-semibold">Key</th>
                  <th className="py-2 px-3 font-semibold">Encrypted</th>
                  <th className="py-2 px-3 font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.key} className="border-b border-theme-card-border last:border-0 hover:bg-gray-50">
                    <td className="py-2 px-3 font-mono text-theme-text-primary">{row.key}</td>
                    <td className="py-2 px-3">
                      {row.encrypted
                        ? <span className="badge badge-green">yes</span>
                        : <span className="badge badge-yellow">no</span>}
                    </td>
                    <td className="py-2 px-3 text-theme-text-muted">
                      {new Date(row.updated_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
