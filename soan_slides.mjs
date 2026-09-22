// Soạn SPEC cho mẫu "slides" (Agent Thực Chiến) → spec.json cho templates/slides/build.py.
// TRIẾT LÝ (Boss chốt): mỗi CÂU → CHỌN kiểu slide HỢP nội dung câu đó (KHÔNG random/ép câu vào kiểu). Nội dung đa dạng → video tự nhiên nhiều kiểu. Nonce chỉ để 2 video CÙNG chủ đề đỡ giống nhau.
import { writeFileSync } from 'node:fs';
import { verbatimScenes, captionFor } from './soan_util.mjs';

const KEY = process.env.CLAUDE_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const TITLE = process.env.TITLE || '';
const ARTICLE = process.env.ARTICLE || '';
const VERBATIM = process.env.VERBATIM === '1';   // 1 = kịch bản DÁN THỦ CÔNG → giữ NGUYÊN 100% (mỗi câu = 1 slide)
const BRANDKW = process.env.BRANDKW || 'AI Agent, tự động hoá kinh doanh';
const BRAND_LABEL = (process.env.BRAND_LABEL || '').trim() || (process.env.VERBATIM === '1' ? '' : 'ANTOA');   // THỦ CÔNG: để trống = rỗng · AUTO: mặc định ANTOA
const NONCE = process.env.GITHUB_RUN_ID || String(Math.floor(Math.random() * 1e9));

export const SLIDES_CATALOG = `DANH MỤC KIỂU SLIDE (chọn kiểu HỢP nội dung; item cách bằng " | ", field cách bằng " :: ", đặc biệt ">>"):
BIGTEXT: câu chính :: câu phụ
STAT: SỐ/kí hiệu :: nhãn :: phụ          (vd "×3" hay "90%")
TAKEAWAY: điều ghi nhớ :: bổ sung
CALLOUT: cảnh báo :: giải thích
DEFINITION: thuật ngữ :: ví von :: nghĩa
CHECKLIST: mục | mục | mục
STEPS: bước::phụ | bước::phụ | bước
COUNTDOWN: mục::phụ | mục::phụ
FLOW: 📋 việc1 | 🧩 việc2 | ✅ việc3      (mỗi mục 1 emoji + chữ ngắn)
FORMULA: 📋 a | 🧩 b >> kết quả
TRANSFORM: trước :: sau :: phụ
SPLIT: trước :: sau
COMPARE: nhãnA::tênA::mô tảA | nhãnB::tênB::mô tảB
PROSCONS: xấu1 | xấu2 >> tốt1 | tốt2
TRIO: số1::nhãn1 | số2::nhãn2 | số3::nhãn3
GRID: 🔧 nhãn | 📈 nhãn | 💬 nhãn | ⚙️ nhãn
QUOTE: câu trích :: người nói
TERMINAL: câu lệnh ngắn :: phụ
CHAT: câu của bạn :: câu của agent
PROGRESS: nhãn :: sốphầntrăm :: phụ       (vd 70)
DONUT: sốphầntrăm :: chữ giữa :: đuôi     (vd 80)
BARS: nhãn::phụ::caoPx | ...              (caoPx 120-300)
RANKING: tên::rộngPx | ...                (rộng 120-300)
FUNNEL: tầng1 | tầng2 | tầng3 | tầng4
TAGS: tiêu đề | tag1 | tag2 | tag3
TIMELINE: mốc::tiêu đề::mô tả | ...
HUB: trung tâm >> nhánh1 | nhánh2 | nhánh3 | nhánh4
ORBIT: lõi >> vệ tinh1 | vệ tinh2 | vệ tinh3
LOOP: bước1 | bước2 | bước3 | bước4
MATRIX: ô1 :: ô2 :: ô3 :: ô4 (ô4 nổi bật)`;

