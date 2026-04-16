from __future__ import annotations

import shutil
import subprocess
import wave
from pathlib import Path


def has_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None


def normalize_media(path: str) -> str:
    if not has_ffmpeg():
        return path

    source = Path(path)
    target = source.with_suffix(".normalized.wav")
    command = [
        "ffmpeg",
        "-y",
        "-i",
        str(source),
        "-ac",
        "1",
        "-ar",
        "16000",
        str(target),
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        return path
    return str(target)


def get_duration_seconds(path: str) -> float | None:
    file_path = Path(path)
    if file_path.suffix.lower() != ".wav":
        return None
    try:
        with wave.open(str(file_path), "rb") as wav_file:
            frames = wav_file.getnframes()
            rate = wav_file.getframerate()
            if rate == 0:
                return None
            return round(frames / float(rate), 2)
    except (wave.Error, FileNotFoundError):
        return None
