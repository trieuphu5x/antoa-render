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
LEAD, TAIL, MIN_D, OUTRO_D = 0.1, 0.15, 2.0, 4.0   # giọng LIỀN MẠCH: gần như không quãng nghỉ giữa cảnh
_CHANNEL = ""   # tên kênh (đặt trong build) — dùng cho outro brandmark


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


IMG_W, IMG_H = 420, 540


def statsize(val):
    """Cỡ SỐ LỚN tự co theo số ký tự — tránh 'vỡ hàng' khi nhiều chữ số (vd 5-10, 24/7). Boss chốt: bỏ 340px cố định."""
    n = len(str(val or "").strip())
    return 220 if n <= 2 else 176 if n == 3 else 138 if n == 4 else 110

# 6 PALETTE MÀU (:root) — user chọn màu nào, dựng đúng màu đó. Mặc định kem-cam.
COLORS = {
    "kem-cam": "--paper:#EFE9DC; --paperhi:#F5F0E6; --paperlo:#E7DECB; --ink:#22233F; --ink2:#5C5F79; --ember:#E2552F; --gold:#E0A43B; --card:#FBF8F1; --onmedia:#F4EFE4;",
    "navy-vang": "--paper:#17284D; --paperhi:#1F3360; --paperlo:#101E3C; --ink:#EEF1F8; --ink2:#A8B2CC; --ember:#F5B72E; --gold:#E79A4A; --card:#223357; --onmedia:#F4EFE4;",
    "xanh-ngoc": "--paper:#0F5B4E; --paperhi:#146C5C; --paperlo:#0A4238; --ink:#EFF5F0; --ink2:#A6CDBF; --ember:#FFC94D; --gold:#FF8560; --card:#155F52; --onmedia:#F4EFE4;",
    "hong-dat": "--paper:#F2E6E1; --paperhi:#FAF0EC; --paperlo:#E8D6CE; --ink:#3A2630; --ink2:#6E5560; --ember:#E42D2B; --gold:#C79A5B; --card:#FCF5F1; --onmedia:#F6EFEA;",
    "den-gold": "--paper:#16171C; --paperhi:#1E2027; --paperlo:#0F1013; --ink:#ECE7DC; --ink2:#A29E8F; --ember:#E0A43B; --gold:#C98A3A; --card:#24262E; --onmedia:#F4EFE4;",
    "xanh-duong-cam": "--paper:#E8EDF2; --paperhi:#F2F6FA; --paperlo:#DAE1EA; --ink:#16233A; --ink2:#526079; --ember:#2F6BFF; --gold:#FF6A2C; --card:#F7FAFD; --onmedia:#F4EFE4;",
}


