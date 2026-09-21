// Soạn SPEC (cảnh + inner HTML kiểu AI Có Gì Mới) bằng Claude → spec.json cho dung.py.
// Dùng để validate bê nguyên mẫu. Sau sẽ chuyển logic này vào Tower (ai.js generateScenes).
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { cleanScriptLines } from './soan_util.mjs';   // lọc nhãn cấu trúc (HOOK:/CTA:/# TIÊU ĐỀ) trước khi đọc verbatim

const KEY = process.env.CLAUDE_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const TITLE = process.env.TITLE || '';
const ARTICLE = process.env.ARTICLE || '';
const BRANDKW = process.env.BRANDKW || 'AI Agent, tự động hoá';
const PERSONA = (process.env.BRAND_PERSONA || '').trim();   // giọng thương hiệu của dự án (News/vnnews) — nhất quán với Evergreen/Trend
const BRAND_LABEL = (process.env.BRAND_LABEL || '').trim() || 'ANTOA';                       // tên hiện cuối video (theo workflow)
const SLOGAN = (process.env.SLOGAN || '').trim() || 'Theo dõi để cập nhật mỗi ngày.';        // slogan cuối video (theo workflow)
const SOURCE = (process.env.SOURCE || '').trim();                                            // NGUỒN THẬT (masthead góc trên + "Nguồn:" dưới) — KHÔNG mặc định VnExpress
const IMG_MODE = (process.env.IMG_MODE || '').trim();                                        // 'article' = TIN TỨC VN → video DÀI hơn (~85s) vì bài VN dày số liệu
const VERBATIM = process.env.VERBATIM === '1';                                               // 1 = dùng ĐÚNG NGUYÊN VĂN kịch bản Boss đã sửa (ARTICLE = kịch bản), KHÔNG để Claude viết lại lời
// ⏱ ĐỘ DÀI VIDEO (Sản Xuất tay): TARGET_SEC (giây) → số cảnh (~8s/cảnh). Rỗng/0 = mặc định (VN 10-12 · News 7-8). CHỈ áp khi AI TỰ viết (verbatim bỏ qua path này).
const TARGET_SEC = Math.min(210, Math.max(0, Number(process.env.TARGET_SEC) || 0));
const SCENE_MAP = { 60: '7-8', 90: '11-12', 120: '15-16', 150: '19-20', 180: '22-24' };       // khớp 5 mức UI (1′/1′30/2′/2′30/3′)
const NSCENES = TARGET_SEC
  ? (SCENE_MAP[TARGET_SEC] || `${Math.floor(TARGET_SEC / 8)}-${Math.floor(TARGET_SEC / 8) + 2}`)
  : (IMG_MODE === 'article' ? '10-12' : '7-8');
const MAXTOK = IMG_MODE === 'article' ? 3800 : 2600;                                         // VN nhiều cảnh → nới token

// #1 ẢNH BÀI GỐC: đọc manifest do chup.mjs ghi (nếu chụp thành công). Ảnh ĐẦU (hl.png) vào cảnh HOOK → thumbnail.
let SHOTS = [];
try { if (existsSync('shots/manifest.json')) SHOTS = (JSON.parse(readFileSync('shots/manifest.json', 'utf8')).shots || []); } catch (e) { SHOTS = []; }
const cardH = (s) => Math.max(80, Math.min(340, Math.round(770 * (s.h || 150) / (s.w || 770))));   // cao hiển thị (card rộng 770px)
// BỎ nhãn "BÀI GỐC · nguồn" TRÊN ảnh (Boss) — đã có dẫn nguồn góc trái-dưới (.credit) xuyên suốt video rồi.
const cardHtml = (file, h, kind) => `<div class="card anim"><img src="assets/img/${file}" style="width:770px;height:${h}px" /></div>`;
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
${SHOTS.map((s, i) => `- Ảnh ${i + 1} (${s.kind === 'stock' ? 'MINH HOẠ' : s.kind === 'title' ? 'TIÊU ĐỀ' : 'BÀI GỐC'}): dán NGUYÊN ${cardHtml(s.file, cardH(s), s.kind)}`).join('\n')}
LUẬT DÙNG ẢNH: ĐẶT ảnh đầu "${SHOTS[0].file}" VÀO CẢNH HOOK s1 (làm thumbnail) — s1 = <div class="mid">[head hook] + [thẻ .card ảnh đầu]</div>. Ảnh còn lại rải 1-2 cảnh giữa. Giữ NGUYÊN src+style, đặt TRONG <div class="mid">.
` : '';

const PROMPT = `Bạn là biên tập viên video tin ngắn 9:16 (kênh kiểu "AI Có Gì Mới"). Việt hoá tin dưới đây thành KỊCH BẢN VIDEO gồm ${NSCENES} CẢNH${TARGET_SEC ? ` (mỗi cảnh 1 câu lời đọc ~8 giây → tổng ĐỦ DÀY cho video ~${TARGET_SEC} giây; khai thác sâu, mỗi cảnh 1 ý rõ, KHÔNG lặp, KHÔNG kéo lê)` : (IMG_MODE === 'article' ? ' (tin Việt Nam nhiều số liệu — khai thác SÂU, mỗi cảnh 1 ý/1 con số rõ, KHÔNG lặp; đủ dày cho video ~85 giây)' : '')}, trả về DUY NHẤT một JSON hợp lệ (không markdown, không giải thích).

