#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GENERATOR mẫu "broll2" (hiển thị: "Mẫu Broll Chạy Chữ 2") — nền VIDEO stock 9:16 + CAPTION theo lời đọc.
3 KIỂU trình bày (spec.style / env BROLL2_STYLE): bar (thanh dọc) · italic (nghiêng + gạch chân) · highlight (nền màu).
Chữ: HTML caption → Chrome headless PNG trong suốt → ffmpeg overlay. Thiếu Chrome → fallback drawtext. Cùng font Be Vietnam Pro.
Dùng: python3 build.py <workdir> <spec.json> [--render]
spec.json: { "tts","voice","style","scenes":[ {"query","cap","vo"} ] }  (cap = caption hiển thị, xuống dòng bằng \\n hoặc <br>)
"""
import sys, os, json, re, subprocess, asyncio, html, shutil, glob
HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")
FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
FFPROBE = os.environ.get("FFPROBE", "ffprobe")
FONT = os.path.join(ASSETS, "font-bold.ttf")
LEAD, TAIL, MIN_D = 0.5, 0.9, 3.0
AMBER = "0xFFC53D"
COLORS = {"cam": "#F0662F", "vang": "#FFC42E", "mint": "#22E0A6"}
STYLES = ("bar", "italic", "highlight")
sys.path.insert(0, HERE)
import stock
sys.path.insert(0, os.path.join(HERE, "..", ".."))   # repo root → uservid (VIDEO→VIDEO)
try:
    import uservid
except Exception:
    uservid = None


def dur(p):
    try:
        return round(float(subprocess.check_output(
            [FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]).decode().strip()), 3)
    except Exception:
        return 0.0


def clean(s):
    s = str(s or "")
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s); s = re.sub(r"\*(.+?)\*", r"\1", s)
    return s.replace("\\", "").replace(":", " ").replace("'", "").replace("%", " phần trăm").strip()


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
    elif engine == "vieneu":
        import vieneu_tts; vieneu_tts.synth(text, out, os.environ.get("VIENEU_VOICE"))
    elif engine == "edge":
        asyncio.run(_edge(text, voice, out))
    else:
        return 0.0
    return dur(out)


# ============================ CAPTION OVERLAY (Chrome → PNG trong suốt) ============================
SH = "text-shadow:0 2px 3px rgba(0,0,0,.6),0 6px 26px rgba(0,0,0,.5);-webkit-text-stroke:1.5px rgba(0,0,0,.42)"


def _cap_html(cap):
    """Escape text, cho phép xuống dòng bằng \\n hoặc <br> (tối đa 3 dòng)."""
    s = str(cap or "").replace("<br/>", "\n").replace("<br>", "\n")
    parts = [html.escape(p.strip()) for p in s.split("\n") if p.strip()]
    return "<br>".join(parts[:3]) or "&nbsp;"


def build_html(cap, style, accent):
    caph = _cap_html(cap)
    if style == "italic":       # Chữ NGHIÊNG + gạch chân màu
        css = (".cap{position:absolute;left:76px;top:55%;max-width:850px}"
               ".txt{color:#fff;font-style:italic;font-weight:800;font-size:70px;line-height:1.26;letter-spacing:-.005em;" + SH + "}"
               ".uline{display:block;width:150px;height:11px;border-radius:6px;background:" + accent + ";margin-top:28px;box-shadow:0 6px 18px rgba(0,0,0,.3)}")
        body = '<div class="cap"><span class="txt">' + caph + '</span><span class="uline"></span></div>'
    elif style == "highlight":  # Chữ trên KHỐI MÀU (highlight)
        css = (".cap{position:absolute;left:74px;top:54%;max-width:880px}"
               ".txt{font-weight:800;font-size:64px;line-height:1.62;color:#fff}"
               ".txt .hl{background:" + accent + ";-webkit-box-decoration-break:clone;box-decoration-break:clone;"
               "padding:8px 22px;border-radius:12px;box-shadow:0 8px 22px rgba(0,0,0,.28);text-shadow:0 2px 4px rgba(0,0,0,.32)}")
        body = '<div class="cap"><span class="txt"><span class="hl">' + caph + '</span></span></div>'
    else:                       # bar (mặc định): thanh dọc trái + chữ thẳng
        css = (".cap{position:absolute;left:74px;top:56%;display:flex;align-items:stretch;max-width:820px}"
               ".bar{width:12px;border-radius:6px;background:" + accent + ";margin-right:30px;flex:none;box-shadow:0 6px 20px rgba(0,0,0,.35)}"
               ".txt{color:#fff;font-weight:800;font-size:70px;line-height:1.24;letter-spacing:-.005em;" + SH + "}")
        body = '<div class="cap"><span class="bar"></span><span class="txt">' + caph + '</span></div>'
    return ('<!doctype html><html lang="vi"><head><meta charset="utf-8">'
            '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
            '<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,600;0,700;0,800;1,700;1,800&display=block" rel="stylesheet">'
            '<style>*{margin:0;padding:0;box-sizing:border-box}'
            'html,body{width:1080px;height:1920px;overflow:hidden;background:transparent;font-family:"Be Vietnam Pro",sans-serif}'
            + css + '</style></head><body>' + body + '</body></html>')


def find_chrome():
    cands = [os.environ.get("CHROME_BIN"),
             "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
             shutil.which("google-chrome"), shutil.which("google-chrome-stable"),
             shutil.which("chromium-browser"), shutil.which("chromium"), shutil.which("chrome")]
    for pat in ("~/.cache/ms-playwright/chromium-*/chrome-linux/chrome",
                "~/.cache/ms-playwright/chromium*/chrome-mac*/Chromium.app/Contents/MacOS/Chromium",
                "~/.cache/puppeteer/chrome/*/chrome-*/*Chrome*"):
        cands += glob.glob(os.path.expanduser(pat))
    for c in cands:
        if c and os.path.isfile(c):
            return c
    return None


def render_caption(work, i, cap, chrome, style, accent):
    hp = os.path.join(work, f"cap{i}.html"); open(hp, "w", encoding="utf-8").write(build_html(cap, style, accent))
    png = os.path.join(work, f"cap{i}.png")
    try:
        subprocess.run([chrome, "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
                        "--hide-scrollbars", "--force-device-scale-factor=1", "--default-background-color=00000000",
                        "--window-size=1080,1920", "--virtual-time-budget=6000", f"--screenshot={png}", "file://" + hp],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as e:
        print("[broll2] chrome caption lỗi:", e); return None
    return png if os.path.exists(png) and os.path.getsize(png) > 4000 else None


def scene_overlay_cmd(bg, mp3, png, has_a, sdur, out):
    args = [FFMPEG, "-y", "-loglevel", "error", "-stream_loop", "-1", "-i", bg]
    args += (["-i", mp3] if has_a else ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"])
    args += ["-loop", "1", "-t", f"{sdur}", "-i", png]
    fc = ("[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
          "eq=brightness=-0.06:saturation=1.05,setsar=1,fps=30[bg];"
          "[2:v]format=rgba,fade=t=in:st=0.1:d=0.45:alpha=1[ov];"
          "[bg][ov]overlay=x=0:y='if(lt(t,0.45),(0.45-t)/0.45*28,0)':format=auto,"
          "fade=t=in:st=0:d=0.3,format=yuv420p[v]")
    args += ["-filter_complex", fc, "-map", "[v]", "-map", "1:a", "-af", "apad",
             "-c:v", "libx264", "-r", "30", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "44100", "-t", f"{sdur}", out]
    subprocess.run(args, check=True)


# ============================ FALLBACK: drawtext caption (khi thiếu Chrome) ============================
def scene_drawtext_cmd(bg, mp3, has_a, sdur, cap, accent, out):
    lines = [clean(p) for p in str(cap or "").replace("<br/>", "\n").replace("<br>", "\n").split("\n") if p.strip()][:3]
    aff = "0x" + accent.lstrip("#")
    parts = ["scale=1080:1920:force_original_aspect_ratio=increase", "crop=1080:1920",
             "drawbox=x=74:y=1075:w=12:h=200:color=" + aff + ":t=fill"]
    y = 1085
    for ln in lines:
        parts.append(f"drawtext=fontfile='{FONT}':text='{ln}':fontcolor=white:fontsize=64:x=120:y={y}"
                     f":shadowcolor=black@0.7:shadowx=0:shadowy=5:alpha='min(1\\,t/0.4)'")
        y += 78
    args = [FFMPEG, "-y", "-loglevel", "error", "-stream_loop", "-1", "-i", bg]
    args += (["-i", mp3] if has_a else ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"])
    args += ["-t", f"{sdur}", "-vf", ",".join(parts), "-r", "30", "-pix_fmt", "yuv420p", "-c:v", "libx264",
             "-map", "0:v", "-map", "1:a", "-af", "apad", "-c:a", "aac", "-ar", "44100", "-t", f"{sdur}", out]
    subprocess.run(args, check=True)


# ============================ BUILD ============================
def build(workdir, spec, do_render):
    mediad = os.path.join(workdir, "media"); os.makedirs(mediad, exist_ok=True)
    audiod = os.path.join(workdir, "audio"); os.makedirs(audiod, exist_ok=True)
    capd = os.path.join(workdir, "cap"); os.makedirs(capd, exist_ok=True)
    engine = spec.get("tts", "vbee"); voice = spec.get("voice", "vi-VN-NamMinhNeural")
    scenes = spec.get("scenes", [])
    style = str(spec.get("style") or os.environ.get("BROLL2_STYLE") or "bar").strip()
    if style not in STYLES: style = "bar"
    color = str(spec.get("color") or os.environ.get("BROLL2_ACCENT") or "cam").strip()
    accent = COLORS.get(color, COLORS["cam"])
    chrome = find_chrome()
    print(f"[broll2] kiểu: {style} · màu {accent} · {'Chrome ' + os.path.basename(chrome) if chrome else 'KHÔNG có Chrome → fallback drawtext'}")
    srcs = []; parts = []
    # VIDEO→VIDEO: user clip (env VIDEO_CLIPS) → nền; lỗi/rỗng → stock (đường cũ).
    user_bg = None; ucur = 0.0; ubgdur = 0.0
    try:
        if uservid:
            user_bg = uservid.build_user_bg(workdir)
            if user_bg:
                ubgdur = uservid.bg_dur(user_bg)
    except Exception as e:
        print("[broll2] build_user_bg lỗi → dùng stock:", e); user_bg = None

    for i, sc in enumerate(scenes, 1):
        vo = sc.get("vo", "") or ""
        cap = sc.get("cap") or vo
        mp3 = os.path.join(audiod, f"s{i}.mp3")
        d = tts_scene(vo, mp3, engine, voice) if vo else 0.0
        sdur = round(max(MIN_D, (d + LEAD + TAIL) if d else MIN_D), 3)
        bg = os.path.join(mediad, f"s{i}.mp4")
        used_user = False
        if user_bg and ubgdur > 0.5:
            if uservid.user_seg(user_bg, ucur, sdur, bg):
                used_user = True; srcs.append("user")
                ucur += sdur
                if ucur >= ubgdur:
                    ucur = 0.0
        if not used_user:
            src = stock.fetch(sc.get("query", ""), bg, sdur); srcs.append(src or "none")
        if not do_render:
            continue
        out = os.path.join(workdir, f"scene{i}.mp4")
        has_a = d > 0.3 and os.path.exists(mp3)
        png = render_caption(capd, i, cap, chrome, style, accent) if chrome else None
        if png:
            scene_overlay_cmd(bg, mp3, png, has_a, sdur, out)
        else:
            scene_drawtext_cmd(bg, mp3, has_a, sdur, cap, accent, out)   # fallback không-Chrome
        parts.append(out)

    total = 0.0
    if do_render and parts:
        listf = os.path.join(workdir, "list.txt"); open(listf, "w").write("\n".join(f"file '{p}'" for p in parts))
        body = os.path.join(workdir, "body.mp4")
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listf,
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", body], check=True)
        out = os.path.join(workdir, "out.mp4")
        # NHẠC NỀN theo MÀU-mood (cam=tươi sáng · vang=động lực · mint=hiện đại) — thư viện free, fallback bgm.mp3 cũ.
        bgm = os.path.join(ASSETS, "music", color + ".mp3")
        if not os.path.exists(bgm):
            bgm = os.path.join(ASSETS, "bgm.mp3")
        print(f"[broll2] nhạc nền: {os.path.basename(os.path.dirname(bgm))}/{os.path.basename(bgm)}")
        if os.path.exists(bgm):
            subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", body, "-stream_loop", "-1", "-i", bgm,
                            "-filter_complex", "[1:a]volume=0.12[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0,alimiter=limit=0.95[a]",
                            "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-shortest", out], check=True)
        else:
            subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", body, "-c", "copy", out], check=True)
        total = dur(out); open(os.path.join(workdir, "duration.txt"), "w").write(str(round(total)))
    return total, len(scenes), srcs


def main():
    workdir = os.path.abspath(sys.argv[1])
    spec = json.load(open(sys.argv[2], encoding="utf-8"))
    total, n, srcs = build(workdir, spec, "--render" in sys.argv[3:])
    print(f"[broll2] {n} cảnh · nguồn nền: {','.join(srcs)}" + (f" · out.mp4 {total}s" if total else " (chưa render)"))


if __name__ == "__main__":
    main()
