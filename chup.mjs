// chup.mjs — CHỤP MÀN HÌNH bài báo (h1 + đoạn điểm nhấn) bằng Playwright → shots/img/*.png (port chup.py local).
// CHỈ chụp CHỮ (element <h1>/<p>) — KHÔNG dính ảnh/đồ hoạ báo → an toàn bản quyền. Tự tắt cookie.
// FAIL-SAFE TUYỆT ĐỐI: mọi lỗi → ghi manifest rỗng → soạn cảnh về text/stat (không bao giờ làm hỏng render).
// Dùng: node chup.mjs "<url>" <out_dir=shots> [số_đoạn=2]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const URL = process.argv[2] || '';
const OUT = process.argv[3] || 'shots';
const NPARA = Math.max(1, Math.min(3, Number(process.argv[4]) || 2));   // Boss: 2-3 ảnh cho video ~1 phút
const IMGDIR = join(OUT, 'img');
const CONSENT = ['Agree', 'Accept all', 'Accept All', 'Accept', 'I agree', 'Consent', 'Got it', 'Đồng ý', 'OK', 'Allow all', 'Continue'];
const score = (t) => { let s = 0; const n = t.length; if (n >= 90) s += 2; if (n >= 180) s += 1; if (/\d/.test(t)) s += 3; if (/[%$€]|billion|million|percent|\bAI\b|model/i.test(t)) s += 1; return s; };

async function run() {
  const manifest = { url: URL, shots: [] };
  mkdirSync(IMGDIR, { recursive: true });
  const done = () => { writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2)); console.log(`chup: ${manifest.shots.length} ảnh → ${IMGDIR}/`); };
  if (!/^https?:\/\//.test(URL)) { console.log('chup: URL không hợp lệ → bỏ qua (text-only)'); return done(); }
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 860, height: 1200 }, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36' });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1500);
    for (const label of CONSENT) {   // tắt popup cookie
      try { const btn = page.getByRole('button', { name: label, exact: false }); if (await btn.count() > 0) { await btn.first().click({ timeout: 1500 }); await page.waitForTimeout(400); break; } } catch (e) { /* thử nhãn khác */ }
    }
    await page.waitForTimeout(400);
    // 1) TIÊU ĐỀ (hl.png) — ảnh ĐẦU TIÊN, sẽ đặt vào cảnh hook (0s) → làm thumbnail
    try {
      const h1 = page.locator('h1').first();
      await h1.scrollIntoViewIfNeeded({ timeout: 4000 });
      await h1.screenshot({ path: join(IMGDIR, 'hl.png') });
      const box = await h1.boundingBox();
      manifest.shots.push({ file: 'hl.png', kind: 'title', w: Math.round(box?.width || 770), h: Math.round(box?.height || 120) });
    } catch (e) { console.log('chup: lỗi h1 —', e.message); }
    // 2) ĐOẠN ĐIỂM NHẤN (ưu tiên đoạn có SỐ LIỆU) → shot2.png, shot3.png
    let loc = page.locator('article p'); if (await loc.count() === 0) loc = page.locator('main p'); if (await loc.count() === 0) loc = page.locator('p');
    const cands = []; const total = Math.min(await loc.count(), 40);
    for (let i = 0; i < total; i++) {
      let t = ''; try { t = (await loc.nth(i).innerText()).trim(); } catch (e) { continue; }
      if (t.length < 70 || /(cookie|subscribe|sign up|newsletter|advertis|©)/i.test(t)) continue;
      cands.push({ s: score(t), i });
    }
    cands.sort((a, b) => b.s - a.s);
    const picked = cands.slice(0, NPARA).sort((a, b) => a.i - b.i);   // giữ thứ tự xuất hiện
    let k = 2;
    for (const { i } of picked) {
      const fn = `shot${k}.png`;
      try { const el = loc.nth(i); await el.scrollIntoViewIfNeeded({ timeout: 4000 }); await page.waitForTimeout(200); await el.screenshot({ path: join(IMGDIR, fn) }); const box = await el.boundingBox(); manifest.shots.push({ file: fn, kind: 'para', w: Math.round(box?.width || 770), h: Math.round(box?.height || 150) }); k++; } catch (e) { /* bỏ đoạn lỗi */ }
    }
  } catch (e) { console.log('chup: lỗi tổng —', e.message, '→ text-only'); }
  finally { try { await browser?.close(); } catch (e) {} }
  done();
}
run().catch((e) => { console.log('chup: crash —', e.message); try { writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ url: URL, shots: [] })); } catch (e2) {} });
