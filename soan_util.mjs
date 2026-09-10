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
