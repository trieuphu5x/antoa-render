#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GENERATOR mẫu "broll" — nền VIDEO stock 9:16 + CHỮ CHẠY (kinetic) overlay. Hợp sức khoẻ/tài chính/thể dục.
Dùng: python3 build.py <workdir> <spec.json> [--render]
spec.json:
{
 "num":"01", "tts":"vbee"|"edge"|"none", "voice":"<edge voice>",
 "scenes":[ {"query":"từ khoá tìm b-roll", "kick":"nhãn", "head":["dòng lớn 1","dòng *nhấn* 2"], "sub":"1 câu phụ", "vo":"lời đọc"}, ... ]
}
Nền: stock.fetch (Pexels/Pixabay nếu có key; không thì gradient ffmpeg). Chữ: HTML+GSAP, render HyperFrames.
"""
import sys, os, json, re, html as _html, subprocess, asyncio
HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")
FFPROBE = os.environ.get("FFPROBE", "ffprobe")
sys.path.insert(0, HERE)
import stock
LEAD, TAIL, MIN_D = 0.15, 0.8, 3.5


def dur(p):
    try:
        return round(float(subprocess.check_output(
            [FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]).decode().strip()), 3)
    except Exception:
        return 0.0


def mk(s):
    s = _html.escape(str(s or ""), quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r'<b>\1</b>', s)
    s = re.sub(r"\*(.+?)\*", r'<span class="em">\1</span>', s)
    return s


def hsize(lines):
    longest = max((len(re.sub(r"[*]", "", l)) for l in lines), default=0)
    return 118 if longest <= 12 else 96 if longest <= 18 else 76 if longest <= 26 else 60


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


HEAD = '''<!doctype html>
<html lang="vi"><head><meta charset="UTF-8" /><meta name="viewport" content="width=1080, height=1920" />
<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Be+Vietnam+Pro:wght@500;700;800&display=swap" rel="stylesheet" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;overflow:hidden;background:#000;font-family:"Be Vietnam Pro",sans-serif;color:#fff}
#root{position:relative;width:1080px;height:1920px}
video{filter:saturate(1.05) contrast(1.03)}
.scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.35) 0%,rgba(0,0,0,.05) 34%,rgba(0,0,0,.20) 60%,rgba(0,0,0,.82) 100%)}
.wrap{position:absolute;left:90px;right:90px;bottom:340px}
.kick{display:inline-block;font-weight:800;font-size:28px;letter-spacing:.20em;text-transform:uppercase;color:#0b0b0b;background:#FFC53D;padding:9px 20px;border-radius:8px;margin-bottom:26px}
.head{font-family:"Anton",sans-serif;line-height:1.04;letter-spacing:.005em;text-transform:uppercase;text-shadow:0 6px 34px rgba(0,0,0,.6)}
.head .line{display:block}
.head .em{color:#FFC53D}
.sub{margin-top:30px;font-size:40px;line-height:1.42;font-weight:600;color:#F2F4F8;max-width:900px;text-shadow:0 3px 18px rgba(0,0,0,.7)}
.sub b{color:#FFD873}
.brand{position:absolute;left:90px;bottom:150px;font-family:"Anton",sans-serif;font-size:40px;letter-spacing:.06em;color:#fff;opacity:.92;text-shadow:0 3px 16px rgba(0,0,0,.7)}
.pbar{position:absolute;left:0;bottom:0;height:10px;width:1080px;background:rgba(255,255,255,.14)}
.pfill{position:absolute;left:0;bottom:0;height:10px;width:1080px;background:#FFC53D;transform-origin:left center}
.scene{position:absolute;inset:0}
</style></head><body>
'''


def build(workdir, spec):
    os.makedirs(os.path.join(workdir, "media"), exist_ok=True)
    os.makedirs(os.path.join(workdir, "audio"), exist_ok=True)
    subprocess.run(["cp", os.path.join(ASSETS, "bgm.mp3"), os.path.join(workdir, "audio", "bgm.mp3")])
    for f in ("hyperframes.json", "package.json"):
        d = os.path.join(workdir, f)
        if not os.path.exists(d):
            subprocess.run(["cp", os.path.join(ASSETS, f), d])

    engine = spec.get("tts", "vbee")
    voice = spec.get("voice", "vi-VN-NamMinhNeural")
    scenes = spec.get("scenes", [])

    # 1) TTS + timing + tải nền
    t = 0.0; laid = []; srcs = []
    for i, sc in enumerate(scenes, 1):
        vo = sc.get("vo", "")
        mp3 = os.path.join(workdir, f"audio/s{i}.mp3")
        d = tts_scene(vo, mp3, engine, voice) if vo else 0.0
        sdur = round(max(MIN_D, (d + LEAD + TAIL) if d else MIN_D), 3)
        bg = os.path.join(workdir, f"media/s{i}.mp4")
        src = stock.fetch(sc.get("query", ""), bg, sdur)
        srcs.append(src or "none")
        laid.append({**sc, "i": i, "start": round(t, 3), "sdur": sdur, "adur": d,
                     "astart": round(t + LEAD, 3), "audio": f"s{i}.mp3" if d else None,
                     "bg": f"media/s{i}.mp4" if src else None})
        t = round(t + sdur, 3)
    total = round(t, 3)

    html = [HEAD]
    html.append(f'<div id="root" data-composition-id="main" data-start="0" data-duration="{total}" data-width="1080" data-height="1920">')
    track = 0
    # nền video từng cảnh (media — không class clip)
    for sc in laid:
        if sc["bg"]:
            html.append(f'<video id="bg{sc["i"]}" src="{sc["bg"]}" data-start="{sc["start"]}" data-duration="{sc["sdur"]}" data-media-start="0" data-track-index="{track}" muted playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video>')
            track += 1
    # scrim full-timeline (chữ luôn nổi trên nền)
    html.append(f'<div class="layer scrim clip" data-start="0" data-duration="{total}" data-track-index="{track}"></div>'); track += 1
    # chữ chạy từng cảnh
    anims = []
    for sc in laid:
        lines = sc.get("head", []) or [sc.get("kick", "")]
        fs = hsize(lines)
        body = "".join(f'<span class="line">{mk(l)}</span>' for l in lines)
        inner = ('<div class="wrap">'
                 + (f'<div class="kick anim">{mk(sc["kick"])}</div>' if sc.get("kick") else "")
                 + f'<div class="head anim" style="font-size:{fs}px">{body}</div>'
                 + (f'<div class="sub anim">{mk(sc["sub"])}</div>' if sc.get("sub") else "")
                 + '</div>')
        html.append(f'<div class="scene clip" id="scene{sc["i"]}" data-start="{sc["start"]}" data-duration="{sc["sdur"]}" data-track-index="{track}">{inner}</div>')
        anims.append((f'#scene{sc["i"]}', round(sc["start"] + 0.12, 3)))
        track += 1
    # brand + progress
    html.append(f'<div class="layer clip" data-start="0" data-duration="{total}" data-track-index="{track}"><div class="brand">ANTOA</div><div class="pbar"></div><div class="pfill" id="pfill"></div></div>'); track += 1
    # audio
    for sc in laid:
        if sc["audio"]:
            html.append(f'<audio src="audio/{sc["audio"]}" data-start="{sc["astart"]}" data-duration="{sc["adur"]}" data-track-index="{track}" data-volume="1"></audio>'); track += 1
    html.append(f'<audio id="bgm" src="audio/bgm.mp3" data-start="0" data-duration="{total}" data-track-index="{track}" data-volume="0.06"></audio>'); track += 1
    html.append('</div>')

    js = ['<script>window.__timelines=window.__timelines||{};var tl=gsap.timeline({paused:true});',
          f'gsap.set("#pfill",{{scaleX:0}});tl.to("#pfill",{{scaleX:1,duration:{total},ease:"none"}},0);',
          'function enter(s,a){tl.from(s+" .anim",{opacity:0,y:48,duration:0.62,ease:"power3.out",stagger:0.13},a);}']
    for sel, at in anims:
        js.append(f'enter("{sel}",{at});')
    js.append('window.__timelines["main"]=tl;</script></body></html>')
    html.append("\n".join(js))
    open(os.path.join(workdir, "index.html"), "w", encoding="utf-8").write("\n".join(html))
    return total, len(scenes), srcs


def main():
    workdir = os.path.abspath(sys.argv[1])
    spec = json.load(open(sys.argv[2], encoding="utf-8"))
    total, n, srcs = build(workdir, spec)
    print(f"[broll] index.html OK · {n} cảnh · {total}s · nguồn nền: {','.join(srcs)}")
    if "--render" in sys.argv[3:]:
        subprocess.run(["npx", "--yes", "hyperframes@0.7.64", "render"], cwd=workdir)


if __name__ == "__main__":
    main()
