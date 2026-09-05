// Soạn SPEC cho mẫu "slides" (Agent Thực Chiến) → spec.json cho templates/slides/build.py.
// TRIẾT LÝ (Boss chốt): mỗi CÂU → CHỌN kiểu slide HỢP nội dung câu đó (KHÔNG random/ép câu vào kiểu). Nội dung đa dạng → video tự nhiên nhiều kiểu. Nonce chỉ để 2 video CÙNG chủ đề đỡ giống nhau.
import { writeFileSync } from 'node:fs';

const KEY = process.env.CLAUDE_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const TITLE = process.env.TITLE || '';
const ARTICLE = process.env.ARTICLE || '';
const BRANDKW = process.env.BRANDKW || 'AI Agent, tự động hoá kinh doanh';
const BRAND_LABEL = (process.env.BRAND_LABEL || '').trim() || 'ANTOA';
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

"slides" — QUY TẮC (ưu tiên ĐÚNG THỨ TỰ này):
- ƯU TIÊN SỐ 1 — HỢP NỘI DUNG: mỗi câu (sceneNo = vị trí câu 1-based) → chọn kiểu slide KHỚP Ý câu đó (bảng dưới). Câu kể/dẫn dắt/không hợp kiểu nào → ĐỂ TRỐNG (tự thành text slide). TUYỆT ĐỐI KHÔNG ép câu vào kiểu không hợp chỉ để cho đa dạng — thà để text slide còn hơn gán sai kiểu.
- BẢNG CHỌN KIỂU THEO NỘI DUNG: có số/tỉ lệ → STAT/TRIO/PROGRESS/DONUT/BARS; liệt kê mục → CHECKLIST/STEPS/COUNTDOWN; quy trình/vòng lặp → FLOW/STEPS/LOOP; so sánh/trước-sau → COMPARE/SPLIT/TRANSFORM/PROSCONS; định nghĩa → DEFINITION; nhấn mạnh/trích/lệnh → BIGTEXT/CALLOUT/TAKEAWAY/QUOTE/TERMINAL; sơ đồ/quan hệ → HUB/ORBIT/FORMULA/MATRIX/FUNNEL/TAGS/TIMELINE/RANKING/GRID/CHAT.
- ĐA DẠNG là PHỤ (KHÔNG ép): nhờ nội dung khác nhau, video tự nhiên ra nhiều kiểu. CHỈ khi 1 câu hợp NHIỀU kiểu ngang nhau thì ưu tiên kiểu chưa dùng (đỡ lặp look + khác video khác theo hạt giống ${nonce}). Tránh lặp 1 kiểu quá 2-3 lần NẾU vẫn còn kiểu khác cũng hợp.
- ⚠️ ĐỊNH DẠNG args PHẢI CHÍNH XÁC 100% theo bảng: field cách bằng " :: ", item cách bằng " | ", lõi/kết-quả cách bằng " >> ". Mỗi ô PHẢI có CHỮ THẬT (không để trống, không "/", không dấu suông). VD ORBIT = "Doanh nghiệp >> Agent bán | Agent chăm | Agent phân tích" (BẮT BUỘC có " >> " tách lõi khỏi vệ tinh). HUB/FORMULA/PROSCONS cũng BẮT BUỘC " >> ". CALLOUT/STAT/TAKEAWAY/DEFINITION… phải đủ chữ 2 vế qua " :: ". NẾU KHÔNG chắc điền đúng định dạng cho 1 câu → ĐỂ TRỐNG cả dòng slide đó (thành text slide) — thà text còn hơn slide VỠ/RỖNG.

${SLIDES_CATALOG}
KHÔNG kí tự < > trong args. Chỉ in JSON.`;

const r = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
  body: JSON.stringify({ model: MODEL, max_tokens: 3200, messages: [{ role: 'user', content: slidesPrompt({ title: TITLE, article: ARTICLE, kw: BRANDKW, nonce: NONCE }) }] }),
});
const j = await r.json();
const raw = (j?.content || []).map((b) => b.text || '').join('');
const m = raw.match(/\{[\s\S]*\}/);
if (!m) { console.error('Không parse được JSON:', raw.slice(0, 300)); process.exit(1); }
const spec = JSON.parse(m[0]);
if (!spec.script || !spec.script.length) { console.error('Thiếu script'); process.exit(1); }

// #2 CHỐNG SLIDE VỠ: loại dòng slide args sai định dạng (rỗng/"/ /"/thiếu ">>") → câu đó tự thành TEXT slide (luôn đọc được).
const ARROW = new Set(['FORMULA', 'HUB', 'ORBIT', 'PROSCONS']);
const validSlide = (line) => {
  const parts = String(line || '').split('|');
  if (parts.length < 2) return false;
  const typ = (parts[1] || '').trim().toUpperCase();
  const args = parts.slice(3).join('|').trim();
  if (((args.match(/[\p{L}\p{N}]/gu) || []).length) < 3) return false;           // rỗng/rác kiểu "/ /"
  if (ARROW.has(typ)) { const [l, r2] = args.split('>>'); if (!r2 || !(l || '').trim() || !(r2 || '').trim()) return false; }  // thiếu lõi/vệ-tinh
  return true;
};
const before = (spec.slides || []).length;
spec.slides = (spec.slides || []).filter(validSlide);
const dropped = before - spec.slides.length;

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
