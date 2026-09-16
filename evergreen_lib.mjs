// ANTOA — Evergreen engine (chung) — port Y HỆT Kho Swipe (kho.txt) sang Node, chạy trên GitHub Actions (runner Mỹ:
// Claude KHÔNG bị 403). Transcript qua Supadata (IP residential — datacenter YouTube chặn cứng, đã kiểm chứng).
// Dùng chung cho evergreen_hunt.mjs (săn+phân tích swipe) và evergreen_phoi.mjs (transcript+kịch bản).

const MODEL = () => process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const YT_KEY = () => process.env.YT_KEY || '';
const CLAUDE_KEY = () => process.env.CLAUDE_KEY || '';
const SUPADATA_KEY = () => process.env.SUPADATA_KEY || '';

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status + ' → ' + (await r.text()).slice(0, 200));
  return r.json();
}

// ===================== SĂN (bước ① Kho Swipe) =====================
export async function timKiemYouTube(keyword, max, region) {
  const after = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();   // 30 NGÀY (Evergreen)
  const bias = region === 'world' ? '&relevanceLanguage=en&regionCode=US' : '';   // world → ưu tiên video global tiếng Anh (né video Việt nhiễu)
  const url = 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=viewCount&maxResults=' + max +
    '&publishedAfter=' + encodeURIComponent(after) + '&q=' + encodeURIComponent(keyword) + bias + '&key=' + YT_KEY();
  const items = (await getJSON(url)).items || [];
  const out = [];
  for (const it of items) { const v = await layChiTietVideo(it.id.videoId); if (v) out.push(v); }
  return out;
}
async function layChiTietVideo(videoId) {
  const url = 'https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=' + videoId + '&key=' + YT_KEY();
  const it = ((await getJSON(url)).items || [])[0];
  if (!it) return null;
  const views = Number(it.statistics.viewCount || 0);
  const subs = await laySubscriber(it.snippet.channelId);
  const outlierX = subs > 0 ? Math.round(views / subs) : 0;                 // OUTLIER = views/subs (linh hồn Evergreen)
  const outlier = subs > 0 ? outlierX + 'x' : views + ' view';
  return {
    nguon: 'YouTube', url: 'https://youtu.be/' + videoId, outlier, outlierX, views, subs,
    title: it.snippet.title, channel: it.snippet.channelTitle,
    noidung: 'TIÊU ĐỀ: ' + it.snippet.title + '\nKÊNH: ' + it.snippet.channelTitle +
      '\nVIEW: ' + views + ' | SUB kênh: ' + subs + '\nMÔ TẢ: ' + (it.snippet.description || '').slice(0, 500)
  };
}
async function laySubscriber(channelId) {
  try {
    const it = ((await getJSON('https://www.googleapis.com/youtube/v3/channels?part=statistics&id=' + channelId + '&key=' + YT_KEY())).items || [])[0];
    return Number(it.statistics.subscriberCount || 0);
  } catch (e) { return 0; }
}

// ===================== TRANSCRIPT — Supadata (BYOK sau) =====================
export async function layTranscript(videoUrl) {
  const key = SUPADATA_KEY();
  if (!key) { console.error('⚠️ Chưa có SUPADATA_KEY → bỏ transcript (dựng từ hook+cấu trúc)'); return ''; }
  try {
    const url = 'https://api.supadata.ai/v1/transcript?text=true&url=' + encodeURIComponent(videoUrl);   // KHÔNG ép lang → lấy transcript GỐC theo ngôn ngữ video (vi cho video Việt, en cho video Anh); Claude việt-hoá sau — tránh mất transcript / dịch 2 vòng
    const r = await fetch(url, { headers: { 'x-api-key': key } });
    if (!r.ok) { console.error('Supadata HTTP ' + r.status + ': ' + (await r.text()).slice(0, 160)); return ''; }
    const j = await r.json();
    let txt = '';
    if (typeof j.content === 'string') txt = j.content;
    else if (Array.isArray(j.content)) txt = j.content.map((c) => c.text || '').join(' ');
    return String(txt).replace(/\s+/g, ' ').trim().slice(0, 12000);
  } catch (e) { console.error('Transcript lỗi:', e.message); return ''; }
}

export function videoIdTuLink(link) { const m = String(link).match(/(?:youtu\.be\/|v=|shorts\/)([\w-]{11})/); return m ? m[1] : ''; }

