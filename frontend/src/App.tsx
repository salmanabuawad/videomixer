import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Film, Settings, FolderKanban, KeyRound, Menu, X,
  SlidersHorizontal, LogOut, User,
} from 'lucide-react';
import { useApp } from './contexts/AppContext';
import { Login } from './components/Login';
import { ProjectsPage } from './pages/ProjectsPage';
import { ConfigPage } from './pages/ConfigPage';

const APP_NAME    = 'Video Mixer';
const FOOTER_TEXT = '© Kortex Digital';

type TabId = 'projects' | 'config';

interface NavItem {
  id:    TabId;
  label: string;
  icon:  React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'projects', label: 'Projects', icon: <FolderKanban className="h-5 w-5 shrink-0" /> },
  { id: 'config',   label: 'Config',   icon: <KeyRound     className="h-5 w-5 shrink-0" /> },
];

export default function App() {
  const { session, logout, brightness, setBrightness, fontSize, setFontSize, themeId, setThemeId } = useApp();
  const [isAuthenticated, setIsAuthenticated] = useState(!!session);
  const [activeTab, setActiveTab]   = useState<TabId>('projects');
  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setSettingsOpen(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const closeAllMenus = useCallback(() => {
    setSidebarOpen(false); setSettingsOpen(false); setUserMenuOpen(false);
  }, []);

  if (!isAuthenticated) return <Login onLoginSuccess={() => setIsAuthenticated(true)} />;

  return (
    <div className="min-h-screen bg-theme-content flex flex-col" onClick={closeAllMenus}>
      {/* ── HEADER ── */}
      <header
        className="shrink-0 h-12 bg-theme-header flex items-center justify-between px-4 text-white shadow-md z-50"
        style={{ background: 'rgb(var(--theme-header))' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
            <Film className="h-5 w-5 text-white" />
          </div>
          <span className="font-semibold text-base hidden sm:inline">{APP_NAME}</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Settings */}
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => { setSettingsOpen(v => !v); setUserMenuOpen(false); }}
              className={`p-2.5 rounded hover:bg-white/10 transition-colors ${settingsOpen ? 'bg-white/10' : 'opacity-80'}`}
              title="Settings"
            >
              <SlidersHorizontal className="h-5 w-5" />
            </button>
            {settingsOpen && (
              <div
                className="absolute right-0 top-full mt-1 w-52 border border-white/10 rounded-lg shadow-xl py-2 z-[100]"
                style={{ background: 'rgb(var(--theme-sidebar))' }}
              >
                <div className="px-3 py-1.5 border-b border-white/10">
                  <span className="text-xs font-medium text-white/70">Theme</span>
                  <div className="flex gap-1 mt-1">
                    {(['ocean', 'mist'] as const).map(t => (
                      <button key={t}
                        onClick={() => { setThemeId(t); setSettingsOpen(false); }}
                        className={`flex-1 py-1.5 rounded text-sm capitalize ${themeId === t ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/10'}`}
                      >{t}</button>
                    ))}
                  </div>
                </div>
                <div className="px-3 py-1.5 border-b border-white/10">
                  <span className="text-xs font-medium text-white/70">Brightness</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(['light', 'normal', 'dark', 'contrast'] as const).map(b => (
                      <button key={b}
                        onClick={() => { setBrightness(b); setSettingsOpen(false); }}
                        className={`flex-1 min-w-0 py-1.5 rounded text-xs ${brightness === b ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/10'}`}
                      >{b}</button>
                    ))}
                  </div>
                </div>
                <div className="px-3 py-1.5">
                  <span className="text-xs font-medium text-white/70">Font Size</span>
                  <div className="flex gap-1 mt-1">
                    {(['small', 'normal', 'large'] as const).map(f => (
                      <button key={f}
                        onClick={() => { setFontSize(f); setSettingsOpen(false); }}
                        className={`flex-1 py-1.5 rounded text-sm capitalize ${fontSize === f ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/10'}`}
                      >{f}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* User */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => { setUserMenuOpen(v => !v); setSettingsOpen(false); }}
              className={`p-2.5 rounded hover:bg-white/10 transition-colors ${userMenuOpen ? 'bg-white/10' : 'opacity-80'}`}
              title="User"
            >
              <User className="h-5 w-5" />
            </button>
            {userMenuOpen && (
              <div
                className="absolute right-0 top-full mt-1 w-48 border border-white/10 rounded-lg shadow-xl py-2 z-[100]"
                style={{ background: 'rgb(var(--theme-sidebar))' }}
              >
                <div className="px-3 py-2 border-b border-white/10">
                  <p className="text-sm font-medium text-white truncate">{session?.user_name}</p>
                  <p className="text-xs text-white/70 capitalize">{session?.user_role}</p>
                </div>
                <button
                  onClick={() => { setUserMenuOpen(false); logout(); setIsAuthenticated(false); }}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 text-sm text-white/90 hover:bg-red-500/30 hover:text-white rounded-b-lg transition-colors"
                >
                  <LogOut className="h-4 w-4" /> Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── BODY ── */}
      <div className="flex-1 flex flex-row min-h-0">
        <button
          onClick={e => { e.stopPropagation(); setSidebarOpen(v => !v); }}
          className="md:hidden fixed z-50 min-h-[44px] min-w-[44px] p-3 left-2 top-2 bg-app-sidebar rounded-xl shadow-lg border border-app-sidebar-hover touch-manipulation"
          style={{ background: 'rgb(var(--theme-sidebar))' }}
        >
          <Menu className="h-6 w-6 text-white" />
        </button>

        {/* Sidebar */}
        <div
          className={`${sidebarOpen ? 'fixed inset-y-0 left-0 z-40 md:relative md:z-auto' : 'hidden md:flex'}
                       md:w-[72px] flex flex-col shrink-0 border-r border-white/10`}
          style={{ background: 'rgb(var(--theme-sidebar))' }}
          onClick={e => e.stopPropagation()}
        >
          {sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden absolute min-h-[44px] min-w-[44px] p-3 right-2 top-2 rounded-xl"
            >
              <X className="h-6 w-6 text-white" />
            </button>
          )}

          <nav className="flex-1 p-2 space-y-1 overflow-visible pt-16 md:pt-2">
            {NAV_ITEMS.map(item => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
                  title={item.label}
                  className={`w-full flex items-center justify-center md:justify-center gap-3 md:gap-0 p-3 rounded transition-all duration-200 text-white relative
                    ${active ? 'border-r-[3px]' : 'hover:bg-white/10'}`}
                  style={active ? {
                    background: 'rgb(var(--theme-sidebar-active))',
                    borderRightColor: 'rgb(var(--theme-sidebar-active-stripe))',
                  } : undefined}
                >
                  {item.icon}
                  <span className="md:hidden text-sm">{item.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="p-2 border-t border-white/10 flex flex-col items-center">
            <p className="text-[9px] text-white/40 text-center">{FOOTER_TEXT}</p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-auto" onClick={closeAllMenus}>
          {/* Page header strip */}
          <div className="page-header flex items-center gap-3 px-4 sm:px-6 py-3">
            <div className="p-1.5 rounded-md bg-white/20 flex items-center justify-center">
              {activeTab === 'projects' ? <FolderKanban className="h-5 w-5 text-white" /> : <KeyRound className="h-5 w-5 text-white" />}
            </div>
            <span className="text-base font-semibold text-white">
              {NAV_ITEMS.find(n => n.id === activeTab)?.label}
            </span>
          </div>

          {/* Page body */}
          <div
            className="flex-1 p-4 sm:p-6"
            style={{ background: 'rgb(var(--theme-content))' }}
          >
            {activeTab === 'projects' ? <ProjectsPage /> : <ConfigPage />}
          </div>
        </div>
      </div>
    </div>
  );
}
