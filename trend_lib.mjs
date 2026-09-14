// ANTOA — Trend engine (chung) — port Trend Remix v1 (Apps Script) sang Node, chạy trên GitHub runner Mỹ.
// Săn VELOCITY (view/giờ) YouTube (2 bước: search → videos.list statistics) + TikTok (Apify); phối kịch bản
// 1-5' adaptive; AI TỰ CHẤM 1-10 + cổng an toàn nền tảng (thay người duyệt). Tái dùng callClaude/layTranscript/
// translateKeywordsEn từ evergreen_lib.mjs (Claude KHÔNG bị 403 trên runner, khác CF Workers).
import { callClaude } from './evergreen_lib.mjs';

const YT_KEY = () => process.env.YT_KEY || '';
const APIFY_TOKEN = () => process.env.APIFY_TOKEN || '';

const TREND_MIN_AGE_H = 24;   // ≥ 24 giờ (đủ lâu để velocity có nghĩa)
const TREND_MAX_DAYS = 7;     // ≤ 7 ngày (video ĐANG LÊN, không phải video cũ đông view)

async function getJSON(url, opt) {
  const r = await fetch(url, opt);
  if (!r.ok) throw new Error('HTTP ' + r.status + ' → ' + (await r.text()).slice(0, 200));
  return r.json();
}

// ===================== SĂN VELOCITY — YouTube 2 bước =====================
// search (order=viewCount, ≤7 ngày) → gom videoId → 1 call videos.list/50 video lấy statistics → velocity=view/giờ.
export async function timKiemYouTubeVelocity(keyword, max, region, minView) {
  const after = new Date(Date.now() - TREND_MAX_DAYS * 24 * 3600 * 1000).toISOString();
  const bias = region === 'world' ? '&relevanceLanguage=en&regionCode=US' : '';
  const sd = await getJSON('https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=viewCount&maxResults=' + max +
    '&publishedAfter=' + encodeURIComponent(after) + '&q=' + encodeURIComponent(keyword) + bias + '&key=' + YT_KEY());
  const ids = (sd.items || []).map((it) => it.id && it.id.videoId).filter(Boolean);
  if (!ids.length) return [];
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const vd = await getJSON('https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=' + ids.slice(i, i + 50).join(',') + '&key=' + YT_KEY());
    const now = Date.now();
    for (const it of (vd.items || [])) {
      const views = Number((it.statistics && it.statistics.viewCount) || 0);
      const ageH = (now - new Date((it.snippet && it.snippet.publishedAt) || 0).getTime()) / 3600000;
      if (ageH < TREND_MIN_AGE_H || ageH > TREND_MAX_DAYS * 24 || views < minView) continue;
      const title = (it.snippet && it.snippet.title) || '';
      const channel = (it.snippet && it.snippet.channelTitle) || '';
      out.push({
        nguon: 'YouTube', platform: 'youtube', url: 'https://youtu.be/' + it.id, title, channel,
        views, ageHours: Math.round(ageH), velocity: Math.round(views / Math.max(1, ageH)),
        noidung: 'TIÊU ĐỀ: ' + title + '\nKÊNH: ' + channel + '\nVIEW: ' + views + ' | TUỔI: ' + Math.round(ageH) + 'h\nMÔ TẢ: ' + ((it.snippet && it.snippet.description) || '').slice(0, 500),
      });
    }
  }
  return out;
}

