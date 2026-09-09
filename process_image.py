# Làm nét ảnh sản phẩm — CHÉP ĐÚNG logic bản gốc process.py của shop:
#   crop vuông giữa ảnh → resize 1080×1080 (LANCZOS) → UnsharpMask(radius=1.5, percent=144, threshold=3) → JPEG q95.
# Chạy trên GitHub Actions (repository_dispatch 'imgproc'). Tải ảnh từ Drive (public "ai có link"), thử nhiều URL.
import os, io, urllib.request
from PIL import Image, ImageFilter

# ---- THÔNG SỐ Y HỆT BẢN GỐC ----
DO_SHARP   = 1.8               # percent = DO_SHARP*80 = 144
KICH_THUOC = (1080, 1080)
# --------------------------------

IMG_URL  = os.environ.get("IMG_URL", "").strip()
DRIVE_ID = os.environ.get("DRIVE_ID", "").strip()
MODE     = (os.environ.get("MODE") or "both").strip().lower()   # crop = chỉ cắt 1080 · sharp = chỉ làm nét · both = cả hai
OUT      = "out.jpg"


def tai(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (ANTOA imgproc)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        ct = r.headers.get("Content-Type", "")
        return r.read(), ct


def lay_anh():
    # Thứ tự ưu tiên: ảnh gốc (download) → thumbnail độ phân giải cao (fallback nếu Drive chặn/hiện trang xác nhận).
    ung_vien = []
    if IMG_URL:
        ung_vien.append(IMG_URL)
    if DRIVE_ID:
        ung_vien.append(f"https://drive.google.com/uc?export=download&id={DRIVE_ID}")
        ung_vien.append(f"https://drive.google.com/thumbnail?id={DRIVE_ID}&sz=w2048")
    seen = set()
    for u in ung_vien:
        if not u or u in seen:
            continue
        seen.add(u)
        try:
            data, ct = tai(u)
            if b"<html" in data[:600].lower() or "text/html" in ct.lower():
                print("  ⚠️ nguồn trả HTML (trang xác nhận), thử URL kế:", u)
                continue
            img = Image.open(io.BytesIO(data)); img.load()
            print("  📥 Tải ảnh OK:", u, img.size)
            return img
        except Exception as e:
            print("  ⚠️ nguồn lỗi:", u, e)
    raise SystemExit("❌ Không tải được ảnh từ Drive (kiểm tra thư mục đã share 'ai có link')")


def crop_vuong(img):
    w, h = img.size
    canh = min(w, h)
    left = (w - canh) // 2
    top  = (h - canh) // 2
    return img.crop((left, top, left + canh, top + canh))


img = lay_anh().convert("RGB")
if MODE in ("crop", "both"):
    img = crop_vuong(img)
    img = img.resize(KICH_THUOC, Image.LANCZOS)          # cắt vuông giữa → 1080×1080
if MODE in ("sharp", "both"):
    img = img.filter(ImageFilter.UnsharpMask(radius=1.5, percent=int(DO_SHARP * 80), threshold=3))   # làm nét y hệt bản gốc (giữ nguyên kích thước/tỉ lệ)
img.save(OUT, "JPEG", quality=95)
print(f"✅ Xong (mode={MODE}) →", OUT, img.size)
