// Soạn SPEC (cảnh + inner HTML kiểu AI Có Gì Mới) bằng Claude → spec.json cho dung.py.
// Dùng để validate bê nguyên mẫu. Sau sẽ chuyển logic này vào Tower (ai.js generateScenes).
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const KEY = process.env.CLAUDE_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const TITLE = process.env.TITLE || '';
const ARTICLE = process.env.ARTICLE || '';
const BRANDKW = process.env.BRANDKW || 'AI Agent, tự động hoá';
const BRAND_LABEL = (process.env.BRAND_LABEL || '').trim() || 'ANTOA';                       // tên hiện cuối video (theo workflow)
const SLOGAN = (process.env.SLOGAN || '').trim() || 'Theo dõi để cập nhật mỗi ngày.';        // slogan cuối video (theo workflow)
const SOURCE = (process.env.SOURCE || '').trim();                                            // NGUỒN THẬT (masthead góc trên + "Nguồn:" dưới) — KHÔNG mặc định VnExpress

// #1 ẢNH BÀI GỐC: đọc manifest do chup.mjs ghi (nếu chụp thành công). Ảnh ĐẦU (hl.png) vào cảnh HOOK → thumbnail.
let SHOTS = [];
try { if (existsSync('shots/manifest.json')) SHOTS = (JSON.parse(readFileSync('shots/manifest.json', 'utf8')).shots || []); } catch (e) { SHOTS = []; }
const cardH = (s) => Math.max(80, Math.min(340, Math.round(770 * (s.h || 150) / (s.w || 770))));   // cao hiển thị (card rộng 770px)
const cardTag = 'BÀI GỐC' + (SOURCE ? ' · ' + SOURCE.toUpperCase() : '');
const cardHtml = (file, h) => `<div class="card anim"><div class="tab">${cardTag}</div><img src="assets/img/${file}" style="width:770px;height:${h}px" /></div>`;
// 🩹 FIX "dán sai vị trí ảnh": ép MỌI thẻ .card nằm TRONG <div class="mid"> (haiku hay đặt card SAU </div> đóng mid →
// card position:relative rơi lên đỉnh scene, ĐÈ masthead "TIN NÓNG"). Gỡ card ra rồi chèn lại vào cuối .mid → luôn ở vùng nội dung.
function ensureCardInMid(inner) {
  inner = String(inner || '');
  const cardRe = /<div class="card[^>]*">[\s\S]*?<img[^>]*>\s*<\/div>/g;
  const cards = inner.match(cardRe) || [];
  if (!cards.length) return inner;
  const rest = inner.replace(cardRe, '').trim();
  if (/^<div class="mid[^>]*>[\s\S]*<\/div>\s*$/.test(rest)) {
    return rest.replace(/<\/div>\s*$/, cards.join('') + '</div>');   // chèn card vào cuối .mid (trong vùng nội dung)
  }
  const body = rest.replace(/^<div class="mid[^>]*>/, '').replace(/<\/div>\s*$/, '');   // gỡ mid lỗi/không chuẩn
  return `<div class="mid">${body}${cards.join('')}</div>`;           // bọc lại sạch, card nằm trong
}
const IMG_BLOCK = SHOTS.length ? `
CÓ ${SHOTS.length} ẢNH CHỤP BÀI GỐC (dán vào cảnh bằng thẻ .card — TĂNG ĐỘ TIN CẬY):
${SHOTS.map((s, i) => `- Ảnh ${i + 1} (${s.kind === 'title' ? 'TIÊU ĐỀ' : 'đoạn'}): dán NGUYÊN ${cardHtml(s.file, cardH(s))}`).join('\n')}
LUẬT DÙNG ẢNH: ĐẶT ảnh đầu "${SHOTS[0].file}" VÀO CẢNH HOOK s1 (làm thumbnail) — s1 = <div class="mid">[head hook] + [thẻ .card ảnh đầu]</div>. Ảnh còn lại rải 1-2 cảnh giữa. Giữ NGUYÊN src+style, đặt TRONG <div class="mid">.
` : '';

const PROMPT = `Bạn là biên tập viên video tin ngắn 9:16 (kênh kiểu "AI Có Gì Mới"). Việt hoá tin dưới đây thành KỊCH BẢN VIDEO gồm 7-8 CẢNH, trả về DUY NHẤT một JSON hợp lệ (không markdown, không giải thích).

TIN: "${TITLE}"
NỘI DUNG GỐC: """${ARTICLE.slice(0, 2400)}"""
TỪ KHOÁ THƯƠNG HIỆU (bám sát): ${BRANDKW}
${IMG_BLOCK}
JSON dạng:
{
 "palette": "<một trong: hot|launch|creative|biz|research — chọn theo LOẠI tin: hot=drama/an ninh, launch=ra mắt/model mới, creative=phim-ảnh-nghệ thuật AI, biz=thị trường/kinh doanh, research=nghiên cứu>",
 "caption": {"title":"<TIÊU ĐỀ chuẩn SEO cho Facebook & YouTube: TIẾNG VIỆT, 1 dòng, ĐẶT TỪ KHOÁ/tên chủ thể QUAN TRỌNG NHẤT LÊN ĐẦU (vd tên model/hãng/công nghệ), có yếu tố người-hay-tìm + hấp dẫn (con số/kết quả/'mới nhất'/'vừa ra mắt'…), 50-90 ký tự, KHÔNG hashtag, KHÔNG dấu ngoặc kép, KHÔNG viết HOA toàn bộ>", "desc":"<caption đăng: TỐI ĐA 2 câu ngắn gọn + 4-5 hashtag. TUYỆT ĐỐI KHÔNG nhồi toàn bộ nội dung/kịch bản vào đây>"},
 "scenes": [
   {"id":"s1","inner":"<HTML cảnh HOOK>","vo":"<lời đọc cảnh 1>"},
   ... các cảnh giữa ...,
   {"id":"s7","inner":"<HTML cảnh CTA hỏi>","vo":"<lời đọc>"},
   {"id":"sO","inner":"<div class=\\"mid\\"><div class=\\"brand anim\\">${BRAND_LABEL}</div><div class=\\"lede anim\\">${SLOGAN}</div></div>"}
 ]
}

LUẬT viết "inner" (BẮT BUỘC, chỉ dùng các class này):
- Bọc ngoài: <div class="mid"> ... </div>  (cảnh chữ thuần, căn giữa).
- Nhãn nhỏ trên cùng: <div class="kick anim">Nhãn ngắn</div>  (VD "Sự thật", "Số liệu", "Ra mắt").
- Tiêu đề cảnh: <div class="head h-md anim">Chữ chính <span class="emr">nhấn ĐỎ/CAM</span></div>  (dùng <span class="em">…</span> nhấn màu phụ; xuống dòng bằng <br/> khi cần, tránh mồ côi 1 từ).
- Câu diễn giải: <div class="lede anim">1 câu ngắn, dễ hiểu cho người Việt.</div>
- Cảnh cuối (sO): dùng <div class="brand anim">${BRAND_LABEL}</div>.
- KHÔNG dùng class/thẻ khác. ${SHOTS.length ? 'ẢNH: CHỈ dùng qua thẻ .card đã cho ở trên (giữ nguyên src+style). BẮT BUỘC đặt thẻ .card BÊN TRONG <div class="mid">…</div> (là phần tử con cuối) — TUYỆT ĐỐI KHÔNG đặt sau thẻ </div> đóng .mid, nếu không ảnh sẽ rơi lên đỉnh đè tiêu đề.' : 'KHÔNG dùng ảnh, KHÔNG style inline.'}
- "vo" = lời đọc tự nhiên tiếng Việt (1 câu/cảnh), KHÔNG chứa HTML.
- An toàn nền tảng: KHÔNG hứa thu nhập/mốc thời gian/comment-bait/thổi phồng, KHÔNG ký tự < > trong text hiển thị (dùng "trên/dưới").
Chỉ in JSON.`;

const r = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
  body: JSON.stringify({ model: MODEL, max_tokens: 2600, messages: [{ role: 'user', content: PROMPT }] }),
});
if (!r.ok) { console.error(`❌ Claude ${r.status}:`, (await r.text().catch(() => '')).slice(0, 300)); process.exit(1); }
const j = await r.json();
const raw = (j?.content || []).map((b) => b.text || '').join('');
const m = raw.match(/\{[\s\S]*\}/);
if (!m) { console.error('❌ Không parse được JSON:', raw.slice(0, 300)); process.exit(1); }
const spec = JSON.parse(m[0]);
// 🛡️ KIỂM SÁT VIÊN (chạy tại backend Mỹ, nơi Claude không bị 403): kịch bản phải ≥3 cảnh, nếu không → chặn, KHÔNG render video rỗng.
if (!Array.isArray(spec.scenes) || spec.scenes.length < 3) {
  console.error(`❌ KIỂM SÁT chặn: kịch bản chỉ ${spec.scenes?.length || 0} cảnh (<3) — không sản xuất video rỗng.`);
  process.exit(1);
}
// ÉP cảnh cuối (thương hiệu) dùng đúng BRAND_LABEL + SLOGAN theo workflow — AI có thể không theo sát mẫu.
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const closing = `<div class="mid"><div class="brand anim">${escHtml(BRAND_LABEL)}</div><div class="lede anim">${escHtml(SLOGAN)}</div></div>`;
const sO = spec.scenes.find((s) => s.id === 'sO');
if (sO) { sO.inner = closing; if (!sO.vo) sO.vo = SLOGAN; }
else spec.scenes.push({ id: 'sO', inner: closing, vo: SLOGAN });
console.log(`✓ Cảnh cuối: thương hiệu="${BRAND_LABEL}" · slogan="${SLOGAN}"`);

