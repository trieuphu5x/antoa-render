// ĐO CHI PHÍ AI THẬT (Ví ANTOA) — nạp sẵn vào MỌI tiến trình node của job qua NODE_OPTIONS="--require <workspace>/meter.cjs".
// Dùng --require (CommonJS) vì mọi bản Node đều nhận — kể cả Node của chính các action GitHub (cache/upload-artifact).
// Bọc fetch toàn cục: gặp lời gọi AI TRẢ PHÍ (Claude / OpenAI ảnh / Gemini) trả về OK → ghi 1 dòng usage vào usage.jsonl.
// Không sửa script nào; lỗi đo KHÔNG BAO GIỜ làm hỏng lời gọi thật (bọc try, trả nguyên response).
const { appendFileSync } = require('node:fs');
const { join } = require('node:path');

const FILE = process.env.USAGE_FILE || join(process.env.GITHUB_WORKSPACE || process.cwd(), 'usage.jsonl');
const orig = globalThis.fetch;

function reqJson(init) {
  try { return typeof init?.body === 'string' ? JSON.parse(init.body) : {}; } catch { return {}; }
}
function write(o) {
  try { appendFileSync(FILE, JSON.stringify({ ...o, t: Math.floor(Date.now() / 1000) }) + '\n'); } catch { /* bỏ qua */ }
}

if (typeof orig === 'function' && !globalThis.__antoaMeter) {
  globalThis.__antoaMeter = true;
  globalThis.fetch = async function meteredFetch(input, init) {
    const res = await orig(input, init);
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || String(input);
      const ai = /api\.anthropic\.com\/v1\/messages|api\.openai\.com\/v1\/images|generativelanguage\.googleapis\.com\/.*:generateContent/.test(url);
      if (ai && res.ok) {
        const j = await res.clone().json().catch(() => null);
        if (j) {
          const rq = reqJson(init);
          if (url.includes('anthropic.com')) {
            const u = j.usage || {};
            write({ p: 'anthropic', m: j.model || rq.model, in: u.input_tokens, out: u.output_tokens, cw: u.cache_creation_input_tokens, cr: u.cache_read_input_tokens });
          } else if (url.includes('openai.com')) {
            const u = j.usage || {}, d = u.input_tokens_details || {};
            write({ p: 'openai-image', m: rq.model || 'gpt-image-1', q: rq.quality || '', size: rq.size || '', n: Array.isArray(j.data) ? j.data.length : (rq.n || 1), tin: d.text_tokens ?? u.input_tokens, iin: d.image_tokens, out: u.output_tokens });
          } else {
            const u = j.usageMetadata || {}, m = (/models\/([^:/?]+)/.exec(url) || [])[1] || '';
            write({ p: 'gemini', m, in: u.promptTokenCount, out: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) });
          }
        }
      }
    } catch { /* đo lỗi → bỏ qua */ }
    return res;
  };
}
