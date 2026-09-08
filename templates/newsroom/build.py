#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
dung.py — MÁY DỰNG (auto-builder) cho chuỗi "AI Có Gì Mới" (ai-co-gi-moi).
Đầu vào: 1 file JSON mô tả video (mast, nguồn, danh sách cảnh + lời đọc).
Máy tự: edge-tts từng cảnh → đo độ dài → canh giờ (audio + hold) → ghép nhạc nền + tiếng xẹt
        → sinh index.html hợp lệ HyperFrames (look "tin nóng", safe zone x:96–906) → (tuỳ chọn) render.

Design: builder KHÔNG tự bịa bố cục — mỗi cảnh Claude cấp sẵn 'inner' (HTML trong cảnh, đặt top theo
safe zone). Builder chỉ lo timing + audio + sfx + bgm + khung + GSAP. Giữ quyền thiết kế cho Claude,
builder an toàn/đơn giản → tái dùng cho mọi video (batch).

Dùng:
    python3 lib/dung.py <video_dir> <spec.json> [--render]
spec.json:
{
 "mast_a":"TIN", "mast_b":"KINH DOANH", "date":"20/07", "source":"VnExpress Kinh doanh",
 "voice":"vi-VN-HoaiMyNeural", "rate":"-5%", "hold":0.7, "lead":0.2, "outro_dur":3.5,
 "scenes":[ {"id":"s1","inner":"<div class=\"wrap\" ...>...</div>", "vo":"lời đọc..."},
            ... , {"id":"sO","inner":"<div class=\"wrap\" ...>...</div>"} ]  # cảnh cuối có thể không 'vo'
}
"""
import sys, os, json, asyncio, subprocess
import edge_tts

FFPROBE = os.environ.get("FFPROBE", "ffprobe")
HERE = os.path.dirname(os.path.abspath(__file__))
# GÓI TỰ CHỨA: mọi asset nằm trong templates/newsroom/assets (bê từ studio, không phụ thuộc ngoài)
ASSETS = os.path.join(HERE, "assets")
BGM_SRC = os.path.join(ASSETS, "bgm-electronic-pixabay.mp3")


def dur(path):
    out = subprocess.run([FFPROBE, "-v", "quiet", "-show_entries", "format=duration",
                          "-of", "csv=p=0", path], capture_output=True, text=True)
    try:
        return round(float(out.stdout.strip()), 3)
    except Exception:
        return 0.0


async def _tts(text, voice, rate, out):
    await edge_tts.Communicate(text, voice, rate=rate).save(out)


def make_whoosh(path):
    # "swoosh" chuyển cảnh nổi rõ: white noise 0.28s, bandpass, fade in nhanh + out mượt
    subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "anoisesrc=d=0.28:c=white:a=0.9",
                    "-af", "highpass=f=350,lowpass=f=7000,afade=t=in:st=0:d=0.04,afade=t=out:st=0.10:d=0.18",
                    "-ar", "44100", path], capture_output=True)


HEAD = '''<!doctype html>
<html lang="vi"><head><meta charset="UTF-8" /><meta name="viewport" content="width=1080, height=1920" />
<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
:root{ --bg1:#1E2A4A; --bg2:#131C34; --bg3:#0A0F1E; --ink:#F3F5FA; --mut:#9AA7C2;
       --red:#FF3B30; --amber:#FFC53D; --onA:#ffffff; --onB:#0B1020; }  /* mood mặc định = hot */
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;overflow:hidden;background:var(--bg3);font-family:"Be Vietnam Pro",sans-serif;color:var(--ink)}
#root{position:relative;width:1080px;height:1920px}
.layer{position:absolute;inset:0}
.bg{background:radial-gradient(130% 85% at 50% 6%, var(--bg1) 0%, var(--bg2) 45%, var(--bg3) 100%)}
.vig{background:radial-gradient(120% 60% at 50% 50%, transparent 60%, rgba(0,0,0,.5) 100%)}
.mast{position:absolute;top:170px;left:96px;display:flex;align-items:center;gap:16px;font-weight:800;letter-spacing:.02em;font-size:34px}
.mast .dot{width:20px;height:20px;border-radius:50%;background:var(--red);box-shadow:0 0 0 6px rgba(255,59,48,.22)}
.mast .tag{color:var(--ink)} .mast .tag b{color:var(--red)}
.mr{position:absolute;top:178px;right:174px;font-family:"JetBrains Mono",monospace;font-size:24px;color:var(--mut);letter-spacing:.04em}
.src{position:absolute;top:1560px;left:96px;font-family:"JetBrains Mono",monospace;font-size:22px;color:var(--mut);letter-spacing:.03em}
.credit{position:absolute;top:1598px;left:96px;font-family:"JetBrains Mono",monospace;font-size:19px;color:var(--mut);opacity:.72;letter-spacing:.02em}
.pbar{position:absolute;left:0;bottom:0;height:10px;width:1080px;background:rgba(255,255,255,.10)}
.pfill{position:absolute;left:0;bottom:0;height:10px;width:1080px;background:linear-gradient(90deg,var(--red),var(--amber));transform-origin:left center}
.scene{position:absolute;inset:0}
.wrap{position:absolute;left:96px;right:174px}
.kick{display:inline-block;font-weight:800;font-size:28px;letter-spacing:.22em;text-transform:uppercase;color:var(--onB);background:var(--amber);padding:8px 20px;border-radius:6px}
.kick.red{background:var(--red);color:var(--onA)}
.head{font-family:"Anton",sans-serif;font-weight:400;line-height:1.22;letter-spacing:.005em;text-transform:uppercase}
.head br{line-height:1.35}
.h-xl{font-size:118px}.h-lg{font-size:96px}.h-md{font-size:76px}
.em{color:var(--amber)} .emr{color:var(--red)}
.lede{font-size:39px;line-height:1.5;color:var(--mut);font-weight:500}.lede b{color:var(--ink);font-weight:700}
.shot{position:absolute;left:96px;right:174px;background:#fff;border-radius:20px;padding:20px;box-shadow:0 30px 70px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.5)}
.shot img{display:block;width:770px;border-radius:10px}
.shot .tab{position:absolute;top:-38px;left:24px;background:var(--red);color:#fff;font-family:"JetBrains Mono",monospace;font-size:22px;font-weight:700;padding:8px 18px;border-radius:8px 8px 0 0;letter-spacing:.04em}
.callout{position:absolute;left:96px;right:174px}
.callout .big{font-family:"Anton",sans-serif;font-size:74px;line-height:1.2;text-transform:uppercase}
/* BỐ CỤC THEO TỪNG CẢNH (builder tự chọn):
   - Cảnh CHỮ THUẦN (stat/câu hỏi/CTA/outro) = .mid mặc định → CĂN GIỮA (punchy, không mồ côi).
   - Cảnh CÓ ẢNH (.card) = .mid.split → bất đối xứng: nội dung TRÁI + kicker PHẢI
     (đối trọng với tab của thẻ ảnh bên trái). Builder tự thêm .split khi cảnh có .card. */
.mid{position:absolute;left:96px;right:174px;top:255px;bottom:365px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:38px}
.mid .lede{max-width:840px}
.mid .head{max-width:100%}
.mid.split{align-items:flex-start;text-align:left;gap:40px}
.mid.split .kick{align-self:flex-end}           /* kicker lệch phải — chỉ khi có ảnh làm đối trọng */
.mid.split .lede{max-width:770px}
.card{position:relative;background:#fff;border-radius:22px;padding:20px;box-shadow:0 30px 70px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.5)}
.card img{display:block;border-radius:12px}
.card .tab{position:absolute;top:-38px;left:24px;background:var(--red);color:#fff;font-family:"JetBrains Mono",monospace;font-size:22px;font-weight:700;padding:8px 18px;border-radius:8px 8px 0 0;letter-spacing:.04em}
.big{font-family:"Anton",sans-serif;font-size:62px;line-height:1.18;text-transform:uppercase}
.chip{display:inline-flex;gap:14px;align-items:baseline;background:var(--bg2);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:22px 30px;font-size:38px;font-weight:700;margin:10px 14px 0 0}
.chip .n{font-family:"Anton",sans-serif;font-size:56px;color:var(--amber);line-height:.8}
.brand{font-family:"Anton",sans-serif;font-size:92px;text-transform:uppercase;color:var(--red)}.brand .emr{color:var(--red)}
.stat{font-family:"Anton",sans-serif;font-size:300px;line-height:.86;color:var(--amber)}
</style></head><body>
'''

# ===== THEME QUẢNG CÁO (ad) — ngôn ngữ hình thương mại, KHÁC hẳn tin tức =====
HEAD_AD = '''<!doctype html>
<html lang="vi"><head><meta charset="UTF-8" /><meta name="viewport" content="width=1080, height=1920" />
<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Be+Vietnam+Pro:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
:root{ --bg:#2A0E3A; --ink:#FFFFFF; --mut:#E7CFF2; --pink:#FF2E7E; --gold:#FFD23F; --orange:#FF7A1A; --mint:#28E0A8; }
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;overflow:hidden;background:var(--bg);font-family:"Be Vietnam Pro",sans-serif;color:var(--ink)}
#root{position:relative;width:1080px;height:1920px}
.layer{position:absolute;inset:0}
.bg{background:radial-gradient(90% 60% at 50% 10%, #5A1B6E 0%, #37124A 45%, #1B0726 100%)}
.vig{background:radial-gradient(120% 80% at 50% 42%, rgba(255,122,26,.16) 0%, transparent 55%)}
/* chrome quảng cáo: brand chip + ribbon SALE (KHÔNG masthead tin, KHÔNG 'Nguồn') */
.brandchip{position:absolute;top:150px;left:96px;display:flex;align-items:center;gap:14px;font-weight:900;font-size:38px;letter-spacing:.02em}
.brandchip .sq{width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,var(--pink),var(--orange))}
.brandchip b{color:var(--gold)}
.ribbon{position:absolute;top:150px;right:96px;background:linear-gradient(135deg,var(--pink),var(--orange));color:#fff;font-family:"Anton",sans-serif;font-size:40px;padding:12px 26px;border-radius:16px;box-shadow:0 12px 34px rgba(255,46,126,.5);transform:rotate(3deg)}
.pbar{position:absolute;left:0;bottom:0;height:12px;width:1080px;background:rgba(255,255,255,.12)}
.pfill{position:absolute;left:0;bottom:0;height:12px;width:1080px;background:linear-gradient(90deg,var(--pink),var(--gold));transform-origin:left center}
.scene{position:absolute;inset:0}
.wrap{position:absolute;left:96px;right:96px}
.kick{display:inline-block;font-weight:900;font-size:30px;letter-spacing:.14em;text-transform:uppercase;color:#2A0E3A;background:var(--gold);padding:10px 24px;border-radius:999px}
.kick.red{background:linear-gradient(135deg,var(--pink),var(--orange));color:#fff}
.head{font-family:"Anton",sans-serif;font-weight:400;line-height:1.0;letter-spacing:.005em;text-transform:uppercase}
.h-xl{font-size:150px}.h-lg{font-size:120px}.h-md{font-size:94px}
.em{color:var(--gold)} .emr{color:var(--pink)}
.lede{font-size:41px;line-height:1.4;color:var(--mut);font-weight:600}.lede b{color:#fff;font-weight:800}
/* card ảnh sản phẩm — nổi bật trên nền tím, viền gradient */
.shot{position:absolute;background:#fff;border-radius:28px;padding:16px;box-shadow:0 26px 70px rgba(0,0,0,.5), 0 0 0 5px rgba(255,210,63,.9)}
.shot img{display:block;width:100%;border-radius:16px}
.callout{position:absolute;left:96px;right:96px}
.callout .big{font-family:"Anton",sans-serif;font-size:80px;line-height:1.02;text-transform:uppercase}
/* thành phần bán hàng */
.price{font-family:"Anton",sans-serif;font-size:210px;line-height:.9;color:var(--gold);text-shadow:0 8px 30px rgba(255,210,63,.35)}
.price .cur{font-size:96px;vertical-align:super}
.old{font-size:44px;color:#B79CC6;text-decoration:line-through;font-weight:700}
.off{display:inline-block;background:var(--pink);color:#fff;font-family:"Anton",sans-serif;font-size:52px;padding:6px 22px;border-radius:14px;transform:rotate(-3deg)}
.stars{font-size:96px;color:var(--gold);letter-spacing:8px}
.cta{display:inline-block;font-family:"Anton",sans-serif;font-size:66px;color:#2A0E3A;background:linear-gradient(135deg,var(--gold),var(--orange));padding:22px 54px;border-radius:999px;box-shadow:0 16px 44px rgba(255,122,26,.55);text-transform:uppercase}
.chip{display:inline-flex;gap:12px;align-items:center;background:rgba(255,255,255,.1);border:2px solid rgba(255,210,63,.5);border-radius:999px;padding:16px 30px;font-size:40px;font-weight:800;margin:10px 12px 0 0}
.brand{font-family:"Anton",sans-serif;font-size:100px;text-transform:uppercase}.brand .emr{color:var(--pink)}
.stat{font-family:"Anton",sans-serif;font-size:300px;line-height:.86;color:var(--gold)}
</style></head><body>
'''


# 5 BỘ MÀU theo MOOD (cùng 1 layout — chỉ đổi biến màu). spec["palette"] chọn 1.
PALETTES = {
    # chấn động / drama / an ninh / hack  → đỏ trên navy (mặc định)
    "hot":      {"--bg1": "#1E2A4A", "--bg2": "#131C34", "--bg3": "#0A0F1E", "--red": "#FF3B30", "--amber": "#FFC53D", "--onA": "#ffffff", "--onB": "#0B1020"},
    # ra mắt / model mới / sản phẩm  → cyan trên xanh mực
    "launch":   {"--bg1": "#123A60", "--bg2": "#0A2038", "--bg3": "#04101F", "--red": "#22C9F2", "--amber": "#86E4FF", "--onA": "#05202F", "--onB": "#05202F"},
    # sáng tạo / phim–ảnh AI / nghệ thuật  → magenta trên tím than
    "creative": {"--bg1": "#3E1456", "--bg2": "#280C42", "--bg3": "#140724", "--red": "#FF2E7E", "--amber": "#FFD23F", "--onA": "#ffffff", "--onB": "#2A0E3A"},
    # kinh doanh / thị trường / đầu tư  → mint+vàng trên xanh rêu
    "biz":      {"--bg1": "#0C4234", "--bg2": "#082A20", "--bg3": "#04140E", "--red": "#22E0A0", "--amber": "#FFD23F", "--onA": "#04140E", "--onB": "#04140E"},
    # nghiên cứu / khám phá / "wow"  → hổ phách+tím trên chàm indigo
    "research": {"--bg1": "#282858", "--bg2": "#181840", "--bg3": "#0B0B26", "--red": "#FFB020", "--amber": "#B79CF6", "--onA": "#241203", "--onB": "#180A2E"},
}


def write_caption(video_dir, cap, spec):
    """Sinh CAPTION PACK cạnh video (cho khâu đăng đọc): caption.json (máy) + caption.md (người)."""
    tags = cap.get("hashtags", [])
    if isinstance(tags, str):
        tags = tags.split()
    tagline = " ".join(t if t.startswith("#") else "#" + t for t in tags)
    title = (cap.get("title") or "").strip()
    desc = (cap.get("desc") or "").strip()
    full = title
    if desc:
        full += "\n\n" + desc
    if tagline:
        full += "\n\n" + tagline
    full = full.strip()
    data = {"title": title, "desc": desc, "hashtags": tags, "post_time": cap.get("post_time", ""),
            "caption_full": full, "source": spec.get("source", "")}
    with open(os.path.join(video_dir, "caption.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    md = (f"# Caption — {os.path.basename(os.path.normpath(video_dir))}\n\n"
          f"**Dòng đầu / tiêu đề đăng:** {title}\n\n"
          f"**CAPTION ĐẦY ĐỦ (copy dán cả 3 nền):**\n```\n{full}\n```\n\n"
          f"**Giờ đăng gợi ý:** {cap.get('post_time', '')}  ·  **Nguồn:** {spec.get('source', '')}\n")
    open(os.path.join(video_dir, "caption.md"), "w", encoding="utf-8").write(md)


def build(video_dir, spec):
    voice = spec.get("voice", "vi-VN-HoaiMyNeural")
    rate = spec.get("rate", "-5%")
    hold = spec.get("hold", 0.7)
    lead = spec.get("lead", 0.2)
    outro_dur = spec.get("outro_dur", 3.5)
    audio_dir = os.path.join(video_dir, "audio")
    os.makedirs(audio_dir, exist_ok=True)

    # engine TTS: edge (mặc định, free) hoặc vbee (giọng chuyên nghiệp)
    tts_engine = spec.get("tts", "edge")
    vbee = None
    vn = None
    if tts_engine == "vbee":
        sys.path.insert(0, HERE)
        import vbee_tts as vbee
    elif tts_engine == "vieneu":
        sys.path.insert(0, HERE)
        import vieneu_tts as vn

    # 1) TTS + đo độ dài + tính mốc
    t = 0.0
    scenes = []
    n = 0
    for sc in spec["scenes"]:
        vo = sc.get("vo")
        if vo:
            n += 1
            mp3 = os.path.join(audio_dir, f"s{n}.mp3")
            if os.path.exists(mp3) and not spec.get("force_tts"):
                pass  # tái dùng audio đã tạo (khỏi gọi lại Vbee/edge)
            elif vbee:
                vbee.synth(vo, mp3, spec.get("speed", "1.0"))
            elif vn:
                vn.synth(vo, mp3, os.environ.get("VIENEU_VOICE"))
            else:
                asyncio.run(_tts(vo, voice, rate, mp3))
            d = dur(mp3)
            sdur = round(d + hold, 3)
            scenes.append({**sc, "start": round(t, 3), "sdur": sdur,
                           "audio": f"s{n}.mp3", "astart": round(t + lead, 3), "adur": d})
        else:
            sdur = outro_dur
            scenes.append({**sc, "start": round(t, 3), "sdur": sdur, "audio": None})
        t = round(t + sdur, 3)
    total = round(t, 3)

    # 2) nhạc + BỘ tiếng chuyển cảnh THẬT (Pixabay) — LUÂN PHIÊN nhiều tiếng cho đỡ nhàm
    sfx_pool = os.path.join(ASSETS, "sfx")  # kho SFX đóng gói trong mẫu
    sfx_list = spec.get("sfx_list", [f"sfx{i}.mp3" for i in range(1, 6)])
    sfx_files = []
    for name in sfx_list:
        src = name if os.path.isabs(name) else os.path.join(sfx_pool, name)
        if os.path.exists(src):
            base = os.path.basename(src)
            subprocess.run(["cp", src, os.path.join(audio_dir, base)])
            sfx_files.append((base, dur(os.path.join(audio_dir, base)) or 0.6))
    sfx_vol = spec.get("sfx_vol", 0.5)
    # nhạc nền: LUÂN PHIÊN kho nhạc — ưu tiên kho riêng kênh (_assets/music), nếu không có → kho ĐÓNG GÓI trong mẫu
    # (assets/music, nhiều track tin tức). Seed xoay = spec["bgm_seed"] (tiêu đề, do render.mjs cấp) vì WORK dir cố định.
    music_credit = ""  # ghi nguồn nhạc THEO TRACK THẬT — chỉ nhạc CC BY (inc-*) mới cần; Pixabay để trống
    bgm_dst = os.path.join(audio_dir, "bgm.mp3")
    if not os.path.exists(bgm_dst):
        ch_music = os.path.join(os.path.dirname(os.path.abspath(video_dir)), "_assets", "music")
        pack_music = os.path.join(ASSETS, "music")
        music_dir = ch_music if os.path.isdir(ch_music) else pack_music
        tracks = sorted(f for f in os.listdir(music_dir)) if os.path.isdir(music_dir) else []
        tracks = [f for f in tracks if f.lower().endswith(".mp3")]
        seed = str(spec.get("bgm_seed") or os.path.basename(os.path.normpath(video_dir)))
        if spec.get("bgm") and os.path.exists(os.path.join(music_dir, spec["bgm"])):
            src = os.path.join(music_dir, spec["bgm"])
        elif tracks:
            _h = 2166136261
            for _c in seed:
                _h = ((_h ^ ord(_c)) * 16777619) & 0xFFFFFFFF  # FNV-1a → phân bố đều (sum(ord) tiếng Việt bị cụm)
            idx = _h % len(tracks)                             # xoay theo tiêu đề → mỗi video 1 nhạc khác
            src = os.path.join(music_dir, tracks[idx])
        else:
            src = BGM_SRC  # fallback dùng chung
        if os.path.exists(src):
            subprocess.run(["cp", src, bgm_dst])
            if os.path.basename(src).lower().startswith("inc-"):
                music_credit = "Kevin MacLeod (incompetech.com) · CC BY 4.0"
    # ghi credit nhạc ra file để render.mjs nối vào caption (đồng bộ với credit trên video)
    open(os.path.join(video_dir, "music_credit.txt"), "w", encoding="utf-8").write(music_credit)

    # 3) HTML
    is_ad = spec.get("theme") == "ad"
    html = [HEAD_AD if is_ad else HEAD]
    # đổi MOOD MÀU (cùng layout) — override biến :root
    pal = PALETTES.get(spec.get("palette", ""))
    if pal and not is_ad:
        html.append("<style>:root{" + "".join(f"{k}:{v};" for k, v in pal.items()) + "}</style>")
    html.append(f'<div id="root" data-composition-id="main" data-start="0" data-duration="{total}" data-width="1080" data-height="1920">')
    html.append(f'<div class="layer bg clip" data-start="0" data-duration="{total}" data-track-index="0"></div>')
    html.append(f'<div class="layer vig clip" data-start="0" data-duration="{total}" data-track-index="1"></div>')
    if is_ad:
        chrome = (f'<div class="brandchip"><span class="sq"></span>{spec.get("mast_a","")} <b>{spec.get("mast_b","")}</b></div>'
                  + (f'<div class="ribbon">{spec["ribbon"]}</div>' if spec.get("ribbon") else '')
                  + '<div class="pbar"></div><div class="pfill" id="pfill"></div>')
    else:
        _mr = spec.get("mr", "")   # góc trên-phải ĐỂ TRỐNG (loại tin đã ở góc trái); KHÔNG lặp nguồn, KHÔNG để ngày
        _credit_html = f'<div class="credit">🎵 Nhạc: {music_credit}</div>' if music_credit else ''
        chrome = (f'<div class="mast"><span class="dot"></span><span class="tag">{spec.get("mast_a","TIN")} <b>{spec.get("mast_b","KINH DOANH")}</b></span></div>'
                  + (f'<div class="mr">{_mr}</div>' if _mr else '')
                  + f'<div class="src">Nguồn: {spec.get("source","")}</div>'
                  + _credit_html
                  + '<div class="pbar"></div><div class="pfill" id="pfill"></div>')
    html.append(f'<div class="layer clip" data-start="0" data-duration="{total}" data-track-index="2">{chrome}</div>')
    ti = 3
    anims = []
    for sc in scenes:
        inner = sc["inner"]
        # TỰ CHỌN alignment: cảnh có ảnh (.card) → bố cục bất đối xứng (.split); chữ thuần → căn giữa
        if 'class="card' in inner:
            inner = inner.replace('class="mid"', 'class="mid split"', 1)
        html.append(f'<div class="scene clip" id="{sc["id"]}" data-start="{sc["start"]}" data-duration="{sc["sdur"]}" data-track-index="{ti}">{inner}</div>')
        anims.append((sc["id"], round(sc["start"] + 0.15, 3), ('class="shot"' in inner or 'class="card' in inner)))
        ti += 1
    # audio
    aidx = ti
    for sc in scenes:
        if sc["audio"]:
            html.append(f'<audio id="a_{sc["id"]}" src="audio/{sc["audio"]}" data-start="{sc["astart"]}" data-duration="{sc["adur"]}" data-track-index="{aidx}" data-volume="1"></audio>')
            aidx += 1
    html.append(f'<audio id="bgm" src="audio/bgm.mp3" data-start="0" data-duration="{total}" data-track-index="{aidx}" data-volume="0.045"></audio>')
    aidx += 1
    ci = 0
    for k, sc in enumerate(scenes):
        if k == 0 or not sfx_files:
            continue
        fname, fdur = sfx_files[ci % len(sfx_files)]  # LUÂN PHIÊN các tiếng
        ci += 1
        sfx_start = max(0.0, round(sc["start"] - 0.12, 3))  # nổ ngay TRƯỚC cắt cảnh
        html.append(f'<audio id="sfx_{sc["id"]}" src="audio/{fname}" data-start="{sfx_start}" data-duration="{fdur}" data-track-index="{aidx}" data-volume="{sfx_vol}"></audio>')
        aidx += 1
    html.append("</div>")

    # GSAP
    js = ['<script>window.__timelines=window.__timelines||{};var tl=gsap.timeline({paused:true});',
          f'gsap.set("#pfill",{{scaleX:0}});tl.to("#pfill",{{scaleX:1,duration:{total},ease:"none"}},0);',
          'function enter(s,a){tl.from(s+" .anim",{opacity:0,y:42,duration:0.55,ease:"power3.out",stagger:0.11},a);}',
          'function shot(s,a){tl.from(s+" .shot",{opacity:0,y:60,scale:0.92,duration:0.6,ease:"power3.out"},a);}']
    for i, (sid, at, has_shot) in enumerate(anims):
        # CẢNH HOOK (đầu tiên): KHÔNG entrance anim → hiện ĐẦY ĐỦ ngay frame 0
        # (auto-post lấy frame 0 làm thumbnail → thumbnail đẹp, không trống). Các cảnh sau: bình thường.
        if i == 0:
            continue
        js.append(f'enter("#{sid}",{at});')
        if has_shot:
            js.append(f'shot("#{sid}",{round(at+0.35,3)});')
    js.append('window.__timelines["main"]=tl;</script></body></html>')
    html.append("\n".join(js))

    open(os.path.join(video_dir, "index.html"), "w", encoding="utf-8").write("\n".join(html))
    # scaffold configs (copy từ template phu-nu nếu video chưa có)
    for f in ("hyperframes.json", "package.json"):
        if not os.path.exists(os.path.join(video_dir, f)):
            tpl = os.path.join(ASSETS, "_template", f)
            if os.path.exists(tpl):
                subprocess.run(["cp", tpl, os.path.join(video_dir, f)])
    # CAPTION PACK — sinh file cạnh video nếu spec có "caption"
    if spec.get("caption"):
        write_caption(video_dir, spec["caption"], spec)
    return total, len(scenes)


def main():
    video_dir = sys.argv[1]
    spec = json.load(open(sys.argv[2], encoding="utf-8"))
    total, ns = build(video_dir, spec)
    print(f"✓ built {ns} scenes, {total}s → {video_dir}/index.html")
    if "--render" in sys.argv:
        subprocess.run(["npx", "--yes", "hyperframes@0.7.64", "render"], cwd=video_dir)


if __name__ == "__main__":
    main()
