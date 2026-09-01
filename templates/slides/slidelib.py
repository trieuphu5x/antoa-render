#!/usr/bin/env python3
"""Thư viện 30 SLIDE (port từ _slides-catalog) — render inner HTML điền nội dung.
render(type, pill, args) -> inner_html (các phần tử có class 'anim' để build_video gắn enter()).
args: các item cách nhau '|' ; trong item các field cách nhau '::' ; kết quả/đặc biệt sau '>>'.
CSS lấy từ _slides-catalog/index.html (build_video nhúng)."""
import html as _html, re

def esc(s): return _html.escape(str(s), quote=False)

def grad(text):
    w = str(text).split()
    if len(w) <= 1: return f'<span class="em">{esc(text)}</span>'
    k = max(1, round(len(w) * 0.5))
    return f'{esc(" ".join(w[:k]))} <span class="em">{esc(" ".join(w[k:]))}</span>'

def hsize(t):
    L = len(str(t)); return 104 if L <= 26 else 84 if L <= 42 else 66 if L <= 60 else 54 if L <= 84 else 44

def _pill(p): return f'<div class="pill anim">{esc(p)}</div>' if p else ''
def _items(a): return [x.strip() for x in a.split('|')] if a.strip() else []
def _emoji(s):
    s = s.strip(); m = re.match(r'^(\S+)\s+(.*)$', s); return (m.group(1), m.group(2)) if m else ('•', s)

def text_slide(sentence, pill='', variant=0):
    fs = hsize(sentence)
    if variant == 1:  # canh giữa, chữ lớn phát sáng
        return (_pill(pill) + f'<div style="position:absolute;left:96px;right:174px;top:47%;transform:translateY(-50%);text-align:center">'
                f'<div class="head anim glow" style="font-size:{int(fs*1.06)}px;text-align:center">{grad(sentence)}</div></div>')
    if variant == 2:  # kiểu trích dẫn, dấu nháy lớn
        return (_pill(pill) + f'<div style="position:absolute;left:96px;right:174px;top:45%;transform:translateY(-50%)">'
                f'<div class="anim" style="font-family:\'Space Grotesk\';font-weight:700;font-size:150px;line-height:.5;color:var(--cyan)">&#10078;</div>'
                f'<div class="head anim" style="position:static;margin-top:20px;font-size:{int(fs*0.94)}px">{grad(sentence)}</div></div>')
    return (_pill(pill) + f'<div style="position:absolute;left:96px;right:174px;top:47%;transform:translateY(-50%)">'
            f'<div class="head anim glow" style="font-size:{fs}px">{grad(sentence)}</div></div>')

def bigtext(pill, a):
    head, _, sub = a.partition('::')
    fs = min(hsize(head) + 24, 116)
    return (_pill(pill) + '<div style="position:absolute;left:96px;right:174px;top:50%;transform:translateY(-50%)">'
            f'<div class="head anim glow" style="position:static;font-size:{fs}px">{grad(head)}</div>'
            + (f'<div class="sub anim" style="margin-top:30px">{esc(sub)}</div>' if sub else '') + '</div>')

def stat(pill, a):
    big, label, sub = (a.split('::') + ['', ''])[:3]
    n = len(big.strip())
    fz = 300 if n <= 3 else 240 if n <= 4 else 190 if n <= 6 else 150 if n <= 9 else 110  # co theo độ dài, giữ 1 dòng
    return (_pill(pill) + f'<div class="num anim glow" style="position:absolute;left:96px;right:174px;top:620px;font-size:{fz}px;line-height:.95;white-space:nowrap">{esc(big)}</div>'
            f'<div class="head anim" style="top:980px;font-size:70px">{grad(label)}</div>'
            + (f'<div class="bx anim" style="top:1120px"><div class="sub">{esc(sub)}</div></div>' if sub else ''))

