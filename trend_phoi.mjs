// ANTOA — Trend PHỐI (thủ công) — chạy trên GitHub runner Mỹ (Claude không 403 + Supadata transcript).
// Boss bấm "Phối" 1 tin Trend → transcript (chỉ YouTube) + Claude kịch bản 1-5' (TREND_POST_PROMPT) →
// ghi script.txt + has_transcript.txt → callback kind:"compose" về Tower (status='phoi' + script). Như evergreen_phoi.
import { writeFileSync } from 'node:fs';
import { layTranscript } from './evergreen_lib.mjs';
import { TREND_POST_PROMPT, phoiTrendClaude } from './trend_lib.mjs';

const p = {
  videoUrl: process.env.VIDEO_URL || '',
  platform: (process.env.PLATFORM || 'youtube').trim(),
  title: process.env.TITLE || '',
  brandName: process.env.BRAND_NAME || 'thương hiệu',
  niche: process.env.NICHE || 'ứng dụng AI vào công việc',
  persona: process.env.PERSONA || '',
  slogan: process.env.SLOGAN || '',
  region: process.env.REGION || 'vn',
};

const main = async () => {
  const transcript = p.platform === 'youtube' ? await layTranscript(p.videoUrl) : '';   // TikTok không có transcript → dựng từ hook+tiêu đề
  console.log('transcript:', transcript ? transcript.length + ' ký tự' : 'KHÔNG có (dùng hook+tóm tắt)');
  const cand = { title: p.title, noidung: '', url: p.videoUrl };
  const script = await phoiTrendClaude(cand, transcript, TREND_POST_PROMPT(p));
  if (!script || !script.trim()) { writeFileSync('script.txt', ''); writeFileSync('has_transcript.txt', '0'); throw new Error('Claude kịch bản rỗng'); }
  writeFileSync('script.txt', script.trim());
  writeFileSync('has_transcript.txt', transcript ? '1' : '0');
  console.log('✅ PHỐI Trend xong:', script.trim().split('\n').filter(Boolean).length, 'câu | hasTranscript:', !!transcript);
};
main().catch((e) => { console.error('FATAL:', e); writeFileSync('script.txt', ''); process.exit(1); });
