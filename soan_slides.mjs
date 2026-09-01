// Soạn SPEC cho mẫu "slides" (Agent Thực Chiến) → spec.json cho templates/slides/build.py.
// TRIẾT LÝ: 30 kiểu slide → mỗi video TRỘN nhiều kiểu khác nhau (không lặp look). Có nonce để 2 video khác nhau.
import { writeFileSync } from 'node:fs';

const KEY = process.env.CLAUDE_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const TITLE = process.env.TITLE || '';
const ARTICLE = process.env.ARTICLE || '';
const BRANDKW = process.env.BRANDKW || 'AI Agent, tự động hoá kinh doanh';
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

JSON: { "num":"01", "script":["câu 1", ... 12-16 câu ...], "slides":["<sceneNo> | <TYPE> | <pill> | <args>", ...] }

"script": 12-16 câu, MỖI CÂU = 1 slide, ngắn gọn khẩu ngữ có nhịp; câu 1 = HOOK; câu cuối = chốt + gợi hành động mềm. Bám nghề AI Agent. KHÔNG hứa thu nhập/mốc thời gian/comment-bait, KHÔNG kí tự < >.

"slides" — TRIẾT LÝ QUAN TRỌNG (đừng để video nào cũng giống nhau):
- Gán 1 kiểu slide cho ÍT NHẤT 70% số câu (sceneNo = vị trí câu 1-based). Câu kể/chuyển tiếp thì để trống (tự thành text slide).
- Dùng NHIỀU kiểu KHÁC NHAU: tối thiểu 8 kiểu phân biệt trong 1 video; KHÔNG lặp 1 kiểu quá 2 lần.
- Chọn kiểu HỢP nội dung: có số → STAT/TRIO/PROGRESS/DONUT/BARS; liệt kê → CHECKLIST/STEPS/COUNTDOWN; quy trình → FLOW/STEPS/LOOP; so sánh → COMPARE/SPLIT/TRANSFORM/PROSCONS; định nghĩa → DEFINITION; nhấn mạnh → BIGTEXT/CALLOUT/TAKEAWAY/QUOTE/TERMINAL; sơ đồ → HUB/ORBIT/FORMULA/MATRIX/FUNNEL/TAGS/TIMELINE/RANKING/GRID/CHAT.
- Với hạt giống trên, hãy ĐA DẠNG lựa chọn để 2 video cùng chủ đề vẫn khác nhau.

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
writeFileSync('spec.json', JSON.stringify(spec, null, 2));
const types = [...new Set((spec.slides || []).map((s) => (s.split('|')[1] || '').trim()))];
console.log(`✓ spec.json (slides): ${spec.script.length} câu · ${(spec.slides || []).length} slide · ${types.length} kiểu khác nhau: ${types.join(',')}`);
