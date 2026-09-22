#!/usr/bin/env python3
# gen-voice.py <config.json> — đọc scenes[].say (+ cta.say) → giọng VieNeu → assets/voice.wav + assets/timings.json
# CI-friendly: `from vieneu import Vieneu` (giả định vieneu đã pip install trong môi trường CI — ANTOA đã có).
import sys, os, json, wave
from vieneu import Vieneu

cfg_path = sys.argv[1] if len(sys.argv) > 1 else "config.json"
cfg = json.load(open(cfg_path, encoding="utf-8"))
VOICE = os.environ.get("VIENEU_VOICE") or cfg.get("voice", "Xuân Vĩnh")   # render.mjs set VIENEU_VOICE khi giọng vieneu
here = os.path.dirname(os.path.abspath(cfg_path))
d = os.path.join(here, "assets"); os.makedirs(d, exist_ok=True)
lines = [s["say"] for s in cfg["scenes"]]
if cfg.get("cta", {}).get("say"): lines.append(cfg["cta"]["say"])

tts = Vieneu()
try:
    st = tts.get_preset_voice(VOICE); st = getattr(st, "style", None) or st
except Exception:
    st = None
GAP = [0.5] + [0.7]*(len(lines)-1); TAIL = 1.4
SILENT_DUR = 2.2   # dòng outro "__SILENT__" (tên kênh cuối video) = khoảng lặng, KHÔNG đọc
params=None; frames=b""; sr=None; timings=[]; t=0.0
for i, txt in enumerate(lines):
    is_silent = (not txt) or (txt.strip() == "__SILENT__")
    if is_silent and sr is not None:   # chèn window im lặng (cần đã biết sr từ câu trước)
        frames += b"\x00"*(int(GAP[i]*sr)*params.sampwidth*params.nchannels); t += GAP[i]
        frames += b"\x00"*(int(SILENT_DUR*sr)*params.sampwidth*params.nchannels)
        timings.append({"i":i,"start":round(t,2),"end":round(t+SILENT_DUR,2),"text":""}); t += SILENT_DUR
        continue
    try: audio = tts.infer(txt, voice=VOICE, style=st)
    except TypeError: audio = tts.infer(txt, voice=VOICE)
    p=f"{d}/_l{i}.wav"; tts.save(audio, p)
    with wave.open(p,"rb") as w: pr=w.getparams(); fr=w.readframes(w.getnframes())
    if params is None: params=pr; sr=pr.framerate
    frames += b"\x00"*(int(GAP[i]*sr)*pr.sampwidth*pr.nchannels); t += GAP[i]
    dur = len(fr)//(pr.sampwidth*pr.nchannels)/sr
    timings.append({"i":i,"start":round(t,2),"end":round(t+dur,2),"text":txt}); frames+=fr; t+=dur
    os.remove(p)
frames += b"\x00"*(int(TAIL*sr)*params.sampwidth*params.nchannels); t += TAIL
with wave.open(f"{d}/voice.wav","wb") as w: w.setparams(params); w.writeframes(frames)
json.dump({"duration":round(t,2),"fps":cfg.get("fps",30),"lines":timings},
          open(f"{d}/timings.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
print("voice.wav: %.2fs, %d câu" % (t, len(lines)))
