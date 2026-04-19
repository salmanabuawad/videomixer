/**
 * AppContext — session + brightness + theme + font-size in one place.
 * Split into sub-contexts if the app grows large.
 */
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { setFontSizeStore, type FontSize } from '../lib/fontSizeStore';

export type ThemeId   = 'ocean' | 'mist';
export type Brightness = 'light' | 'normal' | 'dark' | 'contrast';

export interface Session {
  user_id:   number;
  user_name: string;
  user_role: 'admin' | 'user' | 'readonly' | string;
  token:     string;
}

interface AppContextValue {
  /* Auth */
  session:  Session | null;
  login:    (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout:   () => void;
  /* Appearance */
  themeId:    ThemeId;
  brightness: Brightness;
  fontSize:   FontSize;
  setThemeId:    (t: ThemeId)    => void;
  setBrightness: (b: Brightness) => void;
  setFontSize:   (f: FontSize)   => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const SESSION_KEY   = 'app-session';
const THEME_KEY     = 'app-theme';
const BRIGHT_KEY    = 'app-brightness';
const FONTSIZE_KEY  = 'app-font-size';

function loadSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
  catch { return null; }
}

export function AppProvider({ children, onLogin }: { children: ReactNode; onLogin?: (session: Session) => void }) {
  const [session,    setSession]    = useState<Session | null>(loadSession);
  const [themeId,    setThemeIdSt]  = useState<ThemeId>(    () => (localStorage.getItem(THEME_KEY)    as ThemeId)    || 'ocean');
  const [brightness, setBrightnessSt] = useState<Brightness>(() => (localStorage.getItem(BRIGHT_KEY)  as Brightness) || 'normal');
  const [fontSize,   setFontSizeSt] = useState<FontSize>(   () => (localStorage.getItem(FONTSIZE_KEY) as FontSize)   || 'normal');

  /* Apply theme to DOM */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeId);
    localStorage.setItem(THEME_KEY, themeId);
  }, [themeId]);

  /* Apply brightness to DOM */
  useEffect(() => {
    if (brightness === 'normal') {
      document.documentElement.removeAttribute('data-brightness');
      localStorage.removeItem(BRIGHT_KEY);
    } else {
      document.documentElement.setAttribute('data-brightness', brightness);
      localStorage.setItem(BRIGHT_KEY, brightness);
    }
  }, [brightness]);

  /* Apply font-size to DOM */
  useEffect(() => {
    if (fontSize === 'normal') {
      document.documentElement.removeAttribute('data-font-size');
      localStorage.removeItem(FONTSIZE_KEY);
    } else {
      document.documentElement.setAttribute('data-font-size', fontSize);
      localStorage.setItem(FONTSIZE_KEY, fontSize);
    }
    setFontSizeStore(fontSize);
  }, [fontSize]);

  /* ── Login: replace this stub with your real API call ── */
  const login = useCallback(async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    // TODO: replace with real API  e.g. POST /api/auth/login
    if (!username.trim() || !password) return { success: false, error: 'Username and password are required.' };

    // Stub: accept any non-empty credentials
    const sess: Session = {
      user_id:   1,
      user_name: username.trim(),
      user_role: username.toLowerCase() === 'admin' ? 'admin' : 'user',
      token:     'stub-token',
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sess));
    setSession(sess);
    onLogin?.(sess);
    return { success: true };
  }, [onLogin]);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  }, []);

  return (
    <AppContext.Provider value={{
      session, login, logout,
      themeId,    setThemeId:    setThemeIdSt,
      brightness, setBrightness: setBrightnessSt,
      fontSize,   setFontSize:   setFontSizeSt,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}