def transform(pill, a):
    old, new, sub = (a.split('::') + ['', ''])[:3]
    n = len(new.strip())
    fs = 200 if n <= 6 else 160 if n <= 11 else 120 if n <= 18 else 92 if n <= 26 else 72  # co theo độ dài, chữ dài tự nhỏ
    # layout FLOW căn giữa (như bigtext): xếp dọc, KHÔNG top cố định → phụ đề không bao giờ đè lên "new" dù wrap
    return (_pill(pill) + '<div style="position:absolute;left:96px;right:174px;top:50%;transform:translateY(-50%)">'
            f'<div class="old anim" style="position:static;font-size:92px;line-height:1.05">{esc(old)}</div>'
            f'<div class="anim" style="position:static;font-size:58px;color:var(--cyan);margin:14px 0;line-height:1">↓</div>'
            f'<div class="num anim glow" style="position:static;font-size:{fs}px;line-height:1.02">{esc(new)}</div>'
            + (f'<div class="sub anim" style="margin-top:28px">{esc(sub)}</div>' if sub else '') + '</div>')

def trio(pill, a):
    cells = ''.join(f'<div class="col hot anim" style="text-align:center"><div class="num" style="font-size:92px">{esc(n)}</div><div class="cdesc" style="margin-top:8px">{esc(l)}</div></div>'
                    for it in _items(a) for n, l in [(it.split("::") + [""])[:2]])
    return _pill(pill) + f'<div class="bx" style="top:680px"><div class="cols">{cells}</div></div>'

def compare(pill, a):
    it = _items(a); (tA, nA, dA) = (it[0].split('::') + ['', '', ''])[:3]; (tB, nB, dB) = (it[1].split('::') + ['', '', ''])[:3]
    return (_pill(pill) + f'<div class="head anim" style="top:470px;font-size:76px">{esc(tA)} <span class="em">≠</span> {esc(tB)}</div>'
            f'<div class="bx" style="top:660px"><div class="cols">'
            f'<div class="col anim"><div class="tagm">{esc(tA)}</div><div class="cname">{esc(nA)}</div><div class="cdesc">{esc(dA)}</div></div>'
            f'<div class="col hot anim"><div class="tagm">{esc(tB)}</div><div class="cname em">{esc(nB)}</div><div class="cdesc">{esc(dB)}</div></div>'
            f'</div></div>')

def proscons(pill, a):
    bad_s, _, good_s = a.partition('>>')
    def rows(items, cls, mark):
        return ''.join(f'<div class="rowit" style="background:none;border:0;padding:8px 0;margin:0 0 12px"><div class="rico {cls}">{mark}</div><div class="rtx" style="font-size:36px">{esc(x)}</div></div>' for x in _items(items))
    return (_pill(pill) + '<div class="bx" style="top:580px"><div class="cols">'
            f'<div class="col bad anim"><div class="tagm">Làm tay</div>{rows(bad_s,"r","✕")}</div>'
            f'<div class="col hot anim"><div class="tagm">Giao Agent</div>{rows(good_s,"g","✓")}</div>'
            '</div></div>')

def grid(pill, a):
    cells = ''.join(f'<div class="cell anim"><div class="fi">{e}</div><div class="fl">{esc(l)}</div></div>' for it in _items(a) for e, l in [_emoji(it)])
    return _pill(pill) + f'<div class="bx" style="top:640px"><div class="fg">{cells}</div></div>'

def callout(pill, a):
    t, _, d = a.partition('::')
    return (f'<div class="pill anim" style="border-color:rgba(255,107,107,.5);background:rgba(255,107,107,.06)">{esc(pill or "Cảnh báo")}</div>'
            f'<div class="bx anim" style="top:620px"><div class="callout"><div class="ci">⚠️</div><div class="ct">{esc(t)}</div><div class="cd">{esc(d)}</div></div></div>')

