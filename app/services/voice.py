"""OpenAI text-to-speech for marketing video voiceover."""

from __future__ import annotations

import os

from openai import OpenAI

from app.config_store import openai_api_key


def synthesize_voiceover_mp3(text: str, out_path: str, voice: str = "alloy") -> None:
    """Write narration audio using OpenAI TTS (mp3)."""
    key = openai_api_key()
    if not key:
        raise ValueError("OpenAI API key required for voiceover")
    text = (text or "").strip()
    if not text:
        raise ValueError("Voiceover script is empty")
    client = OpenAI(api_key=key)
    os.makedirs(os.path.dirname(os.path.abspath(out_path)) or ".", exist_ok=True)
    response = client.audio.speech.create(
        model="tts-1-hd",
        voice=voice,
        input=text[:4096],
    )
    if hasattr(response, "stream_to_file"):
        response.stream_to_file(out_path)
    else:
        data = getattr(response, "content", None) or b""
        with open(out_path, "wb") as f:
            f.write(data)
