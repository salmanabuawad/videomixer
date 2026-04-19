import json
import re
from typing import Any

from openai import OpenAI

from app.config_store import openai_api_key, openai_model

SYSTEM_PROMPT = """You are a senior marketing strategist and civil-engineering storyteller for Zym-Tec.
You produce structured JSON only. Ground every claim in the supplied source material — do not invent facts.
The hero (main) video clip must lead the story; support clips reinforce but never overshadow it.
"""


def _client() -> OpenAI:
    key = openai_api_key()
    if not key:
        raise ValueError(
            "OpenAI API key is missing or still the placeholder from .env.example. "
            "Set OPENAI_API_KEY in /opt/zymtech_innovation/.env (or app_config.openai_api_key in the database) "
            "to a real key from https://platform.openai.com/api-keys , then restart the app."
        )
    return OpenAI(api_key=key)


def _parse_json_payload(text: str) -> dict[str, Any]:
    t = text.strip()
    fence = re.match(r"^```(?:json)?\s*\n", t)
    if fence:
        t = t[fence.end() :]
        if t.rstrip().endswith("```"):
            t = t.rstrip()[:-3].rstrip()
    parsed: Any = json.loads(t)
    if isinstance(parsed, dict):
        return parsed
    raise ValueError("Model returned JSON that is not an object")


def _chat_json(system: str, user: str) -> dict[str, Any]:
    """Use Chat Completions with JSON output — reliable across models vs. Responses API."""
    client = _client()
    model = openai_model()
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    completion = None
    last_err: Exception | None = None
    for use_json_mode in (True, False):
        try:
            kwargs: dict[str, Any] = {
                "model": model,
                "messages": messages,
                "temperature": 0.35,
            }
            if use_json_mode:
                kwargs["response_format"] = {"type": "json_object"}
            completion = client.chat.completions.create(**kwargs)
            break
        except Exception as e:
            last_err = e
            if not use_json_mode:
                raise ValueError(f"OpenAI request failed: {e}") from e
    if completion is None:
        raise ValueError(f"OpenAI request failed: {last_err}") from last_err

    raw = (completion.choices[0].message.content or "").strip()
    if not raw:
        raise ValueError("Empty response from OpenAI")
    try:
        return _parse_json_payload(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"Model did not return valid JSON: {e}") from e


def extract_knowledge(doc_text: str) -> dict[str, Any]:
    user = f"""Analyze the uploaded Zym-Tec material and return ONE JSON object with these keys:

- summary: 2–4 sentences: what the product/service is and who it is for.
- process_steps: array of short strings, the workflow or method (ordered).
- key_claims: array of evidence-based claims (only from the text).
- benefits: array of customer benefits (only from the text).
- search_terms: array of short keyword phrases for discovery.
- narrative_arc: object with keys: hook (1–2 sentences), problem, solution, proof, cta — each a short string forming a complete mini-story.
- storyboard: object with:
  - logline: one sentence pitch.
  - scenes: array of objects, each with: role ("hero"|"support"|"title"), title, goal, duration_sec (numbers only, sum roughly 55–75 seconds across scenes), narration_hint (one sentence of what the VO should say in that beat).

The storyboard must read as a coherent arc: open with hook/hero, build problem→solution, end with CTA. Total implied runtime from scene durations should target ~60 seconds.

Source material:
{doc_text[:24000]}
"""
    return _chat_json(SYSTEM_PROMPT, user)


def revise_render_plan(
    previous_plan: dict[str, Any],
    enhancement_request: str,
    knowledge: dict[str, Any],
    main_assets: list[str],
    support_assets: list[str],
) -> dict[str, Any]:
    user = f"""Revise the following render plan based on the user's feedback. Return the FULL revised plan JSON in the same schema (aspect_ratio, total_duration_sec, scenes[] with role/asset/start_sec/duration_sec/title/subtitle, voiceover_script). Do NOT return a diff.

Rules:
- Only use asset paths that appear in the main or support lists below.
- Keep the hero asset dominant unless the user explicitly asks to reduce it.
- Preserve coherent narrative arc: hook → context → problem → solution → proof → CTA.
- If the user asks for pacing changes, adjust duration_sec and total_duration_sec consistently.
- If the user asks for new copy, update title/subtitle/voiceover_script accordingly.

User feedback:
{enhancement_request.strip()}

Previous plan:
{json.dumps(previous_plan, ensure_ascii=False)}

Knowledge (for grounding claims):
{json.dumps(knowledge, ensure_ascii=False)}

Main assets:
{main_assets}

Support assets:
{support_assets}
"""
    return _chat_json(SYSTEM_PROMPT, user)


def build_render_plan(
    knowledge: dict[str, Any], main_assets: list[str], support_assets: list[str]
) -> dict[str, Any]:
    user = f"""Create a JSON render plan for a **vertical 9:16** marketing video (~55–70 seconds total).

Story rules:
- Tell a **complete story**: hook → context → problem → solution → proof → call-to-action.
- Use the **main (hero) asset** for the majority of screen time; support clips for B-roll or reinforcement only.
- Every scene must advance the narrative (no random clips).
- On-screen title/subtitle text must be short (≤8 words per line).

Voiceover:
- **voiceover_script**: ONE continuous narration paragraph (150–280 words) that matches the scene order and total duration (~55–70s when read aloud at a clear marketing pace). It must sound like one cohesive ad, not bullet points. No stage directions — spoken words only.

Technical JSON shape:
- aspect_ratio: "9:16"
- total_duration_sec: number (55–70), sum of scene durations must match within ~2s.
- scenes: array of 6–10 scenes. Each scene object MUST have:
  - role: "hero" | "support" | "title"
  - asset: EXACTLY one of the file paths from main or support lists below
  - start_sec: where to trim inside that file (>=0)
  - duration_sec: length of this scene (>=2, sum ≈ total_duration_sec)
  - title: short on-screen headline (can be empty for pure footage)
  - subtitle: supporting line (can be empty)

Knowledge (use for messaging only; asset paths come from the lists below):
{json.dumps(knowledge, ensure_ascii=False)}

Main assets (hero — use index 0 most):
{main_assets}

Support assets:
{support_assets}
"""
    return _chat_json(SYSTEM_PROMPT, user)