def takeaway(pill, a):
    t, _, d = a.partition('::')
    return (f'<div class="pill anim" style="border-color:rgba(78,214,160,.5);background:rgba(78,214,160,.06)">{esc(pill or "Ghi nhớ")}</div>'
            f'<div class="bx anim" style="top:620px"><div class="take"><div class="ki">💡</div><div class="kt">{esc(t)}</div><div class="kd">{esc(d)}</div></div></div>')

def loop(pill, a):
    it = (_items(a) + ['', '', '', ''])[:4]; pos = ['left:50%;top:0;transform:translateX(-50%)', 'right:0;top:50%;transform:translateY(-50%)', 'left:50%;bottom:0;transform:translateX(-50%)', 'left:0;top:50%;transform:translateY(-50%)']
    nds = ''.join(f'<div class="nd anim" style="{pos[i]}"><div class="n">0{i+1}</div><div class="t">{esc(it[i])}</div></div>' for i in range(4))
    return _pill(pill) + f'<div class="bx" style="top:560px;height:800px"><div style="position:relative;height:800px"><div class="ring"></div><div class="ctr anim">while<b>(chưa xong)</b></div>{nds}</div></div>'

def flow(pill, a):
    it = _items(a); parts = []
    for i, x in enumerate(it):
        e, l = _emoji(x); parts.append(f'<div class="fnode anim"><span class="fi">{e}</span>{esc(l)}</div>')
        if i < len(it) - 1: parts.append('<div class="farr anim">→</div>')
    return _pill(pill) + f'<div class="bx" style="top:740px"><div class="flow">{"".join(parts)}</div></div>'

def steps(pill, a):
    rows = ''.join(f'<div class="rowit anim"><div class="rico">{i+1}</div><div class="rtx">{esc(t)}{f"<small>{esc(s)}</small>" if s else ""}</div></div>'
                   for i, it in enumerate(_items(a)) for t, s in [(it.split("::") + [""])[:2]])
    return _pill(pill) + f'<div class="bx" style="top:600px">{rows}</div>'

def countdown(pill, a):
    rows = ''.join(f'<div class="item anim"><div class="bn">0{i+1}</div><div class="bt">{esc(t)}{f"<small>{esc(s)}</small>" if s else ""}</div></div>'
                   for i, it in enumerate(_items(a)) for t, s in [(it.split("::") + [""])[:2]])
    return _pill(pill) + f'<div class="bx" style="top:640px"><div class="cd3">{rows}</div></div>'

def checklist(pill, a):
    rows = ''.join(f'<div class="rowit anim"><div class="rico g">✓</div><div class="rtx">{esc(x)}</div></div>' for x in _items(a))
    return _pill(pill) + f'<div class="bx" style="top:620px">{rows}</div>'

def timeline(pill, a):
    rows = ''
    for it in _items(a):
        f = it.split('::'); yr, ti, de = (f + ['', '', ''])[:3]; hot = 'hot' if (len(f) > 3 and 'hot' in f[3]) else ''
        rows += f'<div class="tlrow {hot} anim"><div class="tldot"></div><div class="tlyr">{esc(yr)}</div><div class="tlti {"em" if hot else ""}">{esc(ti)}</div><div class="tlde">{esc(de)}</div></div>'
    return _pill(pill) + f'<div class="bx" style="top:560px;left:110px">{rows}</div>'

def hub(pill, a):
    center, _, sp = a.partition('>>'); it = (_items(sp) + ['', '', '', ''])[:4]
    pos = ['left:0;top:60px', 'right:0;top:60px', 'left:0;bottom:60px', 'right:0;bottom:60px']
    sps = ''.join(f'<div class="spoke anim" style="{pos[i]}">{esc(it[i])}</div>' for i in range(4))
    return _pill(pill) + f'<div class="bx" style="top:600px;height:760px"><div style="position:relative;height:760px"><div class="hub anim">{esc(center)}</div>{sps}</div></div>'

