// ANTOA — News + VN News engine (chung) — PORT từ Tower src/lib/hunt.js + vnnews.js sang runner Mỹ.
// Đẩy VIỆC NẶNG (fetch RSS/HN/Reddit + cổng AI lọc chủ đề) khỏi Cloudflare (trần 50 subreq) → runner.
// topicGate dùng CLAUDE (không 403 trên runner) thay Workers AI llama → lọc chủ đề chuẩn hơn.
// news & vnnews ĐỘC LẬP: news = HN/Reddit/RSS + cổng AI; vnnews = báo VN round-robin (không cổng AI).
import { callClaude, translateKeywordsEn } from './evergreen_lib.mjs';

// ---- an toàn nền tảng (nhắm hứa tiền/làm giàu, không cờ nhầm số tiền tin tức) ----
const UNSAFE = /(làm giàu|get.?rich|đổi đời|kiếm.{0,8}(tiền|triệu|\$\d)|thu nhập.{0,12}(tháng|triệu|\$\d)|x\d+\s*tài khoản|từ nghèo.*giàu)/i;
export const safetyOf = (title) => UNSAFE.test(title || '') ? 'warn' : 'ok';
const SOCIAL_RE = /(twitter\.com|x\.com|xcancel|nitter|reddit\.com|news\.ycombinator|github\.com|youtu)/i;

// ---- khớp từ khoá thương hiệu (cụm ≥4 hoặc có dấu → substring; ASCII ngắn → ranh giới từ) ----
export function matchesBrand(title, keywords) {
  if (!keywords || !keywords.length) return true;
  const t = (title || '').toLowerCase();
  return keywords.some((k) => {
    const kw = String(k).toLowerCase().trim(); if (!kw) return false;
    if (kw.length >= 4 || /[^\x00-\x7f]/.test(kw)) return t.includes(kw);
    return new RegExp('(^|[^a-z0-9])' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)', 'i').test(t);
  });
}

// ---- CỔNG AI (Claude): tin có ĐÚNG chủ đề kênh không? YES/NO. Lỗi/nhập nhằng → fallback khớp từ khoá ----
export async function topicGate(brand, title, article) {
  const theme = String(brand?.theme || '').trim();
  const kws = (brand?.keywords || []).map((k) => String(k).trim()).filter(Boolean);
  if (!theme && !kws.length) return { ok: true, by: 'no-topic' };
  const body = String(article || '').replace(/\s+/g, ' ').trim().slice(0, 1500);
  try {
    const topic = theme || kws.join(', ');
    const sys = 'Bạn là BỘ LỌC CHỦ ĐỀ tin tức. Chỉ trả lời DUY NHẤT một từ: YES hoặc NO, không giải thích.';
    const user = `Kênh chỉ đăng tin thuộc CHỦ ĐỀ: "${topic}"${kws.length ? ` (từ khoá liên quan: ${kws.join(', ')})` : ''}.\nTIN dưới đây có ĐÚNG thuộc chủ đề đó không?\n\nTIÊU ĐỀ: ${title || ''}\nNỘI DUNG: ${body || '(không bóc được nội dung — xét theo tiêu đề)'}`;
    const txt = String(await callClaude(sys, user, 10) || '').toUpperCase();
    const yes = /\bYES\b/.test(txt), no = /\bNO\b/.test(txt);
    if (yes && !no) return { ok: true, by: 'ai' };
    if (no && !yes) return { ok: false, by: 'ai' };
  } catch (e) { /* fallback */ }
  if (!kws.length) return { ok: true, by: 'no-kw' };
  return { ok: matchesBrand(title, kws), by: 'fallback-kw' };
}