TIN: "${TITLE}"
NỘI DUNG GỐC: """${ARTICLE.slice(0, 2400)}"""
TỪ KHOÁ THƯƠNG HIỆU (bám sát): ${BRANDKW}
${PERSONA ? `GIỌNG THƯƠNG HIỆU (viết lời đọc theo giọng này): ${PERSONA}\n` : ''}${IMG_BLOCK}
JSON dạng:
{
 "palette": "<một trong: hot|launch|creative|biz|research — chọn theo LOẠI tin: hot=drama/an ninh, launch=ra mắt/model mới, creative=phim-ảnh-nghệ thuật AI, biz=thị trường/kinh doanh, research=nghiên cứu>",
 "caption": {"title":"<TIÊU ĐỀ chuẩn SEO cho Facebook & YouTube: TIẾNG VIỆT, 1 dòng, ĐẶT TỪ KHOÁ/tên chủ thể QUAN TRỌNG NHẤT LÊN ĐẦU (vd tên model/hãng/công nghệ) để dễ tìm, RÕ RÀNG ĐÚNG BẢN CHẤT (nêu chủ thể + việc gì), giọng ĐIỀM ĐẠM — TUYỆT ĐỐI KHÔNG giật gân/clickbait/thổi phồng, 50-90 ký tự, KHÔNG hashtag, KHÔNG dấu ngoặc kép, KHÔNG viết HOA toàn bộ>", "desc":"<caption đăng: TỐI ĐA 2 câu ngắn gọn TRUNG LẬP (không câu tương tác giật gân) + 3-5 hashtag trung tính bám chủ đề. TUYỆT ĐỐI KHÔNG nhồi toàn bộ nội dung/kịch bản vào đây>"},
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
- ⚖️ AN TOÀN TIN TỨC (BẮT BUỘC — tránh nền tảng gỡ/hạn chế):
  1) TRUNG THỰC với bài gốc: chỉ nói thông tin CÓ trong bài, KHÔNG bịa/suy diễn/quy chụp, KHÔNG thêm số liệu-chi tiết không có.
  2) KHÔNG giật tít sai sự thật; KHÔNG phóng đại ("chấn động/kinh hoàng/sốc") nếu bài gốc không vậy. Tiêu đề phải khớp nội dung.
  3) Tin CHƯA kiểm chứng: dùng "theo nguồn tin/được cho là/nghi vấn" — KHÔNG khẳng định chắc chắn.
  4) KHÔNG mô tả bạo lực/tai nạn/thương vong/tang thương chi tiết phản cảm; né hình ảnh máu me, thi thể.
  5) Tin nhạy cảm (chính trị/tôn giáo/sắc tộc/lãnh thổ): đưa TRUNG LẬP, KHÔNG bình luận định hướng, KHÔNG kích động.
  6) KHÔNG bôi nhọ/xúc phạm/kết tội cá nhân-tổ chức; nêu cáo buộc thì ghi rõ là "cáo buộc/đang điều tra", tôn trọng suy đoán vô tội.
  7) 🔇 GIỌNG ĐIỀM ĐẠM, đưa tin KHÁCH QUAN — thà bớt thu hút còn hơn bị nền tảng cắm cờ. Áp dụng cho CẢ lời đọc (vo), tiêu đề cảnh (head), TIÊU ĐỀ SEO (caption.title), caption đăng (caption.desc) và HASHTAG: KHÔNG dùng từ giật gân/clickbait ("sốc", "chấn động", "kinh hoàng", "phải xem ngay", "sự thật khủng khiếp", "không thể tin nổi"), KHÔNG viết HOA cả cụm để hù, KHÔNG lạm dụng !/?. Hashtag: 3-5 cái TRUNG TÍNH bám chủ đề, KHÔNG hashtag giật gân/gây sợ hãi/câu tương tác.
