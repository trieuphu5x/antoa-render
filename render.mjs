// ANTOA render backend — ORCHESTRATOR mẫu (đóng gói).
// KHÔNG tự dựng video: nhận {template, spec, voice} từ Tower → chạy ĐÚNG gói mẫu trong templates/<pkg>/.
// Mẫu "newsroom" = bê chuẩn 100% "AI Có Gì Mới" (build.py → HyperFrames → MP4).
// Chạy trên GitHub Actions ubuntu: python3 + edge-tts + Chromium (npx hyperframes) + ffmpeg.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync, copyFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(HERE, 'templates');
const WORK = join(HERE, 'work');
const OUT = join(HERE, 'out.mp4');

const TEMPLATE = process.env.TEMPLATE || 'newsroom';
const TITLE = process.env.TITLE || 'ANTOA';
const SCRIPT = process.env.SCRIPT || '';
// VOICE = "edge:<code>" (free) | "vbee:<code>" (cần secret VBEE_APP_ID/VBEE_TOKEN). Test: dùng vbee của Boss.
const VOICE = process.env.VOICE || 'edge:vi-VN-HoaiMyNeural';
const [ENGINE, ...rest] = VOICE.split(':');
const CODE = rest.join(':') || VOICE;

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts });
const dur = (f) => { try { return Math.round(parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f]).toString().trim())) || 0; } catch (e) { return 0; } };

// ---- 1) registry: template id → gói + builder ----
const registry = JSON.parse(readFileSync(join(TEMPLATES, 'registry.json'), 'utf8'));
const tpl = (registry.templates || []).find((t) => t.id === TEMPLATE);
if (!tpl) { console.error(`[render] Không thấy mẫu "${TEMPLATE}" trong registry`); process.exit(1); }
if (tpl.status !== 'ready') { console.error(`[render] Mẫu "${TEMPLATE}" (${tpl.name}) chưa nối pipeline (status=${tpl.status})`); process.exit(1); }
const pkgDir = join(TEMPLATES, tpl.package);
const entry = join(pkgDir, tpl.entry || 'build.py');

// ---- 2) spec: Tower gửi (client_payload.spec) hoặc soạn tay ghi spec.json. Định dạng KHÁC nhau theo mẫu:
//        newsroom → {palette, scenes:[{inner,vo}]}; slides → {script, slides}. Orchestrator không giả định shape.
const isNews = TEMPLATE === 'newsroom';
let spec = null;
try { if (process.env.SPEC && process.env.SPEC !== 'null') spec = JSON.parse(process.env.SPEC); } catch (e) { console.error('[render] SPEC JSON lỗi:', e.message); }
if (!spec && existsSync(join(HERE, 'spec.json'))) {
  try { spec = JSON.parse(readFileSync(join(HERE, 'spec.json'), 'utf8')); console.log('[render] Dùng spec.json (soạn tay)'); } catch (e) {}
}
if (isNews && (!spec || !spec.scenes || !spec.scenes.length)) {
  console.log('[render] newsroom không có SPEC hợp lệ → dựng spec tối giản từ TITLE.');
  const t = (SCRIPT || TITLE).replace(/[<>]/g, '').slice(0, 90);
  spec = { palette: 'launch', caption: { title: TITLE, desc: '' }, scenes: [
    { id: 's1', inner: `<div class="mid"><div class="kick anim">Tin mới</div><div class="head h-md anim">${t}</div></div>`, vo: t },
    { id: 'sO', inner: '<div class="mid"><div class="brand anim">ANTOA</div><div class="lede anim">Theo dõi để cập nhật mỗi ngày.</div></div>' },
  ] };
}
if (!spec) { console.error(`[render] Thiếu SPEC cho mẫu "${TEMPLATE}" — Tower/soạn-cảnh chưa cấp.`); process.exit(1); }

// CAP VIDEO NGẮN ≤ 3 phút (chốt chặn số cảnh/câu).
if (Array.isArray(spec.scenes) && spec.scenes.length > 24) spec.scenes = spec.scenes.slice(0, 24);
if (Array.isArray(spec.script) && spec.script.length > 22) spec.script = spec.script.slice(0, 22);

// ---- 3) giọng đọc → nạp vào spec + env cho builder ----
if (ENGINE === 'vbee') { process.env.VBEE_VOICE = CODE; spec.tts = 'vbee'; }   // vbee_tts.py đọc creds từ env
else { spec.tts = 'edge'; if (isNews) spec.voice = CODE; }                     // edge chỉ dùng cho newsroom

// ---- 4) chạy gói mẫu → HyperFrames render ----
rmSync(WORK, { recursive: true, force: true }); mkdirSync(WORK, { recursive: true });
writeFileSync(join(WORK, 'spec.json'), JSON.stringify(spec, null, 2));
// CAPTION THẬT (grounded, do backend soạn) → file cho bước callback gửi kèm về Tower (Telegram/webhook cần caption + link).
try { const cap = spec.caption || {}; writeFileSync(join(HERE, 'caption.txt'), [cap.title, cap.desc].map((s) => String(s || '').trim()).filter(Boolean).join('\n\n')); } catch (e) { /* bỏ qua */ }
const sceneInfo = isNews ? `${spec.scenes.length} cảnh · palette=${spec.palette}` : (spec.scenes ? `${spec.scenes.length} cảnh` : `${(spec.script || []).length || '?'} câu`);
console.log(`[render] mẫu=${tpl.name} · ${sceneInfo} · giọng=${VOICE}`);
run('python3', [entry, WORK, join(WORK, 'spec.json'), '--render'], { cwd: pkgDir });

// ---- 5) tìm MP4 render mới nhất trong work → out.mp4 ----
function newestMp4(dir) {
  let best = null;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { const inner = newestMp4(p); if (inner && (!best || inner.mtime > best.mtime)) best = inner; }
    else if (name.endsWith('.mp4') && (!best || st.mtimeMs > best.mtime)) best = { path: p, mtime: st.mtimeMs };
  }
  return best;
}
const found = newestMp4(WORK);
if (!found) { console.error('[render] Không thấy MP4 sau render'); process.exit(1); }
copyFileSync(found.path, OUT);
writeFileSync(join(HERE, 'duration.txt'), String(dur(OUT)));
console.log(`[render] ✓ ${OUT} · ${dur(OUT)}s (từ ${found.path})`);