// #1 ẢNH: đảm bảo ảnh ĐẦU (hl.png) nằm ở cảnh HOOK s1 → thành thumbnail; nếu AI quên thì tự chèn.
if (SHOTS.length) {
  const usable = SHOTS.filter((s) => existsSync('shots/img/' + s.file));
  const first = usable[0];
  if (first && spec.scenes[0]) {
    const s1 = spec.scenes[0];
    if (!/class="card/.test(s1.inner || '')) {
      const fc = cardHtml(first.file, cardH(first));
      s1.inner = /<\/div>\s*$/.test(s1.inner || '') ? s1.inner.replace(/<\/div>\s*$/, fc + '</div>') : `<div class="mid">${s1.inner || ''}${fc}</div>`;
    }
    console.log(`✓ Ảnh bài gốc: ${usable.length}/${SHOTS.length} — ảnh đầu "${first.file}" ở cảnh hook (thumbnail)`);
  } else console.log('• Ảnh chụp không dùng được → text/stat');
} else console.log('• Không có ảnh chụp → text/stat');

// 🩹 CHUẨN HOÁ vị trí ảnh cho MỌI cảnh: ép .card vào trong .mid (chống card đè masthead — Boss báo khung 20h 2026-09-05).
let fixedCards = 0;
for (const sc of spec.scenes) {
  const before = sc.inner;
  sc.inner = ensureCardInMid(sc.inner);
  if (sc.inner !== before) fixedCards++;
}
if (fixedCards) console.log(`✓ Chuẩn hoá vị trí ảnh: ${fixedCards} cảnh (ép .card vào .mid, không đè masthead)`);

