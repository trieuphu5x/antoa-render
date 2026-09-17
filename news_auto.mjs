// ANTOA — News/VN News SẢN XUẤT AUTO — 1 job trên runner Mỹ (thay hunt+cổng AI trong Cloudflare — bỏ trần 50 subreq).
// STRATEGY=news → HN/Reddit/RSS → chống trùng (sự kiện+url) → CỔNG AI Claude → TẦNG-2 săn từ khoá → chọn 1 → bóc bài.
// STRATEGY=vnnews → báo VN round-robin theo topic+paper → chống trùng (sameStory+url) → chọn 1 → bóc bài.
// Trả news.json {chosen:{title,url,article,platform,paper?,hot?}} hoặc {none}. Tower tạo source+content+render.
import { writeFileSync } from 'node:fs';
import { huntNews, huntNewsByKeywords, huntVnNews, topicGate, fetchArticle, titleWords, wordOverlap, sameStory, translateKeywordsEn } from './news_lib.mjs';

const STRATEGY = (process.env.STRATEGY || 'news').trim();
const brand = { theme: process.env.NICHE || '', keywords: (() => { try { return JSON.parse(process.env.KEYWORDS || '[]'); } catch (e) { return []; } })(), region: process.env.REGION || 'vn', feeds: (() => { try { return JSON.parse(process.env.FEEDS || '[]'); } catch (e) { return []; } })() };
const producedTitles = (() => { try { return JSON.parse(process.env.PRODUCED_TITLES || '[]').map((s) => String(s || '')); } catch (e) { return []; } })();
const seenUrls = (() => { try { return JSON.parse(process.env.SEEN_URLS || '[]').map((s) => String(s || '')); } catch (e) { return []; } })();
const vnTopic = process.env.VN_TOPIC || '';
const vnPaper = process.env.VN_PAPER || 'all';
const GATE_MAX = 8;   // runner không bị trần 50 subreq như CF → duyệt cổng AI rộng tay hơn

const normUrl = (u) => String(u || '').replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/$/, '');
const seenSet = new Set(seenUrls.map(normUrl));
const isSeen = (url) => seenSet.has(normUrl(url));
// chống trùng SỰ KIỆN news (a-z word overlap ≥4, hoặc ≥3 & ≥50%)
const producedW = producedTitles.map(titleWords);
const isDupNews = (title) => { const w = titleWords(title); if (w.size < 2) return false; for (const ew of producedW) { const ov = wordOverlap(w, ew); if (ov >= 4 || (ov >= 3 && 2 * ov >= Math.min(w.size, ew.size))) return true; } return false; };
const isDupVn = (title) => producedTitles.some((t) => sameStory(title, t));

const main = async () => {
  if (STRATEGY === 'vnnews') {
    if (!vnTopic) { writeFileSync('news.json', JSON.stringify({ ok: true, none: true, reason: 'workflow VN News chưa chọn chủ đề' })); return; }
    const hunted = await huntVnNews(vnTopic, vnPaper, 15);
    const pick = hunted.find((f) => f.title && f.url && !isSeen(f.url) && !isDupVn(f.title) && !['fail', 'warn'].includes(f.safety));
    if (!pick) { writeFileSync('news.json', JSON.stringify({ ok: true, none: true, reason: 'không có tin VN mới (đã trùng tên/sự kiện/url)' })); console.log('➡️ KHÔNG có tin VN'); return; }
    const article = await fetchArticle(pick.url);
    writeFileSync('news.json', JSON.stringify({ ok: true, none: false, chosen: { title: pick.title, url: pick.url, article, platform: 'vnnews', paper: pick.paper, hot: pick.hot } }));
    console.log('🇻🇳 CHỌN:', pick.paper, '·', pick.title.slice(0, 50), '| article', article.length, 'ký tự');
    return;
  }
  // NEWS
  if (brand.region === 'world' && brand.keywords.length) { const en = await translateKeywordsEn(brand.keywords); if (en && en.length) { console.log('🌐 world → từ khoá EN:', en.join(', ')); brand.keywords = en; } }
  let cands = (await huntNews(brand, 20)).filter((c) => c.title && c.url && !isSeen(c.url) && !isDupNews(c.title) && !['fail', 'warn'].includes(c.safety));
  console.log('Săn News:', cands.length, 'bài (sau chống trùng)');
  let chosen = null, gateTries = 0;
  const tryGate = async (list) => {
    for (const c of list) {
      if (chosen) break;
      if (gateTries >= GATE_MAX) break;
      gateTries++;
      const article = await fetchArticle(c.url);
      const g = await topicGate(brand, c.title, article);
      if (g.ok) { chosen = { title: c.title, url: c.url, article, platform: 'news' }; console.log('  ✓ đúng chủ đề —', c.title.slice(0, 45)); return; }
      console.log('  ✗ lạc chủ đề —', c.title.slice(0, 45));
    }
  };
  await tryGate(cands);
  // TẦNG 2: feed trùng hết / lạc chủ đề → săn theo từ khoá (đa dạng chủ đề)
  if (!chosen && brand.keywords.length) {
    const more = (await huntNewsByKeywords(brand.keywords, 2)).filter((c) => c.title && c.url && !isSeen(c.url) && !isDupNews(c.title));
    console.log('Tầng 2 (từ khoá):', more.length, 'bài');
    await tryGate(more);
  }
  if (!chosen) { writeFileSync('news.json', JSON.stringify({ ok: true, none: true, reason: `không có tin News đúng chủ đề "${brand.theme || ''}" sau ${gateTries} lượt cổng AI` })); console.log('➡️ KHÔNG có tin News'); return; }
  writeFileSync('news.json', JSON.stringify({ ok: true, none: false, chosen }));
  console.log('📰 CHỌN:', chosen.title.slice(0, 50), '| article', (chosen.article || '').length, 'ký tự');
};
main().catch((e) => { console.error('FATAL:', e); writeFileSync('news.json', JSON.stringify({ ok: false, err: String(e) })); process.exit(1); });
