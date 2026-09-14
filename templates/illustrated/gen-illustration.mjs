#!/usr/bin/env node
// gen-illustration.mjs "<prompt>" <out.png> [model] [aspect]
// Sinh ảnh minh hoạ. Key đọc từ ENV (CI-friendly): OPENAI_API_KEY | GEMINI_API_KEY.
//   • OpenAI: model "gpt-image-1"/"dall-e-3"  → OPENAI_API_KEY
//   • Gemini: model "gemini-*"                 → GEMINI_API_KEY
import fs from "node:fs";
const prompt = process.argv[2];
const out = process.argv[3] || "out.png";
const model = process.argv[4] || "gpt-image-1";
const aspect = process.argv[5] || "9:16";
if (!prompt) { console.error('usage: gen-illustration.mjs "<prompt>" <out.png> [model] [aspect]'); process.exit(1); }

let b64;
if (model.startsWith("gpt-image") || model.startsWith("dall")) {
  const KEY = process.env.OPENAI_API_KEY;
  if (!KEY) { console.error("thiếu ENV OPENAI_API_KEY"); process.exit(1); }
  const dalle = model.startsWith("dall");
  const size = aspect==="16:9" ? (dalle?"1792x1024":"1536x1024")
             : aspect==="1:1" ? "1024x1024"
             : (dalle?"1024x1792":"1024x1536");
  let j;   // RETRY 429 (rate limit gpt-image-1 = 5 ảnh/phút) + 5xx: chờ theo "try again in Xs" rồi thử lại (tối đa 6 lần).
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method:"POST", headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${KEY}` },
      body: JSON.stringify({ model, prompt, size, n:1 }),
    });
    j = await res.json().catch(() => ({}));
    if (res.ok) break;
    const msg = String(j.error?.message || JSON.stringify(j)).slice(0,220);
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      const m = /try again in ([\d.]+)s/i.exec(msg);
      let wait = m ? Math.ceil(parseFloat(m[1]) * 1000) + 2000 : attempt * 10000;
      wait = Math.min(70000, Math.max(wait, 8000));
      console.error(`HTTP ${res.status} rate-limit (thử ${attempt}/6) — chờ ${Math.round(wait/1000)}s`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    console.error("HTTP", res.status, msg); process.exit(1);
  }
  b64 = j.data?.[0]?.b64_json;
  if (!b64 && j.data?.[0]?.url) { const r=await fetch(j.data[0].url); b64=Buffer.from(await r.arrayBuffer()).toString("base64"); }
} else {
  const KEY = process.env.GEMINI_API_KEY;
  if (!KEY) { console.error("thiếu ENV GEMINI_API_KEY"); process.exit(1); }
  const body = { contents:[{ parts:[{ text: prompt }] }], generationConfig:{ imageConfig:{ aspectRatio: aspect } } };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`, {
    method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!res.ok) { console.error("HTTP", res.status, JSON.stringify(j.error?.message||j).slice(0,220)); process.exit(1); }
  b64 = (j.candidates?.[0]?.content?.parts||[]).find(p=>p.inlineData?.data)?.inlineData?.data;
}
if (!b64) { console.error("no image in response"); process.exit(1); }
fs.writeFileSync(out, Buffer.from(b64, "base64"));
console.log("OK ->", out, "(" + (fs.statSync(out).size/1024|0) + " KB) model=" + model + " aspect=" + aspect);