Chỉ in JSON.`;

// ===== VERBATIM: dùng ĐÚNG NGUYÊN VĂN kịch bản Boss sửa (ARTICLE = kịch bản) — KHÔNG để Claude viết lại LỜI ĐỌC =====
// Mỗi câu/dòng = 1 cảnh, "vo" giữ NGUYÊN 100%. HÌNH thì Claude CÔ ĐỌNG (head NGẮN in hoa + lede chữ thường) như bản News
// đẹp — KHÔNG nhét cả câu vào head (tránh bức tường chữ hoa). Claude lỗi → fallback tách câu (head = cụm đầu, lede = phần còn lại).
async function buildVerbatimSpec(scriptText) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let lines = cleanScriptLines(scriptText, 14);   // bỏ nhãn cấu trúc + markdown, giữ câu thoại sạch verbatim
  if (!lines.length) lines = [String(TITLE || 'Tin mới')];
  const KICK = ['Điểm chính', 'Chi tiết', 'Đáng chú ý', 'Bối cảnh', 'Con số', 'Diễn biến', 'Kết luận'];
  const P = /kinh doanh|thị trường|lợi nhuận|tỉ đồng|doanh nghiệp|tài chính|cổ phiếu|tăng trưởng/i.test(scriptText) ? 'biz'
    : /ra mắt|vừa công bố|trình làng|phiên bản|model|sản phẩm mới/i.test(scriptText) ? 'launch'
    : /nghiên cứu|khoa học|phát hiện|thử nghiệm/i.test(scriptText) ? 'research'
    : /phim|nghệ thuật|âm nhạc|sáng tạo|thời trang/i.test(scriptText) ? 'creative' : 'hot';
  // CÔ ĐỌNG HÌNH bằng Claude (KHÔNG đổi lời đọc). Trả head ngắn + lede thường cho từng câu.
  let vis = [];
  if (KEY) {
    try {
      const vp = `Cho ${lines.length} câu LỜI ĐỌC video tin ngắn 9:16, theo thứ tự. Với MỖI câu, tạo phần HÌNH gọn & chuyên nghiệp:
