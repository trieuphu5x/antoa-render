// Soạn SPEC cho mẫu "slides" (Agent Thực Chiến) → spec.json cho templates/slides/build.py.
// Claude viết KỊCH BẢN N câu (mỗi câu 1 slide) + vài slide đồ hoạ đặc thù. Dùng cho test tay trên GitHub.
import { writeFileSync } from 'node:fs';

const KEY = process.env.CLAUDE_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const TITLE = process.env.TITLE || '';
const ARTICLE = process.env.ARTICLE || '';
const BRANDKW = process.env.BRANDKW || 'AI Agent, tự động hoá kinh doanh';

const PROMPT = `Bạn là biên kịch video "Agent Thực Chiến" (slide infographic 9:16 dạy nghề dùng AI Agent). Viết KỊCH BẢN cho chủ đề dưới đây, trả về DUY NHẤT một JSON hợp lệ (không markdown, không giải thích).

CHỦ ĐỀ: "${TITLE}"
BỐI CẢNH (nếu có): """${ARTICLE.slice(0, 2000)}"""
TỪ KHOÁ BÁM SÁT: ${BRANDKW}

JSON dạng:
{
 "num": "01",
 "script": ["câu 1","câu 2", ... 12-16 câu ...],
 "slides": ["<sceneNo> | <TYPE> | <pill ngắn> | <args>", ...]
}

LUẬT "script" (BẮT BUỘC):
- 12-16 câu, MỖI CÂU = 1 slide. Câu ngắn gọn, khẩu ngữ, đời thường, có nhịp. Mở bằng 1 câu HOOK mạnh, kết bằng 1 câu chốt + gợi hành động mềm.
- Bám nghề: AI Agent làm thay việc lặp lại, tăng năng suất. KHÔNG hứa thu nhập/mốc thời gian, KHÔNG comment-bait, KHÔNG ký tự < >.

LUẬT "slides" (TUỲ CHỌN — chỉ cho 3-6 câu QUAN TRỌNG cần đồ hoạ; câu còn lại tự thành text slide):
- Mỗi dòng: "<sceneNo> | <TYPE> | <pill> | <args>". sceneNo = vị trí câu trong script (1-based).
- TYPE hợp lệ: BIGTEXT, CHECKLIST, CALLOUT, DEFINITION, TAKEAWAY, TRANSFORM, FLOW, SPLIT, STAT.
- args: các item cách nhau " | "? KHÔNG — trong 1 dòng, các phần cách nhau " :: " ; riêng CHECKLIST/FLOW các mục cách nhau " | ".
  * BIGTEXT: "câu chính :: câu phụ"
  * CHECKLIST: "mục 1 | mục 2 | mục 3"
  * DEFINITION: "Thuật ngữ :: ví von ngắn :: giải thích 1 câu"
  * TAKEAWAY: "ý chính :: ý bổ sung"
  * TRANSFORM: "Ngày xưa: ... :: Bây giờ: ... :: Bạn chỉ cần ..."
  * FLOW: "bước 1 | bước 2 | bước 3"
  * SPLIT: "vế A :: vế B"
  * STAT: "×3-5 :: nhãn ngắn :: câu phụ"
- KHÔNG chèn ký tự < >.
Chỉ in JSON.`;

const r = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
  body: JSON.stringify({ model: MODEL, max_tokens: 2600, messages: [{ role: 'user', content: PROMPT }] }),
});
const j = await r.json();
const raw = (j?.content || []).map((b) => b.text || '').join('');
const m = raw.match(/\{[\s\S]*\}/);
if (!m) { console.error('Không parse được JSON:', raw.slice(0, 300)); process.exit(1); }
const spec = JSON.parse(m[0]);
if (!spec.script || !spec.script.length) { console.error('Thiếu script'); process.exit(1); }
writeFileSync('spec.json', JSON.stringify(spec, null, 2));
console.log(`✓ spec.json (slides): ${spec.script.length} câu · ${(spec.slides || []).length} slide đồ hoạ`);
