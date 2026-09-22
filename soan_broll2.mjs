// Soạn SPEC cho mẫu "broll2" (Mẫu Broll Chạy Chữ 2 — nền video stock + CAPTION theo lời đọc) → spec.json cho templates/broll2/build.py.
import { writeFileSync } from 'node:fs';
import { claudeJson, verbatimScenes, captionFor } from './soan_util.mjs';
const KEY = process.env.CLAUDE_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const TITLE = process.env.TITLE || '';
const ARTICLE = process.env.ARTICLE || '';
const VERBATIM = process.env.VERBATIM === '1';   // 1 = kịch bản DÁN THỦ CÔNG → giữ NGUYÊN lời đọc
const BRANDKW = process.env.BRANDKW || 'kinh doanh, marketing, đời sống';
const NONCE = process.env.GITHUB_RUN_ID || String(Math.floor(Math.random() * 1e9));
const BRAND_LABEL = (process.env.BRAND_LABEL || '').trim();   // tên hiển thị cuối video (thủ công) — rỗng = KHÔNG cảnh outro

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

let spec;
if (VERBATIM) {
  const vs = await verbatimScenes(ARTICLE, { key: KEY, model: MODEL, title: TITLE, max: 90 });
  const scenes = vs.map((s) => ({ query: (s.head || TITLE).replace(/\*/g, ''), cap: (s.head || '').replace(/\*/g, ''), vo: s.vo }));   // cap không dùng *…* → bỏ dấu nhấn
  if (BRAND_LABEL) scenes.push({ query: 'calm minimal soft gradient background', cap: BRAND_LABEL, vo: '' });   // outro: tên kênh (im lặng ~3s); rỗng = không thêm
  spec = { scenes };
  console.error(`✓ VERBATIM broll2: ${vs.length} câu${BRAND_LABEL ? ' + outro "' + BRAND_LABEL + '"' : ''}`);
} else {
  spec = await claudeJson({ key: KEY, model: MODEL, maxTokens: 3000, prompt: broll2Prompt({ title: TITLE, article: ARTICLE, kw: BRANDKW, nonce: NONCE }), tries: 3, label: 'broll2' });
}
if (!spec || !spec.scenes || !spec.scenes.length) { console.error('Thiếu scenes'); process.exit(1); }
spec.style = (process.env.BROLL2_STYLE || 'bar').trim();   // kiểu user chọn: bar | italic | highlight
// MÀU accent auto-KHỚP chủ đề khi user chọn "Tự khớp" (BROLL2_ACCENT rỗng/auto): mint=sức khoẻ/công nghệ/thiên nhiên · vang=tài chính/thành công/động lực · cam=đời sống (mặc định). build.py đọc spec.color → accent + nhạc.
function pickBroll2Color(text) {
  const s = (text || '').toLowerCase();
  if (/sức khoẻ|suc khoe|thể dục|the duc|yoga|thiền|thien|thiên nhiên|thien nhien|công nghệ|cong nghe|tech|khoa học|khoa hoc|hiện đại|hien dai|thư giãn|thu gian|sông|biển|bien|nước|môi trường|moi truong/.test(s)) return 'mint';
  if (/tài chính|tai chinh|tiền|tien|đầu tư|dau tu|thành công|thanh cong|kinh doanh|khởi nghiệp|khoi nghiep|năng lượng|nang luong|bứt phá|but pha|mục tiêu|muc tieu|động lực|dong luc|chiến thắng|chien thang/.test(s)) return 'vang';
  return 'cam';
}
const _ac = (process.env.BROLL2_ACCENT || '').trim().toLowerCase();
spec.color = (_ac && _ac !== 'auto') ? _ac : pickBroll2Color(`${TITLE}. ${String(ARTICLE).slice(0, 200)}`);   // màu accent cứng → dùng; "auto"/rỗng → tự khớp chủ đề
console.error(`✓ màu broll2: ${spec.color} ${(_ac && _ac !== 'auto') ? '(user chọn)' : '(auto-khớp)'}`);
if (!spec.caption || !spec.caption.title) spec.caption = await captionFor(ARTICLE || TITLE, { key: KEY, model: MODEL, title: TITLE, brandkw: BRANDKW });   // tiêu đề SEO + caption + hashtag
writeFileSync('spec.json', JSON.stringify(spec, null, 2));
console.log(`✓ spec.json (broll2): ${spec.scenes.length} cảnh · kiểu ${spec.style} · query: ${spec.scenes.map((s) => s.query).join(' | ')}`);
