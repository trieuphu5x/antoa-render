// ANTOA — Evergreen PHỐI (bước ③ Kho Swipe) — chạy trên GitHub Actions runner Mỹ.
// Đọc env → Supadata transcript + Claude viết kịch bản 2-3' (SAB_POST_PROMPT) → ghi script.txt + has_transcript.txt.
import { writeFileSync } from 'node:fs';
import { layTranscript, videoIdTuLink, POST_PROMPT, phoiClaude } from './evergreen_lib.mjs';

const p = {
  videoUrl: process.env.VIDEO_URL || '',
  swipe: JSON.parse(process.env.SWIPE || '{}'),
  brandName: process.env.BRAND_NAME || 'thương hiệu',
  niche: process.env.NICHE || 'ứng dụng AI vào công việc',
  persona: process.env.PERSONA || '',   // giọng thương hiệu → POST_PROMPT viết lời đọc đúng chất
  slogan: process.env.SLOGAN || '',
  region: process.env.REGION || 'vn',
};

const main = async () => {
  if (!p.videoUrl || !videoIdTuLink(p.videoUrl)) { console.error('❌ thiếu VIDEO_URL hợp lệ'); process.exit(1); }
  const transcript = await layTranscript(p.videoUrl);
  console.log('transcript:', transcript ? transcript.length + ' ký tự' : 'KHÔNG có (dùng fallback hook+cấu trúc)');
  const script = await phoiClaude(p.swipe, transcript, p.videoUrl, POST_PROMPT(p));
  if (!script || !script.trim()) { console.error('❌ Claude trả kịch bản rỗng'); process.exit(1); }
  writeFileSync('script.txt', script.trim());
  writeFileSync('has_transcript.txt', transcript ? '1' : '0');
  const lines = script.trim().split('\n').filter(Boolean);
  console.log('✅ PHỐI xong:', lines.length, 'câu | hasTranscript:', !!transcript);
  console.log('  câu 1:', lines[0]);
};
main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
