#!/usr/bin/env python3
"""Vbee TTS helper (đóng gói trong mẫu newsroom).
build.py gọi vbee.synth(text, out, speed). Creds đọc theo thứ tự ưu tiên:
  1) BIẾN MÔI TRƯỜNG  VBEE_APP_ID / VBEE_TOKEN / VBEE_VOICE  (GitHub Actions secrets)
  2) file .vbee.env cạnh script hoặc trỏ bởi VBEE_ENV (chạy local)
Không hard-code đường dẫn máy Boss → chạy được cả trên CI lẫn máy.
"""
import sys, os, json, time, urllib.request

BASE = "https://vbee.vn/api/v1/tts"
HERE = os.path.dirname(os.path.abspath(__file__))


def load_env():
    e = {}
    # file (nếu có) — nạp trước, env sẽ ghi đè
    path = os.environ.get("VBEE_ENV") or os.path.join(HERE, ".vbee.env")
    if os.path.exists(path):
        for l in open(path):
            l = l.strip()
            if "=" in l and not l.startswith("#"):
                k, v = l.split("=", 1); e[k] = v
    # env (ưu tiên cao nhất — dùng cho secret CI)
    for k in ("VBEE_APP_ID", "VBEE_TOKEN", "VBEE_VOICE"):
        if os.environ.get(k):
            e[k] = os.environ[k]
    return e


def _post(url, data, token):
    req = urllib.request.Request(url, data=json.dumps(data).encode(),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"}, method="POST")
    return json.load(urllib.request.urlopen(req, timeout=30))


def _get(url, token):
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
    return json.load(urllib.request.urlopen(req, timeout=30))


def _download(link, out, tries=5):
    last = None
    for k in range(tries):
        try:
            urllib.request.urlretrieve(link, out)
            if os.path.getsize(out) > 800:
                return True
        except Exception as ex:
            last = ex
        time.sleep(2 + k * 2)
    raise RuntimeError("Vbee download lỗi sau %d lần: %s" % (tries, last))


def _synth_once(text, out, speed, tok, app_id, voice):
    body = {"app_id": app_id, "callback_url": "https://example.com/vbee-callback",
            "input_text": text, "voice_code": voice, "audio_type": "mp3",
            "bitrate": 128, "speed_rate": speed}
    r = _post(BASE, body, tok)
    res = r.get("result")
    if not res:
        raise RuntimeError("Vbee POST lỗi: " + json.dumps(r, ensure_ascii=False)[:200])
    rid = res["request_id"] if isinstance(res, dict) else res
    link = None
    for _ in range(40):
        time.sleep(1.5)
        g = _get(BASE + "/" + rid, tok)
        gr = g.get("result") or {}
        st = gr.get("status")
        if st == "SUCCESS":
            link = gr.get("audio_link"); break
        if st in ("FAILURE", "ERROR"):
            raise RuntimeError("Vbee failed: " + json.dumps(g, ensure_ascii=False))
    if not link:
        raise TimeoutError("Vbee timeout for: " + text[:40])
    _download(link, out)
    return out


def synth(text, out, speed="1.0", tries=3):
    e = load_env()
    tok = e.get("VBEE_TOKEN"); app_id = e.get("VBEE_APP_ID"); voice = e.get("VBEE_VOICE")
    if not (tok and app_id and voice):
        raise RuntimeError("Thiếu VBEE_APP_ID/VBEE_TOKEN/VBEE_VOICE (env hoặc .vbee.env)")
    last = None
    for k in range(tries):
        try:
            return _synth_once(text, out, speed, tok, app_id, voice)
        except Exception as ex:
            last = ex
            if os.path.exists(out):
                try: os.remove(out)
                except Exception: pass
            time.sleep(3 + k * 3)
    raise RuntimeError("Vbee synth thất bại sau %d lần: %s" % (tries, last))


if __name__ == "__main__":
    text, out = sys.argv[1], sys.argv[2]
    speed = sys.argv[3] if len(sys.argv) > 3 else "1.0"
    synth(text, out, speed)
    print("OK", out)
