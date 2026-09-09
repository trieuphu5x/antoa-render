#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ORCHESTRATOR mẫu "illustrated" (Mẫu Video Vẽ Hình AI) — tranh AI vẽ, đa phong cách, 9:16.
Dùng lại VieNeu (giọng) + HyperFrames render + ffmpeg CỦA ANTOA; chỉ thêm bước sinh ảnh OpenAI.
Gọi: python3 build.py <WORK> <WORK/spec.json> [--render]

spec.json (config) = { image_style, image_model, voice, fps, scenes:[{say,image_prompt,caption?}], cta:{say,brand,tag}, style:{music_file,musicVolume}, caption:{title,desc} }
Luồng: gen-voice.py (VieNeu → assets/voice.wav + timings.json) → gen-illustration.mjs (OpenAI → build/assets/imgN.png)
       → build-composition.mjs (Ken Burns + caption + CTA → build/index.html) → audio-cues.json → HyperFrames render → mix-audio.mjs → output/video.mp4
"""
import sys, os, json, subprocess, random

HERE = os.path.dirname(os.path.abspath(__file__))


def node(script, *args, **kw):
    subprocess.run(["node", os.path.join(HERE, script), *[str(a) for a in args]], check=True, **kw)


def build(workdir, spec_path, do_render):
    cfg = json.load(open(spec_path, encoding="utf-8"))
    os.makedirs(os.path.join(workdir, "assets"), exist_ok=True)
    os.makedirs(os.path.join(workdir, "build", "assets"), exist_ok=True)
    os.makedirs(os.path.join(workdir, "build", "renders"), exist_ok=True)

    # 1) GIỌNG (VieNeu) → assets/voice.wav + assets/timings.json  (gen-voice dùng here=dirname(spec)=workdir)
    print("[illustrated] 1) giọng VieNeu…")
    subprocess.run(["python3", os.path.join(HERE, "gen-voice.py"), spec_path], check=True)

    # 2) SINH ẢNH (OpenAI gpt-image-1) → build/assets/img1..N.png
    style = (cfg.get("image_style") or "").strip()
    model = cfg.get("image_model", "gpt-image-1")
    scenes = cfg.get("scenes", [])
    print(f"[illustrated] 2) sinh {len(scenes)} ảnh ({model}, style='{style[:40]}…')")
    for i, sc in enumerate(scenes, 1):
        pr = (sc.get("image_prompt") or "").strip()
        out = os.path.join(workdir, "build", "assets", f"img{i}.png")
        prompt = f"{style}. {pr}" if style else pr
        node("gen-illustration.mjs", prompt, out, model, "9:16")

    # 3) DỰNG COMPOSITION (Ken Burns + caption + CTA) → build/index.html
    print("[illustrated] 3) dựng composition…")
    node("build-composition.mjs", spec_path)

    # 4) AUDIO CUES (SFX theo cảnh — thiếu file SFX thì mix bỏ qua)
    try:
        tim = json.load(open(os.path.join(workdir, "assets", "timings.json"), encoding="utf-8"))
        L = tim.get("lines", [])
        n = len(scenes)
        # SFX kho SAB (assets/sfx) — 3 accent tinh tế, đúng vai trò (mô tả trong sound-effects/library.json):
        #   fairy-dust.mp3 = bụi tiên lấp lánh mở màn · swoosh.mp3 = swoosh chuyển cảnh · ta-da.mp3 = khoe kết quả ở CTA
        #   Nhạc nền: bước 6 random 1 bài trong pool assets/music (6 track Pixabay), auto-duck nhỏ lại khi có giọng.
        cues = [{"at": 0.6, "sound": "fairy-dust.mp3", "vol": 0.16}]
        for i in range(1, n):
            if i < len(L):
                cues.append({"at": round(L[i]["start"] - 0.18, 2), "sound": "swoosh.mp3", "vol": 0.22})
        if cfg.get("cta") and L:
            cta_i = min(n, len(L) - 1)
            cues.append({"at": round(L[cta_i]["start"], 2), "sound": "ta-da.mp3", "vol": 0.28})
        json.dump(cues, open(os.path.join(workdir, "build", "audio-cues.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    except Exception as e:
        print("[illustrated] audio-cues bỏ qua:", e)

    if not do_render:
        print("[illustrated] xong build/index.html (không render)")
        return

    # 5) RENDER (HyperFrames headless) → build/renders/video.mp4
    print("[illustrated] 5) render HyperFrames…")
    subprocess.run(["npx", "--yes", "hyperframes@0.8.30", "render", ".", "-q", "high", "-o", "renders/video.mp4"],
                   cwd=os.path.join(workdir, "build"), check=True)

    # 6) TRỘN ÂM THANH (voice + SFX + nhạc) → output/video.mp4
    #    Nhạc nền: RANDOM 1 bài trong pool assets/music (mỗi video 1 bài cho đỡ nhàm — không lặp nhạc cũ).
    #    Truyền qua env MUSIC_FILE (mix-audio ưu tiên env này). Pool rỗng → mix bỏ qua nhạc.
    mix_env = dict(os.environ)
    music_dir = os.environ.get("MUSIC_DIR") or os.path.join(HERE, "assets", "music")
    try:
        pool = sorted(f for f in os.listdir(music_dir) if f.lower().endswith((".mp3", ".wav", ".m4a")))
    except FileNotFoundError:
        pool = []
    if pool:
        pick = random.choice(pool)
        mix_env["MUSIC_FILE"] = os.path.join(music_dir, pick)
        print(f"[illustrated] 6) trộn âm thanh… (nhạc nền ngẫu nhiên {len(pool)} bài → {pick})")
    else:
        print("[illustrated] 6) trộn âm thanh… (không có nhạc nền)")
    node("mix-audio.mjs", spec_path, env=mix_env)
    print("[illustrated] ✓ output/video.mp4")


def main():
    workdir = os.path.abspath(sys.argv[1])
    spec_path = os.path.abspath(sys.argv[2])
    build(workdir, spec_path, "--render" in sys.argv[3:])


if __name__ == "__main__":
    main()