export const slidesPrompt = ({ title, article, kw, nonce }) => `Bạn là biên kịch video "Agent Thực Chiến" (slide infographic 9:16 dạy nghề dùng AI Agent). Viết KỊCH BẢN cho chủ đề, trả về DUY NHẤT một JSON hợp lệ (không markdown).

CHỦ ĐỀ: "${title}"
BỐI CẢNH: """${(article || '').slice(0, 2000)}"""
TỪ KHOÁ BÁM SÁT: ${kw}
Hạt giống đa dạng (để video này khác các video khác): ${nonce}

JSON: { "num":"01", "caption":{"title":"<TIÊU ĐỀ SEO tiếng Việt 1 dòng: đặt TỪ KHOÁ/chủ thể quan trọng nhất LÊN ĐẦU, hấp dẫn, 50-90 ký tự, KHÔNG hashtag, KHÔNG dấu ngoặc kép, KHÔNG viết HOA toàn bộ>", "desc":"<caption đăng: TỐI ĐA 2 câu ngắn + 4-5 hashtag; KHÔNG nhồi cả kịch bản>"}, "script":["câu 1", ... 12-16 câu ...], "slides":["<sceneNo> | <TYPE> | <pill> | <args>", ...] }

"caption": để đăng lên Telegram/FB/YT/TikTok — title = tiêu đề SEO tiếng Việt; desc = caption ngắn + hashtag.
"script": 12-16 câu, MỖI CÂU = 1 slide, ngắn gọn khẩu ngữ có nhịp; câu 1 = HOOK; câu cuối = chốt + gợi hành động mềm. Bám nghề AI Agent. KHÔNG hứa thu nhập/mốc thời gian/comment-bait, KHÔNG kí tự < >.

"slides" — QUY TẮC:
- 🎯 MỤC TIÊU: HẦU HẾT câu PHẢI có kiểu slide ĐỒ HOẠ — tối thiểu 10/14 câu (≥70%). Gần như câu nào CŨNG có 1 kiểu hình hợp; ĐỪNG dồn câu vào text cho "an toàn". CHỈ để TRỐNG (text slide) TỐI ĐA 2-3 câu kể chuyện/dẫn dắt thuần, không có ý cụ thể.
- CÂU 1 (HOOK) & CÂU CHỐT: dùng BIGTEXT hoặc CALLOUT (KHÔNG để text thường — đây là câu quan trọng nhất).
- CHỌN KIỂU THEO Ý CÂU (sceneNo = vị trí câu 1-based): số/tỉ lệ→STAT/TRIO/PROGRESS/DONUT/BARS; liệt kê/nhiều mục→CHECKLIST/STEPS/COUNTDOWN/GRID/TAGS; quy trình/vòng lặp→FLOW/STEPS/LOOP; so sánh/trước-sau→COMPARE/SPLIT/TRANSFORM/PROSCONS; định nghĩa→DEFINITION; cảnh báo/vấn đề/rủi ro/tưởng tượng tình huống→CALLOUT; điều ghi nhớ/lợi ích→TAKEAWAY; trích/tuyên bố mạnh→QUOTE/BIGTEXT; lệnh/thao tác/đối thoại→TERMINAL/CHAT; sơ đồ/quan hệ→HUB/ORBIT/FORMULA/MATRIX/FUNNEL/TIMELINE/RANKING.
- ĐA DẠNG: tránh lặp 1 kiểu quá 2-3 lần nếu còn kiểu khác cũng hợp; câu hợp nhiều kiểu → ưu tiên kiểu chưa dùng (hạt giống ${nonce}).
- ĐỊNH DẠNG args CHÍNH XÁC 100%: field " :: ", item " | ", lõi/kết-quả " >> ". Mỗi ô có CHỮ THẬT (không rỗng, không "/", không dấu suông). VD ORBIT = "Doanh nghiệp >> Agent bán | Agent chăm | Agent phân tích" (BẮT BUỘC " >> " tách lõi khỏi vệ tinh); HUB/FORMULA/PROSCONS BẮT BUỘC " >> "; CALLOUT/STAT/TAKEAWAY/DEFINITION đủ 2 vế qua " :: ".
- KHÔNG CHẮC kiểu phức tạp? → CHỌN KIỂU ĐƠN GIẢN CHẮC ĐÚNG (BIGTEXT/STAT/TAKEAWAY/CALLOUT/CHECKLIST/QUOTE) — VẪN là hình, ĐỪNG bỏ về text. Chỉ để trống khi câu thật sự không có ý gì để minh hoạ.

- ⚠️ MỖI dòng slides BẮT BUỘC ĐỦ 4 PHẦN ngăn bằng " | ": "sceneNo | TYPE | pill | args" — LUÔN có pill (nhãn 1-3 từ), KHÔNG bao giờ bỏ trống/gộp pill vào args. VÍ DỤ ĐÚNG:
  "2 | CHECKLIST | Việc cần làm | Lập danh sách sáng | Chọn 3 việc chính | Tập trung sâu 25 phút"
  "5 | STAT | Hiệu suất | 25 :: phút mỗi phiên :: Pomodoro"
  "9 | CALLOUT | Lưu ý | Tắt thông báo điện thoại :: khi cần tập trung cao độ"
${SLIDES_CATALOG}
KHÔNG kí tự < > trong args. Chỉ in JSON.`;

