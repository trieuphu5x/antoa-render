#!/usr/bin/env python3
"""GENERATOR video kênh Agent Thực Chiến — kịch bản N câu -> index.html + audio + SLIDE.
Dùng: python3 build_video.py <script.md|.txt> <video_folder> [--num NN] [--no-audio]
- Số cảnh ĐỘNG theo số câu (nguyên tắc vàng #1). Mỗi câu = 1 cảnh.
- CHIẾN LƯỢC SLIDE (14/07): KHÔNG dùng ảnh nữa. Mỗi cảnh = 1 SLIDE infographic HTML/CSS
  (30 kiểu ở slidelib.py — nét tuyệt đối, 0 watermark, đồng nhất, scale được).
- Cảnh nào cần đồ hoạ đặc thù: em ghi spec ở <folder>/slides.txt  ->  `sceneNo | TYPE | pill | args`
  (TYPE: STAT/TRANSFORM/COMPARE/DEFINITION/TERMINAL/STEPS/FLOW/FUNNEL/COUNTDOWN/QUOTE/... xem slidelib.REG)
  Cảnh KHÔNG có spec  ->  text slide (luân phiên 3 biến thể trái/giữa/trích-dẫn) từ chính câu đó.
- Giọng: Vbee Minh Quân. Timing: nhịp liên tục. Brand + CSS slide lấy từ _slides-catalog/index.html.
"""
import sys, os, re, subprocess, urllib.request, urllib.parse, html, argparse, time, random, json, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")
CHANNEL = ASSETS            # gói tự chứa: _template/_slides-catalog/image nằm trong assets/
FFPROBE = os.environ.get("FFPROBE", "ffprobe")
# THƯƠNG HIỆU đa-tenant: masthead/outro lấy từ workflow (BRAND_LABEL/SLOGAN), KHÔNG hardcode "Agent Thực Chiến"/SAB.
BRAND_LABEL = (os.environ.get("BRAND_LABEL") or "").strip() or "ANTOA"
SLOGAN = (os.environ.get("SLOGAN") or "").strip()
sys.path.insert(0, HERE)   # slidelib + vbee_tts cạnh generator

PAD_LEAD, PAD_TAIL, OUTRO = 0.15, 0.25, 3.4

def dur(p):
    return round(float(subprocess.check_output(
        [FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]).decode().strip()), 3)

def brand_style():
    src = open(os.path.join(CHANNEL, "_slides-catalog/index.html")).read()
    return src[src.index("<style>") + 7: src.index("</style>")]

def parse_sentences(path):
    txt = open(path).read()
    if "KỊCH BẢN" in txt:
        txt = txt.split("KỊCH BẢN", 1)[1]
        txt = re.split(r'\n##\s', txt)[0]
    out = []
    for ln in txt.splitlines():
        ln = ln.strip()
        if not ln or ln.startswith("#") or ln.startswith("**") or ln.startswith(">"):
            continue
        m = re.match(r'^\d+[\.\)]\s+(.*)', ln)
        s = (m.group(1) if m else ln).strip()
        s = re.sub(r'^[-*•]\s+', '', s).strip()
        if len(s) >= 6:
            out.append(s)
    return out

def normalize_product(s):
    t = re.sub(r'\bSAB\b', 'Super Agent Business', s)
    t = re.sub(r'\s*[\(,]?\s*gọi tắt là Super Agent Business\)?', '', t)
    return t

import slidelib

# ---------- animation (entrance ngẫu nhiên cho mỗi cảnh) ----------
def A_enter():
    return random.choice(["{}", "{x:-40}", "{x:40}", "{y:-28}", "{y:34}", "{stagger:0.14}", "{x:-24,stagger:0.12}"])

def _wrap(i, s, d, ti, inner):
    return (f'      <div class="slide clip" id="s{i}" data-start="{s}" data-duration="{d}" data-track-index="{ti}">\n'
            f'        {inner}\n      </div>')

