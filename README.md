# ANTOA Render Backend

Render video 9:16 cho hệ thống marketing **ANTOA** — chạy trên **GitHub Actions** (có Chromium + ffmpeg, thứ Cloudflare Workers không có).

## Kiến trúc "đóng gói mẫu" (template registry)

Mỗi **mẫu video** = 1 gói tự chứa trong `templates/<id>/` (builder + assets + `template.json`), khai báo ở `templates/registry.json`. Orchestrator `render.mjs` nhận `template` → chạy đúng gói đó. Thêm mẫu tương lai = thả thêm thư mục gói + 1 dòng registry.

| Mẫu | Kênh gốc | Trạng thái |
|-----|----------|-----------|
| `newsroom` | AI Có Gì Mới (tin ngắn editorial, 5 mood theo loại tin) | ✅ ready |
| `slides` · `netchi` · `phunu` | Agent Thực Chiến · Nét Chì Của Mẹ · Phụ Nữ KDO | ⏳ soon |

`newsroom` bê chuẩn 100% builder `dung.py` (HyperFrames) của kênh AI Có Gì Mới.

## Cách chạy

**A. Tự động (production):** Tower gọi `repository_dispatch` (event `render`) kèm `client_payload = { template, spec, voice, title, callback, jobId, contentId }` → render → up R2 → callback về Tower.

**B. Test tay:** vào tab **Actions → ANTOA Render → Run workflow**, nhập tiêu đề → workflow tự **soạn cảnh bằng Claude** → render → MP4 tải về ở **Artifacts** (không cần R2/Cloudflare).

## Secrets (Settings → Secrets and variables → Actions)

| Secret | Bắt buộc | Dùng cho |
|--------|----------|----------|
| `CLAUDE_API_KEY`, `CLAUDE_MODEL` | test tay | soạn cảnh newsroom |
| `VBEE_APP_ID`, `VBEE_TOKEN` | giọng Vbee | TTS chuyên nghiệp |
| `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_PUBLIC_URL` | khi nối R2 | up video (bỏ trống → xuất artifact) |
| `RENDER_CALLBACK_SECRET` | khi nối Tower | xác thực callback |

Chưa có R2 vẫn chạy: MP4 xuất ra **artifact**. Giọng: `vbee:<code>` (cần secret Vbee) hoặc `edge:<code>` (free).

## Free tier
Repo **public** = phút Actions không giới hạn. Ubuntu runner cài sẵn ffmpeg; workflow tự cài edge-tts + Chromium (Playwright) cho HyperFrames.
