// Soạn SPEC (cảnh + inner HTML kiểu AI Có Gì Mới) bằng Claude → spec.json cho dung.py.
// Dùng để validate bê nguyên mẫu. Sau sẽ chuyển logic này vào Tower (ai.js generateScenes).
import { writeFileSync } from 'node:fs';

const KEY = process.env.CLAUDE_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const TITLE = process.env.TITLE || '';
const ARTICLE = process.env.ARTICLE || '';
const BRANDKW = process.env.BRANDKW || 'AI Agent, tự động hoá';
const BRAND_LABEL = (process.env.BRAND_LABEL || '').trim() || 'ANTOA';                       // tên hiện cuối video (theo workflow)
const SLOGAN = (process.env.SLOGAN || '').trim() || 'Theo dõi để cập nhật mỗi ngày.';        // slogan cuối video (theo workflow)

const PROMPT = `Bạn là biên tập viên video tin ngắn 9:16 (kênh kiểu "AI Có Gì Mới"). Việt hoá tin dưới đây thành KỊCH BẢN VIDEO gồm 7-8 CẢNH, trả về DUY NHẤT một JSON hợp lệ (không markdown, không giải thích).

TIN: "${TITLE}"
NỘI DUNG GỐC: """${ARTICLE.slice(0, 2400)}"""
TỪ KHOÁ THƯƠNG HIỆU (bám sát): ${BRANDKW}

JSON dạng:
{
 "palette": "<một trong: hot|launch|creative|biz|research — chọn theo LOẠI tin: hot=drama/an ninh, launch=ra mắt/model mới, creative=phim-ảnh-nghệ thuật AI, biz=thị trường/kinh doanh, research=nghiên cứu>",
 "caption": {"title":"<tiêu đề đăng>", "desc":"<caption ngắn 1-2 câu + 4-5 hashtag>"},
 "scenes": [
   {"id":"s1","inner":"<HTML cảnh HOOK>","vo":"<lời đọc cảnh 1>"},
   ... các cảnh giữa ...,
   {"id":"s7","inner":"<HTML cảnh CTA hỏi>","vo":"<lời đọc>"},
   {"id":"sO","inner":"<div class=\\"mid\\"><div class=\\"brand anim\\">${BRAND_LABEL}</div><div class=\\"lede anim\\">${SLOGAN}</div></div>"}
 ]
}

LUẬT viết "inner" (BẮT BUỘC, chỉ dùng các class này):
- Bọc ngoài: <div class="mid"> ... </div>  (cảnh chữ thuần, căn giữa).
- Nhãn nhỏ trên cùng: <div class="kick anim">Nhãn ngắn</div>  (VD "Sự thật", "Số liệu", "Ra mắt").
- Tiêu đề cảnh: <div class="head h-md anim">Chữ chính <span class="emr">nhấn ĐỎ/CAM</span></div>  (dùng <span class="em">…</span> nhấn màu phụ; xuống dòng bằng <br/> khi cần, tránh mồ côi 1 từ).
- Câu diễn giải: <div class="lede anim">1 câu ngắn, dễ hiểu cho người Việt.</div>
- Cảnh cuối (sO): dùng <div class="brand anim">${BRAND_LABEL}</div>.
- KHÔNG dùng class/thẻ khác, KHÔNG style inline, KHÔNG ảnh.
- "vo" = lời đọc tự nhiên tiếng Việt (1 câu/cảnh), KHÔNG chứa HTML.
- An toàn nền tảng: KHÔNG hứa thu nhập/mốc thời gian/comment-bait/thổi phồng, KHÔNG ký tự < > trong text hiển thị (dùng "trên/dưới").
Chỉ in JSON.`;

const r = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
  body: JSON.stringify({ model: MODEL, max_tokens: 2600, messages: [{ role: 'user', content: PROMPT }] }),
});
if (!r.ok) { console.error(`❌ Claude ${r.status}:`, (await r.text().catch(() => '')).slice(0, 300)); process.exit(1); }
const j = await r.json();
const raw = (j?.content || []).map((b) => b.text || '').join('');
const m = raw.match(/\{[\s\S]*\}/);
if (!m) { console.error('❌ Không parse được JSON:', raw.slice(0, 300)); process.exit(1); }
const spec = JSON.parse(m[0]);
// 🛡️ KIỂM SÁT VIÊN (chạy tại backend Mỹ, nơi Claude không bị 403): kịch bản phải ≥3 cảnh, nếu không → chặn, KHÔNG render video rỗng.
if (!Array.isArray(spec.scenes) || spec.scenes.length < 3) {
  console.error(`❌ KIỂM SÁT chặn: kịch bản chỉ ${spec.scenes?.length || 0} cảnh (<3) — không sản xuất video rỗng.`);
  process.exit(1);
}
// ÉP cảnh cuối (thương hiệu) dùng đúng BRAND_LABEL + SLOGAN theo workflow — AI có thể không theo sát mẫu.
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const closing = `<div class="mid"><div class="brand anim">${escHtml(BRAND_LABEL)}</div><div class="lede anim">${escHtml(SLOGAN)}</div></div>`;
const sO = spec.scenes.find((s) => s.id === 'sO');
if (sO) { sO.inner = closing; if (!sO.vo) sO.vo = SLOGAN; }
else spec.scenes.push({ id: 'sO', inner: closing, vo: SLOGAN });
console.log(`✓ Cảnh cuối: thương hiệu="${BRAND_LABEL}" · slogan="${SLOGAN}"`);

spec.tts = process.env.SPEC_TTS || 'edge';
if (process.env.SPEC_VOICE) spec.voice = process.env.SPEC_VOICE;
writeFileSync('spec.json', JSON.stringify(spec, null, 2));
console.log(`✓ spec.json: palette=${spec.palette} · ${spec.scenes.length} cảnh · tts=${spec.tts}`);
console.log('Cảnh 1 inner:', spec.scenes[0].inner.slice(0, 140));
