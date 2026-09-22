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
const BRAND_LABEL = (process.env.BRAND_LABEL || '').trim() || (VERBATIM ? '' : 'ANTOA');   // thủ công: để TRỐNG = KHÔNG outro; auto giữ ANTOA
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
  • "image_prompt": mô tả HÀNH ĐỘNG + BỐI CẢNH + CẢM XÚC của cảnh bằng TIẾNG ANH cho AI vẽ. KHÔNG tả ngoại hình nhân vật (hệ thống tự thêm 1 nhân vật CỐ ĐỊNH để nhất quán mọi cảnh). KHÔNG mô tả phong cách (đã cố định riêng). KHÔNG có chữ trong ảnh ("no text").
- "cta.say": 1 câu chốt/kêu gọi mềm tiếng Việt (không hứa hẹn, không comment-bait).
- "caption": {"title": tiêu đề đăng ngắn, "desc": 1–2 câu mô tả + 3–5 hashtag tiếng Việt}.
An toàn: KHÔNG hứa thu nhập/mốc thời gian, KHÔNG comment-bait, KHÔNG kí tự < >.
Chỉ in JSON.`;

if (!KEY) { console.error('❌ Thiếu CLAUDE_API_KEY'); process.exit(1); }

// NHÂN VẬT NHẤT QUÁN: gpt-image-1 gọi ĐỘC LẬP từng ảnh (không nhớ nhau) → phải TẢ CÙNG 1 nhân vật trong MỌI prompt.
// Sinh 1 "character bible" (1 câu tả ngoại hình cố định) rồi gắn vào mọi image_prompt. Rỗng → fallback câu chung.
async function characterBible() {
  try {
    const r = await claudeJson({ key: KEY, model: MODEL, maxTokens: 160, tries: 2, label: 'char',
      prompt: `Chủ đề: "${TITLE}". Bối cảnh: """${ARTICLE.slice(0, 500)}""". Tả 1 NHÂN VẬT CHÍNH xuyên suốt câu chuyện bằng TIẾNG ANH, 1 câu ngắn gọn: giới tính, độ tuổi, kiểu/màu tóc, trang phục (màu), 1 nét đặc trưng. BẮT BUỘC nhân vật là NGƯỜI VIỆT NAM / CHÂU Á (Vietnamese / East-Southeast Asian appearance). CHỈ tả ngoại hình cố định, KHÔNG bối cảnh/hành động. Trả JSON: {"character":"..."}` });
    return String((r && r.character) || '').replace(/[<>]/g, '').trim();
  } catch (e) { return ''; }
}
const CHAR = await characterBible();
// NGƯỜI CHÂU Á: ép mọi cảnh vẽ nhân vật + người phụ đều là người Việt/Á Đông (khán giả Việt) — gắn vào MỌI image_prompt.
const ASIAN_TAG = ' All people depicted are Vietnamese (East/Southeast Asian) with authentic Asian facial features, skin tone and hair.';
const CHAR_TAG = (CHAR ? ` Main character, SAME person in every scene: ${CHAR}` : ' One consistent recurring Vietnamese (Asian) main character, same person in every scene.') + ASIAN_TAG;
console.error(`✓ nhân vật nhất quán: ${CHAR || '(fallback chung)'}`);

const cclean = (s) => String(s || '').replace(/[*<>|]/g, ' ').replace(/\s+/g, ' ').trim();   // dọn nhấn/markup cho caption hiển thị
const MAX_IMG = 12;   // TRẦN ảnh AI/video (chi phí gpt-image-1) — đọc FULL kịch bản nhưng gộp câu để không đội ảnh
let scenes, ctaObj, capTitle, capDesc;
if (VERBATIM) {
  // KỊCH BẢN DÁN THỦ CÔNG → say GIỮ NGUYÊN 100% & ĐỌC HẾT (độ dài khớp kịch bản). Gộp câu thành ≤ MAX_IMG cảnh ảnh.
  const vs = await verbatimScenes(ARTICLE, { key: KEY, model: MODEL, title: TITLE, max: 90 });   // lấy HẾT câu (was 8 → cắt cụt kịch bản)
  const gsz = Math.max(1, Math.ceil(vs.length / MAX_IMG));   // số câu / 1 ảnh
  const groups = [];
  for (let i = 0; i < vs.length; i += gsz) groups.push(vs.slice(i, i + gsz));
  scenes = groups.map((g) => ({
    say: g.map((s) => s.vo).join(' '),                                   // ĐỌC nguyên văn tất cả câu trong nhóm
    caption: cclean(g[0].head || g[0].vo).slice(0, 70),                  // chữ hiện lên ngắn gọn (không nhồi cả đoạn)
    image_prompt: `Editorial illustration. Scene: ${cclean(g[0].head || g[0].vo)}. Soft emotional mood, no text.${CHAR_TAG}`,
  }));
  const cap = await captionFor(ARTICLE || TITLE, { key: KEY, model: MODEL, title: TITLE, brandkw: BRANDKW });
  capTitle = cap.title || TITLE; capDesc = cap.desc || '';
  ctaObj = BRAND_LABEL ? { say: '__SILENT__', brand: BRAND_LABEL, tag: '' } : null;   // outro tên kênh im lặng ~2.2s; trống = KHÔNG outro
  console.error(`✓ VERBATIM illustrated: ${vs.length} câu (đọc HẾT) → ${scenes.length} cảnh ảnh${BRAND_LABEL ? ' + outro "' + BRAND_LABEL + '"' : ''}`);
} else {
  const out = await claudeJson({ key: KEY, model: MODEL, maxTokens: 3000, prompt: PROMPT, tries: 3, label: 'illustrated' });
  if (!out) { console.error('❌ Claude không trả JSON hợp lệ'); process.exit(1); }
  scenes = (out.scenes || []).filter((s) => s && s.say).slice(0, 6)
    .map((s) => ({ ...s, image_prompt: `${String(s.image_prompt || s.say).replace(/[<>]/g, '').trim()}${CHAR_TAG}` }));   // gắn nhân vật cố định vào mọi cảnh
  const ctaSay = (out.cta && out.cta.say) || 'Theo dõi để không bỏ lỡ.';
  ctaObj = { say: ctaSay, brand: BRAND_LABEL, tag: SLOGAN };   // auto giữ nguyên
  capTitle = (out.caption && out.caption.title) || TITLE; capDesc = (out.caption && out.caption.desc) || '';
}
if (!scenes.length) { console.error('Thiếu scenes'); process.exit(1); }

// Config đầy đủ cho build.py + render.mjs (caption.txt/script.txt).
const spec = {
  image_style: IMG_STYLE,
  image_model: IMG_MODEL,
  fps: 30,
  scenes,
  cta: ctaObj,   // null = KHÔNG outro (thủ công để trống tên kênh)
  caption: { title: capTitle, desc: capDesc },
  script: scenes.map((s) => s.say).filter(Boolean),   // cho "Sửa kịch bản" — verbatim: KHÔNG chèn CTA lạ; auto: lời đọc cảnh
  style: { musicVolume: 0.16 },   // nhạc nền auto-duck; build.py random 1 bài trong pool assets/music mỗi video
};
writeFileSync('spec.json', JSON.stringify(spec, null, 2));
console.log(`✓ spec.json (illustrated): ${scenes.length} cảnh · style="${IMG_STYLE.slice(0, 40)}…"`);
