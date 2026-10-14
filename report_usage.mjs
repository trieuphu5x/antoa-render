// GỬI CHI PHÍ AI THẬT của lần chạy này về Tower (Ví ANTOA) — bước cuối MỌI workflow (if: always()).
// Đọc usage.jsonl (meter.cjs ghi) → POST <origin của CALLBACK>/webhook/usage kèm id để Tower quy về đúng tài khoản/dự án.
// Không có usage / không có callback → im lặng thoát 0. Lỗi mạng → báo log, KHÔNG làm đỏ job.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const FILE = process.env.USAGE_FILE || join(process.env.GITHUB_WORKSPACE || process.cwd(), 'usage.jsonl');
const cb = process.env.CALLBACK || '';
if (!cb || !existsSync(FILE)) { console.log('usage: không có gì để báo'); process.exit(0); }

const items = readFileSync(FILE, 'utf8').split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
if (!items.length) { console.log('usage: 0 lời gọi AI trả phí'); process.exit(0); }

let url;
try { url = new URL('/webhook/usage', cb).toString(); } catch { console.log('usage: callback không hợp lệ'); process.exit(0); }
const body = {
  secret: process.env.SECRET || '',
  run: process.env.GITHUB_RUN_ID || '', attempt: process.env.GITHUB_RUN_ATTEMPT || '1',
  workflow: process.env.GITHUB_WORKFLOW || '', event: process.env.EVENT || '',
  jobId: process.env.JOB_ID || '', contentId: process.env.CONTENT_ID || '', sourceId: process.env.SOURCE_ID || '', brandId: process.env.BRAND_ID || '',
  items,
};
const by = {}; items.forEach((u) => { by[u.p] = (by[u.p] || 0) + 1; });
console.log('usage:', JSON.stringify(by));
try {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  console.log('usage → Tower:', r.status, (await r.text()).slice(0, 120));
} catch (e) { console.log('usage → Tower lỗi:', e.message); }