let spec;
if (VERBATIM) {
  // KỊCH BẢN DÁN THỦ CÔNG → mỗi câu = 1 slide, lời đọc GIỮ NGUYÊN 100%. slides rỗng → build.py tự làm TEXT slide (luôn đọc được).
  const vs = await verbatimScenes(ARTICLE, { key: KEY, model: MODEL, title: TITLE, max: 90 });
  const cap = await captionFor(ARTICLE, { key: KEY, model: MODEL, title: TITLE, brandkw: BRANDKW });   // #B: sinh tiêu đề SEO + caption + hashtag (như broll/news) thay vì title=câu đầu, desc rỗng
  // #C (Boss chốt): CHỮ LÊN SLIDE = ý chính CÔ ĐỌNG (head TO + lede nhỏ, ~4-6 dòng), KHÔNG nhồi cả câu. Lời ĐỌC (script) vẫn full vo.
  const cclean = (s) => String(s || '').replace(/[<>|*]/g, ' ').replace(/\s+/g, ' ').trim();
  const dispSlides = vs.map((s, i) => { const h = cclean(s.head), l = cclean(s.lede); return h.length >= 3 ? `${i + 1} | BIGTEXT |  | ${h}${l ? ` :: ${l}` : ''}` : ''; }).filter(Boolean);
  spec = { num: '01', caption: { title: cap.title || TITLE, desc: cap.desc || '' }, script: vs.map((s) => s.vo), slides: dispSlides };
  console.error(`✓ VERBATIM slides: ${vs.length} câu · caption "${(cap.title || '').slice(0, 40)}" · ${dispSlides.length} slide cô đọng`);
} else {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 3200, messages: [{ role: 'user', content: slidesPrompt({ title: TITLE, article: ARTICLE, kw: BRANDKW, nonce: NONCE }) }] }),
  });
  const j = await r.json();
  const raw = (j?.content || []).map((b) => b.text || '').join('');
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) { console.error('Không parse được JSON:', raw.slice(0, 300)); process.exit(1); }
  spec = JSON.parse(m[0]);
}
if (!spec.script || !spec.script.length) { console.error('Thiếu script'); process.exit(1); }

// #2 CHỐNG SLIDE VỠ: loại dòng slide args sai định dạng (rỗng/"/ /"/thiếu ">>") → câu đó tự thành TEXT slide (luôn đọc được).
const ARROW = new Set(['FORMULA', 'HUB', 'ORBIT', 'PROSCONS']);
// args = phần sau pill; NHƯNG nếu Claude BỎ pill (chỉ 3 field) → coi phần 3 là args (khôi phục slide bị loại oan). Khớp generator.py.
const argsOf = (parts) => (parts.length > 3 ? parts.slice(3).join('|') : (parts[2] || '')).trim();
const validSlide = (line) => {
  const parts = String(line || '').split('|');
  if (parts.length < 3) return false;
  if (!/^\d+$/.test((parts[0] || '').trim())) return false;                       // sceneNo phải là số (generator bỏ dòng không số)
  const typ = (parts[1] || '').trim().toUpperCase();
  const args = argsOf(parts);
  if (((args.match(/[\p{L}\p{N}]/gu) || []).length) < 3) return false;           // rỗng/rác kiểu "/ /"
  if (ARROW.has(typ)) { const [l, r2] = args.split('>>'); if (!r2 || !(l || '').trim() || !(r2 || '').trim()) return false; }  // thiếu lõi/vệ-tinh
  return true;
};
const before = (spec.slides || []).length;
spec.slides = (spec.slides || []).filter(validSlide);
let dropped = before - spec.slides.length;

