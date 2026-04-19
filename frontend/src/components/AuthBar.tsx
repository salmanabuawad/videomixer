import { Link, useNavigate } from "react-router-dom";
import { logout } from "../auth";

export function AuthBar() {
  const navigate = useNavigate();

  function onLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="auth-bar">
      <div className="auth-bar-left">
        <Link to="/">Projects</Link>
        <span className="auth-bar-sep">·</span>
        <Link to="/settings">Settings</Link>
      </div>
      <div className="auth-bar-right">
        <span className="auth-bar-user">Signed in as admin</span>
        <button type="button" className="auth-bar-logout" onClick={onLogout}>
          Sign out
        </button>
      </div>
    </div>
  );
}
