/**
 * App.tsx — shell that matches buildingsmanager exactly:
 *   • h-12 dark header  (logo · title · settings menu · user menu)
 *   • narrow icon-only sidebar (72px desktop) with fly-out popup submenus
 *   • tabs bar below header  (border-b-2 active indicator, X close button)
 *   • content area fills the rest (no page scroll)
 *
 * CUSTOMISE:
 *   1. Replace NAV_GROUPS with your own nav items and page types.
 *   2. Add cases to renderPage() for each page type.
 *   3. Replace APP_NAME, APP_ICON, and FOOTER_TEXT.
 */
import { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import {
  Building2, Settings, Home, Search, Users, FileText, BarChart3,
  ChevronDown, ChevronRight, X, Menu, Loader2, SlidersHorizontal, LogOut, User,
} from 'lucide-react';
import { useApp } from './contexts/AppContext';
import { Login } from './components/Login';

/* ── lazy pages ─────────────────────────────────────────────── */
const SampleGrid  = lazy(() => import('./components/SampleGrid').then(m => ({ default: m.SampleGrid })));

/* ── App config (change per project) ─────────────────────────── */
const APP_NAME    = 'My Application';
const FOOTER_TEXT = '© My Company';
function AppIcon() {
  return (
    <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
      <Building2 className="h-5 w-5 text-white" />
    </div>
  );
}

/* ── Tab definition ───────────────────────────────────────────── */
export interface Tab {
  id:          string;
  type:        string;   // matches a case in renderPage()
  label:       string;
  icon?:       React.ReactNode;
  pinned?:     boolean;  // pinned = no X button, cannot be closed
  refreshKey?: number;
  /** put any extra data you need for rendering */
  [key: string]: unknown;
}

/* ── Nav item definition ──────────────────────────────────────── */
interface NavItem {
  label:      string;
  icon:       React.ReactNode;
  /** active when any of these tab types is current */
  activeFor:  string[];
  /** items that appear in the flyout menu */
  items:      { label: string; onClick: () => void; hidden?: boolean }[];
}

/* ── Fallback while lazy component loads ─────────────────────── */
function TabFallback() {
  return (
    <div className="flex-1 flex items-center justify-center bg-app-bg">
      <Loader2 className="w-10 h-10 text-app-accent animate-spin" />
    </div>
  );
}

/* ── Unsaved-changes modal ────────────────────────────────────── */
function UnsavedModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Unsaved Changes</h3>
        <p className="text-gray-500 text-sm mb-6">You have unsaved changes. Are you sure you want to leave?</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel}  className="btn btn-cancel btn-md">Stay</button>
          <button onClick={onConfirm} className="btn btn-danger btn-md">Leave Anyway</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
