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


if __name__ == "__main__":
    main()
