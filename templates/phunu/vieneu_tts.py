# vieneu_tts.py — VieNeu TTS offline (ONNX, Apache 2.0, free thương mại). synth(text,out,voice)->mp3.
# Nạp model 1 LẦN/tiến trình (global). Xuất WAV rồi ffmpeg -> mp3 chuẩn (đuôi build.py yêu cầu).
import os, subprocess
_TTS = None
def _engine():
    global _TTS
    if _TTS is None:
        from vieneu import Vieneu
        _TTS = Vieneu()
    return _TTS
def synth(text, out, voice=None, speed="1.0"):
    voice = (voice or os.environ.get("VIENEU_VOICE") or "Xuân Vĩnh").strip()
    tts = _engine()
    try:
        st = tts.get_preset_voice(voice); st = getattr(st, "style", None) or st
    except Exception:
        st = None
    try:
        audio = tts.infer(text, voice=voice, style=st)
    except TypeError:
        audio = tts.infer(text, voice=voice)
    wav = out + ".src.wav"
    tts.save(audio, wav)
    # WAV -> MP3 (ffmpeg có sẵn trên runner); lỗi thì giữ wav-content ở đuôi mp3 (ffprobe/ffmpeg đọc theo nội dung).
    try:
        subprocess.run(["ffmpeg", "-y", "-i", wav, "-c:a", "libmp3lame", "-q:a", "4", out],
                       check=True, capture_output=True)
        os.remove(wav)
    except Exception:
        os.replace(wav, out)
    return out