// NGUỒN: chỉ hiện DƯỚI ĐÁY ("Nguồn:"). Góc trên-phải ĐỂ TRỐNG — loại tin đã ở góc trái (mỗi loại 1 màu),
// KHÔNG để ngày (tránh khách tưởng tin cũ → giảm giữ chân). Boss chốt 2026-09-03.
spec.source = SOURCE;
// Danh mục masthead theo palette (thay "KINH DOANH" cứng cho mọi tin).
const CAT = { hot: 'NÓNG', launch: 'CÔNG NGHỆ', creative: 'SÁNG TẠO', biz: 'KINH DOANH', research: 'NGHIÊN CỨU' };
spec.mast_a = spec.mast_a || 'TIN';
spec.mast_b = CAT[spec.palette] || spec.mast_b || 'CÔNG NGHỆ';
console.log(`✓ Nguồn: "${SOURCE || '(trống)'}" · Danh mục: ${spec.mast_a} ${spec.mast_b}`);

// #7 HASHTAG THƯƠNG HIỆU: đảm bảo caption có hashtag brand (từ BRAND_LABEL, bỏ dấu) — như local #AICoGiMoi.
try {
  const brandTag = '#' + String(BRAND_LABEL).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^A-Za-z0-9]/g, '');
  if (brandTag.length > 2 && spec.caption) {
    const d = String(spec.caption.desc || '');
    if (!new RegExp('\\' + brandTag + '\\b', 'i').test(d)) spec.caption.desc = (brandTag + ' ' + d).trim();   // prepend → render.mjs gom về cụm hashtag
  }
} catch (e) { /* bỏ qua */ }

// #8 TIÊU ĐỀ KHÔNG RỖNG: YouTube BẮT BUỘC title — rỗng → video "unknown" + mất caption/hashtag ở Short.
//    Claude thỉnh thoảng trả caption.title rỗng → ép fallback: TITLE nguồn → câu đầu desc → mặc định.
spec.caption = spec.caption || {};
if (!String(spec.caption.title || '').trim()) {
  const fromDesc = String(spec.caption.desc || '').replace(/#[\p{L}0-9_]+/gu, ' ').replace(/\s+/g, ' ').trim().split(/(?<=[.!?…])\s+/)[0] || '';
  spec.caption.title = (String(TITLE || '').trim() || fromDesc || 'AI Có Gì Mới').slice(0, 90);
  console.log(`⚠️ caption.title RỖNG → fallback: "${spec.caption.title}"`);
}

spec.tts = process.env.SPEC_TTS || 'edge';
if (process.env.SPEC_VOICE) spec.voice = process.env.SPEC_VOICE;
writeFileSync('spec.json', JSON.stringify(spec, null, 2));
console.log(`✓ spec.json: palette=${spec.palette} · ${spec.scenes.length} cảnh · tts=${spec.tts}`);
console.log('Cảnh 1 inner:', spec.scenes[0].inner.slice(0, 140));