// ===================== Claude — bê NGUYÊN prompt kho.txt, tham số hoá =====================
export function SYSTEM_PROMPT(p) {
  const brand = p.brandName || 'thương hiệu';
  const niche = p.niche || 'ứng dụng AI vào công việc';
  const audience = (p.region === 'world') ? 'khán giả quốc tế nói tiếng Việt' : 'người Việt';
  const persona = p.persona ? (' Chất giọng thương hiệu: ' + p.persona + '.') : '';
  return 'Bạn là chuyên gia phân tích content viral cho thương hiệu ' + brand + '.\n' +
    'Niche: ' + niche + '.' + persona + ' Khách hàng: ' + audience + '.\n' +
    'Đọc 1 nội dung đang thắng và trả về DUY NHẤT một JSON (không giải thích, không markdown) đúng schema:\n' +
    '{\n' +
    ' "hook":"Viết lại hook 3 giây mở đầu bằng tiếng Việt, giữ đúng chiêu bản gốc (open loop / phản trực giác / gọi thẳng đối tượng / promise + mốc thời gian)",\n' +
    ' "cau_truc":"Mạch mở→thân→chốt, 3-5 bước ngắn",\n' +
    ' "tai_sao_thang":"Nỗi đau/khao khát nó chạm — 1-2 câu",\n' +
    ' "do_phu_hop": (số 1-10),\n' +
    ' "dung_chu_de": (true nếu TIÊU ĐỀ thuộc đúng niche "' + niche + '"; false nếu lệch — vd phim ngôn tình/drama "tổng tài/CEO", giải trí, tin lá cải... CHỈ nhìn TIÊU ĐỀ để quyết),\n' +
    ' "goi_y_remix":"Cách phối: giữ hook+cấu trúc; nội dung TÔN VINH GIÁ TRỊ CỐT LÕI của niche nói chung, KHÔNG khen ' + brand + ' liên tục; chỉ gợi ý chèn ' + brand + ' nhẹ như một lựa chọn giải pháp nếu thật sự hợp"\n' +
    '}\n' +
    'Quy tắc: viết giọng thương hiệu câu ngắn; chấm do_phu_hop thẳng tay theo THANG 1-10 (10=cực hợp, 1=lạc hẳn), lệch niche cho <=4; dung_chu_de=false khi tiêu đề rõ ràng không thuộc niche.';
}
export function POST_PROMPT(p) {
  const brand = p.brandName || 'thương hiệu';
  const niche = p.niche || 'ứng dụng AI vào công việc';
  const slogan = p.slogan ? (' ("' + p.slogan + '")') : '';
  return 'Bạn là biên kịch video cho thương hiệu ' + brand + ' — về ' + niche + '.\n' +
    'Nhiệm vụ: từ 1 nội dung đang viral, viết 1 KỊCH BẢN VIDEO (TikTok/Reels/YouTube) DÀI 2-3 PHÚT, giọng đọc tiếng Việt.\n\n' +
    '📐 ĐỊNH DẠNG ĐẦU RA (BẮT BUỘC — pipeline dựng video đọc theo đây):\n' +
    '- Kịch bản là MỘT DÃY CÂU, MỖI CÂU 1 DÒNG, và MỖI CÂU = MỘT CẢNH.\n' +
    '- ĐỘ DÀI: 25-35 câu (video 2-3 PHÚT, ~2200-3300 ký tự tiếng Việt). **TỐI ĐA 35 CÂU — TUYỆT ĐỐI KHÔNG vượt 35.** Nội dung nhiều thì CÔ ĐỌNG lại cho gọn trong 35 câu (giữ ý chính + ví dụ đắt nhất, bỏ ý phụ/trùng lặp), KHÔNG viết lan man cũng KHÔNG cắt cụt giữa chừng. Đừng viết dưới 25 câu.\n' +
    '- Dài bằng GIÁ TRỊ THẬT: khai thác SÂU nội dung gốc — giữ nhiều ý, thêm ví dụ cụ thể, tách từng bước rõ ràng. TUYỆT ĐỐI KHÔNG nhồi chữ lặp lại hay nói vòng cho đủ giờ.\n' +
    '- Mỗi câu NGẮN, gọn 1 ý, đọc lên tự nhiên & mạnh (dễ làm chữ trên màn hình).\n' +
    '- CÂU ĐẦU = HOOK 3 giây (phản trực giác / gọi thẳng đối tượng / câu hỏi kích thích tò mò). KHÔNG hook kiểu "hứa thu nhập + mốc thời gian".\n' +
    '- Thân bài: triển khai từng ý một cách sâu, có ví dụ, có mạch dẫn dắt giữ chân người xem tới cuối.\n' +
    '- Câu cuối = CTA MỀM (theo dõi để xem thêm / lưu lại / bạn nghĩ sao). TUYỆT ĐỐI KHÔNG "comment [từ khoá] để nhận [quà]" — engagement bait + kéo lead ra ngoài nền tảng, bị gỡ video.\n' +
    '- CHỈ in các câu thoại, mỗi câu 1 dòng. KHÔNG đánh số, KHÔNG ghi "Cảnh 1", KHÔNG chú thích hình ảnh, KHÔNG markdown.\n\n' +
    '⚠️ AN TOÀN NỀN TẢNG (TikTok/Reels/Shorts — BẮT BUỘC, nếu vi phạm video bị GỠ + phạt tài khoản):\n' +
    '- KHÔNG hứa thu nhập cụ thể: cấm "kiếm X triệu/tháng", "200 triệu", "thu nhập khủng". Nói LỢI ÍCH/CÁCH LÀM, không hứa con số.\n' +
    '- KHÔNG mốc thời gian hứa hẹn: cấm "trong 30 ngày", "từ con số 0", "làm giàu nhanh".\n' +
    '- KHÔNG ngôn ngữ thổi phồng/get-rich-quick: tránh "nghe có vẻ điên", "bí quyết triệu đô", "ai cũng làm được ngay".\n' +
    '- Con số của người khác (vd doanh nghiệp lớn chi X tỷ) để MINH HOẠ BỐI CẢNH thì OK; con số THU NHẬP HỨA HẸN cho người xem thì CẤM.\n' +
    '- Giữ tính GIÁO DỤC/thông tin về ' + niche + ' — không biến thành lời chào mời làm giàu.\n\n' +
    '⭐ NỘI DUNG: nhân vật chính là GIÁ TRỊ CỐT LÕI của niche (' + niche + ') — KHÔNG khen ' + brand + ' liên tục. ' + brand + ' chỉ nhắc NHẸ tối đa 1 lần gần cuối như một lựa chọn giải pháp' + slogan + ', thậm chí không nhắc cũng được.\n\n' +
    'NGUYÊN TẮC BIÊN TẬP:\n' +
    '- Có TRANSCRIPT: khai thác TRIỆT ĐỂ nội dung thật của họ — Việt hoá, giữ nhiều ý & ví dụ & mạch đã giúp viral, viết lại bằng lời mình (KHÔNG dịch máy 1:1). Đây là nguồn để đạt độ dài 2-3 phút.\n' +
    '- KHÔNG có transcript: khai triển sâu từ hook + cấu trúc, tự bổ sung ý/ví dụ hợp lý về ' + niche + ' để đủ dài.\n' +
    '- Số liệu/câu chuyện cá nhân tác giả gốc → KHÔNG bê nguyên; cần số thật của ' + brand + ' mà không có → chèn [Boss điền: ...], TUYỆT ĐỐI không bịa số.\n\n' +
    'Chỉ trả về các câu kịch bản, mỗi câu 1 dòng.';
}

