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
const IMG_MODE = process.env.IMG_MODE || '';   // 'article' = TIN TỨC VN: tải ẢNH BÀI BÁO (og:image) thay chụp chữ
const IMG_QUERY = process.env.IMG_QUERY || '';   // từ khoá phụ để tìm ẢNH MINH HOẠ khi bài thiếu ảnh
const PEXELS_KEY = process.env.PEXELS_API_KEY || '';
const PIXABAY_KEY = process.env.PIXABAY_API_KEY || '';
const IMG_TARGET = 3;   // TIN TỨC VN: đảm bảo ~3 ảnh (tối đa 4 nếu bài nhiều ảnh) — thiếu thì bù ẢNH MINH HOẠ
const IMGDIR = join(OUT, 'img');
const CONSENT = ['Agree', 'Accept all', 'Accept All', 'Accept', 'I agree', 'Consent', 'Got it', 'Đồng ý', 'OK', 'Allow all', 'Continue'];
const score = (t) => { let s = 0; const n = t.length; if (n >= 90) s += 2; if (n >= 180) s += 1; if (/\d/.test(t)) s += 3; if (/[%$€]|billion|million|percent|\bAI\b|model/i.test(t)) s += 1; return s; };
// Chủ đề ẢNH MINH HOẠ (map tiếng Việt/slug URL → từ khoá tiếng Anh cho Pexels/Pixabay).
function stockQuery(q, url) {
  const s = ((q || '') + ' ' + (url || '')).toLowerCase();
  if (/kinh.?doanh|tài chính|tai.?chinh|chứng khoán|chung.?khoan|lợi nhuận|loi.?nhuan|doanh.?nghiệp|doanh.?nghiep|business|finance/.test(s)) return 'business finance office';
  if (/công nghệ|cong.?nghe|\bai\b|technology|digital|khoa.?hoc/.test(s)) return 'technology digital';
  if (/thể thao|the.?thao|bóng đá|bong.?da|sport/.test(s)) return 'sport stadium';
  if (/giải trí|giai.?tri|phim|nhạc|entertainment|\bstar\b/.test(s)) return 'entertainment concert';
  if (/sức khoẻ|suc.?khoe|y tế|y.?te|health|medical/.test(s)) return 'health medical';
  if (/giáo dục|giao.?duc|trường|truong|education|school/.test(s)) return 'education school';
  if (/du lịch|du.?lich|travel|tourism/.test(s)) return 'travel landscape';
  if (/\bxe\b|ô tô|oto|car|auto/.test(s)) return 'car automobile';
  if (/pháp luật|phap.?luat|toà án|law|court/.test(s)) return 'law justice building';
  if (/thế giới|the.?gioi|quốc tế|world|global/.test(s)) return 'world city skyline';
  return 'vietnam city news';
}
// Lấy URL ẢNH MINH HOẠ (Pexels trước, Pixabay dự phòng) — dọc (portrait) hợp video 9:16.
async function fetchStock(query, n) {
  if (!query || n < 1) return [];
  if (PEXELS_KEY) {
    try {
      const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${n + 3}&orientation=portrait`, { headers: { authorization: PEXELS_KEY } });
      if (r.ok) { const j = await r.json(); const us = (j.photos || []).map((p) => p.src && (p.src.large2x || p.src.large || p.src.portrait || p.src.original)).filter(Boolean); if (us.length) return us; }
    } catch (e) { /* thử Pixabay */ }
  }
  if (PIXABAY_KEY) {
    try {
      const r = await fetch(`https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&image_type=photo&orientation=vertical&per_page=${Math.max(3, n + 3)}&safesearch=true`);
      if (r.ok) { const j = await r.json(); const us = (j.hits || []).map((h) => h.largeImageURL || h.webformatURL).filter(Boolean); if (us.length) return us; }
    } catch (e) { /* hết nguồn */ }
  }
  return [];
}

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
    // TIN TỨC VN (IMG_MODE=article): lấy NHIỀU ảnh THẬT của bài (og:image + ảnh figure lớn), dedup; THIẾU thì bù ẢNH MINH HOẠ
    // → đảm bảo ~3-4 ảnh cho video ~85s. Ảnh đầu = hl.png (hook/thumbnail). Lỗi hết → rơi xuống chụp chữ như thường.
    if (IMG_MODE === 'article') {
      try {
        const realUrls = await page.evaluate(() => {
          const out = [], seen = new Set();
          const add = (u) => { if (u && /^https?:\/\//.test(u) && !seen.has(u)) { seen.add(u); out.push(u); } };
          const pick = (sel, attr) => { const e = document.querySelector(sel); return e ? (e.getAttribute(attr) || '') : ''; };
          add(pick('meta[property="og:image"]', 'content') || pick('meta[name="og:image"]', 'content') || pick('meta[name="twitter:image"]', 'content'));
          for (const im of [...document.querySelectorAll('article img, figure img, .fig-picture img, .article-body img, main img')]) {
            if ((im.naturalWidth || im.width || 0) < 400) continue;   // bỏ icon/thumbnail nhỏ
            add(im.currentSrc || im.src || '');
          }
          return out.slice(0, 8);
        });
        const dl = async (u, file) => { try { const resp = await page.request.get(u, { timeout: 20000 }); if (resp.ok()) { writeFileSync(join(IMGDIR, file), await resp.body()); return true; } } catch (e) { /* bỏ ảnh lỗi */ } return false; };
        const nameFor = () => manifest.shots.length === 0 ? 'hl.png' : `shot${manifest.shots.length + 1}.png`;
        // 1) ẢNH THẬT của bài — TỐI ĐA 3 (Boss: bài nhiều ảnh → lấy 3 ảnh báo)
        for (const u of realUrls) {
          if (manifest.shots.length >= 3) break;
          const file = nameFor();
          if (await dl(u, file)) manifest.shots.push({ file, kind: 'article', w: 1200, h: manifest.shots.length === 0 ? 630 : 900 });
        }
        // 2) THIẾU <3 → CHỤP CHÍNH BÀI BÁO (KHÔNG dùng ảnh minh hoạ nữa — hay lệch chủ đề).
        //    Boss: bài chỉ 1 ảnh → 1 ảnh báo + 1 ảnh CHỤP TIÊU ĐỀ + 1 ảnh CHỤP TOÀN CẢNH bài (vùng <article>, KHÔNG dính giao diện báo).
        const shootTitle = async () => {
          try { const h1 = page.locator('h1').first(); await h1.scrollIntoViewIfNeeded({ timeout: 4000 });
            const f = nameFor(); await h1.screenshot({ path: join(IMGDIR, f) }); const b = await h1.boundingBox();
            manifest.shots.push({ file: f, kind: 'title', w: Math.round(b?.width || 770), h: Math.round(b?.height || 120) }); return true; } catch (e) { return false; }
        };
        const shootArticle = async () => {   // TOÀN CẢNH bài = chụp VÙNG <article> (không dính nav/quảng cáo/giao diện báo)
          try {
            const sels = ['article', '.fck_detail', '[itemprop="articleBody"]', '.article-body', '.detail-content', '.dt-news__content', '.singular-content', '.content-detail', 'main'];
            let el = null; for (const s of sels) { const loc = page.locator(s).first(); if (await loc.count() > 0) { el = loc; break; } }
            if (!el) return false;
            await el.scrollIntoViewIfNeeded({ timeout: 4000 }); await page.waitForTimeout(300);
            const b = await el.boundingBox(); if (!b || b.width < 200) return false;
            const f = nameFor(); const h = Math.min(Math.round(b.height), 2200);   // giới hạn chiều cao (bài dài)
            await page.screenshot({ path: join(IMGDIR, f), clip: { x: Math.max(0, b.x), y: Math.max(0, b.y), width: Math.round(b.width), height: h } });
            manifest.shots.push({ file: f, kind: 'article', w: Math.round(b.width), h }); return true; } catch (e) { return false; }
        };
        if (manifest.shots.length && manifest.shots.length < 3) {
          for (const fn of [shootTitle, shootArticle]) { if (manifest.shots.length >= 3) break; await fn(); }
        }
        if (manifest.shots.length) {
          const nA = manifest.shots.filter((s) => s.kind === 'article').length, nT = manifest.shots.length - nA;
          console.log(`chup: ${nA} ảnh bài + ${nT} ảnh chụp bài → ${manifest.shots.length} ảnh (KHÔNG dùng minh hoạ)`);
          return done();
        }
        console.log('chup: bài không có ảnh → fallback chụp chữ');
      } catch (e) { console.log('chup: ảnh bài lỗi —', e.message, '→ fallback chụp chữ'); }
    }
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
