#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GENERATOR mẫu "broll" — nền VIDEO stock 9:16 + CHỮ CHẠY. GHÉP BẰNG FFMPEG (native, nhanh — hợp CI, tiết kiệm phút).
Dùng: python3 build.py <workdir> <spec.json> [--render]
spec.json: { "num","tts":"vbee|edge|none","voice", "scenes":[ {"query","kick","head":[..],"sub","vo"} ] }
Nền: stock.fetch (Pexels/Pixabay có key; không thì gradient). Chữ: ffmpeg drawtext (bold VN + fade). Ra out.mp4.
"""
import sys, os, json, re, subprocess, asyncio
HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")
FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
FFPROBE = os.environ.get("FFPROBE", "ffprobe")
FONT = os.path.join(ASSETS, "font-bold.ttf")
LEAD, TAIL, MIN_D = 0.15, 0.8, 3.5
AMBER = "0xFFC53D"
sys.path.insert(0, HERE)
import stock


def dur(p):
    try:
        return round(float(subprocess.check_output(
            [FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]).decode().strip()), 3)
    except Exception:
        return 0.0


def clean(s):
    """Bỏ markup + ký tự phá drawtext (: ' \\ %). Giữ chữ Việt."""
    s = str(s or "")
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"\*(.+?)\*", r"\1", s)
    return s.replace("\\", "").replace(":", " ").replace("'", "").replace("%", " phần trăm").strip()


def is_em(line):
    return bool(re.match(r"^\s*\*.+\*\s*$", str(line)))


async def _edge(text, voice, out):
    import edge_tts
    await edge_tts.Communicate(text, voice or "vi-VN-NamMinhNeural").save(out)


def tts_scene(text, out, engine, voice):
    if not text:
        return 0.0
    try: os.remove(out)
    except Exception: pass
    if engine == "vbee":
        import vbee_tts; vbee_tts.synth(text, out, "1.0")
    elif engine == "edge":
        asyncio.run(_edge(text, voice, out))
    else:
        return 0.0
    return dur(out)


def dt(text, size, color, x, y):
    """1 filter drawtext (fade-in 0.4s, đổ bóng). text đã clean."""
    t = clean(text)
    if not t:
        return None
    return (f"drawtext=fontfile='{FONT}':text='{t}':fontcolor={color}:fontsize={size}:x={x}:y={y}"
            f":shadowcolor=black@0.65:shadowx=0:shadowy=5:alpha='min(1\\,t/0.4)'")


def scene_filter(sc):
    """Chuỗi -vf cho 1 cảnh: cover 9:16 + scrim + kick + head (2 dòng) + sub + ANTOA."""
    head = sc.get("head", []) or [sc.get("kick", "")]
    longest = max((len(clean(l)) for l in head), default=0)
    fs = 112 if longest <= 12 else 90 if longest <= 18 else 72 if longest <= 26 else 58
    parts = [
        "scale=1080:1920:force_original_aspect_ratio=increase", "crop=1080:1920",
        "drawbox=x=0:y=980:w=1080:h=940:color=black@0.42:t=fill",
    ]
    y = 1245
    if sc.get("kick"):
        kw = min(1080, len(clean(sc["kick"])) * 20 + 48)
        parts.append(f"drawbox=x=90:y=1158:w={kw}:h=62:color={AMBER}:t=fill")
        parts.append(dt(sc["kick"], 30, "black", 112, 1172))
    for line in head[:2]:
        col = AMBER if is_em(line) else "white"
        parts.append(dt(line, fs, col, 90, y))
        y += fs + 10
    if sc.get("sub"):
        parts.append(dt(sc["sub"], 40, "white", 90, y + 12))
    parts.append(dt("ANTOA", 40, "white", 90, 1748))
    return ",".join(p for p in parts if p)


def build(workdir, spec, do_render):
    mediad = os.path.join(workdir, "media"); os.makedirs(mediad, exist_ok=True)
    audiod = os.path.join(workdir, "audio"); os.makedirs(audiod, exist_ok=True)
    engine = spec.get("tts", "vbee"); voice = spec.get("voice", "vi-VN-NamMinhNeural")
    scenes = spec.get("scenes", [])
    srcs = []; parts = []

    for i, sc in enumerate(scenes, 1):
        vo = sc.get("vo", "")
        mp3 = os.path.join(audiod, f"s{i}.mp3")
        d = tts_scene(vo, mp3, engine, voice) if vo else 0.0
        sdur = round(max(MIN_D, (d + LEAD + TAIL) if d else MIN_D), 3)
        bg = os.path.join(mediad, f"s{i}.mp4")
        src = stock.fetch(sc.get("query", ""), bg, sdur); srcs.append(src or "none")
        if not do_render:
            continue
        out = os.path.join(workdir, f"scene{i}.mp4")
        has_a = d > 0.3 and os.path.exists(mp3)
        args = [FFMPEG, "-y", "-loglevel", "error", "-stream_loop", "-1", "-i", bg]
        # LUÔN có track audio (giọng hoặc câm) → concat + trộn nhạc nhất quán
        args += ["-i", mp3] if has_a else ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"]
        args += ["-t", f"{sdur}", "-vf", scene_filter(sc), "-r", "30", "-pix_fmt", "yuv420p", "-c:v", "libx264",
                 "-map", "0:v", "-map", "1:a", "-af", "apad", "-c:a", "aac", "-ar", "44100", "-t", f"{sdur}", out]
        subprocess.run(args, check=True)
        parts.append(out)

    total = 0.0
    if do_render and parts:
        listf = os.path.join(workdir, "list.txt")
        open(listf, "w").write("\n".join(f"file '{p}'" for p in parts))
        body = os.path.join(workdir, "body.mp4")
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listf,
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", body], check=True)
        out = os.path.join(workdir, "out.mp4")
        bgm = os.path.join(ASSETS, "bgm.mp3")
        if os.path.exists(bgm):
            subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", body, "-stream_loop", "-1", "-i", bgm,
                            "-filter_complex", "[1:a]volume=0.06[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0[a]",
                            "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-shortest", out], check=True)
        else:
            subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", body, "-c", "copy", out], check=True)
        total = dur(out)
        open(os.path.join(workdir, "duration.txt"), "w").write(str(round(total)))
    return total, len(scenes), srcs


def main():
    workdir = os.path.abspath(sys.argv[1])
    spec = json.load(open(sys.argv[2], encoding="utf-8"))
    do_render = "--render" in sys.argv[3:]
    total, n, srcs = build(workdir, spec, do_render)
    print(f"[broll] {n} cảnh · nguồn nền: {','.join(srcs)}" + (f" · out.mp4 {total}s" if do_render else " (chưa render)"))


if __name__ == "__main__":
    main()
