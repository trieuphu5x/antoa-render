// ANTOA — Trend SẢN XUẤT AUTO — 1 job làm TRỌN trên GitHub runner Mỹ (Claude không 403 + Supadata transcript).
// Săn VELOCITY (YouTube 2 bước ≤7 ngày + TikTok Apify) → chống trùng (title + video-id) → xếp theo view/giờ →
// duyệt từ trên xuống: transcript (chỉ YouTube) → PHỐI 1-5' → AI CHẤM (điểm ≥ngưỡng & AN TOÀN nền tảng).
// Đạt thì dừng; rớt (không an toàn / dưới ngưỡng) → thử tin velocity kế (tối đa 5 tin, giữ Claude budget).
// Trả trend.json {chosen, script, hasTranscript} hoặc {none} nếu ngày đó không có tin đạt.
import { writeFileSync } from 'node:fs';
import { layTranscript, translateKeywordsEn } from './evergreen_lib.mjs';
import { timKiemYouTubeVelocity, timKiemTikTokVelocity, TREND_POST_PROMPT, phoiTrendClaude, chamTrend } from './trend_lib.mjs';

const p = {
  keywords: (JSON.parse(process.env.KEYWORDS || '[]')).map((s) => String(s).trim()).filter(Boolean),
  brandName: process.env.BRAND_NAME || 'thương hiệu',
  niche: process.env.NICHE || 'ứng dụng AI vào công việc',
  persona: process.env.PERSONA || '',
  slogan: process.env.SLOGAN || '',
  region: process.env.REGION || 'vn',
  producedTitles: (JSON.parse(process.env.PRODUCED_TITLES || '[]')).map((s) => String(s || '')),
  seenUrls: (JSON.parse(process.env.SEEN_URLS || '[]')).map((s) => String(s || '')),   // mọi video trend đã săn/sản xuất → chặn trùng đúng video
  perKeyword: Math.max(1, Math.min(5, Number(process.env.PER_KEYWORD) || 5)),
  minScore: Math.max(1, Math.min(10, Number(process.env.MIN_SCORE) || 7)),   // trend ngưỡng 7 (Boss chốt)
  minView: Math.max(0, Number(process.env.MIN_VIEW) || 3000),
};

// ---- chống trùng theo SỰ KIỆN (word-overlap, port evergreen_auto) ----
const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'is', 'are', 'với', 'và', 'cho', 'của', 'là', 'các', 'một', 'người']);
const titleWords = (t) => new Set(String(t || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
const overlap = (a, b) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n; };
const producedW = p.producedTitles.map(titleWords);
const isDup = (title) => { const w = titleWords(title); if (w.size < 2) return false; for (const ew of producedW) { const ov = overlap(w, ew); if (ov >= 4 || (ov >= 3 && 2 * ov >= Math.min(w.size, ew.size))) return true; } return false; };
// Trùng ĐÚNG video: so video-id YouTube; TikTok so URL đầy đủ.
const vidId = (u) => { const m = String(u || '').match(/(?:v=|youtu\.be\/|\/shorts\/|\/embed\/)([\w-]{11})/); return m ? m[1] : String(u || '').trim(); };
const seenIds = new Set(p.seenUrls.map(vidId));
const isSeen = (url) => seenIds.has(vidId(url));

const main = async () => {
  if (!p.keywords.length) { writeFileSync('trend.json', JSON.stringify({ ok: true, none: true, reason: 'brand chưa có từ khoá' })); return; }
  if (p.region === 'world') { const en = await translateKeywordsEn(p.keywords); if (en && en.length) { console.log('🌐 world → từ khoá EN:', en.join(', ')); p.keywords = en; } }

  // ===== SĂN VELOCITY: YouTube (mỗi từ khoá) + TikTok (1 lần gộp từ khoá) =====
  let cands = [];
  const seenUrl = new Set();
  for (const kw of p.keywords) {
    try { for (const v of await timKiemYouTubeVelocity(kw, p.perKeyword, p.region, p.minView)) if (!seenUrl.has(v.url)) { seenUrl.add(v.url); cands.push(v); } }
    catch (e) { console.error('YT lỗi [' + kw + ']:', e.message); }
  }
  try { for (const v of await timKiemTikTokVelocity(p.keywords, p.minView)) if (!seenUrl.has(v.url)) { seenUrl.add(v.url); cands.push(v); } }
  catch (e) { console.error('TikTok lỗi:', e.message); }

  // chống trùng (đã săn trước + trùng sự kiện) → xếp velocity giảm dần
  cands = cands.filter((c) => !isSeen(c.url) && !isDup(c.title)).sort((a, b) => b.velocity - a.velocity);
  console.log('Săn velocity:', cands.length, 'video (sau chống trùng) — top:', cands.slice(0, 3).map((c) => c.platform + ' ' + c.velocity + '/h').join(', '));
  if (!cands.length) { writeFileSync('trend.json', JSON.stringify({ ok: true, none: true, reason: 'không có video trend mới (đã trùng / chưa đủ view / ngoài 1-7 ngày)' })); return; }

  // ===== PHỐI → CHẤM: duyệt theo velocity, đạt thì dừng =====
  const sys = TREND_POST_PROMPT(p);
  let chosen = null, script = '', diem = 0, hasTranscript = false;
  for (const c of cands.slice(0, 5)) {
    try {
      const transcript = c.platform === 'youtube' ? await layTranscript(c.url) : '';
      const sc = await phoiTrendClaude(c, transcript, sys);
      if (!sc || !sc.trim()) { console.log('  ✗ kịch bản rỗng —', c.title.slice(0, 42)); continue; }
      const kq = await chamTrend(sc.trim());
      if (!kq.an_toan) { console.log('  ⛔ KHÔNG an toàn nền tảng —', c.title.slice(0, 42), '|', kq.ly_do); continue; }
      if (kq.diem < p.minScore) { console.log('  ✗ ' + kq.diem + '/10 (dưới ' + p.minScore + ') —', c.title.slice(0, 42)); continue; }
      chosen = c; script = sc.trim(); diem = kq.diem; hasTranscript = !!transcript;
      console.log('  ✓ ' + kq.diem + '/10 AN TOÀN [vel ' + c.velocity + '/h ' + c.platform + '] —', c.title.slice(0, 42));
      break;
    } catch (e) { console.error('  phối/chấm lỗi:', e.message); }
  }

  if (!chosen) { writeFileSync('trend.json', JSON.stringify({ ok: true, none: true, reason: 'không có tin ĐẠT (an toàn + ≥' + p.minScore + '/10) sau khi thử ' + Math.min(5, cands.length) + ' tin velocity cao nhất' })); console.log('➡️ KHÔNG có tin trend để phối hôm nay'); return; }

  console.log('🔥 TOP: [' + chosen.platform + ' · vel ' + chosen.velocity + '/h · ' + diem + '/10] ' + chosen.title);
  writeFileSync('trend.json', JSON.stringify({
    ok: true, none: false,
    chosen: { url: chosen.url, title: chosen.title, platform: chosen.platform, channel: chosen.channel, velocity: chosen.velocity, ageHours: chosen.ageHours, views: chosen.views, diem },
    script, hasTranscript,
  }));
  console.log('✅ TREND AUTO xong:', script.split('\n').filter(Boolean).length, 'câu | transcript:', hasTranscript);
};
main().catch((e) => { console.error('FATAL:', e); writeFileSync('trend.json', JSON.stringify({ ok: false, err: String(e) })); process.exit(1); });
