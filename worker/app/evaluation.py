"""
Multi-axis video evaluation:
  - convincingness      : how persuasive / credible the video is
  - content_quality     : signal density, narration vs. music, completeness
  - field_relevance     : how close it is to road / soil stabilization
  - video_quality       : technical (resolution, bitrate, fps)
  - overall             : weighted average

Heuristic first. If an Anthropic API key is provided we let the LLM produce the
subjective scores (convincingness, content_quality, field_relevance) and we
keep the objective video_quality from ffprobe.
"""
from __future__ import annotations
import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any


FFPROBE = shutil.which("ffprobe") or "ffprobe"


# ── objective video quality via ffprobe ──────────────────────────────────────

def ffprobe_metrics(video_path: Path) -> dict[str, Any]:
    """Return {width, height, bitrate, fps, duration_sec} or {} on failure."""
    try:
        cmd = [
            FFPROBE, "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,avg_frame_rate,bit_rate:format=duration,bit_rate",
            "-of", "json",
            str(video_path),
        ]
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if out.returncode != 0:
            return {}
        d = json.loads(out.stdout or "{}")
        stream = (d.get("streams") or [{}])[0]
        fmt    = d.get("format") or {}
        # Parse fps "30000/1001"
        fps = 0.0
        afr = stream.get("avg_frame_rate") or ""
        if "/" in afr:
            try:
                n, q = afr.split("/", 1)
                n = float(n); q = float(q)
                fps = round(n / q, 2) if q else 0.0
            except Exception:
                fps = 0.0
        bit = 0
        for k in ("bit_rate",):
            for source in (stream, fmt):
                v = source.get(k)
                if v:
                    try:
                        bit = int(v); break
                    except Exception:
                        pass
            if bit:
                break
        return {
            "width":        int(stream.get("width")  or 0) or None,
            "height":       int(stream.get("height") or 0) or None,
            "bitrate":      bit or None,
            "fps":          fps or None,
            "duration_sec": float(fmt.get("duration") or 0) or None,
        }
    except Exception as exc:
        print(f"[ffprobe_metrics] failed: {exc!r}")
        return {}


def video_quality_from_metrics(m: dict[str, Any]) -> tuple[int, str]:
    """Return (score 0-100, short comment)."""
    if not m:
        return 50, "No video metrics yet — download first."
    h   = m.get("height") or 0
    bit = m.get("bitrate") or 0
    fps = m.get("fps") or 0
    dur = m.get("duration_sec") or 0

    # Resolution
    if   h >= 1080: res_score, res_lbl = 90, "Full HD+"
    elif h >= 720:  res_score, res_lbl = 75, "HD"
    elif h >= 480:  res_score, res_lbl = 55, "SD"
    elif h > 0:     res_score, res_lbl = 35, "Low-res"
    else:           res_score, res_lbl = 40, "unknown resolution"

    # Bitrate (Mbps)
    mbps = bit / 1_000_000 if bit else 0
    if   mbps >= 3:   br_score, br_lbl = 90, f"{mbps:.1f} Mbps"
    elif mbps >= 1:   br_score, br_lbl = 70, f"{mbps:.1f} Mbps"
    elif mbps >= 0.5: br_score, br_lbl = 50, f"{mbps:.1f} Mbps"
    elif mbps > 0:    br_score, br_lbl = 35, f"{mbps:.2f} Mbps (low)"
    else:             br_score, br_lbl = 50, "unknown bitrate"

    # FPS
    if   fps >= 48: fps_score = 85
    elif fps >= 28: fps_score = 80
    elif fps >= 23: fps_score = 70
    elif fps > 0:   fps_score = 45
    else:           fps_score = 55

    score = round(0.55 * res_score + 0.30 * br_score + 0.15 * fps_score)
    score = max(0, min(100, score))
    comment = f"{res_lbl} @ {int(fps) or '?'}fps, {br_lbl}."
    if dur and dur < 30:
        comment += " Very short clip."
        score = min(score, 75)
    return score, comment


# ── subjective axes (heuristic) ──────────────────────────────────────────────