def build_scene(i, s, d, ti, sent, spec, variant):
    """spec = (TYPE, pill, args) hoặc None. Trả (html, [anim])."""
    if spec:
        typ, pill, argstr = spec
        inner = slidelib.render(typ, pill, argstr, sentence=sent, variant=variant)
    else:
        inner = slidelib.text_slide(sent, '', variant)
    return _wrap(i, s, d, ti, inner), [f'enter("#s{i}",{round(s+0.2,3)},{A_enter()});']

def build_outro(i, s, d, ti, sab_img=False):
    # Cảnh cuối = THƯƠNG HIỆU của workflow (BRAND_LABEL + SLOGAN). KHÔNG ảnh SAB, KHÔNG hardcode Agent Thực Chiến.
    bl = html.escape(BRAND_LABEL)
    sub = f'<div class="sub anim" style="margin-top:28px;text-align:center">{html.escape(SLOGAN)}</div>' if SLOGAN else ''
    inner = ('<div style="position:absolute;left:96px;right:174px;top:660px;text-align:center">'
             f'<div class="head anim glow" style="position:static;margin-top:18px;font-size:96px;line-height:1.08;text-align:center">{bl}</div>'
             f'{sub}'
             '<div class="anim" style="margin-top:40px;font-family:\'JetBrains Mono\';font-size:26px;letter-spacing:.14em;color:var(--muted)">Theo dõi để không bỏ lỡ →</div></div>')
    return _wrap(i, s, d, ti, inner), [f'enter("#s{i}",{round(s+0.3,3)},{{stagger:0.14}});']

