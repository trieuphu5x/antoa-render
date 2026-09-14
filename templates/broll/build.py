#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GENERATOR mẫu "broll" (hiển thị: "Mẫu Broll Chạy Chữ 1") — nền VIDEO stock 9:16 + CHỮ EDITORIAL phủ đè.
Chữ editorial (Playfair Display nghiêng cam + Be Vietnam Pro) → Chrome headless chụp PNG TRONG SUỐT → ffmpeg overlay.
Thiếu Chrome trên máy chạy → fallback drawtext (chữ chạy đơn giản, không fail). GHÉP BẰNG FFMPEG (native, nhanh — hợp CI).
Dùng: python3 build.py <workdir> <spec.json> [--render]
spec.json: { "num","tts":"vbee|vieneu|edge|none","voice", "scenes":[ {"query","kick","head":[..],"sub","vo"} ] }
Nền: stock.fetch (Pexels/Pixabay có key; không thì gradient). Nhạc: assets/bgm.mp3. Pill/Footer: env BRAND_LABEL/SLOGAN.
"""
import sys, os, json, re, subprocess, asyncio, html, shutil, glob
HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")
FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
FFPROBE = os.environ.get("FFPROBE", "ffprobe")
FONT = os.path.join(ASSETS, "font-bold.ttf")
LEAD, TAIL, MIN_D = 0.15, 0.8, 3.5
AMBER = "0xFFC53D"
BRAND = (os.environ.get("BRAND_LABEL") or "").strip()
SLOGAN = (os.environ.get("SLOGAN") or "").strip()
# 3 phối màu CHỮ (accent = kicker + dòng nghiêng + pill; chữ chính giữ trắng cho dễ đọc trên video).
COLORS = {"cam": "#F0662F", "vang": "#FFC42E", "mint": "#22E0A6"}
def _rgba(hexc, a):
    h = hexc.lstrip("#")
    return f"rgba({int(h[0:2],16)},{int(h[2:4],16)},{int(h[4:6],16)},{a})"
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
    elif engine == "vieneu":
        import vieneu_tts; vieneu_tts.synth(text, out, os.environ.get("VIENEU_VOICE"))
    elif engine == "edge":
        asyncio.run(_edge(text, voice, out))
    else:
        return 0.0
    return dur(out)


# ============================ OVERLAY EDITORIAL (Chrome → PNG trong suốt) ============================
OVERLAY_HTML = """<!doctype html><html lang="vi"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,600;1,700&family=Be+Vietnam+Pro:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=block" rel="stylesheet">
<style>
  *{{margin:0;padding:0;box-sizing:border-box}}
  html,body{{width:1080px;height:1920px;overflow:hidden;background:transparent;font-family:"Be Vietnam Pro",sans-serif}}
  :root{{--ember:{accent}}}
  .scrim{{position:absolute;inset:0;background:
     linear-gradient(to bottom, rgba(16,14,22,.28) 0%, rgba(16,14,22,0) 26%, rgba(16,14,22,0) 40%, rgba(16,14,22,.55) 74%, rgba(16,14,22,.88) 100%)}}
  .pill{{position:absolute;top:96px;left:90px;display:inline-flex;align-items:center;
     background:{pillbg};color:#fff;padding:15px 26px;border-radius:999px;
     font-weight:700;font-size:26px;letter-spacing:.02em;text-transform:uppercase;box-shadow:0 8px 30px rgba(0,0,0,.28)}}
  .pill .star{{margin-right:10px;font-size:24px}}
  .block{{position:absolute;left:90px;bottom:300px;width:900px}}
  .kicker{{color:var(--ember);font-weight:700;font-size:30px;letter-spacing:.26em;text-transform:uppercase;
     margin-bottom:20px;text-shadow:0 2px 14px rgba(0,0,0,.5)}}
  .head{{font-family:"Playfair Display",serif;color:#fff;font-size:118px;line-height:1.22;letter-spacing:-.01em;
     text-shadow:0 3px 26px rgba(0,0,0,.5)}}
  .head .l1{{font-weight:900;display:inline-block}}
  .head .l2{{font-style:italic;font-weight:600;color:var(--ember);display:inline-block;margin-top:.06em}}
  .body{{margin-top:30px;color:rgba(255,255,255,.94);font-weight:500;font-size:40px;line-height:1.36;
     text-shadow:0 2px 16px rgba(0,0,0,.55)}}
  .body b{{font-weight:700;color:#fff}}
  .foot{{margin-top:34px;font-family:"JetBrains Mono",monospace;font-size:22px;letter-spacing:.14em;
     text-transform:uppercase;color:rgba(255,255,255,.62)}}
</style></head><body>
  <div class="scrim"></div>
  {pill}
  <div class="block">
    <div class="kicker">{kicker}</div>
    <div class="head">{head}</div>
    <div class="body">{body}</div>
    <div class="foot">{footer}</div>
  </div>
</body></html>"""


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


def _head_html(head):
    """Mỗi dòng head → l1 (đậm trắng) hoặc l2 (nghiêng cam). *...* = nhấn cam; nếu không đánh dấu, dòng cuối tự thành cam."""
    if isinstance(head, str):
        head = [head]
    lines = [str(x) for x in (head or []) if str(x).strip()][:2]
    marked = any(is_em(l) for l in lines)
    out = []
    for i, ln in enumerate(lines):
        em = is_em(ln) or (not marked and len(lines) > 1 and i == len(lines) - 1)
        t = re.sub(r"^\s*\*(.+)\*\s*$", r"\1", ln) if is_em(ln) else ln
        t = t.replace("*", "").strip()
        out.append(f'<span class="{"l2" if em else "l1"}">{html.escape(t)}</span>')
    return "<br>".join(out)


def _body_html(sub):
    """**đậm** → <b>; escape phần còn lại; bỏ dấu * thừa. Tách **bold** TRƯỚC để không ăn nhầm dấu sao."""
    parts = re.split(r"(\*\*[^*]+\*\*)", str(sub or ""))
    out = []
    for p in parts:
        if p.startswith("**") and p.endswith("**") and len(p) > 4:
            out.append("<b>" + html.escape(p[2:-2]) + "</b>")
        else:
            out.append(html.escape(p.replace("*", "")))
    return "".join(out)


def render_overlay(work, i, sc, chrome, accent, pillbg):
    pill = f'<div class="pill"><span class="star">✱</span>{html.escape(BRAND)}</div>' if BRAND else ""
    footer = html.escape(SLOGAN) if SLOGAN else "VIDEO EDITORIAL · 9:16"
    doc = OVERLAY_HTML.format(pill=pill, kicker=html.escape(str(sc.get("kick", "")).strip()),
                              head=_head_html(sc.get("head")), body=_body_html(sc.get("sub")), footer=footer,
                              accent=accent, pillbg=pillbg)
    hp = os.path.join(work, f"ov{i}.html"); open(hp, "w", encoding="utf-8").write(doc)
    png = os.path.join(work, f"ov{i}.png")
    try:
        subprocess.run([chrome, "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
                        "--hide-scrollbars", "--force-device-scale-factor=1", "--default-background-color=00000000",
                        "--window-size=1080,1920", "--virtual-time-budget=6000", f"--screenshot={png}", "file://" + hp],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as e:
        print("[broll] chrome overlay lỗi:", e); return None
    return png if os.path.exists(png) and os.path.getsize(png) > 5000 else None


def scene_overlay_cmd(bg, mp3, png, has_a, sdur, out):
    """Nền cover 9:16 + tối nhẹ + overlay PNG editorial (fade-in + trượt lên) + audio (giọng/câm)."""
    args = [FFMPEG, "-y", "-loglevel", "error", "-stream_loop", "-1", "-i", bg]
    args += (["-i", mp3] if has_a else ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"])
    args += ["-loop", "1", "-t", f"{sdur}", "-i", png]
    fc = ("[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
          "eq=brightness=-0.05:saturation=1.06,setsar=1,fps=30[bg];"
          "[2:v]format=rgba,fade=t=in:st=0.15:d=0.7:alpha=1[ov];"
          "[bg][ov]overlay=x=0:y='if(lt(t,0.7),(0.7-t)/0.7*36,0)':format=auto,"
          "fade=t=in:st=0:d=0.35,format=yuv420p[v]")
    args += ["-filter_complex", fc, "-map", "[v]", "-map", "1:a", "-af", "apad",
             "-c:v", "libx264", "-r", "30", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "44100", "-t", f"{sdur}", out]
    subprocess.run(args, check=True)


# ============================ FALLBACK: drawtext (khi máy chạy thiếu Chrome) ============================
def dt(text, size, color, x, y):
    t = clean(text)
    if not t:
        return None
    return (f"drawtext=fontfile='{FONT}':text='{t}':fontcolor={color}:fontsize={size}:x={x}:y={y}"
            f":shadowcolor=black@0.65:shadowx=0:shadowy=5:alpha='min(1\\,t/0.4)'")


def scene_filter(sc):
    head = sc.get("head", []) or [sc.get("kick", "")]
    if isinstance(head, str):
        head = [head]
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
    parts.append(dt(BRAND or "ANTOA", 40, "white", 90, 1748))
    return ",".join(p for p in parts if p)


def scene_drawtext_cmd(bg, mp3, has_a, sdur, sc, out):
    args = [FFMPEG, "-y", "-loglevel", "error", "-stream_loop", "-1", "-i", bg]
    args += (["-i", mp3] if has_a else ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"])
    args += ["-t", f"{sdur}", "-vf", scene_filter(sc), "-r", "30", "-pix_fmt", "yuv420p", "-c:v", "libx264",
             "-map", "0:v", "-map", "1:a", "-af", "apad", "-c:a", "aac", "-ar", "44100", "-t", f"{sdur}", out]
    subprocess.run(args, check=True)


# ============================ BUILD ============================
def build(workdir, spec, do_render):
    mediad = os.path.join(workdir, "media"); os.makedirs(mediad, exist_ok=True)
    audiod = os.path.join(workdir, "audio"); os.makedirs(audiod, exist_ok=True)
    ovd = os.path.join(workdir, "overlay"); os.makedirs(ovd, exist_ok=True)
    engine = spec.get("tts", "vbee"); voice = spec.get("voice", "vi-VN-NamMinhNeural")
    scenes = spec.get("scenes", [])
    color = str(spec.get("color") or os.environ.get("BROLL_COLOR") or "cam").strip()
    accent = COLORS.get(color, COLORS["cam"]); pillbg = _rgba(accent, 0.92)
    chrome = find_chrome()
    print(f"[broll] màu chữ: {color} ({accent}) · {'Chrome ' + os.path.basename(chrome) if chrome else 'KHÔNG có Chrome → fallback drawtext'}")
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
        png = render_overlay(ovd, i, sc, chrome, accent, pillbg) if chrome else None
        if png:
            scene_overlay_cmd(bg, mp3, png, has_a, sdur, out)
        else:
            scene_drawtext_cmd(bg, mp3, has_a, sdur, sc, out)   # fallback không-Chrome
        parts.append(out)

    total = 0.0
    if do_render and parts:
        listf = os.path.join(workdir, "list.txt")
        open(listf, "w").write("\n".join(f"file '{p}'" for p in parts))
        body = os.path.join(workdir, "body.mp4")
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listf,
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", body], check=True)
        out = os.path.join(workdir, "out.mp4")
        # NHẠC NỀN theo MÀU-mood (cam=tươi sáng · vang=động lực · mint=hiện đại) — thư viện free, fallback bgm.mp3 cũ.
        bgm = os.path.join(ASSETS, "music", color + ".mp3")
        if not os.path.exists(bgm):
            bgm = os.path.join(ASSETS, "bgm.mp3")
        print(f"[broll] nhạc nền: {os.path.basename(os.path.dirname(bgm))}/{os.path.basename(bgm)}")
        if os.path.exists(bgm):
            subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", body, "-stream_loop", "-1", "-i", bgm,
                            "-filter_complex", "[1:a]volume=0.12[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0[a]",
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