# ---------- renderers: trả (inner_html, [gsap_calls]) ; sel = "#sceneK" ----------
def r_intro(sc, sel):
    lines = sc.get("disp", [])
    size = dispsize(lines, "d-lg")   # tự co: dòng dài -> hạ cấp (tránh tràn), dòng ngắn giữ d-lg to đẹp
    # CANH GIỮA DỌC trong safe zone (giữa ≈935px) — cụm không còn cao/trống dưới (Boss)
    body = "".join(disp_line(l, size) for l in lines)
    inner = (f'<div class="grp" style="left:96px;top:935px;transform:translateY(-50%);width:810px">'
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
        inner = f'<div class="grp" style="left:96px;top:540px;width:810px">{body}</div>'
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
    src = img if str(img).startswith("http") else f"assets/img/{img}"   # ảnh URL động (Drive/stock) HOẶC ảnh mẫu local
    card = (f'<div class="mcard" id="{mid}" style="{"left:96px" if side=="left" else "right:174px"};top:560px">'
            f'<img src="{src}" style="width:{IMG_W}px;height:{IMG_H}px" />'
            + (f'<div class="mcap">▣ {mk(sc["cap"])}</div>' if sc.get("cap") else "")
            + '</div>')
    if side == "left":   # ảnh trái, chữ phải — canh giữa theo chiều dọc với ảnh
        grp = f'<div class="grp" style="right:174px;top:640px;width:340px;text-align:right">{txtbody}</div>'
        gs = [f'enter("{sel}",AT,{{x:40,stagger:0.11}});', f'card("#{mid}",AT+0.5);']
    else:                # chữ trái, ảnh phải
        grp = f'<div class="grp" style="left:96px;top:640px;width:340px">{txtbody}</div>'
        gs = [f'enter("{sel}",AT,{{x:-40,stagger:0.11}});', f'card("#{mid}",AT+0.5);']
    return card + grp, gs


# ===== 8 KIỂU ẢNH DUYỆT v2 (kho kiểu tạp chí) — mỗi kiểu 1 layout, gsap dùng token AT (start+0.25) & DUR (sdur) =====
IMG_STYLES = ["hero", "duo", "film", "arch", "grid", "split", "circles", "filmstrip"]
IMG_NEED = {"hero": 1, "duo": 1, "film": 2, "arch": 1, "grid": 4, "split": 1, "circles": 2, "filmstrip": 4}


def _heading(sc, size, extra_cls=""):
    """kick + các dòng disp (không lede) — cho các kiểu có tiêu đề."""
    bits = [f'<div class="kick {extra_cls} anim">{mk(sc["kick"])}</div>' if sc.get("kick") else ""]
    bits += [disp_line(l, size) for l in sc.get("disp", [])]
    return "".join(bits)


def _sidetext(sc, size):
    """kick + disp + lede — cho kiểu có cột chữ bên (duo/arch)."""
    body = _heading(sc, size)
    if sc.get("lede"):
        body += f'<div class="lede anim">{mk(sc["lede"])}</div>'
    return body


def r_image(sc, sel, iid, imgs):
    """Trả (inner_html, [gsap]). imgs = list tên file đủ dùng cho kiểu."""
    style = sc.get("style", "hero")
    S = sel

    def IMG(k):
        v = imgs[k % len(imgs)]
        return v if str(v).startswith("http") else f'assets/img/{v}'   # LINK ĐỘNG (Drive/stock) hoặc ảnh mẫu local

    if style == "hero":
        kick = f'<div class="kick onpaper anim" style="color:var(--gold)">{mk(sc["kick"])}</div>' if sc.get("kick") else ""
        disp = "".join(f'<div class="disp {dispsize(sc.get("disp", []), "d-sm")} onpaper anim">{mk(l)}</div>' for l in sc.get("disp", []))
        inner = (f'<div class="hero"><img id="{iid}" src="{IMG(0)}"/><div class="scrim"></div>'
                 f'<div class="ov">{kick}{disp}</div></div>')
        return inner, [f'enter("{S}",AT); kb("{S} .hero img",AT,DUR,1.0,1.12);']

    if style == "duo":
        inner = (f'<div class="duo" id="{iid}" style="left:96px;top:410px;width:520px;height:840px"><img src="{IMG(0)}"/><div class="tint"></div><div class="tint2"></div></div>'
                 f'<div class="grp" style="right:174px;top:560px;width:280px;text-align:right">{_sidetext(sc, "d-sm")}</div>')
        return inner, [f'enter("{S}",AT,{{x:36}}); reveal("{S} .duo",AT); kb("{S} .duo img",AT,DUR,1.06,1.0);']

    if style == "film":   # 2 ảnh phim nghiêng chồng lớp
        cap = sc.get("caps", [])
        c0 = f'<div class="cap">▣ {mk(cap[0])}</div>' if len(cap) > 0 else ""
        c1 = f'<div class="cap">▣ {mk(cap[1])}</div>' if len(cap) > 1 else ""
        inner = (f'<div class="grp" style="left:96px;top:520px;width:760px">{_heading(sc, "d-sm")}</div>'
                 f'<div class="pc" id="{iid}a" style="left:150px;top:880px;transform:rotate(-7deg)"><img src="{IMG(0)}" style="width:350px;height:430px"/>{c0}</div>'
                 f'<div class="pc" id="{iid}b" style="left:470px;top:960px;transform:rotate(6deg)"><img src="{IMG(1)}" style="width:350px;height:430px"/>{c1}</div>')
        return inner, [f'enter("{S}",AT); pop("#{iid}a",AT+0.05); pop("#{iid}b",AT+0.2);']

    if style == "arch":
        inner = (f'<div class="arch" id="{iid}" style="right:174px;top:420px;width:470px;height:900px"><img src="{IMG(0)}"/></div>'
                 f'<div class="grp" style="left:96px;top:640px;width:290px">{_sidetext(sc, "d-sm")}</div>')
        return inner, [f'enter("{S}",AT); pop("#{iid}",AT); kb("#{iid} img",AT,DUR,1.1,1.1,24,-24);']

    if style == "grid":   # lưới 4 ảnh
        kick = f'<div class="grp" style="left:96px;top:420px"><div class="kick anim">{mk(sc.get("kick", "Bộ sưu tập"))}</div></div>'
        cells = (f'<div class="pc" id="{iid}a" style="left:96px;top:490px"><img src="{IMG(0)}" style="width:355px;height:400px"/></div>'
                 f'<div class="pc" id="{iid}b" style="left:508px;top:490px"><img src="{IMG(1)}" style="width:355px;height:400px"/></div>'
                 f'<div class="pc" id="{iid}c" style="left:96px;top:930px"><img src="{IMG(2)}" style="width:355px;height:400px"/></div>'
                 f'<div class="pc" id="{iid}d" style="left:508px;top:930px"><img src="{IMG(3)}" style="width:355px;height:400px"/></div>')
        return kick + cells, [f'enter("{S}",AT); pop("#{iid}a",AT); pop("#{iid}b",AT+0.18); pop("#{iid}c",AT+0.36); pop("#{iid}d",AT+0.54);']

    if style == "split":   # cắt chéo + chữ nửa dưới
        inner = (f'<div class="split" id="{iid}" style="left:96px;top:410px;width:810px;height:720px"><img src="{IMG(0)}"/></div>'
                 f'<div class="grp" style="left:96px;top:1180px;width:810px">{_heading(sc, "d-sm")}</div>')
        return inner, [f'enter("{S}",AT); reveal("#{iid}",AT); kb("#{iid} img",AT,DUR,1.0,1.1);']

    if style == "circles":   # 2 ảnh tròn lệch nhịp
        inner = (f'<div class="grp" style="left:96px;top:430px;width:760px">{_heading(sc, "d-sm")}</div>'
                 f'<div class="circ" id="{iid}a" style="left:96px;top:700px;width:430px;height:430px"><img src="{IMG(0)}"/></div>'
                 f'<div class="circ" id="{iid}b" style="left:476px;top:1000px;width:380px;height:380px"><img src="{IMG(1)}"/></div>')
        return inner, [f'enter("{S}",AT); pop("#{iid}a",AT+0.05); pop("#{iid}b",AT+0.35);']

    # filmstrip — băng phim trượt ngang (giữ ~3s rồi cuộn)
    kick = f'<div style="position:absolute;left:96px;top:520px"><div class="kick anim">{mk(sc.get("kick", "Cuộn ngang"))}</div></div>'
    cards = "".join(f'<div class="pc" style="margin:0"><img src="{IMG(k)}" style="width:410px;height:510px"/></div>' for k in range(max(3, len(imgs))))
    inner = (kick +
             f'<div style="position:absolute;left:0;top:610px;width:1080px;height:660px;overflow:hidden">'
             f'<div class="filmstrip" id="{iid}" style="position:absolute;left:96px;top:0;display:flex;gap:26px">{cards}</div></div>')
    return inner, [f'enter("{S}",AT); tl.set("#{iid}",{{x:0}},AT); tl.to("#{iid}",{{x:-980,duration:2.6,ease:"power1.inOut"}},AT+3);']


def r_stat(sc, sel, sid):   # KIỂU 10 · Số liệu lớn (điểm nhấn)
    lines = sc.get("disp", [])
    sub = f'<div class="disp d-sm anim" style="margin-top:14px">{mk(lines[0])}</div>' if lines else ""
    _bsz = statsize(sc.get("big", "80"))   # SỐ tự co theo độ dài (tránh vỡ hàng)
    inner = (f'<div class="grp" style="left:96px;top:935px;transform:translateY(-50%);width:810px">'
             f'<div class="kick anim">{mk(sc.get("kick", ""))}</div>'
             f'<div class="stat anim" id="{sid}" style="font-size:{_bsz}px;margin-top:18px">{mk(sc.get("big", "80"))}<span style="font-size:{round(_bsz*0.55)}px">{mk(sc.get("suffix", ""))}</span></div>'
             + sub
             + (f'<div class="lede anim" style="margin-top:22px;width:760px">{mk(sc["lede"])}</div>' if sc.get("lede") else "")
             + '</div>')
    return inner, [f'enter("{sel}",AT,{{stagger:0.12}});']


def r_quote(sc, sel):   # KIỂU 11 · Câu trích dẫn
    inner = (f'<div class="grp" style="left:96px;top:935px;transform:translateY(-50%);width:810px">'
             f'<div class="qmark anim">“</div>'
             f'<div class="quote anim" style="margin-top:6px">{mk(sc.get("quote", ""))}</div>'
             + (f'<div class="qby anim" style="margin-top:44px">— {mk(sc["by"])}</div>' if sc.get("by") else "")
             + '</div>')
    return inner, [f'enter("{sel}",AT,{{stagger:0.14}});']


def r_band(sc, sel, bid):   # KIỂU 09 · Băng chữ nhấn mạnh (tiêu đề trên + băng câu đắt giá dưới)
    lines = sc.get("disp", [])
    size = dispsize(lines, "d-md")
    head = "".join([f'<div class="kick anim">{mk(sc["kick"])}</div>' if sc.get("kick") else ""] + [disp_line(l, size) for l in lines])
    inner = (f'<div class="grp" style="left:96px;top:935px;transform:translateY(-50%);width:810px">'
             f'{head}'
             f'<div class="band" id="{bid}" style="position:relative;left:auto;right:auto;margin-top:56px"><div class="bt">{mk(sc.get("band", ""))}</div></div>'
             + '</div>')
    return inner, [f'enter("{sel}",AT); pop("#{bid}",AT+0.25);']


def r_list(sc, sel):
    lines = sc.get("disp", [])
    size = dispsize(lines, "d-sm")
    rows = "".join(f'<div class="listrow"><span class="n">{i+1:02d}</span> {mk(it)}</div>' for i, it in enumerate(sc.get("items", [])))
    inner = (f'<div class="grp" style="left:96px;top:935px;transform:translateY(-50%);width:810px">'
             + ("".join([f'<div class="kick anim">{mk(sc["kick"])}</div>'] if sc.get("kick") else []))
             + "".join(disp_line(l, size) for l in lines)
             + f'<div class="anim" style="margin-top:40px">{rows}</div>'
             + (f'<div class="lede anim">{mk(sc["lede"])}</div>' if sc.get("lede") else "")
             + '</div>')
    return inner, [f'enter("{sel}",AT,{{x:-36,stagger:0.11}});']


def r_countup(sc, sel, nid):
    to = int(sc.get("to", 90)); suf = sc.get("suffix", "%")
    _csz = statsize(str(to) + str(suf))   # SỐ đếm tự co theo độ dài (tránh vỡ hàng)
    inner = (f'<div class="grp" style="left:96px;right:174px;top:935px;transform:translateY(-50%);text-align:center">'   # gộp số + chữ, canh giữa dọc (Boss)
             f'<div class="stat" style="font-size:{_csz}px"><span id="{nid}">0</span>{suf}</div>'
             + (f'<div class="lede anim" style="margin-top:30px">{mk(sc["lede"])}</div>' if sc.get("lede") else "")
             + (f'<div class="kick anim" style="margin-top:24px">{mk(sc["kick"])}</div>' if sc.get("kick") else "")
             + '</div>')
    gs = [f'tl.from("{sel} .stat",{{opacity:0,scale:0.6,duration:0.7,ease:"back.out(1.6)"}},AT);',
          f'var C{nid}={{v:0}};tl.to(C{nid},{{v:{to},duration:1.6,ease:"power2.out",onUpdate:function(){{document.getElementById("{nid}").textContent=Math.round(C{nid}.v);}}}},AT+0.1);',
          f'enter("{sel}",AT+1.6,{{y:28,stagger:0.16}});']
    return inner, gs


def r_cta(sc, sel):   # KIỂU 12 · Chốt / Kêu gọi hành động (có nút pill)
    lines = sc.get("disp", [])
    size = dispsize(lines, "d-md")
    inner = (f'<div class="grp" style="left:96px;top:935px;transform:translateY(-50%);width:810px">'
             + (f'<div class="kick anim">{mk(sc["kick"])}</div>' if sc.get("kick") else "")
             + "".join(disp_line(l, size) for l in lines)
             + (f'<div class="lede anim" style="margin-top:24px;width:780px">{mk(sc["lede"])}</div>' if sc.get("lede") else "")
             + f'<div class="anim" style="margin-top:52px"><span class="pill">{mk(sc.get("pill", "Theo dõi để không bỏ lỡ →"))}</span></div>'
             + '</div>')
    return inner, [f'enter("{sel}",AT,{{stagger:0.12}});']


def r_outro(sc, sel):
    raw = str(sc.get("brand") or (("✳ " + _CHANNEL) if _CHANNEL else ""))   # bỏ default "✳ KHỞI SỰ"
    if not re.sub(r"<[^>]+>|[*_✳]|\s", "", raw):   # không có tên kênh → outro TRỐNG (Boss: để trống = không hiện gì)
        return '<div class="grp" style="left:80px;right:80px;top:730px"></div>', []
    n = len(re.sub(r"<[^>]+>|[*_]", "", raw).strip())
    # AUTO-CO tên kênh cuối video → nhỏ hơn bản cũ (~40%) + nowrap để tên 4 từ KHÔNG xuống dòng.
    bsize = 56 if n <= 16 else 50 if n <= 21 else 44 if n <= 27 else 38 if n <= 34 else 32
    inner = (f'<div class="grp" style="left:80px;right:80px;top:730px;text-align:center">'
             f'<div class="brandmark anim" style="font-size:{bsize}px;white-space:nowrap">{mk(raw)}</div>'
             + (f'<div class="lede anim" style="margin-left:auto;margin-right:auto;max-width:760px;margin-top:20px">{mk(sc["lede"])}</div>' if sc.get("lede") else "")
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
    elif engine == "vieneu":
        sys.path.insert(0, HERE)
        import vieneu_tts
        vieneu_tts.synth(text, out, os.environ.get("VIENEU_VOICE"))
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
    # NHẠC NỀN auto-KHỚP CHỦ ĐỀ theo palette — Tạp Chí giải trí/du lịch: mỗi mood một chất nhạc (thư viện free, không ghi nguồn).
    MUSIC_BY_PAL = {
        "navy-vang":      "buon.mp3",     # buồn/tang/scandal/drama → trầm lắng, piano
        "hong-dat":       "tinhcam.mp3",  # cưới/tình cảm/hạnh phúc → ấm áp ngọt ngào
        "xanh-ngoc":      "dulich.mp3",   # du lịch biển/thiên nhiên → nhẹ nhàng bay bổng
        "xanh-duong-cam": "dulich.mp3",   # du lịch điểm đến chung → nhẹ nhàng bay bổng
        "kem-cam":        "amthuc.mp3",   # ẩm thực/đặc sản → tươi sáng vui vẻ
        "den-gold":       "showbiz.mp3",  # mặc định showbiz/giải trí → hiện đại sôi động
    }
    _mood = str(spec.get("music_mood") or "").strip()   # cho phép ép mood; rỗng → theo palette
    _track = (_mood + ".mp3") if _mood else MUSIC_BY_PAL.get(str(spec.get("palette", "den-gold")), "showbiz.mp3")
    _bgm = os.path.join(ASSETS, "music", _track)
    if not os.path.exists(_bgm):
        _bgm = os.path.join(ASSETS, "music", "showbiz.mp3")
        if not os.path.exists(_bgm):
            _bgm = os.path.join(ASSETS, "bgm.mp3")   # fallback bản cũ nếu thiếu thư viện
    print("[phunu] nhạc nền:", os.path.basename(_bgm), "(palette=" + str(spec.get("palette", "?")) + ")")
    subprocess.run(["cp", _bgm, os.path.join(workdir, "audio", "bgm.mp3")])
    for f in ("hyperframes.json", "package.json"):
        d = os.path.join(workdir, f)
        if not os.path.exists(d):
            subprocess.run(["cp", os.path.join(ASSETS, "_template", f), d])
    css = open(os.path.join(ASSETS, "style.css")).read()
    pal = COLORS.get(str(spec.get("palette", "kem-cam")), COLORS["kem-cam"])   # user chọn màu → chèn :root (đè mặc định)
    css = css + "\n:root{ " + pal + " }"

    engine = spec.get("tts", "vbee")
    voice = spec.get("voice", "vi-VN-HoaiMyNeural")
    scenes = spec.get("scenes", [])
    # NHÃN ĐỘNG: tên kênh (footer) · chủ đề (góc phải) · cột mốc (góc trái). Ưu tiên env brand thật, rồi spec (AI), rồi mặc định.
    global _CHANNEL
    channel = (spec.get("channel") or os.environ.get("BRAND_LABEL") or ("" if os.environ.get("VERBATIM") == "1" else "Kênh của bạn")).strip()   # THỦ CÔNG để trống = rỗng (không hiện outro)
    topic = (spec.get("topic") or os.environ.get("SLOGAN") or "").strip()
    milestone = (spec.get("milestone") or (scenes[0].get("kick") if scenes else "") or "").strip()
    _CHANNEL = channel
    # NGUỒN ẢNH: spec.images = ảnh THẬT bài báo (dedup). Rỗng → ảnh mẫu local (chỉ test).
    imgs = [str(u).strip() for u in (spec.get("images") or []) if str(u).strip()]
    _seen = set(); imgs = [x for x in imgs if not (x in _seen or _seen.add(x))]   # DEDUP giữ thứ tự (ảnh[0]=og:image chủ thể)
    if not imgs:
        imgs = sorted(os.listdir(os.path.join(ASSETS, "img")))
    nimg = len(imgs)
    # KHỚP KHUNG THEO SỐ ẢNH THẬT (Boss chốt): chỉ dùng kiểu cần ≤ số ảnh có → KHÔNG lặp/chèn ảnh lạc.
    # Ít ảnh → chỉ kiểu 1 ảnh (hero/duo/arch/split). Đủ 2 → thêm film/circles. Đủ 4 → thêm grid/filmstrip.
    AVAIL = [s for s in IMG_STYLES if IMG_NEED[s] <= nimg] or ["hero"]

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
    track = 4; scene_html = []; gsap = []; mi = 0; irot = 0
    for sc in laid:
        i = sc["i"]; sel = f"#scene{i}"; typ = sc.get("type", "text")
        durtok = round(max(1.0, sc["sdur"] - 0.4), 3)   # DUR cho kb (span cảnh)
        if typ == "intro": inner, gs = r_intro(sc, sel)
        elif typ in ("media", "image"):   # cảnh ẢNH → chọn kiểu VỪA số ảnh (không chèn ảnh lạc/lặp)
            style = sc.get("style", "auto")
            if style not in IMG_NEED or IMG_NEED[style] > nimg:   # không chỉ định HOẶC kiểu cần nhiều ảnh hơn có → tự chọn kiểu vừa
                style = AVAIL[irot % len(AVAIL)]; irot += 1
            need = IMG_NEED[style]
            simgs = list(sc.get("imgs") or ([sc["img"]] if sc.get("img") and sc.get("img") != "auto" else []))
            while len(simgs) < need:
                simgs.append(imgs[mi % len(imgs)]); mi += 1
            inner, gs = r_image({**sc, "style": style}, sel, f"im{i}", simgs)
        elif typ == "card":   # (giữ layout ảnh cũ 1 thẻ nếu spec yêu cầu)
            img = sc.get("img")
            if not img or img == "auto": img = imgs[mi % len(imgs)]; mi += 1
            inner, gs = r_media(sc, sel, f"m{i}", img)
        elif typ == "stat": inner, gs = r_stat(sc, sel, f"stat{i}")
        elif typ == "quote": inner, gs = r_quote(sc, sel)
        elif typ == "band": inner, gs = r_band(sc, sel, f"band{i}")
        elif typ == "list": inner, gs = r_list(sc, sel)
        elif typ == "countup": inner, gs = r_countup(sc, sel, f"num{i}")
        elif typ == "cta": inner, gs = r_cta(sc, sel)
        elif typ == "outro": inner, gs = r_outro(sc, sel)
        else: inner, gs = r_intro(sc, sel)   # cảnh CHỮ (không ảnh) → kiểu INTRO (canh giữa dọc)
        scene_html.append(f'<div class="scene clip" id="scene{i}" data-start="{sc["start"]}" data-duration="{sc["sdur"]}" data-track-index="{track}">{inner}</div>')
        at = round(sc["start"] + 0.25, 3)
        gsap += [g.replace("AT", str(at)).replace("DUR", str(durtok)) for g in gs]
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
  <div class="layer frame clip" data-start="0" data-duration="{total}" data-track-index="3"><div class="rt"></div><div class="rb"></div><div class="mast">✳ {_html.escape(milestone or channel)}</div><div class="mr">{_html.escape(topic)}</div><div class="ft">{_html.escape(channel)}</div></div>
  {chr(10)+"  ".join(scene_html)}
  {chr(10)+"  ".join(audio_html)}
</div>
<script>
window.__timelines=window.__timelines||{{}};var tl=gsap.timeline({{paused:true}});
gsap.set("#root .orn",{{transformOrigin:"center center"}});tl.to("#root .orn",{{y:-24,duration:{total},ease:"sine.inOut"}},0);
function enter(sel,at,vars){{vars=vars||{{}};tl.from(sel+" .anim",Object.assign({{opacity:0,y:32,duration:0.7,ease:"power3.out",stagger:0.12}},vars),at);}}
function card(sel,at){{tl.from(sel,{{opacity:0,y:36,scale:0.94,duration:0.75,ease:"power3.out"}},at);}}
function kb(sel,at,dur,s0,s1,x0,x1){{x0=x0||0;x1=x1||0;gsap.set(sel,{{transformOrigin:"50% 50%"}});tl.fromTo(sel,{{scale:s0,x:x0}},{{scale:s1,x:x1,duration:dur,ease:"none"}},at);}}
function reveal(sel,at){{tl.fromTo(sel,{{clipPath:"inset(0 100% 0 0)"}},{{clipPath:"inset(0 0% 0 0)",duration:0.85,ease:"power3.inOut"}},at);}}
function pop(sel,at){{tl.from(sel,{{opacity:0,y:30,scale:0.94,duration:0.62,ease:"power3.out"}},at);}}
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