// #3 ÉP PHỦ HÌNH ≥70% (chống "biển chữ"): câu CHƯA có slide → tự gán slide từ chính câu (BIGTEXT/TAKEAWAY/CALLOUT xoay vòng) → luôn đạt mục tiêu dù Claude làm ít/sai.
{
  const covered = new Set((spec.slides || []).map((l) => parseInt(String(l).split('|')[0], 10)).filter((n) => n > 0));
  const target = Math.max(1, Math.ceil((spec.script || []).length * 0.7));
  const FILL = ['BIGTEXT', 'TAKEAWAY', 'CALLOUT'];
  let _rot = 0, _added = 0;
  for (let i = 0; i < (spec.script || []).length && spec.slides.length < target; i++) {
    const no = i + 1;
    if (covered.has(no)) continue;
    const w = String(spec.script[i] || '').replace(/[<>|*]/g, ' ').replace(/\s+/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (w.length < 3) continue;   // câu quá ngắn → để text slide
    const k = Math.ceil(w.length / 2);
    spec.slides.push(`${no} | ${FILL[_rot++ % FILL.length]} |  | ${w.slice(0, k).join(' ')} :: ${w.slice(k).join(' ')}`);
    covered.add(no); _added++;
  }
  if (_added) console.error(`⚠ ÉP phủ hình: +${_added} slide cho câu trống → ${spec.slides.length}/${(spec.script || []).length} (${Math.round(spec.slides.length / Math.max(1, spec.script.length) * 100)}%)`);
}

// #1 CAPTION giao đi (Telegram/Make/Buffer) = tiêu đề SEO + ≤3 câu + hashtag (như News).
// Nhét vào spec.caption ĐỂ render.mjs cũng dựng đúng caption.txt (nó tự build từ spec.caption sau bước này).
spec.caption = spec.caption || {};
spec.caption.title = String(spec.caption.title || TITLE || '').trim();            // KHÔNG rỗng → YT không "unknown"
const brandTag = '#' + String(BRAND_LABEL).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^A-Za-z0-9]/g, '');
let desc = String(spec.caption.desc || '').trim();
if (brandTag.length > 2 && !new RegExp('\\' + brandTag + '\\b', 'i').test(desc)) desc = (brandTag + ' ' + desc).trim();
spec.caption.desc = desc;

writeFileSync('spec.json', JSON.stringify(spec, null, 2));

// Ghi caption.txt luôn (belt-and-suspenders; render.mjs sẽ dựng lại từ spec.caption — cùng nguồn).
try {
  const tags = (desc.match(/#[\p{L}0-9_]+/gu) || []).slice(0, 5);
  const prose = desc.replace(/#[\p{L}0-9_]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const sents = prose.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
  const body = sents.slice(0, spec.caption.title ? 2 : 3).join(' ').trim();
  const capText = [spec.caption.title, body, tags.join(' ')].map((s) => s.trim()).filter(Boolean).join('\n\n').slice(0, 500);
  writeFileSync('caption.txt', capText);
  console.log(`✓ caption.txt: "${spec.caption.title.slice(0, 50)}" · ${tags.length} hashtag`);
} catch (e) { console.error('caption lỗi (bỏ qua):', e.message); }

const types = [...new Set((spec.slides || []).map((s) => (s.split('|')[1] || '').trim()))];
console.log(`✓ spec.json (slides): ${spec.script.length} câu · ${spec.slides.length} slide (loại ${dropped} sai định dạng) · ${types.length} kiểu: ${types.join(',')}`);
