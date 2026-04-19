import json
import os
import subprocess

from app.config import FFMPEG_BIN, FFPROBE_BIN
from app.services.voice import synthesize_voiceover_mp3

W, H = 1080, 1920
FPS = 24


def _run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def _duration(path: str) -> float:
    out = subprocess.check_output(
        [FFPROBE_BIN, "-v", "error", "-show_entries", "format=duration", "-of", "json", path],
        text=True,
    )
    return float(json.loads(out)["format"]["duration"])


def _best_start(asset_duration: float, requested_start: float, seg_len: float) -> float:
    if asset_duration <= seg_len:
        return 0.0
    return max(0.0, min(asset_duration - seg_len, requested_start))


def _vf_base() -> str:
    return (
        f"scale={W}:{H}:force_original_aspect_ratio=increase,"
        f"crop={W}:{H},"
        "eq=contrast=1.08:saturation=1.12:brightness=0.01,"
        "unsharp=5:5:0.8"
    )


def _drawtext_file(path: str, y_expr: str, fontsize: int, border: int) -> str:
    p = os.path.abspath(path).replace("\\", "/")
    return (
        f"drawtext=textfile='{p}':reload=1:x=(w-text_w)/2:y={y_expr}"
        f":fontsize={fontsize}:fontcolor=white:borderw={border}:bordercolor=black"
    )


def _vf_with_captions(temp_dir: str, scene_idx: int, title: str, subtitle: str) -> str:
    parts = [_vf_base()]
    if title.strip():
        tp = os.path.join(temp_dir, f"cap_title_{scene_idx}.txt")
        with open(tp, "w", encoding="utf-8") as f:
            f.write(title.strip().replace("\n", " ")[:500])
        parts.append(_drawtext_file(tp, "h-300", 74, 3))
    if subtitle.strip():
        sp = os.path.join(temp_dir, f"cap_sub_{scene_idx}.txt")
        with open(sp, "w", encoding="utf-8") as f:
            f.write(subtitle.strip().replace("\n", " ")[:500])
        parts.append(_drawtext_file(sp, "h-200", 40, 2))
    return ",".join(parts)


def _mux_video_and_narration(video_path: str, mp3_path: str, out_path: str) -> None:
    vd = _duration(video_path)
    ad = _duration(mp3_path)
    if vd <= 0 or ad <= 0:
        raise ValueError("Invalid video or audio duration")

    if ad > vd + 0.05:
        _run(
            [
                FFMPEG_BIN,
                "-y",
                "-i",
                video_path,
                "-i",
                mp3_path,
                "-filter_complex",
                f"[1:a]atrim=duration={vd:.3f},asetpts=PTS-STARTPTS[aout]",
                "-map",
                "0:v:0",
                "-map",
                "[aout]",
                "-c:v",
                "copy",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-t",
                f"{vd:.3f}",
                out_path,
            ]
        )
    elif ad + 0.05 < vd:
        pad = vd - ad
        _run(
            [
                FFMPEG_BIN,
                "-y",
                "-i",
                video_path,
                "-i",
                mp3_path,
                "-filter_complex",
                f"[1:a]apad=pad_dur={pad:.3f},asetpts=PTS-STARTPTS[aout]",
                "-map",
                "0:v:0",
                "-map",
                "[aout]",
                "-c:v",
                "copy",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-t",
                f"{vd:.3f}",
                out_path,
            ]
        )
    else:
        _run(
            [
                FFMPEG_BIN,
                "-y",
                "-i",
                video_path,
                "-i",
                mp3_path,
                "-map",
                "0:v:0",
                "-map",
                "1:a:0",
                "-c:v",
                "copy",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-shortest",
                out_path,
            ]
        )


def render_plan(project_id: int, plan: dict, render_root: str) -> str:
    project_dir = os.path.join(render_root, str(project_id))
    temp_dir = os.path.join(project_dir, "temp")
    os.makedirs(temp_dir, exist_ok=True)

    scenes = plan.get("scenes") or []
    if not scenes:
        raise ValueError("Render plan has no scenes")

    segs = []
    for idx, scene in enumerate(scenes, start=1):
        asset = scene["asset"]
        title = str(scene.get("title", "") or "")
        subtitle = str(scene.get("subtitle", "") or "")
        duration = float(scene["duration_sec"])
        requested_start = float(scene.get("start_sec", 0))
        asset_dur = _duration(asset)
        start = _best_start(asset_dur, requested_start, duration)
        seg_out = os.path.abspath(os.path.join(temp_dir, f"seg_{idx}.mp4"))
        vf = _vf_with_captions(temp_dir, idx, title, subtitle)
        _run(
            [
                FFMPEG_BIN,
                "-y",
                "-ss",
                f"{start:.2f}",
                "-t",
                f"{duration:.2f}",
                "-i",
                asset,
                "-vf",
                vf,
                "-r",
                str(FPS),
                "-map",
                "0:v:0",
                "-an",
                "-c:v",
                "libx264",
                "-preset",
                "slow",
                "-crf",
                "18",
                "-pix_fmt",
                "yuv420p",
                seg_out,
            ]
        )
        segs.append(seg_out)

    list_path = os.path.abspath(os.path.join(temp_dir, "list.txt"))
    with open(list_path, "w", encoding="utf-8") as f:
        for p in segs:
            f.write(f"file '{os.path.abspath(p).replace(chr(92), '/')}'\n")

    video_no_audio = os.path.abspath(os.path.join(temp_dir, "concat_noaudio.mp4"))
    _run(
        [
            FFMPEG_BIN,
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            list_path,
            "-c:v",
            "libx264",
            "-preset",
            "slow",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-an",
            video_no_audio,
        ]
    )

    final_path = os.path.abspath(os.path.join(project_dir, "final.mp4"))
    voice_script = (plan.get("voiceover_script") or "").strip()

    if voice_script:
        mp3_path = os.path.join(temp_dir, "voiceover.mp3")
        synthesize_voiceover_mp3(voice_script, mp3_path)
        tmp_final = final_path + ".tmp.mp4"
        _mux_video_and_narration(video_no_audio, mp3_path, tmp_final)
        os.replace(tmp_final, final_path)
    else:
        os.replace(video_no_audio, final_path)

    return final_path