def formula(pill, a):
    body, _, res = a.partition('>>'); it = _items(body); parts = []
    for i, x in enumerate(it):
        e, l = _emoji(x); parts.append(f'<div class="fbox anim"><div class="ico">{e}</div><div class="lb">{esc(l)}</div></div>')
        if i < len(it) - 1: parts.append('<div class="plus anim">+</div>')
    return (_pill(pill) + f'<div class="bx" style="top:620px"><div class="flow" style="gap:22px">{"".join(parts)}</div>'
            f'<div class="anim" style="text-align:center;font-size:60px;color:var(--cyan);margin:22px 0">↓</div>'
            f'<div class="res anim">{grad(res.strip())}</div></div>')

def terminal(pill, a):
    cmd, _, sub = a.partition('::')
    return (_pill(pill) + '<div class="bx anim" style="top:640px"><div class="term"><div class="bar2"><span class="dt" style="background:#FF5F57"></span><span class="dt" style="background:#FEBC2E"></span><span class="dt" style="background:#28C840"></span></div>'
            f'<div class="body"><span class="pr">&gt; </span><span class="cm">{esc(cmd)}</span><span class="cur">▋</span></div></div>'
            + (f'<div class="sub anim" style="margin-top:30px">{esc(sub)}</div>' if sub else '') + '</div>')

def progress(pill, a):
    label, pct, sub = (a.split('::') + ['', '', ''])[:3]
    return (_pill(pill) + '<div class="bx" style="top:660px">'
            f'<div class="anim" style="display:flex;justify-content:space-between;font-family:\'Space Grotesk\';font-weight:700;font-size:44px;margin-bottom:20px"><span>{esc(label)}</span><span class="em">{esc(pct)}%</span></div>'
            f'<div class="bar anim"><div class="fill" style="width:{esc(pct)}%"></div></div>'
            + (f'<div class="sub anim" style="margin-top:30px">{esc(sub)}</div>' if sub else '') + '</div>')

def bars(pill, a):
    it = _items(a); cols = ''
    for i, x in enumerate(it):
        cap, lb, h = (x.split('::') + ['', '', '100'])[:3]
        cols += f'<div class="barcol {"v" if i else ""} anim" style="height:{esc(h)}px"><div class="cap">{esc(cap)}</div><div class="lb">{esc(lb)}</div></div>'
    return _pill(pill) + f'<div class="bx" style="top:760px"><div class="chart">{cols}</div></div>'

def donut(pill, a):
    pct, inner, tail = (a.split('::') + ['', '', ''])[:3]
    return (_pill(pill) + f'<div class="bx" style="top:560px"><div class="donut anim" style="background:conic-gradient(var(--cyan) 0% {esc(pct)}%, rgba(130,140,180,.18) {esc(pct)}% 100%)">'
            f'<div class="hole"><div class="pct em">{esc(pct)}%</div><div class="sub" style="font-size:30px">{esc(inner)}</div></div></div>'
            f'<div class="head anim" style="position:static;margin-top:40px;text-align:center;font-size:54px">{grad(tail)}</div></div>')

def orbit(pill, a):
    core, _, tg = a.partition('>>'); it = (_items(tg) + ['', '', ''])[:3]
    pos = ['left:60px;top:120px', 'right:40px;top:220px', 'left:120px;bottom:140px']
    tags = ''.join(f'<div class="otag anim" style="{pos[i]}">{esc(it[i])}</div>' for i in range(3))
    return _pill(pill) + f'<div class="bx" style="top:600px;height:720px"><div class="orbit" style="position:relative;height:720px"><div class="r1 anim"></div><div class="r2 anim"></div><div class="core anim">{core.strip() or "🤖"}</div>{tags}</div></div>'

def chat(pill, a):
    u, _, ag = a.partition('::')
    return (_pill(pill) + '<div class="bx" style="top:600px">'
            f'<div class="msg u anim"><div class="who">BẠN</div>{esc(u)}</div>'
            f'<div class="msg a anim"><div class="who">AGENT</div>{esc(ag)}</div></div>')

