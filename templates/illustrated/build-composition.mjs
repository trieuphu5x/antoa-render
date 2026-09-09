#!/usr/bin/env node
// build-composition.mjs <config.json> — sinh build/index.html: N ảnh minh hoạ + Ken Burns + crossfade + caption + CTA.
// Đọc assets/timings.json + build/assets/img1..N.png. Tất định (Ken Burns theo index, không random).
import fs from "node:fs"; import path from "node:path";
const cfgPath = process.argv[2] || "config.json";
const cfg = JSON.parse(fs.readFileSync(cfgPath,"utf8"));
const here = path.dirname(path.resolve(cfgPath));
const tim = JSON.parse(fs.readFileSync(path.join(here,"assets/timings.json"),"utf8"));
const L = tim.lines, DUR = tim.duration;
const imgs = fs.readdirSync(path.join(here,"build/assets")).filter(f=>/^img\d+\.png$/.test(f)).sort((a,b)=>parseInt(a.match(/\d+/))-parseInt(b.match(/\d+/)));
const N = imgs.length;
const cta = cfg.cta || null;                    // {brand, tag} — hiện ở dòng cuối, đè ảnh cuối
const nStory = cta ? Math.min(N, L.length-1) : Math.min(N, L.length);

// cửa sổ mỗi ảnh: từ start dòng tương ứng → start dòng kế (ảnh cuối kéo tới hết)
const win = [];
for (let i=0;i<N;i++){ const s=L[i]?L[i].start:0; const e=(i<N-1&&L[i+1])?L[i+1].start:DUR; win.push([s,e]); }
// Ken Burns đa hướng (tất định theo i)
const KB=[[{sc:1.06,x:0,y:0},{sc:1.16,x:-24,y:18}],[{sc:1.08,x:20,y:0},{sc:1.18,x:-18,y:-16}],[{sc:1.06,x:0,y:10},{sc:1.18,x:16,y:-18}],[{sc:1.1,x:-16,y:-8},{sc:1.02,x:12,y:12}],[{sc:1.05,x:14,y:14},{sc:1.17,x:-14,y:-10}]];

const scenes = imgs.map((f,i)=>`    <div class="scene" id="s${i}"><div class="ken" id="k${i}"><img src="assets/${f}"/></div></div>`).join("\n");
const capsArr = [];
for (let i=0;i<L.length;i++){ if (cta && i===L.length-1) continue; const t=(cfg.scenes&&cfg.scenes[i]&&cfg.scenes[i].caption)||L[i].text; capsArr.push({s:L[i].start,e:Math.max(L[i].start+1,L[i].end-0.35),t}); }
const ctaStart = cta ? L[L.length-1].start : null;

const kbJs = imgs.map((f,i)=>{ const k=KB[i%KB.length]; const [s,e]=win[i]; const d=Math.max(1,e-s+0.5);
  let js=`    tl.set("#s${i}",{opacity:${i===0?1:0}},0);\n`;
  if(i>0) js+=`    tl.to("#s${i}",{opacity:1,duration:0.6,ease:"power1.inOut"},${(s-0.3).toFixed(2)});\n`;
  js+=`    tl.fromTo("#k${i}",{scale:${k[0].sc},x:${k[0].x},y:${k[0].y}},{scale:${k[1].sc},x:${k[1].x},y:${k[1].y},duration:${d.toFixed(2)},ease:"none"},${s.toFixed(2)});`;
  return js; }).join("\n");
const capsJs = capsArr.map(c=>`    tl.call(()=>{cap.innerHTML=${JSON.stringify(c.t)};gsap.fromTo(cap,{opacity:0,y:14},{opacity:1,y:0,duration:0.3,ease:"power1.out"});},[],${c.s.toFixed(2)});\n    tl.call(()=>{gsap.to(cap,{opacity:0,duration:0.25,ease:"power1.in"});},[],${c.e.toFixed(2)});`).join("\n");
const ctaJs = cta ? `    tl.call(()=>{gsap.to(cap,{opacity:0,duration:0.2});},[],${(ctaStart-0.2).toFixed(2)});\n    tl.fromTo("#cta",{opacity:0,y:24,scale:0.96},{opacity:1,y:0,scale:1,duration:0.6,ease:"back.out(1.4)"},${ctaStart.toFixed(2)});` : "";
const ctaHtml = cta ? `    <div id="cta"><div class="brand">${cta.brand||""}</div><div class="tag">${cta.tag||""}</div></div>` : "";

const html=`<!doctype html><html lang="vi" data-resolution="portrait"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=1080, height=1920"/>
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700;800;900&display=block&subset=vietnamese" rel="stylesheet"/>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;overflow:hidden;background:#141225;font-family:'Be Vietnam Pro',sans-serif}
#stage{position:relative;width:1080px;height:1920px;overflow:hidden;background:#141225}
.scene{position:absolute;inset:0;opacity:0;will-change:opacity}
.ken{position:absolute;inset:0;width:1080px;height:1920px;will-change:transform}
.ken img{width:1080px;height:1920px;object-fit:cover;display:block}
#grad{position:absolute;left:0;right:0;bottom:0;height:640px;z-index:20;background:linear-gradient(to top,rgba(10,8,24,.86),rgba(10,8,24,.4) 45%,transparent);pointer-events:none}
#cap{position:absolute;left:90px;right:90px;bottom:250px;z-index:30;text-align:center;font-size:52px;font-weight:800;line-height:1.28;color:#fff;opacity:0;text-shadow:0 3px 18px rgba(0,0,0,.55)}
#cta{position:absolute;left:0;right:0;bottom:250px;z-index:40;text-align:center;opacity:0}
#cta .brand{font-size:96px;font-weight:900;letter-spacing:-1px;background:linear-gradient(100deg,#ffb37a,#ff7a9c);-webkit-background-clip:text;background-clip:text;color:transparent;line-height:1;padding-top:.32em;padding-bottom:.14em}
#cta .tag{font-size:44px;font-weight:700;color:#fff;margin-top:6px;text-shadow:0 3px 16px rgba(0,0,0,.5)}
#vig{position:absolute;inset:0;z-index:15;pointer-events:none;background:radial-gradient(ellipse 82% 88% at 50% 46%,transparent 55%,rgba(8,6,20,.5))}
</style></head><body>
  <div id="stage" data-composition-id="main" data-start="0" data-width="1080" data-height="1920">
${scenes}
    <div id="vig"></div><div id="grad"></div><div id="cap"></div>
${ctaHtml}
  </div>
<script>
window.__timelines=window.__timelines||{};
document.addEventListener("DOMContentLoaded",()=>{
  const DUR=${DUR}; const tl=gsap.timeline({paused:true}); const cap=document.getElementById("cap");
${kbJs}
${capsJs}
${ctaJs}
  tl.set({},{},DUR); tl.seek(0); window.__timelines["main"]=tl;
  if(typeof window.__hfForceTimelineRebind==="function") window.__hfForceTimelineRebind();
});
</script></body></html>`;
fs.writeFileSync(path.join(here,"build/index.html"),html);
console.log(`build-composition: ${N} ảnh, ${capsArr.length} caption${cta?" + CTA":""}, dur ${DUR}s`);