// Tên NGUỒN THẬT từ URL (domain → tên thân thiện).
export function sourceLabel(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '').replace(/^old\./, '');
    const map = { 'news.ycombinator.com': 'Hacker News', 'ycombinator.com': 'Hacker News', 'reddit.com': 'Reddit', 'techcrunch.com': 'TechCrunch', 'theverge.com': 'The Verge', 'venturebeat.com': 'VentureBeat', 'arstechnica.com': 'Ars Technica', 'wired.com': 'WIRED', 'bloomberg.com': 'Bloomberg', 'reuters.com': 'Reuters', 'nytimes.com': 'The New York Times', 'theguardian.com': 'The Guardian', 'bbc.com': 'BBC', 'bbc.co.uk': 'BBC' };
    return map[h] || h;
  } catch (e) { return ''; }
}

async function getJson(url, headers) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 12000);
  try { const r = await fetch(url, { headers, signal: ctrl.signal }); return await r.json(); }
  finally { clearTimeout(timer); }
}

// ĐỌC BÀI GỐC — bóc <p> + lọc boilerplate + khử trùng đoạn.
export async function fetchArticle(url, max = 2800) {
  if (!url || !/^https?:\/\//.test(url)) return '';
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; ANTOA/1.0)' }, signal: ctrl.signal });
    let html = await r.text();
    html = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<(nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, ' ');
    const BOILER = /(cookie|subscribe|sign up|newsletter|©|all rights|theo dõi|đăng ký|advertisement|quảng cáo|read more|share this|follow us)/i;
    const seenP = new Set();
    const ps = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/&[#a-z0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length > 40 && !BOILER.test(t))
      .filter((t) => { const k = t.slice(0, 50).toLowerCase(); if (seenP.has(k)) return false; seenP.add(k); return true; });
    let text = ps.join('\n');
    if (text.length < 120) text = html.replace(/<[^>]+>/g, ' ').replace(/&[#a-z0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
    return text.slice(0, max);
  } catch (e) { return ''; }
  finally { clearTimeout(timer); }
}

// ============================================================================
// THƯ VIỆN RSS ĐA NGÁCH (Boss chốt 2026-09-17): News KHÔNG fix cứng ngành tech.
// Từ khoá/niche user → ĐỊNH TUYẾN sang NGÁCH → lấy feed báo lớn ĐÚNG ngách.
// VN: reuse VN_PAPERS (11 báo × topic, đã kiểm chứng). World: RSS ổn định (BBC/Guardian/…).
// KHÔNG dùng Google search (kết quả lung tung) — chỉ RSS curated.
// ============================================================================
// Gom feed VN theo 1..n topic từ VN_PAPERS (khai báo ở phần VN NEWS bên dưới — hàm gọi lúc runtime nên OK).
function vnFeedsForTopics(topics) {
  const out = [];
  for (const p of VN_PAPERS) for (const tp of (topics || [])) { const slug = p.feeds[tp]; if (slug) out.push(p.base + slug); }
  return [...new Set(out)];
}
const NEWS_NICHES = [
  { key: 'cong-nghe', tech: true, vnTopics: ['cong-nghe'],
    tags: ['công nghệ', 'phần mềm', 'ứng dụng', 'app', 'ai', 'trí tuệ nhân tạo', 'chuyển đổi số', 'startup công nghệ', 'lập trình', 'gadget', 'điện thoại', 'máy tính', 'technology', 'software', 'artificial intelligence', 'machine learning', 'ai agent', 'automation', 'saas', 'chatbot'],
    world: ['https://techcrunch.com/feed/', 'https://www.theverge.com/rss/index.xml', 'https://feeds.arstechnica.com/arstechnica/index', 'http://feeds.bbci.co.uk/news/technology/rss.xml'] },
  { key: 'kinh-doanh', vnTopics: ['kinh-doanh', 'bat-dong-san'],
    tags: ['kinh doanh', 'tài chính', 'đầu tư', 'chứng khoán', 'doanh nghiệp', 'khởi nghiệp', 'thị trường', 'bất động sản', 'nhà đất', 'crypto', 'bitcoin', 'tiền số', 'marketing', 'bán hàng', 'thương mại', 'business', 'finance', 'investing', 'stock', 'startup', 'real estate', 'ecommerce'],
    world: ['http://feeds.bbci.co.uk/news/business/rss.xml', 'https://www.theguardian.com/uk/business/rss', 'https://www.cnbc.com/id/10001147/device/rss/rss.html'] },
  { key: 'suc-khoe', vnTopics: ['suc-khoe', 'doi-song'],
    tags: ['sức khoẻ', 'sức khỏe', 'y tế', 'bệnh', 'dinh dưỡng', 'thể hình', 'gym', 'fitness', 'yoga', 'mẹ và bé', 'nuôi con', 'mang thai', 'tâm lý', 'health', 'wellness', 'nutrition', 'medical', 'parenting'],
    world: ['http://feeds.bbci.co.uk/news/health/rss.xml', 'https://www.theguardian.com/society/health/rss'] },
  { key: 'am-thuc', vnTopics: ['am-thuc', 'doi-song'],
    tags: ['ẩm thực', 'nấu ăn', 'món ăn', 'công thức', 'đồ ăn', 'quán ăn', 'nhà hàng', 'đặc sản', 'food', 'recipe', 'cooking', 'cuisine', 'restaurant'],
    world: ['https://www.theguardian.com/food/rss'] },
  { key: 'the-thao', vnTopics: ['the-thao'],
    tags: ['thể thao', 'bóng đá', 'bóng rổ', 'tennis', 'cầu lông', 'giải đấu', 'cầu thủ', 'vô địch', 'sport', 'football', 'soccer', 'nba', 'league'],
    world: ['http://feeds.bbci.co.uk/sport/rss.xml', 'https://www.theguardian.com/sport/rss'] },
  { key: 'giai-tri', vnTopics: ['giai-tri', 'lam-dep'],
    tags: ['giải trí', 'showbiz', 'phim', 'điện ảnh', 'ca sĩ', 'diễn viên', 'âm nhạc', 'nghệ sĩ', 'thời trang', 'làm đẹp', 'mỹ phẩm', 'skincare', 'entertainment', 'movie', 'music', 'celebrity', 'fashion', 'beauty'],
    world: ['https://variety.com/feed/', 'https://www.theguardian.com/culture/rss', 'http://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml'] },
  { key: 'du-lich', vnTopics: ['du-lich'],
    tags: ['du lịch', 'điểm đến', 'khách sạn', 'resort', 'tour', 'phượt', 'check-in', 'travel', 'tourism', 'destination', 'hotel'],
    world: ['https://www.theguardian.com/travel/rss'] },
  { key: 'giao-duc', vnTopics: ['giao-duc'],
    tags: ['giáo dục', 'học tập', 'trường học', 'du học', 'tuyển sinh', 'học sinh', 'sinh viên', 'thi cử', 'education', 'school', 'university', 'study', 'ielts'],
    world: ['http://feeds.bbci.co.uk/news/education/rss.xml', 'https://www.theguardian.com/education/rss'] },
  { key: 'xe', vnTopics: ['xe'],
    tags: ['ô tô', 'oto', 'xe máy', 'xe điện', 'xe hơi', 'mô tô', 'car', 'motorbike', 'ev', 'automotive', 'vinfast'],
    world: ['http://feeds.bbci.co.uk/news/technology/rss.xml'] },
  { key: 'the-gioi', vnTopics: ['the-gioi', 'thoi-su'],
    tags: ['thế giới', 'quốc tế', 'chính trị', 'thời sự', 'xã hội', 'chiến sự', 'ngoại giao', 'world', 'politics', 'international'],
    world: ['http://feeds.bbci.co.uk/news/world/rss.xml', 'https://www.theguardian.com/world/rss', 'https://www.aljazeera.com/xml/rss/all.xml'] },
];
const NICHE_BY_KEY = Object.fromEntries(NEWS_NICHES.map((n) => [n.key, n]));
// Khớp 1 tag vào chuỗi tín hiệu: tag DÀI (≥5) hoặc CÓ DẤU → substring; tag ASCII NGẮN (ai/ev/car/app…) → RANH GIỚI TỪ (tránh "skincare"→car, "review"→ev).
const tagHit = (sig, tag) => {
  const t = String(tag).toLowerCase().trim(); if (!t) return false;
  if (t.length >= 5 || /[^\x00-\x7f]/.test(t)) return sig.includes(t);
  return new RegExp('(^|[^a-z0-9])' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)').test(sig);
};

// ĐỊNH TUYẾN từ khoá + niche user → 1-2 ngách. Tầng NHANH: khớp tag (miễn phí). Không khớp → hỏi Claude 1 lần. Vẫn không → 'the-gioi'.
export async function routeNiches(brand) {
  const sig = ' ' + [String(brand?.theme || ''), ...((brand?.keywords) || []).map(String)].join(' , ').toLowerCase() + ' ';
  if (sig.trim()) {
    const scored = NEWS_NICHES.map((n) => ({ n, s: n.tags.reduce((a, t) => a + (tagHit(sig, t) ? 1 : 0), 0) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    if (scored.length) return scored.slice(0, 2).map((x) => x.n);
  }
  const kws = ((brand?.keywords) || []).map((k) => String(k).trim()).filter(Boolean);
  if (brand?.theme || kws.length) {
    try {
      const keys = NEWS_NICHES.map((n) => n.key).join(', ');
      const sys = 'Bạn phân loại NGÁCH nội dung. Chỉ trả các KEY cách nhau dấu phẩy, KHÔNG giải thích.';
      const user = `Chủ đề/từ khoá: "${brand?.theme || ''} ${kws.join(', ')}".\nChọn 1-2 ngách phù hợp nhất trong danh sách: ${keys}.`;
      const txt = String(await callClaude(sys, user, 30) || '').toLowerCase();
      const hit = NEWS_NICHES.filter((n) => new RegExp('\\b' + n.key + '\\b').test(txt));
      if (hit.length) return hit.slice(0, 2);
    } catch (e) { /* fallback dưới */ }
  }
  return [NICHE_BY_KEY['the-gioi']];
}

// Feed cho brand: (1) feed CUSTOM user tự cắm → ưu tiên tuyệt đối; (2) theo NGÁCH × REGION (vn=VN_PAPERS, world=feed thế giới).
async function resolveFeeds(brand) {
  const custom = brand && brand.feeds && Array.isArray(brand.feeds) ? brand.feeds.filter(Boolean) : [];
  const niches = await routeNiches(brand);
  const isTech = niches.some((n) => n.tech);
  if (custom.length) return { feeds: custom, isTech, niches };
  const world = (brand && brand.region) === 'world';
  const out = [];
  for (const n of niches) { if (world) out.push(...(n.world || [])); else out.push(...vnFeedsForTopics(n.vnTopics || [])); }
  return { feeds: [...new Set(out)], isTech, niches };
}

async function getRss(url, minTs) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; ANTOA/1.0)' }, signal: ctrl.signal });
    const xml = await r.text();
    const out = [];
    const clean = (s) => (s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/&[#a-z0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
    const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/(item|entry)>/gi) || [];
    for (const b of blocks) {
      const title = clean(b.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
      let link = clean(b.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1]);
      if (!link) link = (b.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] || '').trim();
      const pub = b.match(/<(pubDate|published|updated|dc:date)[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated|dc:date)>/i)?.[2]?.trim();
      let ts = 0; if (pub) { const d = Date.parse(pub); if (!isNaN(d)) ts = Math.floor(d / 1000); }
      if (title && link && (!minTs || !ts || ts >= minTs)) out.push({ title, link, ts });
    }
    return out;
  } finally { clearTimeout(timer); }
}

// ---- dedup theo SỰ KIỆN (từ khoá tiêu đề) ----
const STOP = new Set(('the a an and or of to in on for with is are was were be by from that this as at it its new now how why what will can vs your you our their they we says say after over into about more most has have had not no but out up off than then them he she his her you re ai').split(' '));
export function titleWords(t) { return new Set((String(t || '').toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((w) => !STOP.has(w))); }
export function wordOverlap(a, b) { let n = 0; for (const w of a) if (b.has(w)) n++; return n; }
const VN_STOP = new Set(('của và các ở đã là cho với một những khi để không có bị trong sau trên dưới về từ đến này đó theo như vì nên ra vào lại người tại do mà nhé thì lúc còn khi nào đâu bằng hơn cùng khiến sẽ đang vẫn cũng rất quá tin bài mới nay hôm ông bà anh chị phó chủ tịch thủ tướng bộ trưởng tỉnh thành phố huyện xã việt nam đường').split(' '));
export function vnWords(t) { return new Set((String(t || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length >= 3 && !VN_STOP.has(w))); }
export function sameStory(a, b) {
  const wa = vnWords(a), wb = vnWords(b);
  if (wa.size < 3 || wb.size < 3) return false;
  const shared = wordOverlap(wa, wb);
  const need = Math.max(3, Math.ceil(0.45 * Math.min(wa.size, wb.size)));
  return shared >= need;
}

// ============ NEWS — HN + Reddit + RSS, chấm HOT ============
export async function huntNews(brand, limit = 10) {
  const now = Math.floor(Date.now() / 1000);
  const FRESH_DAYS = Number(process.env.HUNT_FRESH_DAYS) || 3;
  const minTs = now - FRESH_DAYS * 86400;
  const cand = {};
  const add = (title, url, ts, f) => {
    if (!title || !url) return;
    const key = (url || '').replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/$/, '');
    if (!cand[key]) cand[key] = { title, url, ts: ts || 0, hn_points: 0, hn_comments: 0, reddit_ups: 0, reddit_comments: 0, rss: 0, srcs: new Set() };
    if (ts && ts > cand[key].ts) cand[key].ts = ts;
    for (const k in f) if (k !== '_src') cand[key][k] += f[k];
    if (f._src) cand[key].srcs.add(f._src);
  };
  const { feeds, isTech, niches } = await resolveFeeds(brand);   // TỪ KHOÁ → NGÁCH → feed báo lớn đúng ngách
  const tasks = [];
  if (isTech) {   // HN + Reddit là nguồn TECH-ONLY → CHỈ dùng khi ngách công nghệ/AI (ngách khác bỏ, tránh tin lạc)
    tasks.push((async () => {
      try { const jd = await getJson(`https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=created_at_i%3E${minTs},points%3E15&hitsPerPage=80`);
        for (const h of (jd.hits || [])) add(h.title, h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, h.created_at_i || 0, { hn_points: h.points || 0, hn_comments: h.num_comments || 0, _src: 'hn' }); } catch (e) {}
    })());
    for (const sub of ['artificial', 'singularity', 'LocalLLaMA', 'OpenAI', 'ChatGPT', 'technology', 'MachineLearning']) {
      tasks.push((async () => {
        try { const jd = await getJson(`https://old.reddit.com/r/${sub}/top.json?t=day&limit=12`, { 'User-Agent': 'script:antoa:1.0 (news velocity)' });
          for (const ch of (jd.data?.children || [])) { const d = ch.data; let u = d.url || ''; if (u.includes('reddit.com') || u.includes('/r/')) u = 'https://www.reddit.com' + (d.permalink || ''); add(d.title, u, d.created_utc || 0, { reddit_ups: d.ups || 0, reddit_comments: d.num_comments || 0, _src: 'reddit' }); } } catch (e) {}
      })());
    }
  }
  console.log('📰 News ngách:', niches.map((n) => n.key).join('+'), '· feeds:', feeds.length, isTech ? '(+HN/Reddit tech)' : '');
  const rssItems = [];
  for (const feed of feeds) tasks.push((async () => { try { for (const it of await getRss(feed, minTs)) { add(it.title, it.link, it.ts, { rss: 1, _src: 'rss' }); rssItems.push({ title: it.title, link: it.link, w: titleWords(it.title) }); } } catch (e) {} })());
  await Promise.allSettled(tasks);
  for (const m of Object.values(cand)) {
    const mw = titleWords(m.title); let best = null, bestOv = 0; const feeds = new Set();
    for (const it of rssItems) { const ov = wordOverlap(mw, it.w); if (ov >= 2) { try { feeds.add(new URL(it.link).hostname.replace(/^www\./, '')); } catch (e) {} if (ov > bestOv) { bestOv = ov; best = it; } } }
    m.crossSource = feeds.size;
    const isSocial = SOCIAL_RE.test(m.url);
    m.bocUrl = (best && (isSocial || bestOv >= 3)) ? best.link : m.url;
  }
  let list = Object.values(cand).filter((m) => !m.ts || m.ts >= minTs).map((m) => {
    const ageH = m.ts ? Math.max(1, (now - m.ts) / 3600) : 48;
    const engage = m.hn_points + 3 * m.hn_comments + 0.3 * m.reddit_ups + 3 * m.reddit_comments;
    const cross = Math.max(m.crossSource || 0, m.srcs.size);
    const hot = (engage / Math.pow(ageH + 2, 1.5)) * 100 + 70 * cross + (m.rss ? 25 : 0);
    const freshBonus = ageH <= 12 ? 1.35 : ageH <= 24 ? 1.15 : ageH <= 48 ? 1.0 : 0.8;
    const noArticle = SOCIAL_RE.test(m.url) && (!m.bocUrl || m.bocUrl === m.url);
    const velocity = Math.round(hot * freshBonus * (noArticle ? 0.5 : 1));
    const ai = Math.max(1, Math.min(10, Math.round(5 + cross * 1.4 + Math.min(3, m.hn_comments / 40 + m.reddit_comments / 60) + (ageH <= 24 ? 1 : 0))));
    return { title: m.title, url: m.bocUrl || m.url, hotUrl: m.url, platform: 'news', velocity, ageHours: Math.round(ageH), publishedAt: m.ts || 0, aiScore: ai, crossSource: cross, safety: safetyOf(m.title) };
  }).sort((a, b) => b.velocity - a.velocity);
  const kwHit = list.filter((x) => matchesBrand(x.title, brand?.keywords));
  const out = kwHit.length ? kwHit : list;
  return out.slice(0, limit);
}

// SĂN THEO TỪ KHOÁ (HN search) — đa dạng chủ đề khi 1 sự kiện thống trị.
export async function huntNewsByKeywords(keywords, perKw = 2) {
  const all = (keywords || []).map((s) => String(s).trim()).filter(Boolean);
  if (!all.length) return [];
  const idx = all.length <= 3 ? all.map((_, i) => i) : [...new Set([0, Math.floor(all.length / 2), all.length - 1])];
  const kws = idx.map((i) => all[i]);
  const minTs = Math.floor(Date.now() / 1000) - 3 * 86400;
  const seen = new Set(), out = [];
  await Promise.allSettled(kws.map(async (kw) => {
    try {
      const jd = await getJson(`https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(kw)}&tags=story&numericFilters=created_at_i%3E${minTs},points%3E3&hitsPerPage=6`);
      let took = 0;
      for (const h of (jd.hits || [])) { if (took >= perKw) break; const title = (h.title || '').trim(); const url = h.url || ''; const key = title.toLowerCase(); if (!title || !url || seen.has(key) || SOCIAL_RE.test(url)) continue; seen.add(key); took++; out.push({ title, url, platform: 'news', velocity: (h.points || 0) * 10 + (h.num_comments || 0) * 3, aiScore: 6, safety: safetyOf(title) }); }
    } catch (e) {}
  }));
  return out;
}

// ============ VN NEWS — báo VN × chủ đề (RSS), round-robin ============
export const VN_TOPICS = [{ key: 'thoi-su', label: 'Thời sự' }, { key: 'the-gioi', label: 'Thế giới' }, { key: 'kinh-doanh', label: 'Kinh doanh' }, { key: 'cong-nghe', label: 'Công nghệ' }, { key: 'the-thao', label: 'Thể thao' }, { key: 'giai-tri', label: 'Giải trí' }, { key: 'giao-duc', label: 'Giáo dục' }, { key: 'suc-khoe', label: 'Sức khoẻ' }, { key: 'phap-luat', label: 'Pháp luật' }, { key: 'du-lich', label: 'Du lịch' }, { key: 'xe', label: 'Xe' }, { key: 'bat-dong-san', label: 'Bất động sản' }, { key: 'doi-song', label: 'Đời sống' }, { key: 'am-thuc', label: 'Ẩm thực' }, { key: 'lam-dep', label: 'Làm đẹp / Thời trang' }];
export const VN_PAPERS = [
  { key: 'vnexpress', base: 'https://vnexpress.net/rss/', feeds: { 'thoi-su': 'thoi-su.rss', 'the-gioi': 'the-gioi.rss', 'kinh-doanh': 'kinh-doanh.rss', 'cong-nghe': 'khoa-hoc-cong-nghe.rss', 'the-thao': 'the-thao.rss', 'giai-tri': 'giai-tri.rss', 'giao-duc': 'giao-duc.rss', 'suc-khoe': 'suc-khoe.rss', 'phap-luat': 'phap-luat.rss', 'du-lich': 'du-lich.rss', 'xe': 'oto-xe-may.rss', 'bat-dong-san': 'bat-dong-san.rss', 'doi-song': 'gia-dinh.rss' } },
  { key: 'dantri', base: 'https://dantri.com.vn/rss/', feeds: { 'thoi-su': 'thoi-su.rss', 'the-gioi': 'the-gioi.rss', 'kinh-doanh': 'kinh-doanh.rss', 'cong-nghe': 'cong-nghe.rss', 'the-thao': 'the-thao.rss', 'giai-tri': 'giai-tri.rss', 'giao-duc': 'giao-duc.rss', 'suc-khoe': 'suc-khoe.rss', 'phap-luat': 'phap-luat.rss', 'du-lich': 'du-lich.rss', 'xe': 'o-to-xe-may.rss', 'bat-dong-san': 'bat-dong-san.rss' } },
  { key: 'vietnamnet', base: 'https://vietnamnet.vn/rss/', feeds: { 'thoi-su': 'chinh-tri.rss', 'the-gioi': 'the-gioi.rss', 'cong-nghe': 'thong-tin-truyen-thong.rss', 'the-thao': 'the-thao.rss', 'giai-tri': 'giai-tri.rss', 'phap-luat': 'phap-luat.rss', 'du-lich': 'du-lich.rss', 'xe': 'oto-xe-may.rss', 'bat-dong-san': 'bat-dong-san.rss', 'doi-song': 'doi-song.rss' } },
  { key: 'thanhnien', base: 'https://thanhnien.vn/rss/', feeds: { 'thoi-su': 'thoi-su.rss', 'the-gioi': 'the-gioi.rss', 'kinh-doanh': 'kinh-te.rss', 'cong-nghe': 'cong-nghe.rss', 'the-thao': 'the-thao.rss', 'giai-tri': 'giai-tri.rss', 'giao-duc': 'giao-duc.rss', 'suc-khoe': 'suc-khoe.rss', 'du-lich': 'du-lich.rss', 'xe': 'xe.rss', 'doi-song': 'doi-song.rss' } },
  { key: 'tuoitre', base: 'https://tuoitre.vn/rss/', feeds: { 'thoi-su': 'thoi-su.rss', 'the-gioi': 'the-gioi.rss', 'kinh-doanh': 'kinh-doanh.rss', 'cong-nghe': 'nhip-song-so.rss', 'the-thao': 'the-thao.rss', 'giai-tri': 'giai-tri.rss', 'giao-duc': 'giao-duc.rss', 'du-lich': 'du-lich.rss', 'xe': 'xe.rss' } },
  { key: 'vtcnews', base: 'https://vtcnews.vn/rss/', feeds: { 'thoi-su': 'thoi-su.rss', 'the-gioi': 'the-gioi.rss', 'kinh-doanh': 'kinh-te.rss', 'the-thao': 'the-thao.rss', 'giai-tri': 'giai-tri.rss', 'suc-khoe': 'suc-khoe.rss', 'phap-luat': 'phap-luat.rss', 'du-lich': 'du-lich.rss', 'xe': 'oto-xe-may.rss' } },
  { key: 'znews', base: 'https://znews.vn/rss/', feeds: { 'the-gioi': 'the-gioi.rss', 'cong-nghe': 'cong-nghe.rss', 'the-thao': 'the-thao.rss', 'giai-tri': 'giai-tri.rss', 'giao-duc': 'giao-duc.rss', 'suc-khoe': 'suc-khoe.rss', 'phap-luat': 'phap-luat.rss', 'du-lich': 'du-lich.rss', 'xe': 'oto-xe-may.rss', 'doi-song': 'doi-song.rss' } },
  { key: 'bao24h', base: 'https://cdn.24h.com.vn/upload/rss/', feeds: { 'thoi-su': 'tintuctrongngay.rss', 'kinh-doanh': 'kinhdoanh.rss', 'cong-nghe': 'congnghethongtin.rss', 'the-thao': 'thethao.rss', 'giao-duc': 'giaoduc.rss', 'suc-khoe': 'suckhoedoisong.rss', 'du-lich': 'dulich.rss', 'xe': 'oto.rss', 'am-thuc': 'amthuc.rss', 'lam-dep': 'lamdep.rss' } },
  { key: 'cafef', base: 'https://cafef.vn/', feeds: { 'kinh-doanh': 'doanh-nghiep.rss' } },
  { key: 'genk', base: 'https://genk.vn/rss/', feeds: { 'cong-nghe': 'home.rss' } },
  { key: 'kenh14', base: 'https://kenh14.vn/', feeds: { 'giai-tri': 'star.rss', 'lam-dep': 'beauty-fashion.rss' } },
];
function vnFeedsByPaper(topic, paper) {
  const list = [];
  for (const p of VN_PAPERS) { if (paper && paper !== 'all' && p.key !== paper) continue; const slug = p.feeds[topic]; if (slug) list.push({ paper: p.key, url: p.base + slug }); }
  return list;
}
// Round-robin mỗi báo 1 bài (mới nhất trước) → trộn đều; hot = độ phủ báo.
export async function huntVnNews(topic, paper, limit = 15) {
  const now = Math.floor(Date.now() / 1000), minTs = now - 3 * 86400;
  const feeds = vnFeedsByPaper(topic, paper);
  const perPaper = await Promise.all(feeds.map(async ({ paper: pk, url }) => {
    try { const items = await getRss(url, minTs); return items.filter((it) => it.title && it.link && !SOCIAL_RE.test(it.link || '')).sort((a, b) => (b.ts || 0) - (a.ts || 0)).map((it) => ({ ...it, paper: pk })); }
    catch (e) { return []; }
  }));
  const pool = perPaper.flat();
  const coverage = (title) => { const s = new Set(); for (const it of pool) if (sameStory(title, it.title)) s.add(it.paper); return s.size; };
  const seen = new Set(), out = [];
  for (let round = 0; out.length < limit; round++) {
    let advanced = false;
    for (const list of perPaper) {
      if (round >= list.length) continue; advanced = true;
      const it = list[round]; const k = (it.title || '').trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k); out.push({ title: it.title, url: it.link, ts: it.ts || 0, platform: 'vnnews', safety: safetyOf(it.title), paper: it.paper, hot: coverage(it.title) });
      if (out.length >= limit) break;
    }
    if (!advanced) break;
  }
  return out.slice(0, limit);
}

export { translateKeywordsEn };