ROAD_POS = [
    "road", "highway", "pavement", "stabilization", "stabilisation",
    "subgrade", "base course", "compaction", "roller", "grader", "recycler",
    "reclamation", "fdr", "cement", "lime", "polymer", "geogrid", "geocell",
    "subbase", "asphalt", "embankment", "cbr",
]
ROAD_NEG = [
    "building foundation", "basement", "residential concrete", "landscaping",
    "gardening", "trailer", "music video", "unboxing", "fashion",
]
CONTENT_POS = [
    "site", "in action", "demo", "walk-through", "walkthrough",
    "case study", "field", "on-site", "before and after", "overview",
    "explained", "how it works", "process",
]
CONTENT_NEG = [
    "short", "quick clip", "meme", "compilation",
]
CONVINCE_POS = [
    "case study", "results", "research", "peer-reviewed", "engineer",
    "phd", "professor", "vs ", "comparison", "tested", "mpa",
    "compaction density", "cbr", "aashto", "astm",
]
CONVINCE_NEG = [
    "promo", "promotional", "we offer", "our product", "company", "sales",
    "testimonial only",
]


def _kw_count(text: str, kws: list[str]) -> int:
    tl = text.lower()
    return sum(1 for k in kws if k in tl)


def heuristic_scores(candidate: dict[str, Any]) -> dict[str, Any]:
    title       = candidate.get("title", "") or ""
    description = candidate.get("description", "") or ""
    duration    = candidate.get("duration_sec") or 0
    tags        = candidate.get("domain_tags") or {}
    text        = f"{title}\n{description}"

    # field relevance: keywords + domain tags present
    pos = _kw_count(text, ROAD_POS)
    neg = _kw_count(text, ROAD_NEG)
    field = 30 + pos * 8 - neg * 25 + len(tags) * 5
    field = max(0, min(100, field))
    field_comment = (
        f"{pos} road keyword(s), {len(tags)} domain tag(s)"
        + (f", {neg} off-topic hint(s)" if neg else "")
        + "."
    )

    # content quality: keywords + duration sweet-spot 60s..12min
    cpos = _kw_count(text, CONTENT_POS)
    cneg = _kw_count(text, CONTENT_NEG)
    duration_bonus = 0
    if duration >= 60 and duration <= 720:   duration_bonus = 25
    elif duration > 720 and duration <= 1800: duration_bonus = 10
    elif duration > 0 and duration < 60:     duration_bonus = -15
    content = 40 + cpos * 10 - cneg * 15 + duration_bonus
    content = max(0, min(100, content))
    dur_note = (
        "sweet-spot duration" if duration_bonus >= 20
        else "too short"       if duration and duration < 60
        else "long video"      if duration > 720
        else "medium duration"
    )
    content_comment = f"{cpos} content signal(s), {dur_note}."

    # convincingness: terms + tag-based hints + content-type flavor
    vpos = _kw_count(text, CONVINCE_POS)
    vneg = _kw_count(text, CONVINCE_NEG)
    ct = (tags.get("content_type") or "").lower()
    ct_bonus = {
        "case_study": 20, "comparison": 15, "lecture": 10,
        "field_demo": 10, "animation": 5, "product_demo": -5,
    }.get(ct, 0)
    convince = 35 + vpos * 9 - vneg * 12 + ct_bonus
    convince = max(0, min(100, convince))
    convince_comment = f"{vpos} credibility cue(s){', ' + ct if ct else ''}."

    return {
        "convincingness":  {"score": convince, "comment": convince_comment},
        "content_quality": {"score": content,  "comment": content_comment},
        "field_relevance": {"score": field,    "comment": field_comment},
    }


# ── LLM upgrade ──────────────────────────────────────────────────────────────

