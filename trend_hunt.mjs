// ANTOA — Trend SĂN (thủ công, bước xem-trước) — chạy trên GitHub runner Mỹ (có YT_KEY, giống Evergreen hunt).
// Săn VELOCITY (YouTube 2 bước + TikTok Apify) → gộp → chống trùng URL → xếp view/giờ → cắt LIMIT → candidates.json.
// KHÔNG gọi Claude (nhanh/rẻ — Boss chỉ xem danh sách velocity rồi tự bấm Phối). An toàn = heuristic tiêu đề.
import { writeFileSync } from 'node:fs';
import { translateKeywordsEn } from './evergreen_lib.mjs';
import { timKiemYouTubeVelocity, timKiemTikTokVelocity } from './trend_lib.mjs';

const UNSAFE = /(kiếm\s*\d|thu nhập|triệu\/tháng|làm giàu|x2 tài khoản|thụ động|cam kết lãi|lùa gà|đổi đời|100% lợi nhuận)/i;
const safetyOf = (t) => (UNSAFE.test(t || '') ? 'warn' : 'ok');

const p = {
  keywords: (JSON.parse(process.env.KEYWORDS || '[]')).map((s) => String(s).trim()).filter(Boolean),
  perKeyword: Math.max(1, Math.min(5, Number(process.env.PER_KEYWORD) || 5)),
  region: process.env.REGION || 'vn',
  minView: Math.max(0, Number(process.env.MIN_VIEW) || 3000),
  limit: Math.max(1, Math.min(20, Number(process.env.LIMIT) || 10)),
};

const main = async () => {
  if (!p.keywords.length) { writeFileSync('candidates.json', JSON.stringify({ ok: false, err: 'thiếu keywords' })); process.exit(1); }
  let kws = p.keywords;
  if (p.region === 'world') { const en = await translateKeywordsEn(kws); if (en && en.length) { console.log('🌐 world → từ khoá EN:', en.join(', ')); kws = en; } }

  let cands = [];
  const seen = new Set();
  for (const kw of kws) {
    try { for (const v of await timKiemYouTubeVelocity(kw, p.perKeyword, p.region, p.minView)) if (!seen.has(v.url)) { seen.add(v.url); cands.push(v); } }
    catch (e) { console.error('YT lỗi [' + kw + ']:', e.message); }
  }
  try { for (const v of await timKiemTikTokVelocity(kws, p.minView)) if (!seen.has(v.url)) { seen.add(v.url); cands.push(v); } }
  catch (e) { console.error('TikTok lỗi:', e.message); }

  cands.sort((a, b) => b.velocity - a.velocity);
  const out = cands.slice(0, p.limit).map((c) => ({ url: c.url, platform: c.platform, title: c.title, channel: c.channel, velocity: c.velocity, ageHours: c.ageHours, views: c.views, safety: safetyOf(c.title) }));
  const ytN = out.filter((c) => c.platform === 'youtube').length;
  const tkN = out.filter((c) => c.platform === 'tiktok').length;
  writeFileSync('candidates.json', JSON.stringify({ ok: true, candidates: out, scanned: cands.length }));
  console.log('✅ SĂN velocity xong:', out.length, '/', cands.length, 'quét (' + ytN + ' YouTube · ' + tkN + ' TikTok)');
  for (const c of out) console.log('  • [' + c.platform + ' · ' + c.velocity + '/h] ' + c.title.slice(0, 60));
};
main().catch((e) => { console.error('FATAL:', e); writeFileSync('candidates.json', JSON.stringify({ ok: false, err: String(e) })); process.exit(1); });
