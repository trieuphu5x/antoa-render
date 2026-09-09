// Soạn SPEC cho mẫu "phunu" (Phụ Nữ & Kinh Doanh Online) → spec.json cho templates/phunu/build.py.
import { writeFileSync } from 'node:fs';

const KEY = process.env.CLAUDE_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const TITLE = process.env.TITLE || '';
const ARTICLE = process.env.ARTICLE || '';
const BRANDKW = process.env.BRANDKW || 'bán hàng online, khởi nghiệp, phụ nữ kinh doanh';
const NONCE = process.env.GITHUB_RUN_ID || String(Math.floor(Math.random() * 1e9));

const PROMPT = `Bạn là biên tập viên video editorial "Phụ Nữ & Kinh Doanh Online" (9:16, phong cách sổ tay kem–cam, ấm áp truyền cảm hứng). Soạn KỊCH BẢN cho chủ đề, trả về DUY NHẤT một JSON hợp lệ (không markdown).

CHỦ ĐỀ: "${TITLE}"
BỐI CẢNH: """${ARTICLE.slice(0, 2000)}"""
TỪ KHOÁ BÁM SÁT: ${BRANDKW}
Hạt giống đa dạng (để video này khác các video khác): ${NONCE}

JSON: { "num":"01", "scenes":[ {…}, … ] }  — 16-20 cảnh.

CẢNH 1 luôn type "intro"; CẢNH cuối luôn type "outro"; áp chót nên là type "cta". Ở giữa TRỘN các kiểu cho nhịp điệu.
TRIẾT LÝ ĐA DẠNG (đừng để video nào cũng giống nhau): dùng NHIỀU kiểu khác nhau (ít nhất 6 kiểu ngoài intro/outro); KHÔNG lặp 1 kiểu quá 3 lần; xen kẽ media (đổi side trái/phải), text (đổi align trái/giữa/phải), stat, quote, band (đổi pos trên/dưới), list, countup. Dùng hạt giống để đa dạng lựa chọn.
Mỗi cảnh có "vo" = lời đọc tự nhiên 1-2 câu (tiếng Việt, ấm, KHÔNG chứa markup/kí tự < >).

KIỂU cảnh + trường:
- intro:   {kick, disp:[3 dòng tiêu đề lớn], lede}
- text:    {align:"left"|"center"|"right", kick, kickInk?:true, rule?:true, disp:[2-3 dòng], lede}
- media:   {kick, disp:[2-3 dòng], lede, caps:["chú thích ảnh 1","chú thích ảnh 2"]}  (cảnh ẢNH — hệ thống tự chọn 1 trong 8 kiểu bày ảnh + tự lấy ảnh thật)
- stat:    {kick, big:"số/kí hiệu ngắn (vd 80, ½, 3×)", suffix:"đơn vị đi kèm (vd %, đơn, lần) — ĐỂ TRỐNG nếu big đã đủ nghĩa", disp:["1 dòng phụ ngắn"], lede}
- quote:   {quote:"câu trích ngắn (có thể \\n, dùng *…* nhấn)", by:"nguồn dẫn ngắn (vd Một người bán hàng)"}
- band:    {kick, disp:[1-2 dòng tiêu đề], band:"1 câu chốt đắt giá trong dải màu (dùng *…* nhấn)"}
- list:    {kick, disp:[1-2 dòng], items:["mục 1","mục 2","mục 3"], lede}
- countup: {to:90, suffix:"%", kick, lede}
- cta:     {kick, disp:["1-2 dòng chốt"], lede, pill:"chữ ngắn trên nút CTA (vd Theo dõi ngay →)"}
- outro:   {brand:"✳ KHỞI SỰ", lede:"1 câu kêu gọi chia sẻ mềm"}

MARKUP trong text hiển thị (disp/lede/band/quote — KHÔNG dùng < >): *nhấn cam*  ·  **đậm**  ·  _nghiêng_  ·  xuống dòng \\n. Một dòng disp bọc trọn *…* sẽ thành tiêu đề nhấn cam nghiêng.
An toàn: KHÔNG hứa thu nhập/mốc thời gian, KHÔNG comment-bait, KHÔNG kí tự < > trong text.
Chỉ in JSON.`;

