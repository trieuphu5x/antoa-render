// ANTOA — Evergreen SẢN XUẤT AUTO (Boss chốt logic) — 1 job làm TRỌN trên GitHub runner Mỹ.
// random 2 từ khoá × 3 bài = 6 → swipe (do_phu_hop + dung_chu_de theo TIÊU ĐỀ, free) → lọc ≥8/10 & đúng chủ đề →
// chống trùng vs video đã sản xuất → nếu cặp key trùng/rỗng thì thử CẶP KHÁC → TOP 1 (điểm; bằng điểm→view) →
// CHỈ top 1 qua Supadata (transcript) → kịch bản. Trả về chosen+script, hoặc none nếu ngày đó không có tin.
import { writeFileSync } from 'node:fs';
import { timKiemYouTube, SYSTEM_PROMPT, phanTichClaude, layTranscript, POST_PROMPT, phoiClaude, translateKeywordsEn } from './evergreen_lib.mjs';

const p = {
  keywords: (JSON.parse(process.env.KEYWORDS || '[]')).map((s) => String(s).trim()).filter(Boolean),
  brandName: process.env.BRAND_NAME || 'thương hiệu',
  niche: process.env.NICHE || 'ứng dụng AI vào công việc',
  persona: process.env.PERSONA || '',
  slogan: process.env.SLOGAN || '',
  region: process.env.REGION || 'vn',
  producedTitles: (JSON.parse(process.env.PRODUCED_TITLES || '[]')).map((s) => String(s || '')),
  seenUrls: (JSON.parse(process.env.SEEN_URLS || '[]')).map((s) => String(s || '')),   // MỌI video evergreen đã săn (produced+hunted) → chặn trùng đúng video
  perKeyword: Math.max(1, Math.min(5, Number(process.env.PER_KEYWORD) || 3)),   // 3 bài/key (Boss chốt)
  minScore: Math.max(1, Math.min(10, Number(process.env.MIN_SCORE) || 8)),      // độ_hợp ≥8/10 (thang 1-10 như News/Trend)
};

