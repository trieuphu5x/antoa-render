// Soạn SPEC cho mẫu "broll" (nền video stock + chữ chạy) → spec.json cho templates/broll/build.py.
import { writeFileSync } from 'node:fs';
const KEY = process.env.CLAUDE_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const TITLE = process.env.TITLE || '';
const ARTICLE = process.env.ARTICLE || '';
const BRANDKW = process.env.BRANDKW || 'sức khoẻ, tài chính, thể dục';
const NONCE = process.env.GITHUB_RUN_ID || String(Math.floor(Math.random() * 1e9));

export const brollPrompt = ({ title, article, kw, nonce }) => `Bạn là biên tập video 9:16 kiểu "b-roll + chữ chạy" (nền là clip video stock, chữ lớn động phía trên). Soạn KỊCH BẢN cho chủ đề, trả về DUY NHẤT JSON hợp lệ (không markdown).

CHỦ ĐỀ: "${title}"
BỐI CẢNH: """${(article || '').slice(0, 2000)}"""
LĨNH VỰC/TỪ KHOÁ: ${kw}
Hạt giống đa dạng (để video khác video): ${nonce}

JSON: { "num":"01", "scenes":[ {"query","kick","head","sub","vo"}, ... ] } — 8-12 cảnh (cảnh cuối là chốt + gợi theo dõi mềm).
Mỗi cảnh:
- "query": 2-4 TỪ KHOÁ TIẾNG ANH để tìm clip nền hợp cảnh (vd "morning running park", "stock market chart", "healthy salad bowl"). ĐA DẠNG query giữa các cảnh để nền không trùng.
- "kick": nhãn ngắn (1-2 từ).
- "head": 1-2 DÒNG chữ lớn, cực ngắn & mạnh (mỗi dòng ≤ 4-5 từ). Dùng *…* để nhấn 1 cụm màu vàng.
- "sub": 1 câu phụ ngắn (có thể **đậm** vài từ).
- "vo": lời đọc tiếng Việt tự nhiên 1-2 câu (KHÔNG markup, KHÔNG < >).
An toàn: KHÔNG hứa thu nhập/mốc thời gian/chữa bệnh tuyệt đối/comment-bait, KHÔNG kí tự < >. Giọng tích cực, đáng tin.
Chỉ in JSON.`;

const r = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
  body: JSON.stringify({ model: MODEL, max_tokens: 3000, messages: [{ role: 'user', content: brollPrompt({ title: TITLE, article: ARTICLE, kw: BRANDKW, nonce: NONCE }) }] }),
});
const j = await r.json();
const raw = (j?.content || []).map((b) => b.text || '').join('');
const m = raw.match(/\{[\s\S]*\}/);
if (!m) { console.error('Không parse JSON:', raw.slice(0, 300)); process.exit(1); }
const spec = JSON.parse(m[0]);
if (!spec.scenes || !spec.scenes.length) { console.error('Thiếu scenes'); process.exit(1); }
writeFileSync('spec.json', JSON.stringify(spec, null, 2));
console.log(`✓ spec.json (broll): ${spec.scenes.length} cảnh · query: ${spec.scenes.map((s) => s.query).join(' | ')}`);
