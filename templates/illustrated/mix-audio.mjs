#!/usr/bin/env node
// mix-audio.mjs <config.json> — trộn voice + SFX (theo build/audio-cues.json do AI đạo diễn phát) + nhạc auto-duck.
// SFX bám ĐÚNG cảnh của từng video (không cố định). Thiếu cues → fallback nhẹ theo mốc câu.
// CI-friendly: đường dẫn từ ENV (ffmpeg trên PATH; SFX/nhạc theo repo ANTOA).
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FFMPEG  = process.env.FFMPEG  || "ffmpeg";
const FFPROBE = process.env.FFPROBE || "ffprobe";
const SFXDIR  = process.env.SFX_DIR || "assets/sfx";        // thư mục chứa file SFX
const MUSICDIR= process.env.MUSIC_DIR || "assets/music";    // thư mục chứa nhạc nền

const cfgPath = process.argv[2] || "config.json";
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const here = path.dirname(path.resolve(cfgPath));
const tim = JSON.parse(fs.readFileSync(path.join(here, "assets/timings.json"), "utf8"));
const video = path.join(here, "build/renders/video.mp4");
const voice = path.join(here, "assets/voice.wav");
const out = path.join(here, cfg.output || "output/video.mp4");
fs.mkdirSync(path.dirname(out), {recursive: true});

const dur = tim.duration;
const lines = tim.lines || tim.beats || [];

// SFX events: ưu tiên build/audio-cues.json ([{at, sound, vol}]); nếu không có → fallback nhẹ.
let events = [];
const cuesPath = path.join(here, "build/audio-cues.json");
if (fs.existsSync(cuesPath)) {
  const cues = JSON.parse(fs.readFileSync(cuesPath, "utf8"));
  events = (Array.isArray(cues) ? cues : cues.cues || []).map(c => ({
    // chấp nhận cả tên file ("swoosh.mp3") lẫn full path — luôn quy về basename trong kho SFX chung
    file: path.join(SFXDIR, path.basename(String(c.sound || ""))),
    ms: Math.round((c.at ?? 0) * 1000),
    vol: c.vol ?? 0.3,
  })).filter(e => fs.existsSync(e.file));
  console.log(`audio-cues.json: ${events.length} SFX (do AI đạo diễn đặt theo cảnh)`);
} else {
  // fallback: swoosh mở màn + pop nhẹ đầu mỗi câu + ding gần cuối
  const soft = path.join(SFXDIR, "pop.mp3"), open = path.join(SFXDIR, "swoosh.mp3"), end = path.join(SFXDIR, "ding.mp3");
  if (fs.existsSync(open)) events.push({file: open, ms: 700, vol: 0.3});
  lines.forEach((l, i) => { if (i > 0 && fs.existsSync(soft)) events.push({file: soft, ms: Math.round(l.start*1000)+40, vol: 0.24}); });
  if (fs.existsSync(end) && lines.length) events.push({file: end, ms: Math.round(lines[lines.length-1].start*1000)+150, vol: 0.4});
  console.log(`(không có audio-cues.json) fallback ${events.length} SFX nhẹ theo mốc câu`);
}

// nhạc nền
const musicVol = cfg.style?.musicVolume ?? 0.22;
const musicFile = process.env.MUSIC_FILE || path.join(MUSICDIR, (cfg.style?.music_file || "bgm.mp3"));
const hasMusic = fs.existsSync(musicFile) && musicVol > 0;

const args = ["-y", "-i", video, "-i", voice];
let filt = "";
let mixin = "";
let nInputs = 1; // voice at index 1

if (hasMusic) {
  args.push("-i", musicFile);
  filt += "[1:a]aresample=48000,asplit=2[v0][vsc];";
  filt += `[2:a]aresample=48000,volume=${musicVol},afade=t=in:st=0:d=1.5,afade=t=out:st=${(dur-2).toFixed(1)}:d=2[mraw];`;
  filt += "[mraw][vsc]sidechaincompress=threshold=0.055:ratio=7:attack=15:release=400[duck];";
  mixin = "[v0][duck]";
  nInputs = 3; // video,voice,music
} else {
  filt += "[1:a]aresample=48000[v0];";
  mixin = "[v0]";
  nInputs = 2;
}

let idx = nInputs;
events.forEach((e) => {
  args.push("-i", e.file);
  filt += `[${idx}:a]aresample=48000,adelay=${e.ms}|${e.ms},volume=${e.vol}[a${idx}];`;
  mixin += `[a${idx}]`;
  idx++;
});
const nMix = (mixin.match(/\[/g) || []).length;
filt += `${mixin}amix=inputs=${nMix}:normalize=0:dropout_transition=0,alimiter=limit=0.95[aout];`;

// video: kéo dài (đóng băng frame cuối) cho khớp trọn giọng
const vdur = parseFloat(execFileSync(FFPROBE, ["-v","error","-show_entries","format=duration","-of","csv=p=0", video]).toString().trim());
const pad = Math.max(0, dur - vdur);
filt += `[0:v]tpad=stop_mode=clone:stop_duration=${pad.toFixed(2)},fps=${cfg.fps||30}[vout]`;

args.push("-filter_complex", filt, "-map", "[vout]", "-map", "[aout]",
  "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  "-c:a", "aac", "-b:a", "192k", "-t", dur.toFixed(2), out);

console.log(`Trộn: ${events.length} SFX ${hasMusic?"+ nhạc auto-duck ":""}(video ${vdur.toFixed(1)}s +pad ${pad.toFixed(1)}s → ${dur.toFixed(1)}s)`);
execFileSync(FFMPEG, args, {stdio: ["ignore", "ignore", "inherit"]});
console.log("XONG ->", out);
