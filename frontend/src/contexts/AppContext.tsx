/**
 * AppContext — session + brightness + theme + font-size in one place.
 */
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import api from '../api';
import { setFontSizeStore, type FontSize } from '../lib/fontSizeStore';

export type ThemeId    = 'ocean' | 'mist';
export type Brightness = 'light' | 'normal' | 'dark' | 'contrast';

export interface Session {
  user_id:   number;
  user_name: string;
  user_role: 'admin' | 'user' | 'readonly' | string;
  token:     string;
}

interface AppContextValue {
  session:  Session | null;
  login:    (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout:   () => void;
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

export function AppProvider({ children }: { children: ReactNode }) {
  const [session,    setSession]    = useState<Session | null>(loadSession);
  const [themeId,    setThemeIdSt]  = useState<ThemeId>(    () => (localStorage.getItem(THEME_KEY)    as ThemeId)    || 'ocean');
  const [brightness, setBrightnessSt] = useState<Brightness>(() => (localStorage.getItem(BRIGHT_KEY)  as Brightness) || 'normal');
  const [fontSize,   setFontSizeSt] = useState<FontSize>(   () => (localStorage.getItem(FONTSIZE_KEY) as FontSize)   || 'normal');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeId);
    localStorage.setItem(THEME_KEY, themeId);
  }, [themeId]);

  useEffect(() => {
    if (brightness === 'normal') {
      document.documentElement.removeAttribute('data-brightness');
      localStorage.removeItem(BRIGHT_KEY);
    } else {
      document.documentElement.setAttribute('data-brightness', brightness);
      localStorage.setItem(BRIGHT_KEY, brightness);
    }
  }, [brightness]);

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

  const login = useCallback(async (username: string, password: string) => {
    if (!username.trim() || !password) return { success: false, error: 'Username and password are required.' };
    try {
      const res = await api.post('/auth/login', { username: username.trim(), password });
      const sess: Session = res.data;
      localStorage.setItem(SESSION_KEY, JSON.stringify(sess));
      setSession(sess);
      return { success: true };
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Login failed.';
      return { success: false, error: msg };
    }
  }, []);

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
