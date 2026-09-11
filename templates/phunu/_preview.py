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


# Bộ cảnh kiểm tra 2 fix: intro/text CANH GIỮA + số lớn TỰ CO (5-10, 24/7)
SCENES = [
    ("1_intro", B.r_intro({"kick": "MORNING", "disp": ["*5 thói quen sáng*", "của người", "bán hàng online", "thành công"],
                           "lede": "Những phút đầu tiên quyết định cả ngày kinh doanh của bạn."}, "#s")[0]),
    ("2_text", B.r_intro({"kick": "FOCUS", "disp": ["Thói quen 3:", "*Xem lại đơn hàng*", "*& tin nhắn khách*"],
                          "lede": "Kiểm tra nhanh, lên kế hoạch ngay."}, "#s")[0]),   # CHỮ → canh giữa
    ("3_stat_range", B.r_stat({"kick": "YÊN TĨNH", "big": "5-10", "suffix": " phút", "disp": ["Sáng sớm mỗi ngày"],
                               "lede": "Làm sạch tâm trí, tiếp nhận năng lượng mới."}, "#s", "st3")[0]),
    ("4_stat_247", B.r_stat({"kick": "TỰ ĐỘNG", "big": "24/7", "suffix": "", "disp": ["Bán hàng không ngừng"],
                             "lede": "AI làm việc cả khi bạn ngủ."}, "#s", "st4")[0]),
    ("5_stat80", B.r_stat({"kick": "HIỆU QUẢ", "big": "80", "suffix": "%", "disp": ["Tiết kiệm thời gian"],
                           "lede": "Nhờ quy trình buổi sáng."}, "#s", "st5")[0]),
    ("6_countup", B.r_countup({"kick": "MỖI NGÀY", "to": 90, "suffix": "%",
                               "lede": "Người bán duy trì thói quen sáng."}, "#s", "cu6")[0]),
    ("7_hero", B.r_image({"style": "hero", "kick": "MORNING", "disp": ["Thói quen 1:", "*Thức dậy sớm*", "trước thị trường"]},
                         "#s", "im7", ["img02.jpg"])[0]),
    ("8_card", B.r_media({"side": "left", "kick": "MORNING", "disp": ["Thói quen 2:", "*Uống nước & ngồi yên*"],
                          "lede": "Làm sạch cơ thể và tâm trí."}, "#s", "m8", "img03.jpg")[0]),
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
