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


def extract_knowledge(doc_text: str, asset_inventory: list | None = None) -> dict[str, Any]:
    inventory_block = ""
    if asset_inventory:
        inventory_block = (
            "\nUploaded asset inventory (use this to decide what's missing — propose a "
            "generated_clip_requests entry for any scene role the uploads don't cover):\n"
            + json.dumps(asset_inventory, ensure_ascii=False, indent=2)
            + "\n"
        )
    user = f"""Analyze the uploaded Zym-Tec material and return ONE JSON object with these keys:

- summary: 2–4 sentences: what the product/service is and who it is for.
- process_steps: array of short strings, the workflow or method (ordered).
- key_claims: array of evidence-based claims (only from the text).
- benefits: array of customer benefits (only from the text).
- search_terms: array of short keyword phrases for discovery.
- narrative_arc: object with keys: hook (1–2 sentences), problem, solution, proof, cta — each a short string forming a complete mini-story.
- storyboard: object with:
  - logline: one sentence pitch.
  - scenes: array of objects, each with: role (one of "problem" | "intro" | "spray" | "mix" | "compact" | "advantage" | "closing" — map to the spec's canonical arc), title, goal, duration_sec (numbers only, sum roughly 55–75 seconds across scenes), narration_hint.
- narration_text: one continuous professional narration paragraph (~150–250 words) read aloud at marketing pace, matching the storyboard order. No stage directions — spoken words only.
- intro_script: 1–2 sentences (≤45 words) for a presenter avatar to OPEN the video — warm, grounded, credible. No stage directions.
- closing_script: 1–2 sentences (≤40 words) for the same presenter to CLOSE with a call to action. No stage directions.
- generated_clip_requests: array of objects, one per scene role that the uploaded assets do NOT already cover, with:
    - role: same tag as in the storyboard.scenes[].role
    - needed: true
    - prompt: a concise realistic text-to-video prompt (≤220 chars) suitable for Runway Gen-3. Describe subject, setting, camera, mood. No brand names.
    - duration_sec: target clip duration in seconds (3–8).
  If every storyboard role is covered by the uploads, return an empty array.

The storyboard must read as a coherent arc — problem → intro → spray → mix → compact → advantage → closing — and total implied runtime should target ~55–65 seconds. Do not invent technical claims not in the source material.

Source material:
{doc_text[:24000]}
{inventory_block}"""
    return _chat_json(SYSTEM_PROMPT, user)


_PLAN_SCHEMA_DOC = """Return JSON with this exact schema:

{
  "aspect_ratio": "9:16",
  "total_duration_sec": <number, 55–70>,
  "hero_treatment": {
    "asset": "<one file_path from main assets>",
    "is_narrow": <bool>,            // same flag as the asset metadata
    "is_short": <bool>,
    "composition": "centered" | "layered_narrow" | "full_frame",
    "notes": "<one short sentence describing how the hero is framed>"
  },
  "voiceover_script": "<ONE continuous narration paragraph, 150–280 words, matches total duration read aloud at marketing pace. No stage directions.>",
  "music_cue": "<short style tag, e.g. 'upbeat-corporate'>",
  "scenes": [
    {
      "role": "hook" | "problem" | "intro" | "spray" | "mix" | "compact" | "advantage" | "proof" | "cta",
      "asset": "<one file_path from main or support>",
      "trim_sec": <number>,          // where to start in the source clip
      "duration_sec": <number>,      // on-screen length for this scene
      "title": "<≤6 words, empty string if none>",
      "subtitle": "<≤10 words, empty string if none>",
      "transition_in": "fade" | "slideLeft" | "slideRight" | "zoom" | "",
      "transition_out": "fade" | "slideLeft" | "slideRight" | "zoom" | "",
      "use_layered_hero": <bool>     // if true: the builder will render this scene with a blurred/darkened full-frame background plus the clip centered on top
    }
  ]
}

Rules:
- Every `asset` MUST be a file_path that appears verbatim in main_assets or support_assets below.
- `hero_treatment.composition` = "layered_narrow" when the hero asset has is_narrow=true — this tells the renderer to build a 9:16 background by scaling+cropping+darkening the same clip, with the original centered on top (never stretch a narrow clip).
- `scenes[].use_layered_hero` = true when that scene uses the narrow hero and you want the layered composition for that scene.
- Sum of scene.duration_sec must be within ±2s of total_duration_sec.
- Keep titles punchy (≤6 words) and grounded in the supplied knowledge — no invented claims.
- Narrative arc: hook → context/problem → solution (spray/mix/compact if process_steps match) → proof → CTA."""


def _format_assets(label: str, assets: list) -> str:
    if not assets:
        return f"{label}: (none)"
    if assets and isinstance(assets[0], dict):
        return f"{label} (with metadata):\n{json.dumps(assets, ensure_ascii=False, indent=2)}"
    return f"{label}: {assets}"


def revise_render_plan(
    previous_plan: dict[str, Any],
    enhancement_request: str,
    knowledge: dict[str, Any],
    main_assets: list,
    support_assets: list,
) -> dict[str, Any]:
    user = f"""Revise the following render plan based on the user's feedback. Return the FULL revised plan JSON in the same schema below. Do NOT return a diff.

{_PLAN_SCHEMA_DOC}

Rules specific to revision:
- Only use asset file_paths that appear in the lists below.
- Keep the hero asset dominant unless the user explicitly asks to reduce it.
- If the user asks for pacing changes, adjust duration_sec and total_duration_sec consistently.
- If the user asks for new copy, update title/subtitle/voiceover_script accordingly.

User feedback:
{enhancement_request.strip()}

Previous plan:
{json.dumps(previous_plan, ensure_ascii=False)}

Knowledge (for grounding claims):
{json.dumps(knowledge, ensure_ascii=False)}

{_format_assets("Main assets", main_assets)}

{_format_assets("Support assets", support_assets)}
"""
    return _chat_json(SYSTEM_PROMPT, user)


def build_render_plan(
    knowledge: dict[str, Any], main_assets: list, support_assets: list
) -> dict[str, Any]:
    user = f"""You are planning a vertical 9:16 marketing video (~55–70 seconds) for Zym-Tec.

Before planning, **study all the material provided** — both the uploaded document knowledge and the per-asset metadata below (duration, dimensions, is_narrow, is_short). Your plan must be grounded in this source material and must respect the physical properties of the uploaded clips (e.g. do not schedule 15s from a 6-second clip; do not stretch a narrow clip to fill the frame — use the layered composition instead).

{_PLAN_SCHEMA_DOC}

Knowledge (study this for summary, process steps, claims, benefits, narrative arc):
{json.dumps(knowledge, ensure_ascii=False)}

{_format_assets("Main assets (hero — use index 0 most)", main_assets)}

{_format_assets("Support assets", support_assets)}
"""
    return _chat_json(SYSTEM_PROMPT, user)
