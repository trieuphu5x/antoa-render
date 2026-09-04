// ANTOA — Evergreen SĂN (bước ① Kho Swipe) — chạy trên GitHub Actions runner Mỹ.
// Đọc env → YouTube săn (viewCount 30 ngày) + outlier(views/subs) + Claude phân tích swipe → ghi candidates.json.
import { writeFileSync } from 'node:fs';
import { timKiemYouTube, SYSTEM_PROMPT, phanTichClaude } from './evergreen_lib.mjs';

const p = {
  keywords: JSON.parse(process.env.KEYWORDS || '[]'),
  perKeyword: Math.max(1, Math.min(5, Number(process.env.PER_KEYWORD) || 2)),
  outlierMin: Number(process.env.OUTLIER_MIN) || 0,
  brandName: process.env.BRAND_NAME || 'thương hiệu',
  niche: process.env.NICHE || 'ứng dụng AI vào công việc',
  persona: process.env.PERSONA || '',
  region: process.env.REGION || 'vn',
};

const main = async () => {
  const keywords = p.keywords.map((s) => String(s).trim()).filter(Boolean);
  if (!keywords.length) { console.error('❌ thiếu KEYWORDS'); writeFileSync('candidates.json', JSON.stringify({ ok: false, err: 'thiếu keywords' })); process.exit(1); }
  const sys = SYSTEM_PROMPT(p);

  const cands = [];
  for (const kw of keywords) {
    try { for (const v of await timKiemYouTube(kw, p.perKeyword)) cands.push(v); }
    catch (e) { console.error('YT lỗi [' + kw + ']:', e.message); }
  }

  const seen = new Set(), out = [];
  for (const c of cands) {
    if (seen.has(c.url)) continue; seen.add(c.url);
    if (p.outlierMin > 0 && c.outlierX > 0 && c.outlierX < p.outlierMin) continue;
    try {
      const a = await phanTichClaude(c, sys);
      out.push({
        url: c.url, platform: 'youtube', title: c.title, channel: c.channel,
        outlier: c.outlier, outlierX: c.outlierX, views: c.views, subs: c.subs,
        hook: a.hook || '', cau_truc: a.cau_truc || '', tai_sao_thang: a.tai_sao_thang || '',
        do_phu_hop: Number(a.do_phu_hop) || 0, goi_y_remix: a.goi_y_remix || ''
      });
    } catch (e) { console.error('Claude/parse lỗi [' + c.url + ']:', e.message); }
  }

  const result = { ok: true, candidates: out, scanned: cands.length };
  writeFileSync('candidates.json', JSON.stringify(result));
  console.log('✅ SĂN xong:', out.length, 'candidate /', cands.length, 'quét');
  for (const c of out) console.log(`  • [${c.outlier} · hợp ${c.do_phu_hop}/5] ${c.title.slice(0, 60)}`);
};
main().catch((e) => { console.error('FATAL:', e); writeFileSync('candidates.json', JSON.stringify({ ok: false, err: String(e) })); process.exit(1); });
