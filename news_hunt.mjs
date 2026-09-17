// ANTOA — News/VN News SĂN (thủ công, bước xem-trước) — chạy trên runner Mỹ.
// STRATEGY=news → HN/Reddit/RSS + cổng AI Claude (gắn nhãn topic_ok, KHÔNG loại) + bóc bài cache.
// STRATEGY=vnnews → báo VN round-robin theo topic+paper (không cổng AI). Trả candidates.json cho Tower ghi vào bảng.
import { writeFileSync } from 'node:fs';
import { huntNews, huntVnNews, topicGate, fetchArticle, translateKeywordsEn } from './news_lib.mjs';

const STRATEGY = (process.env.STRATEGY || 'news').trim();
const limit = Math.max(1, Math.min(20, Number(process.env.LIMIT) || 10));
const brand = { theme: process.env.NICHE || '', keywords: (() => { try { return JSON.parse(process.env.KEYWORDS || '[]'); } catch (e) { return []; } })(), region: process.env.REGION || 'vn', feeds: (() => { try { return JSON.parse(process.env.FEEDS || '[]'); } catch (e) { return []; } })() };
const vnTopic = process.env.VN_TOPIC || '';
const vnPaper = process.env.VN_PAPER || 'all';

const main = async () => {
  if (STRATEGY === 'vnnews') {
    if (!vnTopic) { writeFileSync('candidates.json', JSON.stringify({ ok: false, err: 'thiếu chủ đề VN News' })); return; }
    const out = await huntVnNews(vnTopic, vnPaper, limit);   // {title,url,ts,platform,safety,paper,hot}
    writeFileSync('candidates.json', JSON.stringify({ ok: true, candidates: out, scanned: out.length }));
    console.log('✅ SĂN VN News xong:', out.length, 'bài');
    return;
  }
  // NEWS: dịch từ khoá nếu world → săn → gắn nhãn cổng AI (bóc bài + Claude) cho từng bài (Boss tự duyệt, không loại).
  if (brand.region === 'world' && brand.keywords.length) { const en = await translateKeywordsEn(brand.keywords); if (en && en.length) brand.keywords = en; }
  const hunted = await huntNews(brand, limit);
  const gated = await Promise.all(hunted.map(async (s) => {
    try { const article = await fetchArticle(s.url); const g = await topicGate(brand, s.title, article); return { ...s, topic_ok: g.ok ? 1 : 0, article: article || '' }; }
    catch (e) { return { ...s, topic_ok: null, article: '' }; }
  }));
  const offTopic = gated.filter((x) => x.topic_ok === 0).length;
  writeFileSync('candidates.json', JSON.stringify({ ok: true, candidates: gated, scanned: hunted.length, offTopic }));
  console.log('✅ SĂN News xong:', gated.length, 'bài ·', offTopic, 'lạc chủ đề (gắn nhãn)');
};
main().catch((e) => { console.error('FATAL:', e); writeFileSync('candidates.json', JSON.stringify({ ok: false, err: String(e) })); process.exit(1); });
