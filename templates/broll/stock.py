#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Nguồn video stock (đa nguồn) cho mẫu B-roll. Ưu tiên có key → chất lượng cao; không key → fallback gradient ffmpeg.
fetch(query, out_mp4, dur, tint) -> True/False. out_mp4 là clip 9:16 nền cho 1 cảnh.
Key đọc từ env: PEXELS_API_KEY, PIXABAY_API_KEY (Boss cắm sau — 2 phút đăng ký free).
"""
import os, json, subprocess, urllib.request, urllib.parse

FFMPEG = os.environ.get("FFMPEG", "ffmpeg")


def _dl(url, out, headers=None):
    try:
        req = urllib.request.Request(url, headers=headers or {})
        with urllib.request.urlopen(req, timeout=60) as r, open(out, "wb") as f:
            f.write(r.read())
        return os.path.getsize(out) > 20000
    except Exception:
        return False


def _get_json(url, headers=None):
    try:
        req = urllib.request.Request(url, headers=headers or {})
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except Exception:
        return None


def from_pexels(query, out):
    key = os.environ.get("PEXELS_API_KEY")
    if not key:
        return False
    url = "https://api.pexels.com/videos/search?" + urllib.parse.urlencode(
        {"query": query, "orientation": "portrait", "size": "medium", "per_page": 15})
    j = _get_json(url, {"Authorization": key})
    if not j or not j.get("videos"):
        return False
    for v in j["videos"]:
        # chọn file mp4 dọc, cao nhất <= 1920
        files = [f for f in v.get("video_files", []) if f.get("width", 0) < f.get("height", 1)]
        files = sorted(files, key=lambda f: abs((f.get("height") or 0) - 1920))
        for f in files:
            if _dl(f["link"], out):
                return True
    return False


def from_pixabay(query, out):
    key = os.environ.get("PIXABAY_API_KEY")
    if not key:
        return False
    url = "https://pixabay.com/api/videos/?" + urllib.parse.urlencode(
        {"key": key, "q": query, "per_page": 20, "safesearch": "true"})
    j = _get_json(url)
    if not j or not j.get("hits"):
        return False
    for h in j["hits"]:
        vids = h.get("videos", {})
        for size in ("large", "medium", "small"):
            u = vids.get(size, {}).get("url")
            if u and _dl(u, out):
                return True
    return False


def fallback_gradient(out, dur, tint):
    """Không có key → clip gradient động (ffmpeg) làm nền tạm. Màu theo chủ đề (tint)."""
    c0, c1 = tint
    spec = (f"gradients=s=1080x1920:c0={c0}:c1={c1}:x0=0:y0=0:x1=1080:y1=1920:"
            f"nb_colors=2:seed=7:duration={max(dur,2):.2f}:speed=0.012")
    try:
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-f", "lavfi", "-i", spec,
                        "-t", f"{max(dur,2):.2f}", "-r", "30", "-pix_fmt", "yuv420p",
                        "-vf", "gblur=sigma=8", out], check=True)
        return os.path.exists(out)
    except Exception:
        # tối giản hơn nữa: nền tĩnh 1 màu
        try:
            subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-f", "lavfi",
                            "-i", f"color=c={c0}:s=1080x1920:d={max(dur,2):.2f}:r=30",
                            "-pix_fmt", "yuv420p", out], check=True)
            return os.path.exists(out)
        except Exception:
            return False


# gợi ý màu nền theo chủ đề (khi fallback)
TINTS = {
    "health": ("0x0E3B2E", "0x1E8C5A"), "suc khoe": ("0x0E3B2E", "0x1E8C5A"),
    "finance": ("0x0A1E3B", "0x1E5AA8"), "tai chinh": ("0x0A1E3B", "0x1E5AA8"),
    "fitness": ("0x3B1E0A", "0xC8641E"), "the duc": ("0x3B1E0A", "0xC8641E"),
}
DEFAULT_TINT = ("0x0E1A2B", "0x123A5A")


def tint_for(query):
    q = (query or "").lower()
    for k, v in TINTS.items():
        if k in q:
            return v
    return DEFAULT_TINT


def fetch(query, out, dur=6.0):
    """Lấy 1 clip nền cho cảnh. Ưu tiên Pexels → Pixabay → fallback gradient."""
    if from_pexels(query, out):
        return "pexels"
    if from_pixabay(query, out):
        return "pixabay"
    if fallback_gradient(out, dur, tint_for(query)):
        return "fallback"
    return None
