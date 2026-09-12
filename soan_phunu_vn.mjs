// Soạn SPEC cho mẫu "phunu-vn" = BIẾN THỂ "Mẫu Slide Tạp Chí" DÀNH RIÊNG cho TIN TỨC VN.
// KHÁC bản gốc soan_phunu.mjs DUY NHẤT ở NGUỒN ẢNH: lấy ẢNH THẬT TỪ BÀI BÁO (chup.mjs → shots/manifest.json)
// thay vì stock/Drive. Dùng chung templates/phunu/build.py + style.css (cùng 12 kiểu, 6 màu).
// Bản gốc soan_phunu.mjs (stock free / Drive) GIỮ NGUYÊN — đây là biến thể thứ 3 theo nguồn ảnh.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { claudeJson, verbatimScenes, captionFor } from './soan_util.mjs';

const KEY = process.env.CLAUDE_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const TITLE = process.env.TITLE || '';
const ARTICLE = process.env.ARTICLE || '';
const VERBATIM = process.env.VERBATIM === '1';   // 1 = kịch bản DÁN THỦ CÔNG → giữ NGUYÊN 100% lời đọc
const BRANDKW = process.env.BRANDKW || 'showbiz, sao việt, giải trí';
const NONCE = process.env.GITHUB_RUN_ID || String(Math.floor(Math.random() * 1e9));

const PROMPT = `Bạn là biên tập viên video editorial tạp chí giải trí/showbiz (9:16, phong cách tạp chí ảnh sang trọng). Soạn KỊCH BẢN cho tin dưới đây, trả về DUY NHẤT một JSON hợp lệ (không markdown).

CHỦ ĐỀ: "${TITLE}"
BỐI CẢNH: """${ARTICLE.slice(0, 2000)}"""
TỪ KHOÁ BÁM SÁT: ${BRANDKW}
Hạt giống đa dạng: ${NONCE}

JSON: { "channel":"<TÊN KÊNH ngắn>", "topic":"<chủ đề 2-3 từ TIẾNG ANH viết thường khớp nội dung, vd showbiz vietnam / celebrity news>", "milestone":"<CHUYÊN MỤC ngắn IN HOA, vd HÓNG NHANH / SAO & SỰ KIỆN>", "num":"01", "scenes":[ {…}, … ] }  — CHỈ 10-12 cảnh.

⭐ ƯU TIÊN HÌNH ẢNH: **ÍT NHẤT MỘT NỬA** số cảnh là type "media" (ảnh thật từ bài báo). Video kể bằng ẢNH sao là chính.
⭐ NGẮN GỌN: "disp" tối đa 2 dòng, mỗi dòng ≤ 4-5 từ. "lede" ≤ 12 từ hoặc bỏ. "caps" (chú thích ảnh) ≤ 6 từ.
⚖️ AN TOÀN NỀN TẢNG (showbiz — RẤT QUAN TRỌNG): KHÔNG khẳng định chắc nịch chuyện chưa kiểm chứng; dùng "rộ tin / nghe đồn / dân mạng xôn xao / theo nguồn tin". KHÔNG bôi nhọ/xúc phạm/quy kết đời tư. KHÔNG hứa hẹn, KHÔNG comment-bait, KHÔNG kí tự < >.

CẢNH 1 luôn "intro"; cuối luôn "outro"; áp chót nên "cta". Giữa ƯU TIÊN media, xen text/quote cho nhịp.
Mỗi cảnh có "vo" = lời đọc tự nhiên 1-2 câu tiếng Việt, NỐI mạch, giọng hóng nhẹ nhàng có kiểm chứng.

KIỂU cảnh + trường (GIỐNG mẫu tạp chí gốc):
- intro:   {kick, disp:[3 dòng tiêu đề lớn], lede}
- text:    {align:"left"|"center"|"right", kick, kickInk?:true, rule?:true, disp:[2-3 dòng], lede}
- media:   {kick, disp:[2-3 dòng], lede, caps:["chú thích ảnh 1","chú thích ảnh 2"]}  (cảnh ẢNH — hệ thống tự gắn ảnh bài báo)
- stat:    {kick, big:"số ngắn", suffix:"đơn vị", disp:["1 dòng phụ"], lede}
- quote:   {quote:"câu trích ngắn (dùng *…* nhấn)", by:"nguồn dẫn ngắn"}
- band:    {kick, disp:[1-2 dòng], band:"1 câu chốt trong dải màu (*…* nhấn)"}
- list:    {kick, disp:[1-2 dòng], items:["mục 1","mục 2","mục 3"], lede}
- cta:     {kick, disp:["1-2 dòng chốt"], lede, pill:"chữ ngắn nút CTA"}
- outro:   {brand:"✳ TÊN KÊNH", lede:"1 câu kêu gọi theo dõi mềm"}

MARKUP (disp/lede/band/quote — KHÔNG < >): *nhấn màu* · **đậm** · _nghiêng_ · \\n xuống dòng.
Chỉ in JSON.`;

