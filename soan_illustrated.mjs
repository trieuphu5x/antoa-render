// Soạn CONFIG cho mẫu "illustrated" (Mẫu Video Vẽ Hình AI) → spec.json cho templates/illustrated/build.py.
// image_style = phong cách NGƯỜI DÙNG CHỌN (env IMG_STYLE) — KHÔNG để Claude tự chọn. Claude chỉ viết scenes[{say,image_prompt}] + cta.
import { writeFileSync } from 'node:fs';

const KEY = process.env.CLAUDE_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const TITLE = process.env.TITLE || '';
const ARTICLE = process.env.ARTICLE || '';
const BRANDKW = process.env.BRANDKW || 'kể chuyện, truyền cảm hứng';
const BRAND_LABEL = (process.env.BRAND_LABEL || 'ANTOA').trim();
const SLOGAN = (process.env.SLOGAN || '').trim();
const IMG_STYLE = (process.env.IMG_STYLE || 'Modern flat vector editorial illustration, warm palette, clean minimal shapes, soft shadows, no text').trim();
const IMG_MODEL = process.env.IMG_MODEL || 'gpt-image-1';
const NONCE = process.env.GITHUB_RUN_ID || String(Math.floor(Math.random() * 1e9));

const PROMPT = `Bạn là biên tập viên video kể chuyện bằng TRANH MINH HOẠ (dọc 9:16, giọng đọc tiếng Việt ấm áp). Soạn KỊCH BẢN cho chủ đề, trả về DUY NHẤT một JSON hợp lệ (không markdown).

CHỦ ĐỀ: "${TITLE}"
BỐI CẢNH: """${ARTICLE.slice(0, 2000)}"""
TỪ KHOÁ BÁM SÁT: ${BRANDKW}
Hạt giống đa dạng: ${NONCE}

JSON: { "scenes":[ {"say","image_prompt"}, … ], "cta":{"say"}, "caption":{"title","desc"} }

QUY TẮC:
- 4–6 scenes. Mỗi scene:
  • "say": 1 câu thoại tiếng Việt tự nhiên, ấm, 8–20 từ (KHÔNG kí tự < >). Nối lại thành 1 câu chuyện mạch lạc.
  • "image_prompt": mô tả cảnh bằng TIẾNG ANH cho AI vẽ (chủ thể, hành động, bối cảnh, cảm xúc). GIỮ NHÂN VẬT NHẤT QUÁN (mô tả cùng nhân vật ở mọi cảnh: cùng giới tính/tuổi/trang phục). KHÔNG mô tả phong cách (phong cách đã cố định riêng). KHÔNG có chữ trong ảnh ("no text").
- "cta.say": 1 câu chốt/kêu gọi mềm tiếng Việt (không hứa hẹn, không comment-bait).
- "caption": {"title": tiêu đề đăng ngắn, "desc": 1–2 câu mô tả + 3–5 hashtag tiếng Việt}.
An toàn: KHÔNG hứa thu nhập/mốc thời gian, KHÔNG comment-bait, KHÔNG kí tự < >.
Chỉ in JSON.`;

if (!KEY) { console.error('❌ Thiếu CLAUDE_API_KEY'); process.exit(1); }
const r = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
  body: JSON.stringify({ model: MODEL, max_tokens: 3000, messages: [{ role: 'user', content: PROMPT }] }),
});
const j = await r.json();
if (!r.ok) { console.error('❌ Claude lỗi', r.status, JSON.stringify(j?.error || j).slice(0, 200)); process.exit(1); }
const raw = (j?.content || []).map((b) => b.text || '').join('');
const m = raw.match(/\{[\s\S]*\}/);
if (!m) { console.error('Không parse được JSON:', raw.slice(0, 300)); process.exit(1); }
const out = JSON.parse(m[0]);
const scenes = (out.scenes || []).filter((s) => s && s.say).slice(0, 6);
if (!scenes.length) { console.error('Thiếu scenes'); process.exit(1); }

// Config đầy đủ cho build.py + render.mjs (caption.txt/script.txt).
const spec = {
  image_style: IMG_STYLE,
  image_model: IMG_MODEL,
  fps: 30,
  scenes,
  cta: { say: (out.cta && out.cta.say) || 'Theo dõi để không bỏ lỡ.', brand: BRAND_LABEL, tag: SLOGAN },
  caption: { title: (out.caption && out.caption.title) || TITLE, desc: (out.caption && out.caption.desc) || '' },
  script: [...scenes.map((s) => s.say), (out.cta && out.cta.say) || ''].filter(Boolean),   // cho "Sửa kịch bản"
  style: { musicVolume: 0.16 },   // nhạc nền auto-duck; build.py random 1 bài trong pool assets/music mỗi video
};
writeFileSync('spec.json', JSON.stringify(spec, null, 2));
console.log(`✓ spec.json (illustrated): ${scenes.length} cảnh · style="${IMG_STYLE.slice(0, 40)}…"`);
