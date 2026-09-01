#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GENERATOR mẫu "phunu" (Phụ Nữ & Kinh Doanh Online) — editorial kem–cam 9:16.
Viết mới cho ANTOA (kênh gốc không có máy sinh): spec.json (N cảnh có kiểu) -> index.html + audio + timing + HyperFrames.
Dùng: python3 build.py <workdir> <spec.json> [--render]

spec.json:
{
 "num": "01",
 "tts": "vbee" | "edge" | "none",
 "voice": "<edge voice code>",           (chỉ khi tts=edge; vbee đọc VBEE_VOICE từ env)
 "scenes": [ {type, ...content, "vo": "<lời đọc>"}, ... ]
}
KIỂU cảnh (type): intro | text | media | stat | quote | band | list | countup | cta | outro.
Markup trong text (KHÔNG dùng < >): *nhấn cam*  ·  **đậm**  ·  _nghiêng_  ·  xuống dòng bằng \\n.
"""
import sys, os, json, re, html as _html, subprocess, asyncio

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")
FFPROBE = os.environ.get("FFPROBE", "ffprobe")
LEAD, TAIL, MIN_D, OUTRO_D = 0.2, 0.9, 4.0, 8.0


def dur(p):
    try:
        return round(float(subprocess.check_output(
            [FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]).decode().strip()), 3)
    except Exception:
        return 0.0


# ---------- markup an toàn (không cho < >) ----------
def mk(s):
    s = _html.escape(str(s or ""), quote=False)
    s = s.replace("\n", "<br/>")
    s = re.sub(r"\*\*(.+?)\*\*", r'<b>\1</b>', s)
    s = re.sub(r"\*(.+?)\*", r'<span class="em">\1</span>', s)
    s = re.sub(r"_(.+?)_", r'<span class="it">\1</span>', s)
    return s


def disp_line(line, size):
    """1 dòng .disp; nếu cả dòng bọc *...* -> nhấn cam + nghiêng (kiểu tiêu đề gốc)."""
    m = re.match(r"^\*(.+)\*$", str(line).strip())
    cls = f"disp {size} anim"
    if m:
        return f'<div class="disp {size} em it anim">{mk(m.group(1))}</div>'
    return f'<div class="{cls}">{mk(line)}</div>'


def dispsize(lines, default):
    longest = max((len(re.sub(r"[*_]", "", str(l))) for l in lines), default=0)
    if default == "d-lg":
        return "d-lg" if longest <= 14 else "d-md"
    if default == "d-md":
        return "d-md" if longest <= 20 else "d-sm"
    return "d-sm"


IMG_W, IMG_H = 334, 430


# ---------- renderers: trả (inner_html, [gsap_calls]) ; sel = "#sceneK" ----------
def r_intro(sc, sel):
    lines = sc.get("disp", [])
    body = "".join(disp_line(l, "d-lg") for l in lines)
    inner = (f'<div class="grp" style="left:96px;top:400px;width:810px">'
             + (f'<div class="kick anim">{mk(sc["kick"])}</div>' if sc.get("kick") else "")
             + body
             + '<div class="rule anim" style="margin-top:28px"></div>'
             + (f'<div class="lede anim" style="margin-top:22px">{mk(sc["lede"])}</div>' if sc.get("lede") else "")
             + '</div>')
    return inner, [f'enter("{sel}",AT,{{y:42,stagger:0.14}});']


def r_text(sc, sel):
    align = sc.get("align", "left")
    lines = sc.get("disp", [])
    size = dispsize(lines, "d-md" if align == "center" else "d-sm")
    kickcls = "kick ink" if sc.get("kickInk") else "kick"
    inner_bits = [f'<div class="{kickcls} anim">{mk(sc["kick"])}</div>' if sc.get("kick") else ""]
    if sc.get("rule"):
        inner_bits.append('<div class="rule anim"></div>')
    inner_bits += [disp_line(l, size) for l in lines]
    if sc.get("lede"):
        inner_bits.append(f'<div class="lede anim">{mk(sc["lede"])}</div>')
    body = "".join(inner_bits)
    if align == "center":
        inner = f'<div class="grp" style="left:96px;right:174px;top:520px;text-align:center">{body}</div>'
    elif align == "right":
        inner = f'<div class="grp" style="right:174px;top:470px;width:810px;text-align:right">{body}</div>'
    else:
        inner = f'<div class="grp" style="left:96px;top:440px;width:810px">{body}</div>'
    vx = {"center": "{y:38,scale:0.96,stagger:0.13}", "right": "{x:30,stagger:0.12}"}.get(align, "{x:-30,stagger:0.11}")
    return inner, [f'enter("{sel}",AT,{vx});']


def r_media(sc, sel, mid, img):
    side = sc.get("side", "right")   # phía ẢNH
    lines = sc.get("disp", [])
    size = dispsize(lines, "d-sm")
    txt = [f'<div class="kick {"ink" if sc.get("kickInk") else ""} anim">{mk(sc["kick"])}</div>' if sc.get("kick") else ""]
    txt += [disp_line(l, size) for l in lines]
    if sc.get("lede"):
        txt.append(f'<div class="lede anim">{mk(sc["lede"])}</div>')
    txtbody = "".join(txt)
    card = (f'<div class="mcard" id="{mid}" style="{"left:96px" if side=="left" else "right:174px"};top:560px">'
            f'<img src="assets/img/{img}" style="width:{IMG_W}px;height:{IMG_H}px" />'
            + (f'<div class="mcap">▣ {mk(sc["cap"])}</div>' if sc.get("cap") else "")
            + '</div>')
    if side == "left":   # ảnh trái, chữ phải
        grp = f'<div class="grp" style="right:174px;top:470px;width:400px;text-align:right">{txtbody}</div>'
        gs = [f'enter("{sel}",AT,{{x:40,stagger:0.11}});', f'card("#{mid}",AT+0.5);']
    else:                # chữ trái, ảnh phải
        grp = f'<div class="grp" style="left:96px;top:440px;width:420px">{txtbody}</div>'
        gs = [f'enter("{sel}",AT,{{x:-40,stagger:0.11}});', f'card("#{mid}",AT+0.5);']
    return card + grp, gs


def r_stat(sc, sel, sid):
    inner = (f'<div class="grp" style="left:96px;top:360px"><div class="kick ink anim">{mk(sc.get("kick",""))}</div></div>'
             f'<div style="position:absolute;left:96px;top:470px"><div class="stat s-xl" id="{sid}">{mk(sc.get("big","½"))}</div></div>'
             f'<div class="grp" style="left:96px;top:1090px;width:800px"><div class="lede anim">{mk(sc.get("lede",""))}</div></div>')
    gs = [f'tl.from("#{sid}",{{opacity:0,scale:0.5,duration:0.9,ease:"back.out(1.7)"}},AT);',
          f'enter("{sel}",AT+0.2,{{y:30,stagger:0.14}});']
    return inner, gs


def r_quote(sc, sel):
    inner = (f'<div class="grp" style="left:120px;top:520px;width:800px">'
             f'<div class="qmark anim">“</div>'
             f'<div class="quote anim" style="margin-top:20px">{mk(sc.get("quote",""))}</div>'
             + (f'<div class="lede anim" style="margin-top:52px">{mk(sc["lede"])}</div>' if sc.get("lede") else "")
             + '</div>')
    return inner, [f'enter("{sel}",AT,{{y:36,stagger:0.16}});']


def r_band(sc, sel, bid):
    pos = sc.get("pos", "bottom")
    lines = sc.get("disp", [])
    size = dispsize(lines, "d-sm")
    grp = "".join([f'<div class="kick anim">{mk(sc["kick"])}</div>' if sc.get("kick") else ""]
                  + [disp_line(l, size) for l in lines]
                  + ([f'<div class="lede anim" style="margin-top:18px">{mk(sc["lede"])}</div>'] if sc.get("lede") else []))
    band = f'<div class="band" id="{bid}" style="top:{"400px" if pos=="top" else "1050px"}"><div class="bt">{mk(sc.get("band",""))}</div></div>'
    if pos == "top":
        inner = band + f'<div class="grp" style="left:96px;top:820px;width:810px">{grp}</div>'
        gs = [f'tl.from("#{bid}",{{yPercent:-40,opacity:0,duration:0.8,ease:"power3.out"}},AT);', f'enter("{sel}",AT+0.3,{{y:28,stagger:0.14}});']
    else:
        inner = f'<div class="grp" style="left:96px;top:440px;width:810px">{grp}</div>' + band
        gs = [f'enter("{sel}",AT,{{y:26}});', f'tl.from("#{bid}",{{yPercent:40,opacity:0,duration:0.8,ease:"power3.out"}},AT+0.15);']
    return inner, gs


def r_list(sc, sel):
    lines = sc.get("disp", [])
    size = dispsize(lines, "d-sm")
    rows = "".join(f'<div class="listrow"><span class="n">{i+1:02d}</span> {mk(it)}</div>' for i, it in enumerate(sc.get("items", [])))
    inner = (f'<div class="grp" style="left:96px;top:400px;width:810px">'
             + ("".join([f'<div class="kick anim">{mk(sc["kick"])}</div>'] if sc.get("kick") else []))
             + "".join(disp_line(l, size) for l in lines)
             + f'<div class="anim" style="margin-top:40px">{rows}</div>'
             + (f'<div class="lede anim">{mk(sc["lede"])}</div>' if sc.get("lede") else "")
             + '</div>')
    return inner, [f'enter("{sel}",AT,{{x:-36,stagger:0.11}});']


def r_countup(sc, sel, nid):
    to = int(sc.get("to", 90)); suf = sc.get("suffix", "%")
    inner = (f'<div style="position:absolute;left:0;right:0;top:500px;text-align:center"><div class="stat s-xl"><span id="{nid}">0</span>{suf}</div></div>'
             f'<div class="grp" style="left:150px;right:174px;top:1120px;text-align:center">'
             + (f'<div class="lede anim">{mk(sc["lede"])}</div>' if sc.get("lede") else "")
             + (f'<div class="kick anim" style="margin-top:28px">{mk(sc["kick"])}</div>' if sc.get("kick") else "")
             + '</div>')
    gs = [f'tl.from("{sel} .stat",{{opacity:0,scale:0.6,duration:0.7,ease:"back.out(1.6)"}},AT);',
          f'var C{nid}={{v:0}};tl.to(C{nid},{{v:{to},duration:1.6,ease:"power2.out",onUpdate:function(){{document.getElementById("{nid}").textContent=Math.round(C{nid}.v);}}}},AT+0.1);',
          f'enter("{sel}",AT+1.6,{{y:28,stagger:0.16}});']
    return inner, gs


def r_cta(sc, sel):
    lines = sc.get("disp", [])
    inner = (f'<div class="grp" style="left:96px;right:174px;top:560px;text-align:center">'
             + (f'<div class="kick anim">{mk(sc["kick"])}</div>' if sc.get("kick") else "")
             + "".join(disp_line(l, "d-lg") for l in lines)
             + (f'<div class="lede anim" style="margin-left:auto;margin-right:auto;max-width:660px">{mk(sc["lede"])}</div>' if sc.get("lede") else "")
             + '</div>')
    return inner, [f'enter("{sel}",AT,{{y:40,stagger:0.16}});']


def r_outro(sc, sel):
    inner = (f'<div class="grp" style="left:96px;right:174px;top:720px;text-align:center">'
             f'<div class="brandmark anim">{mk(sc.get("brand","✳ KHỞI SỰ"))}</div>'
             + (f'<div class="lede anim" style="margin-left:auto;margin-right:auto;max-width:700px;margin-top:26px">{mk(sc["lede"])}</div>' if sc.get("lede") else "")
             + '</div>')
    return inner, [f'enter("{sel}",AT,{{y:34,scale:0.97,stagger:0.2}});']


# ---------- TTS ----------
async def _edge(text, voice, out):
    import edge_tts
    await edge_tts.Communicate(text, voice or "vi-VN-HoaiMyNeural").save(out)


def tts_scene(text, out, engine, voice):
    if not text:
        return 0.0
    try:
        os.remove(out)
    except Exception:
        pass
    if engine == "vbee":
        sys.path.insert(0, HERE)
        import vbee_tts
        vbee_tts.synth(text, out, "1.0")
    elif engine == "edge":
        asyncio.run(_edge(text, voice, out))
    else:
        return 0.0
    return dur(out)


def build(workdir, spec):
    os.makedirs(os.path.join(workdir, "audio"), exist_ok=True)
    os.makedirs(os.path.join(workdir, "assets"), exist_ok=True)
    # link assets (ảnh + css) vào workdir để HyperFrames đọc tương đối
    subprocess.run(["cp", "-R", os.path.join(ASSETS, "img"), os.path.join(workdir, "assets", "img")])
    subprocess.run(["cp", os.path.join(ASSETS, "bgm.mp3"), os.path.join(workdir, "audio", "bgm.mp3")])
    for f in ("hyperframes.json", "package.json"):
        d = os.path.join(workdir, f)
        if not os.path.exists(d):
            subprocess.run(["cp", os.path.join(ASSETS, "_template", f), d])
    css = open(os.path.join(ASSETS, "style.css")).read()

    engine = spec.get("tts", "vbee")
    voice = spec.get("voice", "vi-VN-HoaiMyNeural")
    scenes = spec.get("scenes", [])
    imgs = sorted(os.listdir(os.path.join(ASSETS, "img")))

    # 1) TTS + timing
    t = 0.0; laid = []
    ai = 0
    for i, sc in enumerate(scenes, 1):
        vo = sc.get("vo", "")
        mp3 = os.path.join(workdir, f"audio/s{i}.mp3")
        d = tts_scene(vo, mp3, engine, voice) if vo else 0.0
        is_outro = sc.get("type") == "outro"
        sdur = OUTRO_D if is_outro and not d else round(max(MIN_D, (d + LEAD + TAIL) if d else MIN_D), 3)
        laid.append({**sc, "i": i, "start": round(t, 3), "sdur": sdur, "adur": d,
                     "astart": round(t + LEAD, 3), "audio": f"s{i}.mp3" if d else None})
        t = round(t + sdur, 3)
    total = round(t, 3)

    # 2) scenes -> HTML + GSAP
    track = 4; scene_html = []; gsap = []; mi = 0
    for sc in laid:
        i = sc["i"]; sel = f"#scene{i}"; typ = sc.get("type", "text")
        if typ == "intro": inner, gs = r_intro(sc, sel)
        elif typ == "media":
            img = sc.get("img");
            if not img or img == "auto": img = imgs[mi % len(imgs)]; mi += 1
            inner, gs = r_media(sc, sel, f"m{i}", img)
        elif typ == "stat": inner, gs = r_stat(sc, sel, f"stat{i}")
        elif typ == "quote": inner, gs = r_quote(sc, sel)
        elif typ == "band": inner, gs = r_band(sc, sel, f"band{i}")
        elif typ == "list": inner, gs = r_list(sc, sel)
        elif typ == "countup": inner, gs = r_countup(sc, sel, f"num{i}")
        elif typ == "cta": inner, gs = r_cta(sc, sel)
        elif typ == "outro": inner, gs = r_outro(sc, sel)
        else: inner, gs = r_text(sc, sel)
        scene_html.append(f'<div class="scene clip" id="scene{i}" data-start="{sc["start"]}" data-duration="{sc["sdur"]}" data-track-index="{track}">{inner}</div>')
        at = round(sc["start"] + 0.25, 3)
        gsap += [g.replace("AT", str(at)) for g in gs]
        track += 1

    # 3) audio
    audio_html = []
    for sc in laid:
        if sc["audio"]:
            audio_html.append(f'<audio src="audio/{sc["audio"]}" data-start="{sc["astart"]}" data-duration="{sc["adur"]}" data-track-index="{track}" data-volume="1"></audio>'); track += 1
    audio_html.append(f'<audio id="bgm" src="audio/bgm.mp3" data-start="0" data-duration="{total}" data-track-index="{track}" data-volume="0.1"></audio>'); track += 1

    doc = f'''<!doctype html>
<html lang="vi"><head><meta charset="UTF-8" /><meta name="viewport" content="width=1080, height=1920" />
<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;0,900;1,600&family=Be+Vietnam+Pro:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>{css}</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{total}" data-width="1080" data-height="1920">
  <div class="layer paper clip" data-start="0" data-duration="{total}" data-track-index="0"></div>
  <div class="layer grain clip" data-start="0" data-duration="{total}" data-track-index="1"><svg><filter id="gr"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="1080" height="1920" filter="url(#gr)"/></svg></div>
  <div class="layer clip" data-start="0" data-duration="{total}" data-track-index="2"><div class="orn">&amp;</div></div>
  <div class="layer frame clip" data-start="0" data-duration="{total}" data-track-index="3"><div class="rt"></div><div class="rb"></div><div class="mast">✳ KHỞI <b>SỰ</b></div><div class="mr">online business</div><div class="ft">Phụ nữ &amp; Kinh doanh Online</div></div>
  {chr(10)+"  ".join(scene_html)}
  {chr(10)+"  ".join(audio_html)}
</div>
<script>
window.__timelines=window.__timelines||{{}};var tl=gsap.timeline({{paused:true}});
gsap.set("#root .orn",{{transformOrigin:"center center"}});tl.to("#root .orn",{{y:-24,duration:{total},ease:"sine.inOut"}},0);
function enter(sel,at,vars){{vars=vars||{{}};tl.from(sel+" .anim",Object.assign({{opacity:0,y:32,duration:0.7,ease:"power3.out",stagger:0.12}},vars),at);}}
function card(sel,at){{tl.from(sel,{{opacity:0,y:36,scale:0.94,duration:0.75,ease:"power3.out"}},at);}}
{chr(10).join(gsap)}
window.__timelines["main"]=tl;
</script></body></html>'''
    open(os.path.join(workdir, "index.html"), "w", encoding="utf-8").write(doc)
    return total, len(scenes)


def main():
    workdir = os.path.abspath(sys.argv[1])
    spec = json.load(open(sys.argv[2], encoding="utf-8"))
    total, n = build(workdir, spec)
    print(f"[phunu] index.html OK · {n} cảnh · {total}s")
    if "--render" in sys.argv[3:]:
        subprocess.run(["npx", "--yes", "hyperframes@0.7.64", "render"], cwd=workdir)


if __name__ == "__main__":
    main()