// ===================== SĂN VELOCITY — TikTok qua Apify =====================
// clockworks/tiktok-scraper — TỐN PHÍ, chỉ chạy khi có APIFY_TOKEN. playCount + createTimeISO → velocity.
export async function timKiemTikTokVelocity(keywords, minView) {
  if (!APIFY_TOKEN()) return [];
  const url = 'https://api.apify.com/v2/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items?token=' + APIFY_TOKEN();
  let items = [];
  try {
    items = await getJSON(url, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ searchQueries: keywords.slice(0, 6), resultsPerPage: 5, searchSection: '/video' }) });
  } catch (e) { console.error('TikTok Apify lỗi:', e.message); return []; }
  const now = Date.now();
  const out = [];
  for (const it of (items || [])) {
    const u = it.webVideoUrl;
    const t = it.createTimeISO ? new Date(it.createTimeISO).getTime() : 0;
    if (!u || !t) continue;
    const ageH = (now - t) / 3600000;
    const views = Number(it.playCount || 0);
    if (ageH < TREND_MIN_AGE_H || ageH > TREND_MAX_DAYS * 24 || views < minView) continue;
    const text = it.text || '';
    const author = (it.authorMeta && it.authorMeta.name) || '';
    out.push({
      nguon: 'TikTok', platform: 'tiktok', url: u, title: text.slice(0, 120), channel: '@' + author,
      views, ageHours: Math.round(ageH), velocity: Math.round(views / Math.max(1, ageH)),
      noidung: 'TÁC GIẢ: @' + author + ' | VIEW: ' + views + ' | TUỔI: ' + Math.round(ageH) + 'h\n' + text.slice(0, 400),
    });
  }
  return out;
}

// ===================== PHỐI — kịch bản 1-5' adaptive (port TREND_SCRIPT_PROMPT) =====================
export function TREND_POST_PROMPT(p) {
  const brand = p.brandName || 'thương hiệu';
  const niche = p.niche || 'ứng dụng AI vào công việc';
  const slogan = p.slogan ? (' ("' + p.slogan + '")') : '';
  return 'Bạn là biên kịch video cho thương hiệu ' + brand + ' — về ' + niche + '.\n' +
    'Từ 1 video đang TREND, viết 1 KỊCH BẢN VIDEO tiếng Việt (TikTok/Reels/Shorts).\n\n' +
    '📐 ĐỊNH DẠNG (pipeline dựng video đọc theo đây):\n' +
    '- MỘT DÃY CÂU, mỗi câu 1 dòng = 1 CẢNH.\n' +
    '- Độ dài 1-5 PHÚT TUỲ nội dung — đủ truyền tải đầy đủ thông tin & yếu tố, KHÔNG nhồi, KHÔNG cắt cụt. Tin đơn giản → 1-2 phút; tin nhiều chất → tới 5 phút.\n' +
    '- Câu ĐẦU = HOOK 3 giây (phản trực giác / gọi thẳng đối tượng / câu hỏi tò mò). KHÔNG hook kiểu "hứa thu nhập + mốc thời gian".\n' +
    '- Câu CUỐI = CTA MỀM (theo dõi để xem thêm / lưu lại / bạn nghĩ sao). TUYỆT ĐỐI KHÔNG "comment [từ khoá] để nhận [quà]" — engagement bait + kéo lead ra ngoài nền tảng, bị gỡ video.\n' +
    '- CHỈ in các câu, mỗi câu 1 dòng. KHÔNG đánh số, KHÔNG ghi "Cảnh", KHÔNG chú thích hình, KHÔNG markdown.\n\n' +
    '⚠️ AN TOÀN NỀN TẢNG (BẮT BUỘC — vi phạm là video bị GỠ + phạt account):\n' +
    '- KHÔNG hứa thu nhập cụ thể ("kiếm X triệu/tháng"...); KHÔNG mốc thời gian hứa hẹn ("trong 30 ngày", "từ con số 0"); KHÔNG ngôn ngữ get-rich-quick ("nghe có vẻ điên/khó tin").\n' +
    '- ⭐ KHÔNG "tiền thụ động / kiếm tiền không cần làm gì" — CẤM KỂ CẢ KHÔNG kèm con số ("thu nhập thụ động", "tiền tự chảy vào", "xây một lần thu hoạch mãi mãi", "ngủ vẫn ra tiền"). Nói NĂNG LỰC TỰ ĐỘNG HOÁ (đỡ việc, tiết kiệm thời gian), KHÔNG hứa tiền tự đến.\n' +
    '- Con số của bên khác để MINH HOẠ bối cảnh thì OK; con số THU NHẬP HỨA HẸN cho người xem thì CẤM. Giữ tính GIÁO DỤC về ' + niche + '.\n\n' +
    '⭐ NỘI DUNG: nhân vật chính là GIÁ TRỊ CỐT LÕI của niche (' + niche + ') — KHÔNG khen ' + brand + ' liên tục. ' + brand + ' nhắc NHẸ tối đa 1 lần gần cuối như một lựa chọn giải pháp' + slogan + ', hoặc không nhắc.\n' +
    'BIÊN TẬP: có TRANSCRIPT → Việt hoá + biên tập lại ý & mạch đã giúp viral (viết bằng lời mình, không dịch máy); KHÔNG có → dựng từ hook + tóm tắt. Số liệu/câu chuyện cá nhân tác giả gốc KHÔNG bê nguyên; cần số thật ' + brand + ' mà chưa có → chèn [Boss điền: ...], không bịa.\n' +
    'Chỉ trả về các câu kịch bản, mỗi câu 1 dòng.';
}
export async function phoiTrendClaude(cand, transcript, sys) {
  const user = 'HOOK/TIÊU ĐỀ: ' + (cand.title || '') + '\nTÓM TẮT: ' + (cand.noidung || '') + '\nLINK: ' + (cand.url || '') + '\n\n' +
    (transcript ? 'TRANSCRIPT (biên tập lại từ đây):\n' + transcript : '(Không có transcript — dựng từ hook + tóm tắt ở trên.)');
  return callClaude(sys, user, 4096);
}