// ===== ĐỌC ẢNH THẬT TỪ BÀI BÁO: chup.mjs đã tải vào shots/img/ + ghi shots/manifest.json =====
// render.mjs copy shots/img → assets/img, build.py phunu resolve tên-file → assets/img/{file}. Nên spec.images = [tên file].
function articleImages() {
  try {
    if (!existsSync('shots/manifest.json')) return [];
    const m = JSON.parse(readFileSync('shots/manifest.json', 'utf8'));
    const shots = Array.isArray(m.shots) ? m.shots : [];
    // Ưu tiên ẢNH THẬT bài báo (kind='article' = og:image/ảnh trong bài); bù ảnh chụp (para/title) nếu thiếu.
    const real = shots.filter((s) => s && s.file && s.kind === 'article').map((s) => s.file);
    const shot = shots.filter((s) => s && s.file && s.kind !== 'article').map((s) => s.file);
    return [...real, ...shot];
  } catch (e) { return []; }
}

// Fallback stock (khi bài KHÔNG có ảnh) — hiếm, nhưng giữ mẫu không rỗng. Ảnh showbiz/giải trí.
const PEXELS_KEY = process.env.PEXELS_API_KEY || '';
const PIXABAY_KEY = process.env.PIXABAY_API_KEY || '';
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const jx = Math.floor(Math.random() * (i + 1)); [a[i], a[jx]] = [a[jx], a[i]]; } return a; }
async function fetchStock(query, n) {
  if (!query || n < 1) return [];
  const page = 1 + Math.floor(Math.random() * 3);
  if (PEXELS_KEY) {
    try {
      const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=30&page=${page}&orientation=portrait`, { headers: { authorization: PEXELS_KEY } });
      if (r.ok) { const j = await r.json(); const us = (j.photos || []).map((p) => p.src && (p.src.large2x || p.src.large || p.src.portrait)).filter(Boolean); if (us.length) return shuffle(us).slice(0, n); }
    } catch (e) { /* thử Pixabay */ }
  }
  if (PIXABAY_KEY) {
    try {
      const r = await fetch(`https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&image_type=photo&orientation=vertical&per_page=30&page=${page}&safesearch=true`);
      if (r.ok) { const j = await r.json(); const us = (j.hits || []).map((h) => h.largeImageURL || h.webformatURL).filter(Boolean); if (us.length) return shuffle(us).slice(0, n); }
    } catch (e) { /* hết nguồn */ }
  }
  return [];
}

let spec;
if (VERBATIM) {
  const vs = await verbatimScenes(ARTICLE, { key: KEY, model: MODEL, title: TITLE, max: 16 });
  const scenes = vs.map((s, i) => (i === 0)
    ? { type: 'intro', disp: [s.head], lede: s.lede, vo: s.vo }
    : ((i % 2 === 1) ? { type: 'media', disp: [s.head], lede: s.lede, vo: s.vo }
                     : { type: 'text', disp: [s.head], lede: s.lede, vo: s.vo }));
  scenes.push({ type: 'outro', vo: '' });
  spec = { scenes };
  console.error(`✓ VERBATIM phunu-vn: ${vs.length} câu giữ NGUYÊN lời đọc`);
} else {
  spec = await claudeJson({ key: KEY, model: MODEL, maxTokens: 3200, prompt: PROMPT, tries: 3, label: 'phunu-vn' });
}
if (!spec || !spec.scenes || !spec.scenes.length) { console.error('Thiếu scenes'); process.exit(1); }

spec.channel = (process.env.BRAND_LABEL || spec.channel || 'Kênh của bạn').toString().trim();
const _cap = await captionFor(ARTICLE || TITLE, { key: KEY, model: MODEL, title: TITLE, brandkw: BRANDKW });
spec.topic = (spec.topic || _cap.topic || process.env.SLOGAN || '').toString().trim();
spec.milestone = (spec.milestone || _cap.milestone || (spec.scenes[0] && spec.scenes[0].kick) || '').toString().trim();
spec.caption = { title: _cap.title, desc: _cap.desc };

// ẢNH: ưu tiên ẢNH THẬT bài báo; bài thiếu ảnh → bù stock giải trí (đủ cho lưới tạp chí).
let images = articleImages();
console.log(`  ảnh bài báo (shots): ${images.length}`);
if (images.length < 2) {
  const q = /giải trí|showbiz|sao|phim|nhạc|star|celeb/i.test(`${TITLE} ${BRANDKW}`) ? 'vietnamese celebrity entertainment stage' : 'entertainment concert crowd stage';
  const bu = await fetchStock(q, 8 - images.length);
  images = [...images, ...bu];
  console.log(`  bù stock: ${bu.length} (tổng ${images.length})`);
}
if (images.length) spec.images = images;
spec.palette = (process.env.PALETTE || 'den-gold').trim();   // showbiz mặc định den-gold sang trọng (user đổi được)

writeFileSync('spec.json', JSON.stringify(spec, null, 2));
console.log(`✓ spec.json (phunu-vn): ${spec.scenes.length} cảnh · ${(spec.images || []).length} ảnh (ưu tiên ảnh bài báo)`);
