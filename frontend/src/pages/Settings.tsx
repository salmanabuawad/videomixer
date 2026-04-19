import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "../api";

/** Map common synonyms to API values; empty = auto. */
function normalizeShotstackApiEnv(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (!t) return "";
  if (t === "staging" || t === "sandbox") return "stage";
  if (t === "production" || t === "prod") return "v1";
  if (t === "stage" || t === "v1") return t;
  return raw.trim();
}

export function Settings() {
  const [openaiConfigured, setOpenaiConfigured] = useState<boolean | null>(null);
  const [currentModel, setCurrentModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4o");
  const [adminToken, setAdminToken] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [heygenConfigured, setHeygenConfigured] = useState<boolean | null>(null);
  const [heygenAvatarIdCurrent, setHeygenAvatarIdCurrent] = useState("");
  const [heygenKey, setHeygenKey] = useState("");
  const [heygenAvatarId, setHeygenAvatarId] = useState("");
  const [savingHeygen, setSavingHeygen] = useState(false);
  const [heygenMessage, setHeygenMessage] = useState<string | null>(null);
  const [heygenError, setHeygenError] = useState<string | null>(null);
  const [encryptionEnabled, setEncryptionEnabled] = useState<boolean | null>(null);

  const [videoEngine, setVideoEngine] = useState("local");
  const [publicUploadUrl, setPublicUploadUrl] = useState("");
  const [shotstackUseProd, setShotstackUseProd] = useState(false);
  const [shotstackApiEnv, setShotstackApiEnv] = useState("");
  const [shotstackSingleKey, setShotstackSingleKey] = useState("");
  const [shotstackSandboxKey, setShotstackSandboxKey] = useState("");
  const [shotstackProdKey, setShotstackProdKey] = useState("");
  const [shotstackConfigured, setShotstackConfigured] = useState<boolean | null>(null);
  const [shotstackEnvEffective, setShotstackEnvEffective] = useState("");
  const [videoEngineEnv, setVideoEngineEnv] = useState("");
  const [savingShotstack, setSavingShotstack] = useState(false);
  const [shotstackMessage, setShotstackMessage] = useState<string | null>(null);
  const [shotstackError, setShotstackError] = useState<string | null>(null);

  function applyConfigStatus(s: api.ConfigStatus) {
    setOpenaiConfigured(s.openai_configured);
    setCurrentModel(s.openai_model);
    setModel(s.openai_model || "gpt-4o");
    setVideoEngine(s.video_engine === "shotstack" ? "shotstack" : "local");
    setVideoEngineEnv(s.video_engine_env || "");
    setPublicUploadUrl(s.public_upload_url_prefix || "");
    setShotstackUseProd(s.shotstack_use_production);
    setShotstackApiEnv(s.shotstack_api_env_override || "");
    setShotstackEnvEffective(s.shotstack_api_env_effective || "");
    setShotstackConfigured(s.shotstack_configured);
    setHeygenConfigured(s.heygen_configured);
    setHeygenAvatarIdCurrent(s.heygen_avatar_id || "");
    setHeygenAvatarId(s.heygen_avatar_id || "");
    setEncryptionEnabled(s.config_encryption_enabled);
  }

  useEffect(() => {
    api
      .fetchConfigStatus()
      .then(applyConfigStatus)
      .catch((e: Error) => setError(e.message));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError("Paste your OpenAI API key.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.saveOpenAIConfig(apiKey.trim(), model.trim() || "gpt-4o", adminToken.trim() || undefined);
      setMessage("Saved. The key is stored in the server database.");
      setApiKey("");
      const s = await api.fetchConfigStatus();
      applyConfigStatus(s);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onSubmitHeygen(e: FormEvent) {
    e.preventDefault();
    setSavingHeygen(true);
    setHeygenError(null);
    setHeygenMessage(null);
    try {
      const res = await api.saveHeyGenConfig(
        {
          heygen_api_key: heygenKey.trim(),
          heygen_avatar_id: heygenAvatarId.trim(),
        },
        adminToken.trim() || undefined
      );
      setHeygenMessage(
        res.heygen_configured
          ? "Saved. HeyGen is configured and the key is encrypted at rest."
          : "Saved. Avatar ID updated (no API key configured yet)."
      );
      setHeygenKey("");
      const s = await api.fetchConfigStatus();
      applyConfigStatus(s);
    } catch (err: unknown) {
      setHeygenError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingHeygen(false);
    }
  }

  async function onSubmitShotstack(e: FormEvent) {
    e.preventDefault();
    setSavingShotstack(true);
    setShotstackError(null);
    setShotstackMessage(null);
    try {
      await api.saveShotstackConfig(
        {
          video_engine: videoEngine,
          public_upload_url_prefix: publicUploadUrl.trim(),
          shotstack_use_production: shotstackUseProd,
          shotstack_api_key: shotstackSingleKey.trim(),
          shotstack_sandbox_key: shotstackSandboxKey.trim(),
          shotstack_production_key: shotstackProdKey.trim(),
          shotstack_api_env: normalizeShotstackApiEnv(shotstackApiEnv),
        },
        adminToken.trim() || undefined
      );
      setShotstackMessage("Saved to app_config.");
      setShotstackSingleKey("");
      setShotstackSandboxKey("");
      setShotstackProdKey("");
      const s = await api.fetchConfigStatus();
      applyConfigStatus(s);
    } catch (err: unknown) {
      setShotstackError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingShotstack(false);
    }
  }

  return (
    <>
      <p>
        <Link to="/">← Projects</Link>
      </p>
      <h1>Settings</h1>
      <p className="settings-hint">
        Provider keys are stored in the server <code>app_config</code> table. Sensitive keys are{" "}
        {encryptionEnabled === null ? "…" : encryptionEnabled ? (
          <strong style={{ color: "#1a7f37" }}>encrypted at rest</strong>
        ) : (
          <strong style={{ color: "#b42318" }}>NOT encrypted — CONFIG_MASTER_KEY missing</strong>
        )}
        . After any secret is saved, the server may require an admin token — set{" "}
        <code>CONFIG_ADMIN_TOKEN</code> in <code>.env</code> and enter the same value below.
      </p>

      <div className="card">
        <p>
          <strong>OpenAI status:</strong>{" "}
          {openaiConfigured === null ? "…" : openaiConfigured ? "API key configured" : "No API key yet"}
        </p>
        {currentModel && (
          <p>
            <strong>Current model:</strong> {currentModel}
          </p>
        )}
      </div>

      <div className="card">
        <h2>OpenAI</h2>
        <form onSubmit={onSubmit} className="login-form">
          <label className="login-label" htmlFor="apiKey">
            API key
          </label>
          <input
            id="apiKey"
            className="login-input"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
          />
          <label className="login-label" htmlFor="model">
            Model
          </label>
          <input
            id="model"
            className="login-input"
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
          <label className="login-label" htmlFor="adminToken">
            Admin token (if required on server)
          </label>
          <input
            id="adminToken"
            className="login-input"
            type="password"
            autoComplete="off"
            value={adminToken}
            onChange={(e) => setAdminToken(e.target.value)}
            placeholder="Only if CONFIG_ADMIN_TOKEN is set on the server"
          />
          {error && <p className="error login-error">{error}</p>}
          {message && <p className="settings-success">{message}</p>}
          <button type="submit" className="primary login-button" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>HeyGen (presenter intro/outro)</h2>
        <p className="settings-hint">
          HeyGen generates the short presenter clips that bookend the reel. You need both an API key and a default
          avatar ID from your HeyGen account. The API key input is write-only — saved values are never shown back.
        </p>
        <p>
          <strong>HeyGen status:</strong>{" "}
          {heygenConfigured === null
            ? "…"
            : heygenConfigured
            ? "API key configured"
            : "No API key yet (using FFmpeg placeholder)"}
        </p>
        {heygenAvatarIdCurrent && (
          <p>
            <strong>Current avatar ID:</strong> <code>{heygenAvatarIdCurrent}</code>
          </p>
        )}
        <form onSubmit={onSubmitHeygen} className="login-form">
          <label className="login-label" htmlFor="heygenKey">
            HeyGen API key (leave empty to keep current)
          </label>
          <input
            id="heygenKey"
            className="login-input"
            type="password"
            autoComplete="off"
            value={heygenKey}
            onChange={(e) => setHeygenKey(e.target.value)}
            placeholder={heygenConfigured ? "••••••• (saved — enter new to replace)" : "paste your HeyGen key"}
          />
          <label className="login-label" htmlFor="heygenAvatarId">
            Default avatar ID
          </label>
          <input
            id="heygenAvatarId"
            className="login-input"
            type="text"
            autoComplete="off"
            value={heygenAvatarId}
            onChange={(e) => setHeygenAvatarId(e.target.value)}
            placeholder="e.g. Abigail_expressive_2024112501"
          />
          {heygenError && <p className="error login-error">{heygenError}</p>}
          {heygenMessage && <p className="settings-success">{heygenMessage}</p>}
          <button type="submit" className="primary login-button" disabled={savingHeygen}>
            {savingHeygen ? "Saving…" : "Save HeyGen settings"}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Video output &amp; Shotstack</h2>
        <p className="settings-hint">
          Use <strong>local</strong> for FFmpeg on the server, or <strong>shotstack</strong> for Shotstack cloud
          renders. Shotstack needs a public HTTPS URL that maps to your upload directory so Shotstack can fetch source
          clips. If the server sets <code>VIDEO_ENGINE</code> in the environment, that value overrides the selection
          saved here.
        </p>
        {videoEngineEnv ? (
          <p>
            <strong>Server env VIDEO_ENGINE:</strong> <code>{videoEngineEnv}</code> (overrides DB for runtime renders)
          </p>
        ) : null}
        <p>
          <strong>Shotstack key configured:</strong>{" "}
          {shotstackConfigured === null ? "…" : shotstackConfigured ? "yes" : "no"}
        </p>
        {shotstackEnvEffective && (
          <p>
            <strong>Effective Shotstack API env:</strong> <code>{shotstackEnvEffective}</code>
          </p>
        )}
        <form onSubmit={onSubmitShotstack} className="login-form">
          <label className="login-label" htmlFor="videoEngine">
            Video engine
          </label>
          <select
            id="videoEngine"
            className="login-input"
            value={videoEngine}
            onChange={(e) => setVideoEngine(e.target.value)}
          >
            <option value="local">local (FFmpeg)</option>
            <option value="shotstack">shotstack</option>
          </select>

          <label className="login-label" htmlFor="publicUploadUrl">
            Public upload URL prefix
          </label>
          <input
            id="publicUploadUrl"
            className="login-input"
            type="url"
            autoComplete="off"
            value={publicUploadUrl}
            onChange={(e) => setPublicUploadUrl(e.target.value)}
            placeholder="https://example.com/zym-uploads"
          />

          <label className="login-label" htmlFor="shotUseProd">
            <input
              id="shotUseProd"
              type="checkbox"
              checked={shotstackUseProd}
              onChange={(e) => setShotstackUseProd(e.target.checked)}
            />{" "}
            Use production Shotstack key (API env v1); off = sandbox (stage)
          </label>

          <label className="login-label" htmlFor="shotstackApiEnv">
            API env override (optional)
          </label>
          <input
            id="shotstackApiEnv"
            className="login-input"
            type="text"
            value={shotstackApiEnv}
            onChange={(e) => setShotstackApiEnv(e.target.value)}
            placeholder="stage or v1 — leave empty for auto"
          />

          <label className="login-label" htmlFor="shotstackSingleKey">
            Single Shotstack API key (optional)
          </label>
          <input
            id="shotstackSingleKey"
            className="login-input"
            type="password"
            autoComplete="off"
            value={shotstackSingleKey}
            onChange={(e) => setShotstackSingleKey(e.target.value)}
            placeholder="If set, sandbox/production fields below are cleared"
          />

          <label className="login-label" htmlFor="shotstackSandboxKey">
            Sandbox key
          </label>
          <input
            id="shotstackSandboxKey"
            className="login-input"
            type="password"
            autoComplete="off"
            value={shotstackSandboxKey}
            onChange={(e) => setShotstackSandboxKey(e.target.value)}
          />

          <label className="login-label" htmlFor="shotstackProdKey">
            Production key
          </label>
          <input
            id="shotstackProdKey"
            className="login-input"
            type="password"
            autoComplete="off"
            value={shotstackProdKey}
            onChange={(e) => setShotstackProdKey(e.target.value)}
          />

          {shotstackError && <p className="error login-error">{shotstackError}</p>}
          {shotstackMessage && <p className="settings-success">{shotstackMessage}</p>}
          <button type="submit" className="primary login-button" disabled={savingShotstack}>
            {savingShotstack ? "Saving…" : "Save video settings"}
          </button>
        </form>
      </div>
    </>
  );
}