- "head": ý chính RẤT NGẮN 3-7 từ (hiện chữ TO in hoa) — TUYỆT ĐỐI KHÔNG chép cả câu.
- "lede": 1 câu diễn giải ngắn (tối đa 16 từ), chữ thường tự nhiên.
KHÔNG trả lời đọc. Trả DUY NHẤT JSON: {"v":[{"head":"...","lede":"..."}]} đúng ${lines.length} phần tử, đúng thứ tự.
CÁC CÂU:
${lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}`;
      const rr = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: MODEL, max_tokens: 2200, messages: [{ role: 'user', content: vp }] }) });
      if (rr.ok) { const jj = await rr.json(); const raw = (jj?.content || []).map((b) => b.text || '').join(''); const m = raw.match(/\{[\s\S]*\}/); if (m) vis = (JSON.parse(m[0]).v) || []; }
    } catch (e) { console.log('verbatim: Claude cô đọng hình lỗi → fallback tách câu'); }
  }
  const words = (s) => String(s).trim().split(/\s+/);
  // PHỐI 2 MÀU head (LINH HỒN mẫu): chưa có *…* thì tự nhấn NỬA SAU, rồi đổi *x* → <span class="emr">x</span> (escape phần còn lại).
  const hiHead = (h) => {
    let s = String(h || '').trim();
    if (!s.includes('*')) { const hw = s.split(/\s+/); if (hw.length >= 3) { const k = Math.ceil(hw.length / 2); s = `${hw.slice(0, k).join(' ')} *${hw.slice(k).join(' ')}*`; } }
    return s.split(/(\*[^*]+\*)/).map((p) => (p.startsWith('*') && p.endsWith('*') && p.length > 2) ? `<span class="emr">${esc(p.slice(1, -1))}</span>` : esc(p)).join('');
  };
  const scenes = lines.map((vo, i) => {
    const v = vis[i] || {};
    const w = words(vo);
    const head = String(v.head || w.slice(0, 6).join(' ')).trim().replace(/[.,!?…:;]+$/, '');
    const lede = String(v.lede || (v.head ? '' : (w.length > 6 ? w.slice(6).join(' ') : ''))).trim();
    const inner = `<div class="mid"><div class="kick anim">${KICK[i % KICK.length]}</div><div class="head h-md anim">${hiHead(head)}</div>${lede ? `<div class="lede anim">${esc(lede)}</div>` : ''}</div>`;
    return { id: `s${i + 1}`, inner, vo };   // vo NGUYÊN VĂN 100%
  });
  const desc = lines.slice(0, 2).join(' ').slice(0, 180);
  return { palette: P, caption: { title: TITLE || '', desc }, scenes };
}
let spec;
if (VERBATIM) {
  spec = await buildVerbatimSpec(ARTICLE);
  console.log(`✓ VERBATIM: lời đọc giữ 100% + hình cô đọng (head ngắn + lede) → ${spec.scenes.length} cảnh`);
} else {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: MAXTOK, messages: [{ role: 'user', content: PROMPT }] }),
  });
  if (!r.ok) { console.error(`❌ Claude ${r.status}:`, (await r.text().catch(() => '')).slice(0, 300)); process.exit(1); }
  const j = await r.json();
  const raw = (j?.content || []).map((b) => b.text || '').join('');
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) { console.error('❌ Không parse được JSON:', raw.slice(0, 300)); process.exit(1); }
  spec = JSON.parse(m[0]);
}
// 🛡️ KIỂM SÁT VIÊN (chạy tại backend Mỹ, nơi Claude không bị 403): kịch bản phải ≥3 cảnh, nếu không → chặn, KHÔNG render video rỗng.
// VERBATIM: Boss tự quyết nội dung/độ dài → chỉ cần ≥1 cảnh (không ép ≥3).
const MIN_SCENES = VERBATIM ? 1 : 3;
if (!Array.isArray(spec.scenes) || spec.scenes.length < MIN_SCENES) {
  console.error(`❌ KIỂM SÁT chặn: kịch bản chỉ ${spec.scenes?.length || 0} cảnh (<${MIN_SCENES}) — không sản xuất video rỗng.`);
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
      const fc = cardHtml(first.file, cardH(first), first.kind);
      s1.inner = /<\/div>\s*$/.test(s1.inner || '') ? s1.inner.replace(/<\/div>\s*$/, fc + '</div>') : `<div class="mid">${s1.inner || ''}${fc}</div>`;
    }
    // RẢI các ảnh còn lại (shot2..) vào những cảnh CHƯA có ảnh (bỏ outro sO) — QUAN TRỌNG cho VERBATIM (Claude không tự chèn).
    const referenced = (f) => spec.scenes.some((sc) => (sc.inner || '').includes(f));
    let placeIdx = 1;
    for (const shot of usable.slice(1)) {
      if (referenced(shot.file)) continue;
      while (placeIdx < spec.scenes.length && (spec.scenes[placeIdx].id === 'sO' || /class="card/.test(spec.scenes[placeIdx].inner || ''))) placeIdx++;
      if (placeIdx >= spec.scenes.length) break;
      const sc = spec.scenes[placeIdx];
      const fc = cardHtml(shot.file, cardH(shot), shot.kind);
      sc.inner = /<\/div>\s*$/.test(sc.inner || '') ? sc.inner.replace(/<\/div>\s*$/, fc + '</div>') : `<div class="mid">${sc.inner || ''}${fc}</div>`;
      placeIdx++;
    }
    console.log(`✓ Ảnh: ${usable.length}/${SHOTS.length} — ảnh đầu ở hook, còn lại rải vào các cảnh`);
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
