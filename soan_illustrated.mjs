// Soạn CONFIG cho mẫu "illustrated" (Mẫu Video Vẽ Hình AI) → spec.json cho templates/illustrated/build.py.
// image_style = phong cách NGƯỜI DÙNG CHỌN (env IMG_STYLE) — KHÔNG để Claude tự chọn. Claude chỉ viết scenes[{say,image_prompt}] + cta.
import { writeFileSync } from 'node:fs';
import { claudeJson, verbatimScenes, captionFor } from './soan_util.mjs';

const VERBATIM = process.env.VERBATIM === '1';   // 1 = kịch bản DÁN THỦ CÔNG → giữ NGUYÊN lời đọc (say)
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
let scenes, ctaSay, capTitle, capDesc;
if (VERBATIM) {
  // KỊCH BẢN DÁN THỦ CÔNG → say GIỮ NGUYÊN 100%; ảnh minh hoạ AI vẽ theo ý chính (head).
  const vs = await verbatimScenes(ARTICLE, { key: KEY, model: MODEL, title: TITLE, max: 8 });
  scenes = vs.map((s) => ({ say: s.vo, image_prompt: `Warm cinematic editorial illustration, scene about: ${(s.head || s.vo).replace(/\*/g, '')}. Consistent recurring character, soft emotional mood, no text.` }));
  const cap = await captionFor(ARTICLE || TITLE, { key: KEY, model: MODEL, title: TITLE, brandkw: BRANDKW });
  ctaSay = 'Theo dõi để không bỏ lỡ.'; capTitle = cap.title || TITLE; capDesc = cap.desc || '';
  console.error(`✓ VERBATIM illustrated: ${scenes.length} câu giữ NGUYÊN lời đọc`);
} else {
  const out = await claudeJson({ key: KEY, model: MODEL, maxTokens: 3000, prompt: PROMPT, tries: 3, label: 'illustrated' });
  if (!out) { console.error('❌ Claude không trả JSON hợp lệ'); process.exit(1); }
  scenes = (out.scenes || []).filter((s) => s && s.say).slice(0, 6);
  ctaSay = (out.cta && out.cta.say) || 'Theo dõi để không bỏ lỡ.';
  capTitle = (out.caption && out.caption.title) || TITLE; capDesc = (out.caption && out.caption.desc) || '';
}
if (!scenes.length) { console.error('Thiếu scenes'); process.exit(1); }

// Config đầy đủ cho build.py + render.mjs (caption.txt/script.txt).
const spec = {
  image_style: IMG_STYLE,
  image_model: IMG_MODEL,
  fps: 30,
  scenes,
  cta: { say: ctaSay, brand: BRAND_LABEL, tag: SLOGAN },
  caption: { title: capTitle, desc: capDesc },
  script: [...scenes.map((s) => s.say), ctaSay].filter(Boolean),   // cho "Sửa kịch bản"
  style: { musicVolume: 0.16 },   // nhạc nền auto-duck; build.py random 1 bài trong pool assets/music mỗi video
};
writeFileSync('spec.json', JSON.stringify(spec, null, 2));
console.log(`✓ spec.json (illustrated): ${scenes.length} cảnh · style="${IMG_STYLE.slice(0, 40)}…"`);
