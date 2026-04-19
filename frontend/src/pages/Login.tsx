import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { isAuthenticated, tryLogin } from "../auth";

export function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (tryLogin(username.trim(), password)) {
      navigate("/", { replace: true });
      return;
    }
    setError("Invalid username or password.");
  }

  return (
    <div className="login-page">
      <div className="login-card card">
        <h1 className="login-title">Zym-Tec Production</h1>
        <p className="login-subtitle">Sign in to continue</p>
        <form onSubmit={onSubmit} className="login-form">
          <label className="login-label" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            className="login-input"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <label className="login-label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="login-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="error login-error">{error}</p>}
          <button type="submit" className="primary login-button">
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
