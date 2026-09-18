#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""VIDEO→VIDEO: tải clip Drive của user → cắt (in/out) → ghép (concat) → 1 nền bg_user.mp4 9:16.
Dùng chung cho mẫu Broll Chạy Chữ 1 (broll) + 2 (broll2). Tower gửi qua env VIDEO_CLIPS = JSON [{"url","start","end"}].

TRIẾT LÝ AN TOÀN: mọi hàm bọc try/except, LỖI hoặc RỖNG → trả None → build.py tự rơi về STOCK (đường cũ KHÔNG đổi).
Không phá render đang chạy. Runner Ubuntu có sẵn curl + ffmpeg.
"""
import os, json, subprocess, re

FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
FFPROBE = os.environ.get("FFPROBE", "ffprobe")
UA = "Mozilla/5.0 (X11; Linux x86_64) ANTOA video"


def _dur(p):
    try:
        return float(subprocess.check_output(
            [FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", p]
        ).decode().strip()) or 0.0
    except Exception:
        return 0.0


def _is_html(path):
    try:
        with open(path, "rb") as f:
            head = f.read(400).lower()
        return b"<!doctype html" in head or b"<html" in head
    except Exception:
        return True


def _dl_drive(url, out):
    """Tải video Drive (bỏ trang xác nhận virus-scan nếu có). True nếu ra file > 50KB, không phải HTML."""
    try:
        ck = out + ".ck"
        subprocess.run(["curl", "-sSL", "-A", UA, "-c", ck, url, "-o", out], timeout=240, check=False)
        if _is_html(out):   # trang xác nhận → bóc confirm + uuid tải lại
            try:
                txt = open(out, "r", errors="ignore").read()
            except Exception:
                txt = ""
            cm = re.search(r'name="confirm" value="([^"]*)"', txt)
            uu = re.search(r'name="uuid" value="([^"]*)"', txt)
            confirm = cm.group(1) if cm else "t"
            base = url.split("&confirm=")[0]
            url2 = base + "&confirm=" + confirm + (("&uuid=" + uu.group(1)) if uu else "")
            subprocess.run(["curl", "-sSL", "-A", UA, "-b", ck, url2, "-o", out], timeout=240, check=False)
        ok = os.path.exists(out) and os.path.getsize(out) > 50000 and not _is_html(out)
        if not ok:
            print("  ⚠ tải clip Drive không thành (chưa công khai / quá lớn / HTML).")
        return ok
    except Exception as e:
        print("  ⚠ tải clip Drive lỗi:", e)
        return False


def _norm916(inp, out, ss=0.0, dur=0.0):
    """Chuẩn hoá 1 clip về 9:16 1080x1920, 30fps, KHÔNG tiếng. ss/dur = cắt in/out (giây)."""
    args = [FFMPEG, "-y", "-loglevel", "error"]
    if ss and ss > 0:
        args += ["-ss", "%.3f" % ss]
    args += ["-i", inp]
    if dur and dur > 0:
        args += ["-t", "%.3f" % dur]
    args += ["-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1",
             "-an", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", out]
    subprocess.run(args, timeout=360, check=True)
    return os.path.exists(out) and os.path.getsize(out) > 10000


def build_user_bg(workdir):
    """Đọc env VIDEO_CLIPS → tải + cắt từng clip → ghép → bg_user.mp4. None nếu rỗng/lỗi (→ build.py dùng stock)."""
    raw = os.environ.get("VIDEO_CLIPS", "")
    if not raw or raw in ("null", "[]"):
        return None
    try:
        clips = json.loads(raw)
    except Exception:
        return None
    if not isinstance(clips, list) or not clips:
        return None
    segs = []
    for i, c in enumerate(clips):
        try:
            url = (c or {}).get("url")
            st = float((c or {}).get("start") or 0)
            en = float((c or {}).get("end") or 0)
            if not url:
                continue
            src = os.path.join(workdir, "uclip%d.raw.mp4" % i)
            if not _dl_drive(url, src):
                continue
            seg = os.path.join(workdir, "useg%d.mp4" % i)
            dur = (en - st) if (en > st) else 0.0
            if _norm916(src, seg, ss=max(0.0, st), dur=dur):
                segs.append(seg)
                print("  ✓ clip %d: cắt %.1f→%.1f OK" % (i, st, en))
        except Exception as e:
            print("  ⚠ clip %d lỗi (bỏ qua):" % i, e)
    if not segs:
        return None
    try:
        listf = os.path.join(workdir, "ulist.txt")
        open(listf, "w").write("\n".join("file '%s'" % p for p in segs))
        bg = os.path.join(workdir, "bg_user.mp4")
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listf,
                        "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-an", bg],
                       timeout=360, check=True)
        if os.path.exists(bg) and os.path.getsize(bg) > 20000:
            print("  ✅ nền VIDEO USER: %d clip → %.1fs" % (len(segs), _dur(bg)))
            return bg
    except Exception as e:
        print("  ⚠ ghép clip lỗi → dùng stock:", e)
    return None


def user_seg(bg_user, cursor, sdur, out):
    """Lấy 1 đoạn [cursor, cursor+sdur] của nền user cho 1 cảnh (scene_overlay_cmd sẽ loop+trim nếu ngắn). True/False."""
    try:
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-ss", "%.3f" % max(0.0, cursor), "-i", bg_user,
                        "-t", "%.3f" % max(1.0, sdur), "-vf", "fps=30", "-an",
                        "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", out], timeout=180, check=True)
        return os.path.exists(out) and os.path.getsize(out) > 5000
    except Exception as e:
        print("  ⚠ cắt đoạn nền user lỗi (cảnh này rơi stock):", e)
        return False


def bg_dur(bg_user):
    return _dur(bg_user)