def _build_eval_prompt(candidate: dict[str, Any]) -> tuple[str, str]:
    system = (
        "You evaluate candidate videos for a road / soil-stabilization "
        "engineering video studio. Be strict. Output strict JSON only."
    )
    user_prompt = f"""Score this candidate on a 0-100 scale on three axes:

- convincingness: how persuasive / credible the video is for a road-engineering audience (evidence, data, expertise signals).
- content_quality: narration density, structure, signal-to-noise, completeness of explanation.
- field_relevance: how closely it aligns with road soil stabilization / pavement rehabilitation / subgrade treatment.

For each axis give:
  "score":   integer 0-100
  "comment": one short sentence (max 20 words) justifying the score.

Candidate metadata:
  title: {candidate.get('title','')}
  description: {candidate.get('description','')}
  duration_sec: {candidate.get('duration_sec')}
  inferred_domain_tags: {json.dumps(candidate.get('domain_tags') or {})}

Return JSON with exactly these keys:
{{
  "convincingness":  {{"score": int, "comment": str}},
  "content_quality": {{"score": int, "comment": str}},
  "field_relevance": {{"score": int, "comment": str}}
}}
"""
    return system, user_prompt


def _parse_eval_json(text: str) -> dict[str, Any] | None:
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        obj = json.loads(text[start : end + 1])
    except Exception:
        return None
    out = {}
    for k in ("convincingness", "content_quality", "field_relevance"):
        v = obj.get(k) or {}
        try:
            score = int(v.get("score") or 0)
        except Exception:
            score = 0
        out[k] = {
            "score":   max(0, min(100, score)),
            "comment": str(v.get("comment") or "")[:160],
        }
    return out


def openai_scores(candidate: dict[str, Any], api_key: str) -> dict[str, Any] | None:
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        system, user_prompt = _build_eval_prompt(candidate)
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=500,
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": user_prompt},
            ],
            response_format={"type": "json_object"},
        )
        text = resp.choices[0].message.content or ""
        parsed = _parse_eval_json(text)
        if parsed:
            parsed["_engine"] = "openai"
        return parsed
    except Exception as exc:
        print(f"[openai_scores] failed: {exc!r}")
        return None


def llm_scores(candidate: dict[str, Any], api_key: str) -> dict[str, Any] | None:
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        system, user_prompt = _build_eval_prompt(candidate)
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=500,
            system=system,
            messages=[{"role": "user", "content": user_prompt}],
        )
        text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
        parsed = _parse_eval_json(text)
        if parsed:
            parsed["_engine"] = "anthropic"
        return parsed
    except Exception as exc:
        print(f"[llm_scores] failed: {exc!r}")
        return None


# ── top level ────────────────────────────────────────────────────────────────

AXES = ("convincingness", "content_quality", "field_relevance", "video_quality")


def evaluate_candidate(candidate: dict[str, Any], video_path: Path | None = None) -> dict[str, Any]:
    # Subjective axes — prefer OpenAI > Anthropic > heuristic
    subj = None
    engine_used = "heuristic"

    openai_key = os.environ.get("OPENAI_API_KEY") or candidate.get("_openai_api_key")
    if openai_key:
        subj = openai_scores(candidate, openai_key)
        if subj:
            engine_used = "openai"

    if not subj:
        anthropic_key = os.environ.get("ANTHROPIC_API_KEY") or candidate.get("_anthropic_api_key")
        if anthropic_key:
            subj = llm_scores(candidate, anthropic_key)
            if subj:
                engine_used = "anthropic"

    if not subj:
        subj = heuristic_scores(candidate)

    # Objective video quality
    metrics = ffprobe_metrics(video_path) if video_path else {}
    vq_score, vq_comment = video_quality_from_metrics(metrics)

    scores = {
        "convincingness":  int(subj["convincingness"]["score"]),
        "content_quality": int(subj["content_quality"]["score"]),
        "field_relevance": int(subj["field_relevance"]["score"]),
        "video_quality":   int(vq_score),
    }
    comments = {
        "convincingness":  subj["convincingness"]["comment"],
        "content_quality": subj["content_quality"]["comment"],
        "field_relevance": subj["field_relevance"]["comment"],
        "video_quality":   vq_comment,
    }
    # Overall: weighted — field relevance matters most, then content, convince, video
    weights = {
        "field_relevance":  0.40,
        "content_quality":  0.25,
        "convincingness":   0.20,
        "video_quality":    0.15,
    }
    overall = round(sum(scores[k] * w for k, w in weights.items()))
    scores["overall"] = max(0, min(100, overall))

    return {
        "scores":        scores,
        "comments":      comments,
        "video_metrics": metrics,
        "engine":        engine_used,
    }
