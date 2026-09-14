// Soạn SPEC cho mẫu "broll" (nền video stock + chữ chạy) → spec.json cho templates/broll/build.py.
import { writeFileSync } from 'node:fs';
import { claudeJson, verbatimScenes, captionFor } from './soan_util.mjs';
const KEY = process.env.CLAUDE_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const TITLE = process.env.TITLE || '';
const ARTICLE = process.env.ARTICLE || '';
const VERBATIM = process.env.VERBATIM === '1';   // 1 = kịch bản DÁN THỦ CÔNG → giữ NGUYÊN lời đọc
const BRANDKW = process.env.BRANDKW || 'sức khoẻ, tài chính, thể dục';
const NONCE = process.env.GITHUB_RUN_ID || String(Math.floor(Math.random() * 1e9));

export const brollPrompt = ({ title, article, kw, nonce }) => `Bạn là biên tập video 9:16 kiểu "b-roll + chữ chạy" (nền là clip video stock, chữ lớn động phía trên). Soạn KỊCH BẢN cho chủ đề, trả về DUY NHẤT JSON hợp lệ (không markdown).

CHỦ ĐỀ: "${title}"
BỐI CẢNH: """${(article || '').slice(0, 2000)}"""
LĨNH VỰC/TỪ KHOÁ: ${kw}
Hạt giống đa dạng (để video khác video): ${nonce}

JSON: { "num":"01", "scenes":[ {"query","kick","head","sub","vo"}, ... ] } — 6-8 cảnh (cảnh cuối là chốt + gợi theo dõi mềm).
Mỗi cảnh:
- "query": 2-4 TỪ KHOÁ TIẾNG ANH để tìm clip nền hợp cảnh (vd "morning running park", "stock market chart", "healthy salad bowl"). ĐA DẠNG query giữa các cảnh để nền không trùng.
- "kick": nhãn ngắn (1-2 từ).
- "head": 1-2 DÒNG chữ lớn, cực ngắn & mạnh (mỗi dòng ≤ 4-5 từ). Dùng *…* để nhấn 1 cụm màu vàng.
- "sub": 1 câu phụ ngắn (có thể **đậm** vài từ).
- "vo": lời đọc tiếng Việt tự nhiên 1-2 câu (KHÔNG markup, KHÔNG < >).
An toàn: KHÔNG hứa thu nhập/mốc thời gian/chữa bệnh tuyệt đối/comment-bait, KHÔNG kí tự < >. Giọng tích cực, đáng tin.
Chỉ in JSON.`;

let spec;
if (VERBATIM) {
  const vs = await verbatimScenes(ARTICLE, { key: KEY, model: MODEL, title: TITLE, max: 14 });
  spec = { num: '01', scenes: vs.map((s) => ({ query: s.head || TITLE, kick: '', head: [s.head], sub: s.lede, vo: s.vo })) };
  console.error(`✓ VERBATIM broll: ${vs.length} câu giữ NGUYÊN lời đọc`);
} else {
  spec = await claudeJson({ key: KEY, model: MODEL, maxTokens: 3000, prompt: brollPrompt({ title: TITLE, article: ARTICLE, kw: BRANDKW, nonce: NONCE }), tries: 3, label: 'broll' });
}
if (!spec || !spec.scenes || !spec.scenes.length) { console.error('Thiếu scenes'); process.exit(1); }
// MÀU auto-KHỚP chủ đề khi user chọn "Tự khớp" (BROLL_COLOR rỗng/auto): mint=sức khoẻ/công nghệ/thiên nhiên · vang=tài chính/thành công/động lực · cam=đời sống/du lịch (mặc định).
function pickBrollColor(text) {
  const s = (text || '').toLowerCase();
  if (/sức khoẻ|suc khoe|thể dục|the duc|yoga|thiền|thien|thiên nhiên|thien nhien|công nghệ|cong nghe|tech|khoa học|khoa hoc|hiện đại|hien dai|thư giãn|thu gian|sông|biển|bien|nước|môi trường|moi truong/.test(s)) return 'mint';
  if (/tài chính|tai chinh|tiền|tien|đầu tư|dau tu|thành công|thanh cong|kinh doanh|khởi nghiệp|khoi nghiep|năng lượng|nang luong|bứt phá|but pha|mục tiêu|muc tieu|động lực|dong luc|chiến thắng|chien thang/.test(s)) return 'vang';
  return 'cam';
}
const _bc = (process.env.BROLL_COLOR || '').trim().toLowerCase();
spec.color = (_bc && _bc !== 'auto') ? _bc : pickBrollColor(`${TITLE}. ${String(ARTICLE).slice(0, 200)}`);   // user chọn màu cứng → dùng; "auto"/rỗng → tự khớp chủ đề
console.error(`✓ màu broll: ${spec.color} ${(_bc && _bc !== 'auto') ? '(user chọn)' : '(auto-khớp)'}`);
if (!spec.caption || !spec.caption.title) spec.caption = await captionFor(ARTICLE || TITLE, { key: KEY, model: MODEL, title: TITLE, brandkw: BRANDKW });   // tiêu đề SEO + caption + hashtag
writeFileSync('spec.json', JSON.stringify(spec, null, 2));
console.log(`✓ spec.json (broll): ${spec.scenes.length} cảnh · query: ${spec.scenes.map((s) => s.query).join(' | ')}`);
