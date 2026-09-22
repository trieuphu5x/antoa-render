// Soạn SPEC cho mẫu "phunu" (Phụ Nữ & Kinh Doanh Online) → spec.json cho templates/phunu/build.py.
import { writeFileSync } from 'node:fs';
import { claudeJson, verbatimScenes, captionFor } from './soan_util.mjs';

const KEY = process.env.CLAUDE_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const TITLE = process.env.TITLE || '';
const ARTICLE = process.env.ARTICLE || '';
const VERBATIM = process.env.VERBATIM === '1';   // 1 = kịch bản DÁN THỦ CÔNG → giữ NGUYÊN 100% lời đọc (chữ slide vẫn cô đọng)
const BRANDKW = process.env.BRANDKW || 'bán hàng online, khởi nghiệp, phụ nữ kinh doanh';
const NONCE = process.env.GITHUB_RUN_ID || String(Math.floor(Math.random() * 1e9));

const PROMPT = `Bạn là biên tập viên video editorial "Phụ Nữ & Kinh Doanh Online" (9:16, phong cách sổ tay kem–cam, ấm áp truyền cảm hứng). Soạn KỊCH BẢN cho chủ đề, trả về DUY NHẤT một JSON hợp lệ (không markdown).

CHỦ ĐỀ: "${TITLE}"
BỐI CẢNH: """${ARTICLE.slice(0, 2000)}"""
TỪ KHOÁ BÁM SÁT: ${BRANDKW}
Hạt giống đa dạng (để video này khác các video khác): ${NONCE}

JSON: { "channel":"<TÊN KÊNH ngắn, vd Khởi Sự>", "topic":"<chủ đề 2-3 từ TIẾNG ANH viết thường KHỚP ĐÚNG nội dung video này, vd life reflection / personal growth / online business / tech news>", "milestone":"<CHUYÊN MỤC/CỘT MỐC ngắn IN HOA khớp nội dung, vd MORNING RITUAL>", "num":"01", "scenes":[ {…}, … ] }  — CHỈ 10-12 cảnh.

⭐ ƯU TIÊN HÌNH ẢNH: **ÍT NHẤT MỘT NỬA** số cảnh là type "media" (ảnh thật). Hạn chế cảnh chữ dày. Video kể bằng ẢNH là chính, chữ chỉ điểm xuyết.
⭐ NGẮN GỌN (RẤT QUAN TRỌNG — đừng nhồi nhét): "disp" tối đa 2 dòng, mỗi dòng ≤ 4-5 từ (chỉ Ý CHÍNH). "lede" tối đa 1 câu NGẮN ≤ 12 từ (hoặc BỎ). "caps" (chú thích ảnh) ≤ 6 từ. Nhường không gian cho ảnh.

CẢNH 1 luôn type "intro"; CẢNH cuối luôn type "outro"; áp chót nên là type "cta". Ở giữa ƯU TIÊN media, xen kẽ ít text/stat/quote cho nhịp điệu.
TRIẾT LÝ ĐA DẠNG: xen kẽ media (đổi side trái/phải), text (đổi align), stat, quote — nhưng MEDIA chiếm đa số. Dùng hạt giống để đa dạng lựa chọn.
Mỗi cảnh có "vo" = lời đọc tự nhiên 1-2 câu (tiếng Việt, ấm, NỐI mạch với cảnh trước/sau để đọc LIỀN MẠCH; KHÔNG markup/kí tự < >).

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

let spec;
if (VERBATIM) {
  // KỊCH BẢN DÁN THỦ CÔNG → giữ NGUYÊN lời đọc; chỉ cô đọng chữ slide (head ngắn + lede). Xen kẽ ảnh/chữ.
  const vs = await verbatimScenes(ARTICLE, { key: KEY, model: MODEL, title: TITLE, max: 90 });
  const scenes = vs.map((s, i) => (i === 0)
    ? { type: 'intro', disp: [s.head], lede: s.lede, vo: s.vo }
    : ((i % 2 === 1) ? { type: 'media', disp: [s.head], lede: s.lede, vo: s.vo }
                     : { type: 'text', disp: [s.head], lede: s.lede, vo: s.vo }));
  scenes.push({ type: 'outro', vo: '' });
  spec = { scenes };
  console.error(`✓ VERBATIM phunu: ${vs.length} câu giữ NGUYÊN lời đọc + cô đọng slide`);
} else {
  spec = await claudeJson({ key: KEY, model: MODEL, maxTokens: 3200, prompt: PROMPT, tries: 3, label: 'phunu' });
}
if (!spec || !spec.scenes || !spec.scenes.length) { console.error('Thiếu scenes'); process.exit(1); }

// 🔊 CHỐNG CÂM: đảm bảo MỖI cảnh (trừ outro) có vo. Claude đôi khi bỏ trống vo → không TTS → video câm.
// Rỗng → dựng vo từ chữ hiển thị (disp/lede/quote/band) để LUÔN có lời đọc. (port từ soan_phunu_vn)
{
  const _strip = (s) => String(s || '').replace(/\*\*|[*_]/g, '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
  let _voFilled = 0;
  for (const sc of spec.scenes) {
    if (sc.type === 'outro') continue;
    if (String(sc.vo || '').trim()) continue;
    const disp = Array.isArray(sc.disp) ? sc.disp.map(_strip).filter(Boolean).join(', ') : _strip(sc.disp);
    sc.vo = [disp, _strip(sc.lede), _strip(sc.quote), _strip(sc.band)].filter(Boolean).join('. ').slice(0, 220) || _strip(sc.kick) || _strip(sc.big);
    if (String(sc.vo || '').trim()) _voFilled++;
  }
  if (_voFilled) console.error(`⚠ ${_voFilled} cảnh thiếu vo → tự dựng từ chữ slide (chống câm)`);
}

// Nhãn động: ưu tiên brand thật (env) → AI đề xuất → mặc định.
spec.channel = (process.env.BRAND_LABEL || spec.channel || 'Kênh của bạn').toString().trim();
// TIÊU ĐỀ SEO + caption + hashtag + TOPIC (góc phải) + CHUYÊN MỤC (góc trái) — LINH ĐỘNG theo nội dung/ngách (phunu scenes không tự có).
const _cap = await captionFor(ARTICLE || TITLE, { key: KEY, model: MODEL, title: TITLE, brandkw: BRANDKW });
spec.topic = (spec.topic || _cap.topic || process.env.SLOGAN || '').toString().trim();        // ô ② góc phải: chủ đề ≤3 từ (không default cứng)
spec.milestone = (spec.milestone || _cap.milestone || (spec.scenes[0] && spec.scenes[0].kick) || '').toString().trim();   // ô ① góc trái: chuyên mục AI sinh (linh động theo ngách)
spec.caption = { title: _cap.title, desc: _cap.desc };

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
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const jx = Math.floor(Math.random() * (i + 1)); [a[i], a[jx]] = [a[jx], a[i]]; } return a; }
async function fetchStock(query, n) {
  if (!query || n < 1) return [];
  const page = 1 + Math.floor(Math.random() * 3);   // đổi trang + xáo trộn → "Đổi ảnh" (stock) ra bộ KHÁC
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
const NEED = 15;   // đủ cho video 16-20 cảnh (lưới 4 / băng phim 4…), build.py xoay vòng — Boss chốt tối đa 15 ảnh user
let images = [];
try { images = JSON.parse(process.env.OWN_IMAGES || '[]'); } catch (e) { images = []; }
images = (images || []).map((u) => String(u).trim()).filter(Boolean).slice(0, NEED);
if (images.length === 0) {   // KHÔNG có ảnh riêng/đã lưu → lấy STOCK theo từ khoá. Có rồi → dùng ĐÚNG bộ đó (build.py xoay vòng), không trộn.
  // BÁM CHỦ ĐỀ + LINH ĐỘNG NGÁCH: ưu tiên `spec.topic` do AI sinh (tiếng Anh, KHỚP đúng nội dung + ngách dự án này)
  //   → KHÔNG bó cứng ngách phụ nữ/kinh doanh. Thiếu topic → fallback từ khoá/tiêu đề.
  const topic = String(spec.topic || '').trim();
  const q = (topic && /[a-z]/i.test(topic) && topic.length >= 3) ? topic : stockQuery(`${TITLE} ${BRANDKW}`);
  images = await fetchStock(q, NEED);
  console.log(`  ảnh stock: ${images.length} (q="${q}", topic AI="${topic}")`);
} else {
  console.log(`  ảnh có sẵn (Drive/đã lưu): ${images.length}`);
}
if (images.length) spec.images = images;
// PALETTE auto-KHỚP chủ đề khi user chọn "Tự khớp" (PALETTE rỗng/auto) — port từ phunu-vn. Cứng thì dùng đúng màu.
function pickPalette(text) {
  const s = String(text || '').toLowerCase();
  if (/qua đời|qua doi|tử vong|tu vong|ra đi|đột ngột|dot ngot|tang lễ|tang le|đau buồn|dau buon|chia tay|ly hôn|ly hon|scandal|kiện|kien|tranh cãi|tranh cai|xin lỗi|xin loi|phốt|phot|tố cáo|to cao|bóc phốt|boc phot|drama|lùm xùm|lum xum|bệnh nặng|benh nang|tai nạn|tai nan|bắt giữ|bat giu|điều tra|dieu tra/.test(s)) return 'navy-vang';
  if (/cưới|cuoi|đám cưới|dam cuoi|hạnh phúc|hanh phuc|em bé|em be|con đầu lòng|con dau long|tình yêu|tinh yeu|hẹn hò|hen ho|kỷ niệm|ky niem|cầu hôn|cau hon|đính hôn|dinh hon/.test(s)) return 'hong-dat';
  if (/biển|bien|đảo|dao|beach|resort|vịnh|vinh|thác|thac|núi|nui|rừng|rung|thiên nhiên|thien nhien|hồ |ho /.test(s)) return 'xanh-ngoc';
  if (/ẩm thực|am thuc|món ăn|mon an|đặc sản|dac san|food|quán ăn|quan an|nhà hàng|nha hang|cà phê|ca phe/.test(s)) return 'kem-cam';
  if (/du lịch|du lich|điểm đến|diem den|check.?in|phượt|phuot|travel|khám phá|kham pha|\btour\b|nghỉ dưỡng|nghi duong/.test(s)) return 'xanh-duong-cam';
  return 'den-gold';
}
const _pal = (process.env.PALETTE || '').trim().toLowerCase();
spec.palette = (_pal && _pal !== 'auto') ? _pal : pickPalette(`${TITLE}. ${String(ARTICLE).slice(0, 140)}`);   // user chọn màu cứng → dùng; "auto"/rỗng → tự khớp chủ đề
console.error(`✓ palette phunu: ${spec.palette} ${(_pal && _pal !== 'auto') ? '(user chọn)' : '(auto-khớp)'}`);

writeFileSync('spec.json', JSON.stringify(spec, null, 2));
console.log(`✓ spec.json (phunu): ${spec.scenes.length} cảnh · ${(spec.images || []).length} ảnh động`);
