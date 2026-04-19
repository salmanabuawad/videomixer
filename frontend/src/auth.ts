/**
 * Browser-session gate only (not server-side security).
 * Replace with real authentication for production.
 */
const STORAGE_KEY = "zymtech_session";

const DEMO_USER = "admin";
const DEMO_PASSWORD = "admin123";

export function tryLogin(username: string, password: string): boolean {
  if (username === DEMO_USER && password === DEMO_PASSWORD) {
    sessionStorage.setItem(STORAGE_KEY, "1");
    return true;
  }
  return false;
}

export function logout(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function isAuthenticated(): boolean {
  return sessionStorage.getItem(STORAGE_KEY) === "1";
}