export async function callClaude(system, user, maxTokens) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': CLAUDE_KEY(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL(), max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] })
  });
  if (!r.ok) throw new Error('Claude HTTP ' + r.status + ' → ' + (await r.text()).slice(0, 200));
  return (await r.json()).content[0].text;
}
export async function phanTichClaude(c, sys) {
  const txt = await callClaude(sys, c.noidung, 1024);
  return JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
}
// Dịch từ khoá VN→EN — CHẠY BACKEND (Claude không 403 như trên CF Workers). Cho region 'world' săn nguồn global.
export async function translateKeywordsEn(keywords) {
  const kws = (keywords || []).map((k) => String(k).trim()).filter(Boolean);
  if (!kws.length) return [];
  try {
    const out = await callClaude('Bạn là trợ lý dịch thuật ngữ chuyên ngành.',
      `Dịch các CỤM TỪ KHOÁ sau sang tiếng Anh (đúng thuật ngữ, ngắn gọn, dễ ra kết quả YouTube). Mỗi cụm 1 dòng, KHÔNG đánh số, KHÔNG giải thích:\n${kws.join('\n')}`, 300);
    const lines = String(out || '').split('\n').map((s) => s.replace(/^[-*\d.)\s]+/, '').trim()).filter(Boolean);
    return lines.length ? lines.slice(0, kws.length) : kws;
  } catch (e) { return kws; }
}
export async function phoiClaude(swipe, transcript, videoUrl, sys) {
  const user = 'HOOK: ' + (swipe.hook || '') + '\nCẤU TRÚC: ' + (swipe.cau_truc || '') + '\nTẠI SAO THẮNG: ' + (swipe.tai_sao_thang || '') +
    '\nGỢI Ý REMIX: ' + (swipe.goi_y_remix || '') + '\nLINK: ' + (videoUrl || '') + '\n\n' +
    (transcript ? 'TRANSCRIPT NỘI DUNG GỐC (biên tập lại từ đây):\n' + transcript
      : '(Không lấy được transcript — dựng bài từ hook + cấu trúc ở trên.)');
  return callClaude(sys, user, 4096);
}