export default function App() {
  const { session, logout, brightness, setBrightness, fontSize, setFontSize, themeId, setThemeId } = useApp();
  const [isAuthenticated, setIsAuthenticated] = useState(!!session);

  /* ── Tab state ──────────────────────────────────────────────── */
  const [tabs, setTabs] = useState<Tab[]>(() => [
    { id: 'dashboard', type: 'dashboard', label: 'Dashboard', pinned: true, icon: <BarChart3 className="h-4 w-4" /> },
    { id: 'grid',      type: 'grid',      label: 'Data Grid',  pinned: true, icon: <Home className="h-4 w-4" /> },
  ]);
  const [activeTabId, setActiveTabId] = useState('dashboard');

  /* ── Unsaved changes guard ──────────────────────────────────── */
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const pendingNav = useRef<(() => void) | null>(null);
  // Set this ref in child pages when they have unsaved changes
  const hasUnsavedChanges = useRef(false);

  const guardedNav = useCallback((action: () => void) => {
    if (hasUnsavedChanges.current) {
      pendingNav.current = action;
      setShowUnsavedModal(true);
    } else {
      action();
    }
  }, []);

  /* ── Sidebar / menu state ───────────────────────────────────── */
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [settingsOpen,  setSettingsOpen]  = useState(false);
  const [userMenuOpen,  setUserMenuOpen]  = useState(false);
  const [openMenuId,    setOpenMenuId]    = useState<string | null>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  /* Close all popups on outside click */
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setSettingsOpen(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const closeAllMenus = useCallback(() => {
    setSidebarOpen(false);
    setOpenMenuId(null);
    setSettingsOpen(false);
    setUserMenuOpen(false);
  }, []);

  /* ── Tab helpers ────────────────────────────────────────────── */
  /** Open or focus a tab. Only one tab per type (unless type === 'grid'). */
  function openTab(tab: Tab) {
    guardedNav(() => {
      setTabs(prev => {
        const existing = prev.find(t => t.id === tab.id);
        if (existing) {
          setActiveTabId(tab.id);
          return prev.map(t => t.id === tab.id ? { ...t, refreshKey: Date.now() } : t);
        }
        // Remove other tabs of same type (except pinned)
        const filtered = prev.filter(t => t.type !== tab.type || t.pinned);
        return [...filtered, { ...tab, refreshKey: Date.now() }];
      });
      setActiveTabId(tab.id);
    });
  }

  function closeTab(tabId: string) {
    guardedNav(() => {
      const tab = tabs.find(t => t.id === tabId);
      if (!tab || tab.pinned) return;
      setTabs(prev => {
        const next = prev.filter(t => t.id !== tabId);
        if (next.length === 0) {
          return [{ id: 'dashboard', type: 'dashboard', label: 'Dashboard', pinned: true }];
        }
        return next;
      });
      if (activeTabId === tabId) {
        const rest = tabs.filter(t => t.id !== tabId);
        setActiveTabId(rest.length > 0 ? rest[rest.length - 1].id : 'dashboard');
      }
    });
  }

  /* ── Nav groups ─────────────────────────────────────────────── */
  /* Add your own groups here. Each group = one sidebar icon.     */
  const NAV_GROUPS: NavItem[] = [
    {
      label:     'Dashboard',
      icon:      <BarChart3 className="h-5 w-5 shrink-0" />,
      activeFor: ['dashboard'],
      items: [
        { label: 'Dashboard', onClick: () => { closeAllMenus(); openTab({ id: 'dashboard', type: 'dashboard', label: 'Dashboard', pinned: true }); } },
      ],
    },
    {
      label:     'Data',
      icon:      <Home className="h-5 w-5 shrink-0" />,
      activeFor: ['grid', 'reports'],
      items: [
        { label: 'Data Grid', onClick: () => { closeAllMenus(); openTab({ id: 'grid', type: 'grid', label: 'Data Grid', pinned: true }); } },
        { label: 'Reports',   onClick: () => { closeAllMenus(); openTab({ id: 'reports', type: 'reports', label: 'Reports', icon: <FileText className="h-4 w-4" /> }); } },
      ],
    },
    {
      label:     'Search',
      icon:      <Search className="h-5 w-5 shrink-0" />,
      activeFor: ['search'],
      items: [
        { label: 'Search', onClick: () => { closeAllMenus(); openTab({ id: 'search', type: 'search', label: 'Search', icon: <Search className="h-4 w-4" /> }); } },
      ],
    },
    {
      label:     'Admin',
      icon:      <Settings className="h-5 w-5 shrink-0" />,
      activeFor: ['users', 'settings'],
      items: [
        { label: 'Users',    onClick: () => { closeAllMenus(); openTab({ id: 'users',    type: 'users',    label: 'Users',    icon: <Users className="h-4 w-4" /> }); } },
        { label: 'Settings', onClick: () => { closeAllMenus(); openTab({ id: 'settings', type: 'settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> }); } },
      ],
    },
  ];

  /* ── Page renderer ──────────────────────────────────────────── */
  const activeTab = tabs.find(t => t.id === activeTabId);
  function renderPage() {
    if (!activeTab) return null;
    switch (activeTab.type) {
      case 'grid':      return <Suspense fallback={<TabFallback />}><SampleGrid key={activeTab.refreshKey as number} /></Suspense>;
      case 'dashboard':
      case 'reports':
      case 'search':
      case 'users':
      case 'settings':
      default:
        return (
          <div className="flex-1 flex items-center justify-center bg-app-bg">
            <div className="text-center text-gray-400">
              <div className="text-5xl mb-4 opacity-20">◻</div>
              <p className="text-lg font-medium capitalize">{activeTab.label}</p>
              <p className="text-sm mt-1">Page content goes here.</p>
            </div>
          </div>
        );
    }
  }

  /* ── Auth guard ─────────────────────────────────────────────── */
  if (!isAuthenticated) {
    return <Login onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  const isActive = (group: NavItem) => activeTab ? group.activeFor.includes(activeTab.type) : false;

  /* ══════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-app-bg flex flex-col" onClick={closeAllMenus}>

      {/* ═══════════════════════════════════════════════════════
          HEADER  — h-12, dark blue
      ═══════════════════════════════════════════════════════ */}
      <header className="shrink-0 h-12 bg-app-header flex items-center justify-between px-4 text-white shadow-md z-50"
              onClick={e => e.stopPropagation()}>

        {/* Left: logo + title */}
        <div className="flex items-center gap-2">
          <AppIcon />
          <span className="font-semibold text-base hidden sm:inline">{APP_NAME}</span>
        </div>

        {/* Right: settings + user */}
        <div className="flex items-center gap-1">

          {/* Settings menu */}
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => { setSettingsOpen(v => !v); setUserMenuOpen(false); }}
              className={`p-2.5 rounded hover:bg-white/10 transition-colors ${settingsOpen ? 'bg-white/10' : 'opacity-80'}`}
              title="Settings"
            >
              <SlidersHorizontal className="h-5 w-5" />
            </button>
            {settingsOpen && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-app-sidebar border border-white/10 rounded-lg shadow-xl py-2 z-[100]">
                {/* Theme */}
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
                {/* Brightness */}
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
                {/* Font size */}
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

          {/* User menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => { setUserMenuOpen(v => !v); setSettingsOpen(false); }}
              className={`p-2.5 rounded hover:bg-white/10 transition-colors ${userMenuOpen ? 'bg-white/10' : 'opacity-80'}`}
              title="User"
            >
              <User className="h-5 w-5" />
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-app-sidebar border border-white/10 rounded-lg shadow-xl py-2 z-[100]">
                <div className="px-3 py-2 border-b border-white/10">
                  <p className="text-sm font-medium text-white truncate">{session?.user_name}</p>
                  <p className="text-xs text-white/70 capitalize">{session?.user_role}</p>
                </div>
                <button
                  onClick={() => { setUserMenuOpen(false); logout(); setIsAuthenticated(false); }}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 text-sm text-white/90 hover:bg-app-destructive/30 hover:text-white rounded-b-lg transition-colors"
                >
                  <LogOut className="h-4 w-4" /> Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════
          BODY  — sidebar + content
      ═══════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-row min-h-0">

        {/* Mobile hamburger */}
        <button
          onClick={e => { e.stopPropagation(); setSidebarOpen(v => !v); }}
          className="md:hidden fixed z-50 min-h-[44px] min-w-[44px] p-3 left-2 bg-app-sidebar rounded-xl shadow-lg border border-app-sidebar-hover touch-manipulation"
          style={{ top: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
        >
          <Menu className="h-6 w-6 text-white" />
        </button>

        {/* ── Sidebar ── */}
        <div
          className={`${sidebarOpen ? 'fixed inset-0 z-40 md:relative md:z-auto' : 'hidden md:flex'}
                       md:w-[72px] lg:w-20 bg-app-sidebar border-r border-white/10
                       flex flex-col shrink-0 overflow-visible`}
          onClick={e => e.stopPropagation()}
        >
          {/* Mobile close */}
          {sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden absolute min-h-[44px] min-w-[44px] p-3 right-2 bg-app-sidebar rounded-xl touch-manipulation"
              style={{ top: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
            >
              <X className="h-6 w-6 text-white" />
            </button>
          )}

          {/* Nav icons */}
          <nav className="flex-1 p-2 space-y-0.5 overflow-visible">
            {NAV_GROUPS.map((group, gi) => (
              <div key={gi} className="relative">
                <button
                  onClick={() => setOpenMenuId(openMenuId === String(gi) ? null : String(gi))}
                  title={group.label}
                  className={`w-full flex items-center justify-center p-2.5 rounded transition-all duration-200 text-white relative
                    ${isActive(group) ? 'bg-app-sidebar-active border-r-[3px] border-r-app-sidebar-indicator' : 'hover:bg-app-sidebar-hover'}`}
                >
                  {group.icon}
                </button>

                {/* Flyout submenu */}
                {openMenuId === String(gi) && (
                  <div className="absolute left-full top-0 ml-1 w-52 bg-app-sidebar border border-white/10 rounded-lg shadow-xl py-2 z-[100] max-h-[70vh] overflow-y-auto">
                    <div className="px-3 py-1 mb-1">
                      <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">{group.label}</span>
                    </div>
                    {group.items.filter(item => !item.hidden).map((item, ii) => (
                      <button key={ii} onClick={item.onClick} className="btn-menu-item">
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>

          <div className="p-2 border-t border-white/10 flex flex-col items-center">
            <p className="text-[9px] text-white/40">{FOOTER_TEXT}</p>
          </div>
        </div>

        {/* ── Content ── */}
        <div
          className="flex-1 flex flex-col min-w-0 pt-[52px] md:pt-0"
          onClick={closeAllMenus}
        >
          {/* ── Tabs bar ── */}
          <div className="bg-app-tabs-bg border-b border-app-input-border shrink-0">
            <div className="px-2 sm:px-4 py-1.5">
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide min-h-[40px]">
                {tabs.map(tab => (
                  <div
                    key={tab.id}
                    className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-all duration-200 cursor-pointer flex-shrink-0 -mb-px group
                      ${activeTabId === tab.id
                        ? 'border-app-sidebar-indicator text-app-text-primary font-semibold'
                        : 'border-transparent text-app-text-muted hover:text-app-text-primary hover:bg-white/40'}`}
                  >
                    <div
                      className="flex items-center gap-2"
                      onClick={() => guardedNav(() => {
                        setTabs(prev => prev.map(t => t.id === tab.id ? { ...t, refreshKey: Date.now() } : t));
                        setActiveTabId(tab.id);
                      })}
                    >
                      {tab.icon && <span className="text-slate-600 shrink-0">{tab.icon}</span>}
                      <span className="whitespace-nowrap text-sm hidden sm:inline">{tab.label}</span>
                    </div>
                    {!tab.pinned && (
                      <button
                        onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
                        className="p-0.5 text-slate-400 hover:bg-red-100 hover:text-red-600 rounded transition-all hover:scale-110"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Page content ── */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-app-bg">
            {renderPage()}
          </div>
        </div>
      </div>

      {/* ── Unsaved changes modal ── */}
      {showUnsavedModal && (
        <UnsavedModal
          onConfirm={() => { setShowUnsavedModal(false); hasUnsavedChanges.current = false; pendingNav.current?.(); pendingNav.current = null; }}
          onCancel={()  => { setShowUnsavedModal(false); pendingNav.current = null; }}
        />
      )}
    </div>
  );
}
