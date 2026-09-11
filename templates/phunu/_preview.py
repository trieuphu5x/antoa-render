#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PREVIEW ẢNH TĨNH mẫu phunu — render TỪNG cảnh ra PNG bằng Chrome (KHÔNG dựng video, KHÔNG TTS).
Dùng để Boss duyệt bố cục/cỡ chữ nhanh trước khi render video thật.
Chạy: python3 _preview.py
Ra: _preview/*.png (1080x1920)
"""
import os, sys, subprocess, html as _html

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build as B   # tái dùng renderers + COLORS (import an toàn: có guard __main__)

ASSETS = os.path.join(HERE, "assets")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT = os.path.join(HERE, "_preview")
os.makedirs(OUT, exist_ok=True)

PALETTE = sys.argv[1] if len(sys.argv) > 1 else "kem-cam"
css = open(os.path.join(ASSETS, "style.css")).read() + "\n:root{ " + B.COLORS.get(PALETTE, B.COLORS["kem-cam"]) + " }"

MILESTONE, TOPIC, CHANNEL = "MORNING RITUAL", "morning habits online sellers", "KHỞI SỰ"
B._CHANNEL = CHANNEL


def doc(inner):
    return f'''<!doctype html><html lang="vi"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=1080, height=1920"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;0,900;1,600&family=Be+Vietnam+Pro:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=block" rel="stylesheet"/>
<style>{css}</style></head><body>
<div id="root" data-width="1080" data-height="1920">
  <div class="layer paper"></div>
  <div class="layer grain"><svg><filter id="gr"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="1080" height="1920" filter="url(#gr)"/></svg></div>
  <div class="layer"><div class="orn">&amp;</div></div>
  <div class="layer frame"><div class="rt"></div><div class="rb"></div><div class="mast">✳ {_html.escape(MILESTONE)}</div><div class="mr">{_html.escape(TOPIC)}</div><div class="ft">{_html.escape(CHANNEL)}</div></div>
  <div class="scene">{inner}</div>
</div></body></html>'''


# Bộ cảnh đại diện: 2 cảnh CHỮ (kiểu intro) + nhiều KIỂU ẢNH (cỡ chữ d-sm như Thói quen 2)
SCENES = [
    ("1_intro", B.r_intro({"kick": "MORNING", "disp": ["*5 thói quen sáng*", "của người", "bán hàng online", "thành công"],
                           "lede": "Những phút đầu tiên quyết định cả ngày kinh doanh của bạn."}, "#s")[0]),
    ("2_text", B.r_intro({"kick": "FOCUS", "disp": ["Thói quen 3:", "*Xem lại đơn hàng*", "*& tin nhắn khách*"],
                          "lede": "Kiểm tra nhanh, lên kế hoạch ngay."}, "#s", top=560)[0]),   # CHỮ (không ảnh) → kiểu intro, dịch xuống
    ("3_hero", B.r_image({"style": "hero", "kick": "MORNING", "disp": ["Thói quen 1:", "*Thức dậy sớm*", "trước thị trường"]},
                         "#s", "im3", ["img02.jpg"])[0]),
    ("4_card", B.r_media({"side": "left", "kick": "MORNING", "disp": ["Thói quen 2:", "*Uống nước & ngồi yên*", "5-10 phút đầu"],
                          "lede": "Làm sạch cơ thể và tâm trí."}, "#s", "m4", "img03.jpg")[0]),
    ("5_film", B.r_image({"style": "film", "kick": "WORK", "disp": ["Thói quen 4:", "*Tối ưu AI & tự động hoá*"],
                          "caps": ["Dashboard tự động", "Bán hàng mọi lúc"]}, "#s", "im5", ["img04.jpg", "img05.jpg"])[0]),
    ("6_duo", B.r_image({"style": "duo", "kick": "MINDSET", "disp": ["Thói quen 5:", "*Nghỉ đúng lúc*"],
                         "lede": "Bền sức mới đi đường dài."}, "#s", "im6", ["img06.jpg"])[0]),
    ("7_arch", B.r_image({"style": "arch", "kick": "GROWTH", "disp": ["Thói quen 6:", "*Học mỗi ngày*"],
                          "lede": "Mỗi sáng một điều mới."}, "#s", "im7", ["img07.jpg"])[0]),
    ("8_circles", B.r_image({"style": "circles", "kick": "ENERGY", "disp": ["Thói quen 7:", "*Vận động nhẹ*"]},
                            "#s", "im8", ["img08.jpg", "img09.jpg"])[0]),
]

for name, inner in SCENES:
    hp = os.path.join(HERE, f"_pv_{name}.html")   # đặt ở template root để 'assets/img/..' phân giải đúng
    open(hp, "w", encoding="utf-8").write(doc(inner))
    png = os.path.join(OUT, f"{name}.png")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    "--force-device-scale-factor=1", "--window-size=1080,1920",
                    f"--screenshot={png}", "--virtual-time-budget=6000", f"file://{hp}"],
                   check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    os.remove(hp)
    print("OK", png)