def parse_slides(path):
    """slides.txt: mỗi dòng `sceneNo | TYPE | pill | args`. Trả {sceneNo:(TYPE,pill,args)}."""
    spec = {}
    if not os.path.exists(path): return spec
    for ln in open(path):
        ln = ln.rstrip("\n")
        if not ln.strip() or ln.lstrip().startswith("#"): continue
        parts = ln.split("|")
        if len(parts) < 2: continue
        no = parts[0].strip()
        if not no.isdigit(): continue
        typ = parts[1].strip()
        pill = parts[2].strip() if len(parts) > 2 else ""
        args = "|".join(parts[3:]).strip() if len(parts) > 3 else ""
        spec[int(no)] = (typ, pill, args)
    return spec

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("script"); ap.add_argument("folder")
    ap.add_argument("--num", default="01"); ap.add_argument("--no-audio", action="store_true")
    ap.add_argument("--no-img", action="store_true")
    args = ap.parse_args()
    folder = args.folder

    sents = [normalize_product(s) for s in parse_sentences(args.script)]
    N = len(sents)
    assert N >= 2, "Cần >=2 câu"
    print(f"[build] {N} câu -> {N} cảnh + outro")

    # Scaffold: chỉ copy khung cần thiết (config + nhạc) nếu THIẾU — không đụng file người dùng
    # (img-prompts.txt/post.txt/layout.json), không kéo nhầm audio/ảnh của video khác.
    tmpl = os.path.join(CHANNEL, "_template")
    os.makedirs(folder, exist_ok=True)
    for sub in ("assets/img", "audio", "renders"):
        os.makedirs(os.path.join(folder, sub), exist_ok=True)
    for item in ("hyperframes.json", "package.json", "meta.json"):
        dst = os.path.join(folder, item)
        if not os.path.exists(dst): shutil.copy(os.path.join(tmpl, item), dst)
    # NHẠC NỀN: DÙNG CHUNG kho nhạc News (newsroom/assets/music) — XOAY theo tiêu đề (FNV-1a) + credit CC BY (inc-*).
    # Trước chỉ 1 track cố định; nay mỗi video 1 nhạc khác như News. Fallback track đóng gói nếu thiếu kho.
    music_credit = ""
    bgm_dst = os.path.join(folder, "audio/bgm.mp3")
    if not os.path.exists(bgm_dst):
        news_music = os.path.join(HERE, "..", "newsroom", "assets", "music")
        tracks = sorted(f for f in os.listdir(news_music) if f.lower().endswith(".mp3")) if os.path.isdir(news_music) else []
        if tracks:
            seed = str(os.environ.get("TITLE") or (sents[0] if sents else "") or args.num)
            _h = 2166136261
            for _c in seed:
                _h = ((_h ^ ord(_c)) * 16777619) & 0xFFFFFFFF   # FNV-1a: phân bố đều (khớp News)
            src = os.path.join(news_music, tracks[_h % len(tracks)])
            shutil.copy(src, bgm_dst)
            if os.path.basename(src).lower().startswith("inc-"): music_credit = "Kevin MacLeod (incompetech.com) · CC BY 4.0"
        elif os.path.exists(os.path.join(tmpl, "audio/bgm.mp3")):
            shutil.copy(os.path.join(tmpl, "audio/bgm.mp3"), bgm_dst)
    open(os.path.join(folder, "music_credit.txt"), "w", encoding="utf-8").write(music_credit)
    # SFX chuyển cảnh — kho DÙNG CHUNG sab-video-studio/sfx/ (sfx1-5.mp3), copy vào audio/ nếu chưa có
    _sfxsrc = os.path.join(ASSETS, "sfx")
    for k in range(1, 6):
        _s = os.path.join(_sfxsrc, f"sfx{k}.mp3"); _d = os.path.join(folder, f"audio/sfx{k}.mp3")
        if os.path.exists(_s) and not os.path.exists(_d): shutil.copy(_s, _d)
    for f in os.listdir(os.path.join(folder, "renders")): os.remove(os.path.join(folder, "renders", f))
    # (Bỏ ảnh SAB ở cảnh cuối — đa-tenant dùng BRAND_LABEL/SLOGAN của workflow, không nhét brand SAB.)

    # ===== SPEC SLIDE: <folder>/slides.txt (sceneNo | TYPE | pill | args). Cảnh không spec -> text slide =====
    spec = parse_slides(os.path.join(folder, "slides.txt"))
    graphic = sorted(k for k, v in spec.items() if v[0].strip().upper() not in ("TEXT", ""))
    print(f"[build] {len(graphic)} cảnh SLIDE đồ hoạ: {graphic} | còn lại text ({N - len(graphic)} cảnh)")

    # 1) GIỌNG Vbee (tái dùng câu đã có file)
    if not args.no_audio:
        import vbee_tts
        for i, s in enumerate(sents, 1):
            p = os.path.join(folder, f"audio/s{i}.mp3")
            if os.path.exists(p) and os.path.getsize(p) > 2000:
                print(f"  voice s{i} (tái dùng)"); continue
            vbee_tts.synth(s, p); print(f"  voice s{i} ok")
    if args.no_audio and not os.path.exists(os.path.join(folder, "audio/s1.mp3")):
        L = [4.0] * N
    else:
        L = [dur(os.path.join(folder, f"audio/s{i}.mp3")) for i in range(1, N + 1)]

    # 2) TIMING (nhịp liên tục)
    S = [0.0] * (N + 2); SD = [0.0] * (N + 2); A = [0.0] * (N + 1); cur = 0.0
    for i in range(1, N + 1):
        S[i] = round(cur, 3); SD[i] = round(L[i - 1] + PAD_LEAD + PAD_TAIL, 3); A[i] = round(S[i] + PAD_LEAD, 3); cur = round(cur + SD[i], 3)
    S[N + 1] = round(cur, 3); SD[N + 1] = OUTRO; TOTAL = round(cur + OUTRO, 3)

    # 3) DỰNG index.html — mỗi cảnh = 1 SLIDE
    scenes = []; anims = []; track = 4; tv = 0
    for i in range(1, N + 1):
        s, d, sent = S[i], SD[i], sents[i - 1]
        sp = spec.get(i)
        is_text = (sp is None) or (sp[0].strip().upper() in ("TEXT", ""))
        variant = (tv % 3) if is_text else 0
        if is_text: tv += 1
        hh, aa = build_scene(i, s, d, track, sent, sp, variant)
        scenes.append(hh); anims += aa; track += 1
    oi = N + 1
    hh, aa = build_outro(oi, S[oi], SD[oi], track); scenes.append(hh); anims += aa; track += 1
    audios = []
    for i in range(1, N + 1):
        audios.append(f'      <audio id="a{i}" src="audio/s{i}.mp3" data-start="{A[i]}" data-duration="{L[i-1]}" data-track-index="{track}" data-volume="1"></audio>'); track += 1
    audios.append(f'      <audio id="bgm" src="audio/bgm.mp3" data-start="0" data-duration="{TOTAL}" data-track-index="{track}" data-volume="0.11"></audio>'); track += 1
    # SFX chuyển cảnh: 1 tiếng ở ĐẦU MỖI cảnh (từ cảnh 2), xoay vòng sfx1-5, volume nhẹ 0.4
    _sfxf = [os.path.join(folder, f"audio/sfx{k}.mp3") for k in range(1, 6)]
    if not args.no_audio and all(os.path.exists(f) for f in _sfxf):
        _sfxd = [dur(f) for f in _sfxf]
        for i in range(2, N + 1):
            k = (i - 2) % 5
            audios.append(f'      <audio id="sfx{i}" src="audio/sfx{k+1}.mp3" data-start="{S[i]}" data-duration="{_sfxd[k]}" data-track-index="{track}" data-volume="0.4"></audio>'); track += 1

    style_css = brand_style()
    doc = f'''<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Be+Vietnam+Pro:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>{style_css}</style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="1080" data-height="1920">

      <div class="layer paper clip" id="bgPaper" data-start="0" data-duration="{TOTAL}" data-track-index="0"></div>
      <div class="layer grid clip" id="bgGrid" data-start="0" data-duration="{TOTAL}" data-track-index="1"></div>
      <div class="layer grain clip" id="bgGrain" data-start="0" data-duration="{TOTAL}" data-track-index="2">
        <svg><filter id="gr"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="1080" height="1920" filter="url(#gr)"/></svg>
      </div>
      <div class="layer frame clip" id="bgFrame" data-start="0" data-duration="{TOTAL}" data-track-index="3">
        <div class="rt"></div><div class="rb"></div><div class="cn c1"></div><div class="cn c2"></div>
        <div class="mast"><span class="dot">◇</span> {html.escape(BRAND_LABEL)}</div><div class="mr">{args.num}</div>
        <div class="ft">{html.escape(BRAND_LABEL)}</div>
      </div>

{chr(10).join(scenes)}

{chr(10).join(audios)}
    </div>

    <script>
      window.__timelines = window.__timelines || {{}};
      var tl = gsap.timeline({{ paused: true }});
      function enter(sel, at, vars){{ vars=vars||{{}}; tl.from(sel+" .anim", Object.assign({{opacity:0,y:30,duration:0.6,ease:"power3.out",stagger:0.1}}, vars), at); }}
      function kb(sel, at, dur, s0, s1, x0, x1){{ gsap.set(sel,{{transformOrigin:"50% 50%"}}); tl.fromTo(sel,{{scale:s0,x:x0||0}},{{scale:s1,x:x1||0,duration:dur,ease:"none"}},at); }}
      function reveal(sel, at){{ tl.fromTo(sel,{{clipPath:"inset(0 100% 0 0)"}},{{clipPath:"inset(0 0% 0 0)",duration:0.85,ease:"power3.inOut"}},at); }}
      function pop(sel, at){{ tl.from(sel,{{opacity:0,y:30,scale:0.94,duration:0.62,ease:"power3.out"}},at); }}

      {chr(10)+"      ".join(anims)}

      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
'''
    open(os.path.join(folder, "index.html"), "w").write(doc)
    print(f"[build] index.html OK | tổng {TOTAL}s | {N} cảnh + outro")

if __name__ == "__main__":
    main()