const r = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
  body: JSON.stringify({ model: MODEL, max_tokens: 4200, messages: [{ role: 'user', content: PROMPT }] }),
});
const j = await r.json();
const raw = (j?.content || []).map((b) => b.text || '').join('');
const m = raw.match(/\{[\s\S]*\}/);
if (!m) { console.error('Không parse được JSON:', raw.slice(0, 300)); process.exit(1); }
const spec = JSON.parse(m[0]);
if (!spec.scenes || !spec.scenes.length) { console.error('Thiếu scenes'); process.exit(1); }

// ===== NGUỒN ẢNH ĐỘNG (KHÔNG lưu — Chromium tải thẳng từ link lúc render) =====
// Ưu tiên ẢNH RIÊNG (Drive) Tower gửi qua OWN_IMAGES (JSON []); thiếu → bù ẢNH FREE theo từ khoá (Pexels/Pixabay).
const PEXELS_KEY = process.env.PEXELS_API_KEY || '';
const PIXABAY_KEY = process.env.PIXABAY_API_KEY || '';
function stockQuery(s) {
  s = (s || '').toLowerCase();
  if (/thời trang|thoi trang|làm đẹp|lam dep|mỹ phẩm|my pham|beauty|fashion/.test(s)) return 'woman fashion beauty lifestyle';
  if (/ăn uống|an uong|đồ ăn|do an|food|cafe|quán|quan/.test(s)) return 'food small business cafe';
  if (/mẹ|gia đình|gia dinh|family|mom|con/.test(s)) return 'woman family home lifestyle';
  if (/kinh.?doanh|bán hàng|ban hang|khởi nghiệp|khoi nghiep|doanh.?nghiệp|business|finance/.test(s)) return 'business woman entrepreneur lifestyle';
  return 'vietnamese woman business lifestyle';
}
async function fetchStock(query, n) {
  if (!query || n < 1) return [];
  if (PEXELS_KEY) {
    try {
      const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${n + 4}&orientation=portrait`, { headers: { authorization: PEXELS_KEY } });
      if (r.ok) { const j = await r.json(); const us = (j.photos || []).map((p) => p.src && (p.src.large2x || p.src.large || p.src.portrait)).filter(Boolean); if (us.length) return us.slice(0, n); }
    } catch (e) { /* thử Pixabay */ }
  }
  if (PIXABAY_KEY) {
    try {
      const r = await fetch(`https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&image_type=photo&orientation=vertical&per_page=${Math.max(3, n + 4)}&safesearch=true`);
      if (r.ok) { const j = await r.json(); const us = (j.hits || []).map((h) => h.largeImageURL || h.webformatURL).filter(Boolean); if (us.length) return us.slice(0, n); }
    } catch (e) { /* hết nguồn */ }
  }
  return [];
}
const NEED = 14;   // đủ cho video 16-20 cảnh (lưới 4 / băng phim 4…), build.py xoay vòng
let images = [];
try { images = JSON.parse(process.env.OWN_IMAGES || '[]'); } catch (e) { images = []; }
images = (images || []).map((u) => String(u).trim()).filter(Boolean).slice(0, NEED);
if (images.length < NEED) {
  const q = stockQuery(`${TITLE} ${BRANDKW}`);
  const stock = await fetchStock(q, NEED - images.length);
  console.log(`  ảnh: riêng ${images.length} + stock ${stock.length} (q="${q}")`);
  images = images.concat(stock);
}
if (images.length) spec.images = images;

writeFileSync('spec.json', JSON.stringify(spec, null, 2));
console.log(`✓ spec.json (phunu): ${spec.scenes.length} cảnh · ${(spec.images || []).length} ảnh động`);