def quote(pill, a):
    txt, _, by = a.partition('::')
    return (_pill(pill) + '<div class="bx" style="top:560px">'
            f'<div class="qmark anim">“</div><div class="qt anim">{grad(txt)}</div>'
            + (f'<div class="qby anim">— {esc(by)}</div>' if by else '') + '</div>')

def funnel(pill, a):
    it = _items(a); n = len(it); sts = ''
    for i, x in enumerate(it):
        w = 760 - i * (500 // max(n - 1, 1)); sts += f'<div class="st anim" style="width:{w}px">{esc(x)}</div>'
    return _pill(pill) + f'<div class="bx" style="top:660px"><div class="funnel">{sts}</div></div>'

def tags(pill, a):
    it = _items(a); head = it[0] if it else ''; rest = it[1:]
    tg = ''.join(f'<div class="tg {"v" if i%2 else ""}">{esc(x)}</div>' for i, x in enumerate(rest))
    return (_pill(pill) + f'<div class="head anim" style="top:472px;font-size:62px">{grad(head)}</div>'
            f'<div class="bx anim" style="top:700px"><div class="tags">{tg}</div></div>')

def ranking(pill, a):
    rows = ''
    for i, it in enumerate(_items(a)):
        nm, w = (it.split('::') + ['200'])[:2]
        rows += f'<div class="rk anim"><div class="pos">0{i+1}</div><div class="nm">{esc(nm)}</div><div class="b3" style="width:{esc(w)}px"></div></div>'
    return _pill(pill) + f'<div class="bx" style="top:640px">{rows}</div>'

def definition(pill, a):
    term, ph, mean = (a.split('::') + ['', '', ''])[:3]
    return (_pill(pill) + '<div class="bx anim" style="top:620px"><div class="def">'
            f'<div class="term">{esc(term)}</div><div class="ph">/ {esc(ph)} /</div><div class="mean">{esc(mean)}</div></div></div>')

def split2(pill, a):
    b, _, af = a.partition('::')
    return (_pill(pill) + '<div class="bx anim" style="top:640px"><div class="split2">'
            f'<div class="h l"><div class="hl">Trước</div><div class="ht">{esc(b)}</div></div>'
            f'<div class="h r"><div class="hl">Sau</div><div class="ht">{esc(af)}</div></div></div></div>')

def matrix(pill, a):
    q = (a.split('::') + ['', '', '', ''])[:4]  # q1 q2 q3 (mờ) · q4 (nổi)
    cells = ''.join(f'<div class="q q{i+1} anim">{esc(q[i])}</div>' for i in range(4))
    return _pill(pill) + f'<div class="bx" style="top:600px"><div class="mx">{cells}</div></div>'

REG = {"STAT": stat, "TRANSFORM": transform, "TRIO": trio, "COMPARE": compare, "PROSCONS": proscons,
       "GRID": grid, "CALLOUT": callout, "TAKEAWAY": takeaway, "LOOP": loop, "FLOW": flow, "STEPS": steps,
       "COUNTDOWN": countdown, "CHECKLIST": checklist, "TIMELINE": timeline, "HUB": hub, "FORMULA": formula,
       "TERMINAL": terminal, "PROGRESS": progress, "BARS": bars, "DONUT": donut, "ORBIT": orbit, "CHAT": chat,
       "QUOTE": quote, "FUNNEL": funnel, "TAGS": tags, "RANKING": ranking, "DEFINITION": definition,
       "SPLIT": split2, "MATRIX": matrix, "BIGTEXT": bigtext}

def render(typ, pill, args, sentence='', variant=0):
    typ = (typ or '').strip().upper()
    if typ in ("TEXT", "", None): return text_slide(sentence, pill, variant)
    fn = REG.get(typ)
    if not fn: return text_slide(sentence, pill, variant)
    try: return fn(pill, args)
    except Exception: return text_slide(sentence, pill, variant)
