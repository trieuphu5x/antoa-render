// Soạn SPEC cho mẫu "broll2" (Mẫu Broll Chạy Chữ 2 — nền video stock + CAPTION theo lời đọc) → spec.json cho templates/broll2/build.py.
import { writeFileSync } from 'node:fs';
const KEY = process.env.CLAUDE_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const TITLE = process.env.TITLE || '';
const ARTICLE = process.env.ARTICLE || '';
const BRANDKW = process.env.BRANDKW || 'kinh doanh, marketing, đời sống';
const NONCE = process.env.GITHUB_RUN_ID || String(Math.floor(Math.random() * 1e9));

export const broll2Prompt = ({ title, article, kw, nonce }) => `Bạn là biên tập video 9:16 kiểu "b-roll + CAPTION" (nền là clip video stock, CHỮ caption to hiện giữa-trái theo lời đọc). Soạn KỊCH BẢN cho chủ đề, trả về DUY NHẤT JSON hợp lệ (không markdown).

CHỦ ĐỀ: "${title}"
BỐI CẢNH: """${(article || '').slice(0, 2000)}"""
LĨNH VỰC/TỪ KHOÁ: ${kw}
Hạt giống đa dạng (để video khác video): ${nonce}

JSON: { "scenes":[ {"query","cap","vo"}, ... ] } — 8-10 cảnh (cảnh cuối chốt + gợi theo dõi mềm).
Mỗi cảnh:
- "query": 2-4 TỪ KHOÁ TIẾNG ANH tìm clip nền hợp cảnh (vd "morning coffee desk", "city street walk", "hands typing laptop"). ĐA DẠNG query giữa các cảnh để nền không trùng.
- "cap": CAPTION hiển thị to — RẤT NGẮN, 1-2 dòng (mỗi dòng ≤ 5-6 từ), xuống dòng bằng ký tự \\n. Đây là ý CHÍNH của câu, không phải cả câu dài. KHÔNG markup, KHÔNG < >.
- "vo": lời đọc tiếng Việt tự nhiên 1-2 câu (nói đủ ý; caption chỉ là phần nhấn). KHÔNG markup, KHÔNG < >.
An toàn: KHÔNG hứa thu nhập/mốc thời gian/chữa bệnh tuyệt đối/comment-bait, KHÔNG kí tự < >. Giọng tích cực, đáng tin.
Chỉ in JSON.`;

const r = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
  body: JSON.stringify({ model: MODEL, max_tokens: 3000, messages: [{ role: 'user', content: broll2Prompt({ title: TITLE, article: ARTICLE, kw: BRANDKW, nonce: NONCE }) }] }),
});
const j = await r.json();
const raw = (j?.content || []).map((b) => b.text || '').join('');
const m = raw.match(/\{[\s\S]*\}/);
if (!m) { console.error('Không parse JSON:', raw.slice(0, 300)); process.exit(1); }
const spec = JSON.parse(m[0]);
if (!spec.scenes || !spec.scenes.length) { console.error('Thiếu scenes'); process.exit(1); }
spec.style = (process.env.BROLL2_STYLE || 'bar').trim();   // kiểu user chọn: bar | italic | highlight
writeFileSync('spec.json', JSON.stringify(spec, null, 2));
console.log(`✓ spec.json (broll2): ${spec.scenes.length} cảnh · kiểu ${spec.style} · query: ${spec.scenes.map((s) => s.query).join(' | ')}`);
