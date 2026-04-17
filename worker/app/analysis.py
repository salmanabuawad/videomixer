"""
Video analysis: heuristic summary + strengths/weaknesses.

If ANTHROPIC_API_KEY is provided, the LLM is used for higher-quality output;
otherwise we fall back to a rule-based analysis that is still useful for a
road / soil stabilization domain.
"""
from __future__ import annotations
import os
import json
from typing import Any


ROAD_STRENGTH_KEYWORDS = {
    "field demo":           "Shows real field work — useful for training.",
    "compaction":           "Covers compaction — a critical step in any stabilized layer.",
    "roller":               "Roller footage — directly usable for a compaction scene.",
    "grader":               "Grader in action — useful for grading / shaping scenes.",
    "recycler":             "Shows the reclaimer/recycler — valuable for FDR explainers.",
    "spreader":             "Binder spreader footage — useful for dosage scenes.",
    "cement":               "Cement-based stabilization explained.",
    "lime":                 "Lime treatment covered — good for subgrade stabilization.",
    "polymer":              "Polymer binder covered — useful for rural / low-volume roads.",
    "geogrid":              "Geogrid reinforcement — good for reinforcement scenes.",
    "full depth reclamation": "FDR explained — strong fit for rehabilitation projects.",
    "fdr":                  "FDR explained — strong fit for rehabilitation projects.",
    "cross-section":        "Includes pavement cross-section diagrams.",
    "subgrade":             "Subgrade-specific content — directly useful.",
    "before and after":     "Before/after comparison — great for result storytelling.",
    "case study":           "Case-study content — credible real-world evidence.",
}

ROAD_WEAKNESS_KEYWORDS = {
    "music":               "Mostly music — limited technical narration.",
    "promotional":         "Promotional tone — may need to remove marketing sections.",
    "company":             "Company promo feel — trim branding segments.",
    "short":               "Short clip — may not have enough material for a full scene.",
    "generic construction": "Generic construction footage — not road-specific.",
    "building foundation": "Building foundation, not road work — off-topic.",
    "residential":         "Residential/house content — off-topic for roads.",
    "drone":               "Drone footage — great shots but limited technical depth.",
}

POS_DOMAIN_TAG_STRENGTH = {
    "field_demo":   "Field demo = directly usable footage.",
    "case_study":   "Case study = credible project evidence.",
    "comparison":   "Comparison video = useful for method-vs-method scenes.",
    "lecture":      "Lecture explains the 'why' — good narration source.",
    "animation":    "Animation explains mechanisms that are hard to film.",
}


def _from_keywords(text: str, mapping: dict[str, str]) -> list[str]:
    out: list[str] = []
    tl = text.lower()
    for kw, note in mapping.items():
        if kw in tl and note not in out:
            out.append(note)
    return out[:5]


def heuristic_summary(candidate: dict[str, Any]) -> dict[str, Any]:
    title       = candidate.get("title", "") or ""
    description = candidate.get("description", "") or ""
    duration    = candidate.get("duration_sec") or 0
    domain_tags = candidate.get("domain_tags") or {}

    text = f"{title}\n{description}"

    strengths  = _from_keywords(text, ROAD_STRENGTH_KEYWORDS)
    weaknesses = _from_keywords(text, ROAD_WEAKNESS_KEYWORDS)

    # Tag-driven strengths
    ct = domain_tags.get("content_type")
    if ct and ct in POS_DOMAIN_TAG_STRENGTH:
        strengths.insert(0, POS_DOMAIN_TAG_STRENGTH[ct])

    if domain_tags.get("equipment"):
        strengths.append(f"Equipment spotlight: {domain_tags['equipment']}.")

    # Duration-based notes
    if duration and duration < 90:
        weaknesses.append("Duration < 90s — may be too short to build a full scene.")
    if duration and duration > 900:
        weaknesses.append("Very long video — will need careful interval selection.")

    if not strengths:
        strengths.append("Candidate matches the searched topic.")
    if not weaknesses:
        weaknesses.append("No obvious weakness detected — review before using.")

    # Summary
    method    = domain_tags.get("method") or "mixed"
    stage     = domain_tags.get("road_stage") or "unspecified stage"
    equipment = domain_tags.get("equipment") or "various"
    summary_parts = []
    if title:
        summary_parts.append(f"Title: {title}.")
    summary_parts.append(f"Covers {method} stabilization on {stage} using {equipment} equipment.")
    if description:
        # First sentence of description, trimmed
        first = description.split(".")[0].strip()
        if first:
            summary_parts.append(first + ".")
    if duration:
        summary_parts.append(f"Runtime ~{duration}s.")
    summary = " ".join(summary_parts)[:600]

    return {
        "summary":    summary,
        "strengths":  strengths[:5],
        "weaknesses": weaknesses[:5],
        "engine":     "heuristic",
    }