// ===================== AI TỰ CHẤM — guardrail thay người duyệt (port chamTrend) =====================
export const TREND_CHAM_PROMPT =
  'Bạn là biên tập viên kiểm duyệt nội dung cho kênh video về AI/công nghệ, khách người Việt.\n' +
  'Chấm 1 KỊCH BẢN VIDEO (mỗi dòng = 1 cảnh) trước khi cho dựng thành video đăng TikTok/Reels/Shorts.\n\n' +
  'CHẤM ĐIỂM 1-10 theo 5 tiêu chí (mỗi cái ~2 điểm):\n' +
  '1. Đúng chủ đề / có giá trị thật cho người kinh doanh.\n' +
  '2. Mạch lạc, dẫn dắt giữ chân tới cuối; câu đầu là HOOK mạnh.\n' +
  '3. Đúng brand: nhân vật chính là GIÁ TRỊ niche, KHÔNG khen thương hiệu lộ liễu.\n' +
  '4. Không bịa số liệu / không sai sự thật hiển nhiên.\n' +
  '5. Câu chữ tự nhiên, đọc lên nghe được (không dịch máy, không nhồi chữ).\n\n' +
  '⛔ AN TOÀN NỀN TẢNG (QUAN TRỌNG NHẤT — quét riêng, phát hiện là gắn cờ):\n' +
  'Đặt "an_toan"=false nếu kịch bản có BẤT KỲ dấu hiệu nào sau (dù chỉ 1 câu):\n' +
  '- Hứa thu nhập (CÓ số: "kiếm X triệu/tháng"... HOẶC KHÔNG số: "thu nhập thụ động", "kiếm tiền không cần làm gì", "tiền tự chảy vào", "xây một lần thu hoạch mãi mãi", "ngủ vẫn ra tiền").\n' +
  '- Mốc thời gian hứa hẹn ("trong 30 ngày", "từ con số 0", "chỉ sau 1 tuần").\n' +
  '- Comment-bait / kéo lead ("comment [từ] để nhận [quà]", "nhắn tin để nhận tài liệu").\n' +
  '- Ngôn ngữ get-rich-quick ("nghe có vẻ điên/khó tin", "bí quyết triệu đô", "ai cũng làm được ngay").\n' +
  '(Con số của bên khác để MINH HOẠ bối cảnh — vd "Microsoft chi 50 tỷ$" — thì KHÔNG tính là vi phạm.)\n\n' +
  'CHỈ trả về đúng 1 dòng JSON, không thêm chữ nào khác:\n' +
  '{"diem": <số nguyên 1-10>, "an_toan": <true hoặc false>, "ly_do": "<1 câu ngắn giải thích điểm + nêu vi phạm nếu có>"}';

export async function chamTrend(kichban) {
  const txt = await callClaude(TREND_CHAM_PROMPT, 'KỊCH BẢN CẦN CHẤM:\n' + kichban, 400);
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Không parse được JSON chấm: ' + txt.slice(0, 120));
  const o = JSON.parse(m[0]);
  return { diem: Number(o.diem) || 0, an_toan: (o.an_toan === true), ly_do: String(o.ly_do || '') };
}