// ---- chống trùng theo SỰ KIỆN (word-overlap, port từ hunt.js) ----
const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'is', 'are', 'với', 'và', 'cho', 'của', 'là', 'các', 'một', 'người']);
const titleWords = (t) => new Set(String(t || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
const overlap = (a, b) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n; };
const producedW = p.producedTitles.map(titleWords);
const isDup = (title) => { const w = titleWords(title); if (w.size < 2) return false; for (const ew of producedW) { const ov = overlap(w, ew); if (ov >= 4 || (ov >= 3 && 2 * ov >= Math.min(w.size, ew.size))) return true; } return false; };
// Trùng ĐÚNG video: so video-id YouTube (né youtu.be/watch?v/shorts) với mọi video đã săn trước → không lấy lại bài hôm trước.
const vidId = (u) => { const m = String(u || '').match(/(?:v=|youtu\.be\/|\/shorts\/|\/embed\/)([\w-]{11})/); return m ? m[1] : String(u || '').trim(); };
const seenIds = new Set(p.seenUrls.map(vidId));
const isSeen = (url) => seenIds.has(vidId(url));

const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const main = async () => {
  if (!p.keywords.length) { writeFileSync('auto.json', JSON.stringify({ ok: true, none: true, reason: 'brand chưa có từ khoá' })); return; }
  if (p.region === 'world') { const en = await translateKeywordsEn(p.keywords); if (en && en.length) { console.log('🌐 world → từ khoá EN:', en.join(', ')); p.keywords = en; } }   // dịch tại backend (CF 403)
  const sys = SYSTEM_PROMPT(p);
  // Chia từ khoá thành các CẶP 2 (đã trộn ngẫu nhiên) → thử từng cặp tới khi có winner (tránh trùng/lặp video).
  const kws = shuffle(p.keywords);
  const pairs = [];
  for (let i = 0; i < kws.length; i += 2) pairs.push(kws.slice(i, i + 2));
  const seenUrl = new Set();
  let chosen = null;

  for (const pair of pairs) {
    if (chosen) break;
    let cands = [];
    for (const kw of pair) { try { for (const v of await timKiemYouTube(kw, p.perKeyword, p.region)) if (!seenUrl.has(v.url)) { seenUrl.add(v.url); cands.push(v); } } catch (e) { console.error('YT lỗi [' + kw + ']:', e.message); } }
    console.log(`Cặp [${pair.join(', ')}] → ${cands.length} bài`);
    const passed = [];
    for (const c of cands) {
      try {
        if (isSeen(c.url)) { console.log(`  ✗ ĐÃ SĂN/SẢN XUẤT trước (trùng video) — ${c.title.slice(0, 45)}`); continue; }
        const a = await phanTichClaude(c, sys);
        const score = Number(a.do_phu_hop) || 0;
        const onTopic = a.dung_chu_de === true || a.dung_chu_de === 'true' || a.dung_chu_de === 1;
        if (score < p.minScore) { console.log(`  ✗ ${score}/10 (dưới ${p.minScore}) — ${c.title.slice(0, 45)}`); continue; }
        if (!onTopic) { console.log(`  ✗ lệch chủ đề (tiêu đề) — ${c.title.slice(0, 45)}`); continue; }
        if (isDup(c.title)) { console.log(`  ✗ TRÙNG video đã sản xuất — ${c.title.slice(0, 45)}`); continue; }
        passed.push({ ...c, do_phu_hop: score, hook: a.hook || '', cau_truc: a.cau_truc || '', tai_sao_thang: a.tai_sao_thang || '', goi_y_remix: a.goi_y_remix || '' });
        console.log(`  ✓ ${score}/10 [${c.outlier}] — ${c.title.slice(0, 45)}`);
      } catch (e) { console.error('  swipe lỗi:', e.message); }
    }
    if (passed.length) {
      passed.sort((a, b) => (b.do_phu_hop - a.do_phu_hop) || (b.views - a.views));   // điểm cao nhất; bằng điểm → view cao hơn
      chosen = passed[0];
    }
  }

  if (!chosen) { writeFileSync('auto.json', JSON.stringify({ ok: true, none: true, reason: 'không có tin ĐẠT (≥' + p.minScore + ' + đúng chủ đề + không trùng) sau khi thử ' + pairs.length + ' cặp từ khoá' })); console.log('➡️ KHÔNG có tin để phối hôm nay'); return; }

  console.log(`🏆 TOP 1: [${chosen.outlier} · ${chosen.do_phu_hop}/10] ${chosen.title}`);
  const swipe = { hook: chosen.hook, cau_truc: chosen.cau_truc, tai_sao_thang: chosen.tai_sao_thang, goi_y_remix: chosen.goi_y_remix };
  const transcript = await layTranscript(chosen.url);   // CHỈ top 1 tốn Supadata
  console.log('transcript:', transcript ? transcript.length + ' ký tự' : 'KHÔNG có (fallback hook+cấu trúc)');
  const script = await phoiClaude(swipe, transcript, chosen.url, POST_PROMPT(p));
  if (!script || !script.trim()) { writeFileSync('auto.json', JSON.stringify({ ok: false, err: 'Claude kịch bản rỗng' })); return; }

  writeFileSync('auto.json', JSON.stringify({
    ok: true, none: false,
    chosen: { url: chosen.url, title: chosen.title, channel: chosen.channel, outlier: chosen.outlier, outlierX: chosen.outlierX, views: chosen.views, do_phu_hop: chosen.do_phu_hop, swipe },
    script: script.trim(), hasTranscript: !!transcript,
  }));
  console.log('✅ AUTO xong:', script.trim().split('\n').filter(Boolean).length, 'câu | hasTranscript:', !!transcript);
};
main().catch((e) => { console.error('FATAL:', e); writeFileSync('auto.json', JSON.stringify({ ok: false, err: String(e) })); process.exit(1); });