def _build_prompt(candidate: dict[str, Any]) -> tuple[str, str]:
    title       = candidate.get("title", "")
    description = candidate.get("description", "")
    duration    = candidate.get("duration_sec")
    domain_tags = candidate.get("domain_tags") or {}
    system = (
        "You analyze candidate videos for a road / soil-stabilization video-editing studio. "
        "You are strict about engineering relevance. Output JSON only."
    )
    user_prompt = f"""A candidate video has this metadata:

Title: {title}
Description: {description}
Duration (sec): {duration}
Inferred domain tags: {json.dumps(domain_tags)}

Produce a compact JSON object with these exact keys:
  "summary":    a 2-3 sentence technical summary focused on road/soil stabilization relevance.
  "strengths":  a JSON array of 2-5 short bullets describing why this clip is useful for a road-stabilization explainer.
  "weaknesses": a JSON array of 2-5 short bullets describing limitations or off-topic risks.

Return only the JSON object, no prose.
"""
    return system, user_prompt


def _parse_llm_json(text: str) -> dict[str, Any] | None:
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        obj = json.loads(text[start : end + 1])
    except Exception:
        return None
    return {
        "summary":    (obj.get("summary") or "").strip()[:1200],
        "strengths":  [str(s).strip() for s in (obj.get("strengths") or [])][:6],
        "weaknesses": [str(s).strip() for s in (obj.get("weaknesses") or [])][:6],
    }


def openai_summary(candidate: dict[str, Any], api_key: str) -> dict[str, Any] | None:
    try:
        from openai import OpenAI  # lazy
        client = OpenAI(api_key=api_key)
        system, user_prompt = _build_prompt(candidate)
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=800,
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": user_prompt},
            ],
            response_format={"type": "json_object"},
        )
        text = resp.choices[0].message.content or ""
        parsed = _parse_llm_json(text)
        if not parsed:
            return None
        parsed["engine"] = "openai"
        return parsed
    except Exception as exc:
        print(f"[openai_summary] failed: {exc!r}")
        return None


def llm_summary(candidate: dict[str, Any], api_key: str) -> dict[str, Any] | None:
    """Use Anthropic to produce higher-quality domain-aware analysis.
    Returns None if the call fails, so the caller can fall back to heuristic.
    """
    try:
        import anthropic  # lazy
        client = anthropic.Anthropic(api_key=api_key)
        system, user_prompt = _build_prompt(candidate)
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=800,
            system=system,
            messages=[{"role": "user", "content": user_prompt}],
        )
        text = "".join(block.text for block in resp.content if getattr(block, "type", None) == "text")
        parsed = _parse_llm_json(text)
        if not parsed:
            return None
        parsed["engine"] = "anthropic"
        return parsed
    except Exception as exc:
        print(f"[llm_summary] failed, falling back: {exc!r}")
        return None


def analyze_candidate_text(candidate: dict[str, Any]) -> dict[str, Any]:
    """Primary entry — prefers OpenAI > Anthropic > heuristic."""
    openai_key = (
        os.environ.get("OPENAI_API_KEY")
        or candidate.get("_openai_api_key")
    )
    if openai_key:
        out = openai_summary(candidate, openai_key)
        if out:
            return out

    anthropic_key = (
        os.environ.get("ANTHROPIC_API_KEY")
        or candidate.get("_anthropic_api_key")
    )
    if anthropic_key:
        out = llm_summary(candidate, anthropic_key)
        if out:
            return out

    return heuristic_summary(candidate)
