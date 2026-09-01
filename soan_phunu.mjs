// Soạn SPEC cho mẫu "phunu" (Phụ Nữ & Kinh Doanh Online) → spec.json cho templates/phunu/build.py.
import { writeFileSync } from 'node:fs';

const KEY = process.env.CLAUDE_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const TITLE = process.env.TITLE || '';
const ARTICLE = process.env.ARTICLE || '';
const BRANDKW = process.env.BRANDKW || 'bán hàng online, khởi nghiệp, phụ nữ kinh doanh';

const PROMPT = `Bạn là biên tập viên video editorial "Phụ Nữ & Kinh Doanh Online" (9:16, phong cách sổ tay kem–cam, ấm áp truyền cảm hứng). Soạn KỊCH BẢN cho chủ đề, trả về DUY NHẤT một JSON hợp lệ (không markdown).

CHỦ ĐỀ: "${TITLE}"
BỐI CẢNH: """${ARTICLE.slice(0, 2000)}"""
TỪ KHOÁ BÁM SÁT: ${BRANDKW}

JSON: { "num":"01", "scenes":[ {…}, … ] }  — 9-13 cảnh.

CẢNH 1 luôn type "intro"; CẢNH cuối luôn type "outro"; áp chót nên là type "cta". Ở giữa TRỘN các kiểu cho nhịp điệu.
Mỗi cảnh có "vo" = lời đọc tự nhiên 1-2 câu (tiếng Việt, ấm, KHÔNG chứa markup/kí tự < >).

KIỂU cảnh + trường:
- intro:   {kick, disp:[3 dòng tiêu đề lớn], lede}
- text:    {align:"left"|"center"|"right", kick, kickInk?:true, rule?:true, disp:[2-3 dòng], lede}
- media:   {side:"left"|"right" (phía ẢNH), kick, disp:[2-3 dòng], lede, cap:"chú thích ảnh ngắn"}  (ảnh tự lấy từ kho)
- stat:    {kick, big:"½" hoặc "3×" (kí hiệu/số ngắn), lede}
- quote:   {quote:"câu trích 3-6 chữ (có thể \\n)", lede}
- band:    {pos:"top"|"bottom", kick, disp:[1-2 dòng], band:"1 câu chốt trong dải màu"}
- list:    {kick, disp:[1-2 dòng], items:["mục 1","mục 2","mục 3"], lede}
- countup: {to:90, suffix:"%", kick, lede}
- cta:     {kick, disp:["Hôm nay,","*bạn bắt đầu.*"], lede}
- outro:   {brand:"✳ KHỞI SỰ", lede:"1 câu kêu gọi chia sẻ mềm"}

MARKUP trong text hiển thị (disp/lede/band/quote — KHÔNG dùng < >): *nhấn cam*  ·  **đậm**  ·  _nghiêng_  ·  xuống dòng \\n. Một dòng disp bọc trọn *…* sẽ thành tiêu đề nhấn cam nghiêng.
An toàn: KHÔNG hứa thu nhập/mốc thời gian, KHÔNG comment-bait, KHÔNG kí tự < > trong text.
Chỉ in JSON.`;

const r = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
  body: JSON.stringify({ model: MODEL, max_tokens: 3200, messages: [{ role: 'user', content: PROMPT }] }),
});
const j = await r.json();
const raw = (j?.content || []).map((b) => b.text || '').join('');
const m = raw.match(/\{[\s\S]*\}/);
if (!m) { console.error('Không parse được JSON:', raw.slice(0, 300)); process.exit(1); }
const spec = JSON.parse(m[0]);
if (!spec.scenes || !spec.scenes.length) { console.error('Thiếu scenes'); process.exit(1); }
writeFileSync('spec.json', JSON.stringify(spec, null, 2));
console.log(`✓ spec.json (phunu): ${spec.scenes.length} cảnh`);
