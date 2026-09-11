// Helper dùng chung cho các soan_*.mjs: gọi Claude + parse JSON CHẮC (retry + vá lỗi cú pháp thường gặp).
// Claude thỉnh thoảng trả JSON hỏng (dấu phẩy thừa, xuống dòng thô trong chuỗi, glitch giữa chừng) → retry + repair.

export function parseJsonLoose(raw) {
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  const s = m[0];
  const tryParse = (x) => { try { return JSON.parse(x); } catch (e) { return null; } };
  // 1) nguyên bản
  let o = tryParse(s); if (o) return o;
  // 2) bỏ dấu phẩy thừa trước } hoặc ]
  const s2 = s.replace(/,(\s*[}\]])/g, '$1');
  o = tryParse(s2); if (o) return o;
  // 3) thay ký tự điều khiển thô (xuống dòng/tab trong chuỗi) bằng khoảng trắng — thô nhưng cứu được
  const s3 = s2.replace(/[\x00-\x1F]/g, ' ');
  o = tryParse(s3); if (o) return o;
  return null;
}

// ===== VERBATIM DÙNG CHUNG: kịch bản DÁN THỦ CÔNG → GIỮ NGUYÊN 100% lời đọc, KHÔNG sửa/biên tập.
// Tách kịch bản thành từng câu = 1 cảnh (vo giữ nguyên). Claude CHỈ cô đọng HÌNH (head ngắn + lede) — KHÔNG đổi lời đọc.
// Trả [{vo, head, lede}]. Mỗi soan map sang định dạng cảnh của mẫu mình. (Boss: dán thủ công là kịch bản đã chuẩn.)
export async function verbatimScenes(scriptText, { key, model, title = '', max = 16 } = {}) {
  let lines = String(scriptText || '').split(/\r?\n+/).map((x) => x.replace(/^\s*[-•*–]\s*/, '').trim()).filter((x) => x.length > 1);
  if (lines.length < 3) lines = String(scriptText || '').replace(/\s+/g, ' ').split(/(?<=[.!?…])\s+/).map((x) => x.trim()).filter((x) => x.length > 1);
  lines = lines.slice(0, max);                                  // trần an toàn số cảnh (render.mjs còn cắt theo thời lượng)
  if (!lines.length) lines = [String(title || 'Nội dung').trim()];
  let vis = [];
  if (key) {
    try {
      const vp = `Cho ${lines.length} câu LỜI ĐỌC video dọc 9:16 (đúng thứ tự). Với MỖI câu tạo phần HÌNH gọn & chuyên nghiệp:
- "head": ý chính RẤT NGẮN 3-7 từ, BỌC 1-2 từ QUAN TRỌNG bằng *...* để nhấn MÀU (vd "Thức dậy *giữa đêm*") — TUYỆT ĐỐI KHÔNG chép cả câu.
- "lede": 1 câu diễn giải ngắn ≤ 14 từ, hoặc để "".
KHÔNG trả lời đọc, KHÔNG đổi câu. Trả DUY NHẤT JSON {"v":[{"head":"...","lede":"..."}]} đúng ${lines.length} phần tử, đúng thứ tự.
CÁC CÂU:\n${lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}`;
      const rr = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model, max_tokens: 2400, messages: [{ role: 'user', content: vp }] }) });
      if (rr.ok) { const jj = await rr.json(); const raw = (jj?.content || []).map((b) => b.text || '').join(''); const o = parseJsonLoose(raw); if (o && Array.isArray(o.v)) vis = o.v; }
    } catch (e) { /* Claude lỗi → fallback tách câu */ }
  }
  const words = (s) => String(s).trim().split(/\s+/);
  return lines.map((vo, i) => {
    const v = vis[i] || {}; const w = words(vo);
    let head = String(v.head || w.slice(0, 6).join(' ')).trim().replace(/[.,!?…:;]+$/, '');
    // PHỐI 2 MÀU: nếu head chưa có *...*, tự nhấn NỬA SAU bằng *...* (ember/vàng) — khớp thiết kế mẫu.
    if (!head.includes('*')) { const hw = head.split(/\s+/); if (hw.length >= 3) { const k = Math.ceil(hw.length / 2); head = `${hw.slice(0, k).join(' ')} *${hw.slice(k).join(' ')}*`; } }
    const lede = String(v.lede || (v.head ? '' : (w.length > 6 ? w.slice(6, 20).join(' ') : ''))).trim();
    return { vo, head, lede };   // vo = NGUYÊN VĂN 100%
  });
}

// CAPTION dùng chung: từ nội dung → {title (SEO), desc (caption + 3-5 hashtag)}. Chạy trên GH Actions (Claude ổn).
export async function captionFor(text, { key, model, title = '', brandkw = '' } = {}) {
  const fb = { title: String(title || '').slice(0, 90), desc: '' };
  if (!key) return fb;
  const prompt = `Từ NỘI DUNG video dưới đây, viết phần ĐĂNG BÀI tiếng Việt. Trả DUY NHẤT JSON {"title":"...","desc":"..."}.
- "title": TIÊU ĐỀ SEO 1 dòng — đặt ý/từ khoá QUAN TRỌNG lên đầu, hấp dẫn TỰ NHIÊN (KHÔNG giật gân), 40-90 ký tự, KHÔNG hashtag, KHÔNG dấu ngoặc kép, KHÔNG viết HOA toàn bộ.
- "desc": caption đăng 1-2 câu ngắn + 3-5 hashtag TRUNG TÍNH bám chủ đề.
An toàn nền tảng: KHÔNG hứa thu nhập/mốc thời gian/comment-bait/thổi phồng/chữa bệnh, KHÔNG ký tự < >.${brandkw ? '\nTừ khoá bám: ' + brandkw : ''}
NỘI DUNG: """${String(text || '').slice(0, 1800)}"""`;
  const o = await claudeJson({ key, model, maxTokens: 500, prompt, tries: 2, label: 'caption' });
  if (o && (o.title || o.desc)) return { title: String(o.title || title || '').trim().slice(0, 100), desc: String(o.desc || '').trim() };
  return fb;
}

export async function claudeJson({ key, model, maxTokens = 3500, prompt, tries = 3, label = '' }) {
  if (!key) { console.error('❌ Thiếu CLAUDE_API_KEY'); return null; }
  let lastRaw = '';
  for (let t = 1; t <= tries; t++) {
    let raw = '';
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
      });
      const j = await r.json();
      if (j && j.error) { lastRaw = 'API error: ' + JSON.stringify(j.error).slice(0, 200); console.error(`(lần ${t}/${tries}) ${lastRaw}`); continue; }
      raw = (j && j.content ? j.content : []).map((b) => b.text || '').join('');
    } catch (e) { lastRaw = 'fetch fail: ' + (e && e.message); console.error(`(lần ${t}/${tries}) ${lastRaw}`); continue; }
    lastRaw = raw;
    const obj = parseJsonLoose(raw);
    if (obj) { if (t > 1) console.error(`✓ parse OK ở lần ${t}`); return obj; }
    console.error(`(lần ${t}/${tries}) ${label} JSON không hợp lệ, thử lại…`);
  }
  console.error(`Không parse được JSON sau ${tries} lần. Raw(400): ${String(lastRaw).slice(0, 400)}`);
  return null;
}
