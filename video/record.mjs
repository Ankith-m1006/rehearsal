// Records the live Rehearsal demo in one continuous take (1600x900) and writes scene marks to marks.json.
// Real PayPal sandbox runs: scene lengths are fitted to the voiceover later (build.py speeds up waits).
// Run: node record.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/ankit/.vscode/extensions/danielsanmedium.dscodegpt-3.24.79/standalone/node_modules/patchright");
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const vdir = path.join(here, "raw"); fs.mkdirSync(vdir, { recursive: true });
const B = "https://rehearsal-1037019152152.asia-south1.run.app";
const REPO = "https://github.com/Ankith-m1006/rehearsal";
const OW = 1600, OH = 900, DSF = 1.25; const W = OW / DSF, H = OH / DSF, Z = 1; // real device scale, no CSS zoom (CSS zoom tore frames)
const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--disable-gpu", "--disable-gpu-compositing", "--disable-features=PaintHolding"] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DSF });
const cursorJS = ([x0, y0, z]) => {
  if (document.documentElement.style.zoom !== String(z)) document.documentElement.style.zoom = String(z);
  if (document.getElementById("__cur")) return;
  const c = document.createElement("div"); c.id = "__cur";
  c.style.cssText = "zoom:" + (1 / z) + ";position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;transform:translate(" + (x0 - 3) + "px," + (y0 - 2) + "px);";
  c.innerHTML = "<svg width=\"22\" height=\"22\" viewBox=\"0 0 24 24\"><path d=\"M4 2 L4 19 L9 14.5 L12.5 22 L15.5 20.6 L12 13.3 L18.5 13.3 Z\" fill=\"#111\" stroke=\"#fff\" stroke-width=\"1.4\" stroke-linejoin=\"round\"/></svg>";
  document.documentElement.appendChild(c);
  addEventListener("mousemove", (e) => { c.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`; }, true);
  addEventListener("mousedown", (e) => {
    const r = document.createElement("div");
    r.style.cssText = `zoom:${1 / z};position:fixed;left:${e.clientX - 16}px;top:${e.clientY - 16}px;width:32px;height:32px;border-radius:50%;border:2px solid rgba(0,48,135,.9);z-index:2147483646;pointer-events:none;transition:transform .45s ease-out,opacity .45s ease-out;`;
    document.documentElement.appendChild(r);
    requestAnimationFrame(() => { r.style.transform = "scale(1.8)"; r.style.opacity = "0"; });
    setTimeout(() => r.remove(), 600);
  }, true);
};
const p = await ctx.newPage();
// Chrome screencast: every painted frame as a JPEG with its timestamp (Playwright's recorder needs a bundled ffmpeg).
const fdir = path.join(vdir, "frames"); fs.mkdirSync(fdir, { recursive: true });
// Full screenshots in a steady loop (headless screencast sent partial repaints that tore).
const frames = []; const cdp = { send: async () => {} }; let shooting = true;
const shooter = (async () => {
  while (shooting) {
    const t = Date.now() / 1000;
    try {
      const buf = await p.screenshot({ type: "jpeg", quality: 82, animations: "allow", caret: "initial", timeout: 5000 });
      const n = String(frames.length).padStart(6, "0"); fs.writeFileSync(path.join(fdir, n + ".jpg"), buf); frames.push({ n, t });
    } catch { await new Promise((r) => setTimeout(r, 50)); }
  }
})();
const t0 = Date.now(); const marks = {}; const mark = (k) => { marks[k] = (Date.now() - t0) / 1000; console.log(k, marks[k]); };
const wait = (ms) => p.waitForTimeout(ms);
let pos = { x: W / 2, y: H / 2 };
const inject = () => p.evaluate(cursorJS, [pos.x, pos.y, Z]).catch(() => {});
const moveTo = async (x, y, ms = 700) => {
  await inject();
  const from = { ...pos }; const st = Date.now();
  for (;;) {
    const t = Math.min(1, (Date.now() - st) / ms); const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    await p.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
    if (t >= 1) break;
    await new Promise((r) => setTimeout(r, 12));
  }
  pos = { x, y };
};
const center = async (loc) => { await loc.scrollIntoViewIfNeeded(); await wait(250); const b = await loc.boundingBox(); return { x: b.x + Math.min(b.width / 2, 140), y: b.y + b.height / 2 }; };
const point = async (loc, ms = 700) => { const c = await center(loc); await moveTo(c.x, c.y, ms); };
const click = async (loc, ms = 700) => { await point(loc, ms); await wait(220); await p.mouse.down(); await wait(90); await p.mouse.up(); };
const smooth = (sel) => p.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: "start" }), sel);
const open = async (url) => { await p.goto(url, { waitUntil: "load", timeout: 60000 }); await wait(1200); await inject(); await p.mouse.move(pos.x, pos.y); };
const runAndWait = async (id, target) => {
  await click(p.locator(`#nav button[data-id="${id}"]`), 800); await wait(900);
  await click(p.locator(`#target button[data-t="${target}"]`), 700); await wait(600);
  await click(p.locator("#go"), 700);
  await p.waitForFunction(() => /failed|passed/i.test(document.querySelector("#badge")?.textContent || ""), null, { timeout: 180000 });
};

try {
  // setup (cut away later)
  await open(B + "/"); await wait(3000);

  // 1. problem
  mark("problem");
  await point(p.locator("#title"), 1200); await wait(1500);
  await point(p.locator(".strip"), 900); await wait(1500);
  await smooth("#bugs"); await wait(1800);
  await point(p.locator("#buglist li").nth(1), 900); await wait(1600);
  await point(p.locator("#buglist li").nth(4), 900); await wait(1800);

  // 2. what it is
  mark("what");
  await p.evaluate(() => scrollTo({ top: 0, })); await wait(1500);
  await point(p.locator("#h-pp"), 900); await wait(1000);
  await point(p.locator("#h-wh"), 700); await wait(1000);
  await point(p.locator("#h-ai"), 700); await wait(1200);
  await point(p.locator("#nav button").nth(0), 900); await wait(900);
  await moveTo(pos.x, pos.y + 160, 1500); await wait(1200);
  await point(p.locator("#steps li").nth(0), 900); await wait(1500);

  // 3. AI compiler
  mark("compile");
  await click(p.locator("#english-in"), 900);
  await p.locator("#english-in").pressSequentially("A buyer pays $9 for ginger chai, PayPal sends the completed webhook three times, and the shop must ship only once.", { delay: 28 });
  await wait(500);
  await click(p.locator("#compile"), 700);
  await p.waitForFunction(() => /Plan built/.test(document.querySelector("#ai-msg")?.textContent || ""), null, { timeout: 120000 });
  mark("compiled");
  await wait(800); await point(p.locator("#title"), 900); await wait(1200);
  await smooth("#plan"); await wait(1500);
  await point(p.locator("#steps li").nth(4), 900); await wait(2500);

  // 4. run duplicate COMPLETED on the buggy shop (real sandbox)
  await p.evaluate(() => scrollTo({ top: 0, })); await wait(1200);
  mark("run");
  await runAndWait("duplicate-completed", "buggy");
  mark("ran");
  await wait(800);
  await point(p.locator("#badge"), 800); await wait(1200);
  await point(p.locator("#grid .ag-row").nth(1), 900); await wait(1500);
  await point(p.locator("#grid .ag-row").nth(2), 700); await wait(1500);
  await point(p.locator('#grid .ag-row[row-index]').last(), 900); await wait(2000);

  // 5. AI diagnosis
  mark("diagnose");
  await p.waitForFunction(() => { const t = document.querySelector("#diagsum")?.textContent || ""; return t && !/Reading the timeline/.test(t); }, null, { timeout: 180000 });
  mark("diagnosed");
  await smooth("#diagbox"); await wait(1500);
  await point(p.locator("#diagsum"), 900); await wait(2500);
  await point(p.locator("#diag .finding pre").first(), 900); await wait(3000);

  // 6. the real catch: the fix commit, then the live re-run passes on the fixed shop
  mark("catch");
  await open(REPO + "/commit/543545e"); await wait(2000);
  const tree = p.getByRole("treeitem", { name: /chai\.js/ }).first();
  if (await tree.count()) { await click(tree, 900); await wait(1800); }
  const fixLine = p.getByText('o.status !== "refunded"', { exact: false }).first();
  if (await fixLine.count()) { await fixLine.scrollIntoViewIfNeeded().catch(() => {}); await p.evaluate(() => window.scrollBy(0, -180)); await wait(800); await point(fixLine, 900); }
  await wait(3500);
  await open(B + "/"); await wait(1500);
  mark("rerun");
  await runAndWait("out-of-order", "fixed");
  mark("reran");
  await wait(800); await point(p.locator("#badge"), 800); await wait(2500);

  // 7. close: the live results table in the README
  mark("close");
  await open(REPO + "#live-results-10-nov-2026-paypal-sandbox"); await wait(2500);
  await p.evaluate(() => { const h = [...document.querySelectorAll("h2, .markdown-heading")].find((n) => /Live results/.test(n.textContent || "")); h?.scrollIntoView({ block: "start", }); });
  await wait(9000);
  mark("end");
} finally {
  fs.writeFileSync(path.join(here, "marks.json"), JSON.stringify({ marks }, null, 1));
  shooting = false; await shooter;
  await ctx.close(); await browser.close();
  // concat list: each frame held until the next one; times are relative to t0 so marks line up
  const base = t0 / 1000; let list = "";
  for (let i = 0; i < frames.length; i++) {
    const d = (i + 1 < frames.length ? frames[i + 1].t : frames[i].t + 0.5) - frames[i].t;
    list += `file 'frames/${frames[i].n}.jpg'
duration ${Math.max(d, 0.001).toFixed(4)}
`;
  }
  fs.writeFileSync(path.join(vdir, "frames.txt"), list);
  fs.writeFileSync(path.join(vdir, "offset.json"), JSON.stringify({ firstFrameAt: frames.length ? frames[0].t - base : 0, frames: frames.length }));
  console.log("frames", frames.length, "first at", frames.length ? (frames[0].t - base).toFixed(2) : "-");
}
