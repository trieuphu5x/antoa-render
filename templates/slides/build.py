#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Wrapper đồng bộ orchestrator cho mẫu "slides" (Agent Thực Chiến).
Dùng: python3 build.py <workdir> <input.json> [--render]
input.json:
{
  "script": "<kịch bản N câu, mỗi câu 1 dòng>"  (hoặc mảng ["câu 1","câu 2",...]),
  "slides": ["3 | STAT | pill | a::b", ...]      (tuỳ chọn — cảnh cần đồ hoạ đặc thù; còn lại text slide),
  "num": "01",                                    (số badge góc)
  "tts": "vbee" | "none"                          (none = bỏ giọng, chỉ dựng index.html để xem nhanh)
}
Bê nguyên generator.py (= build_video.py kênh Agent Thực Chiến) + slidelib + vbee_tts, gói tự chứa.
"""
import sys, os, json, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

FFMPEG = os.environ.get("FFMPEG", "ffmpeg")


def newest_mp4(root):
    best = None
    for dp, _dn, fn in os.walk(root):
        for name in fn:
            if not name.endswith(".mp4"):
                continue
            p = os.path.join(dp, name)
            m = os.path.getmtime(p)
            if not best or m > best[1]:
                best = (p, m)
    return best[0] if best else None


def freeze_intro(mp4, hold=1.4):
    """Frame 0.0s phải có nội dung (Reels/IG/TikTok tự lấy frame đầu làm cover).
    Scene 1 dùng GSAP .from() nên 0.0s trống → animate ~1.1s mới đủ. KHÔNG đụng slide mẫu:
    thay ĐÚNG đoạn đầu (scene 1 đang fade-in) bằng ẢNH TĨNH scene 1 đã hiện đủ (chụp tại t=hold),
    nối phần còn lại từ t=hold. Tổng thời lượng KHÔNG đổi → audio giữ nguyên, đồng bộ tuyệt đối.
    Scene 2..N animate-in nguyên vẹn. Nền/scene 1 sau fade là tĩnh → nối tại hold liền mạch."""
    d = os.path.dirname(mp4)
    poster = os.path.join(d, "_intro_poster.png")
    tmp = mp4 + ".tmp.mp4"
    try:
        subprocess.run([FFMPEG, "-y", "-ss", str(hold), "-i", mp4, "-frames:v", "1", poster],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run([
            FFMPEG, "-y",
            "-loop", "1", "-t", str(hold), "-i", poster,
            "-i", mp4,
            "-filter_complex",
            "[0:v]scale=1080:1920,setsar=1,fps=30,format=yuv420p[still];"
            f"[1:v]trim=start={hold},setpts=PTS-STARTPTS,fps=30,format=yuv420p[rest];"
            "[still][rest]concat=n=2:v=1:a=0[v]",
            "-map", "[v]", "-map", "1:a?",
            "-c:v", "libx264", "-crf", "19", "-preset", "veryfast", "-pix_fmt", "yuv420p",
            "-c:a", "copy", "-movflags", "+faststart", tmp,
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        os.replace(tmp, mp4)
        print(f"[build] ✓ frame 0.0s = scene 1 đầy đủ (freeze {hold}s intro) → {os.path.basename(mp4)}")
    except Exception as e:
        print(f"[build] ! freeze_intro bỏ qua ({e}) — giữ mp4 gốc")
    finally:
        for f in (poster, tmp):
            if os.path.exists(f):
                try: os.remove(f)
                except OSError: pass


def main():
    workdir = os.path.abspath(sys.argv[1])
    spec = json.load(open(sys.argv[2], encoding="utf-8"))
    do_render = "--render" in sys.argv[3:]
    os.makedirs(workdir, exist_ok=True)

    script = spec.get("script", "")
    if isinstance(script, list):
        script = "\n".join(str(x) for x in script)
    open(os.path.join(workdir, "script.txt"), "w", encoding="utf-8").write(script)

    slides = spec.get("slides") or []
    if slides:
        open(os.path.join(workdir, "slides.txt"), "w", encoding="utf-8").write("\n".join(slides))

    # gọi generator (bê build_video.py) qua argv
    argv = [os.path.join(workdir, "script.txt"), workdir, "--num", str(spec.get("num", "01"))]
    if spec.get("tts") == "none":
        argv.append("--no-audio")
    import generator
    sys.argv = ["generator"] + argv
    generator.main()

    if do_render:
        subprocess.run(["npx", "--yes", "hyperframes@0.7.64", "render"], cwd=workdir)
        mp4 = newest_mp4(workdir)
        if mp4:
            freeze_intro(mp4)


if __name__ == "__main__":
    main()
