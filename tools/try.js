// Drives the built page: draws a character on the pad from its stored strokes, pastes a sentence, checks many pages load.
const path = require("path"), http = require("http"), fs = require("fs");
const { chromium } = require(path.join(process.env.HOME, "projects/curso-espanol/node_modules/playwright"));
const DOCS = path.join(__dirname, "..", "docs");
const gfx = {};
for (const line of fs.readFileSync(path.join(__dirname, "../cache/graphics.txt"), "utf8").split("\n")) if (line) { const r = JSON.parse(line); gfx[r.character] = r.medians; }
const server = http.createServer((req, res) => {
  const file = path.join(DOCS, decodeURIComponent(req.url.split("?")[0]).replace(/\/$/, "/index.html"));
  fs.readFile(file, (err, data) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200); res.end(data); });
});
server.listen(0, "127.0.0.1", async () => {
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (e) => e.type() === "error" && errors.push(e.text()));
  await page.goto(base);
  await page.waitForTimeout(2500);
  // 1. draw
  for (const ch of ["好", "清", "我", "龙", "谢"]) {
    await page.goto(base + "#home"); await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector(".pad-tools button:last-child").click());
    const box = await page.locator(".pad-canvas").boundingBox();
    for (const m of gfx[ch]) {
      const pts = m.map(([x, y]) => [box.x + 30 + (x / 1024) * (box.width - 60), box.y + 30 + ((900 - y) / 1024) * (box.height - 60)]);
      await page.mouse.move(pts[0][0], pts[0][1]); await page.mouse.down();
      for (const p of pts.slice(1)) await page.mouse.move(p[0], p[1], { steps: 4 });
      await page.mouse.up();
    }
    await page.waitForTimeout(500);
    const got = await page.locator(".guesses .guess").allTextContents();
    console.log("drew", ch, "-> guesses", got.join(""), got[0] === ch ? "OK" : "MISS");
    if (ch === "谢") { await page.screenshot({ path: path.join(__dirname, "../shots/d-pad.png") }); await page.locator(".guesses .guess").first().click(); await page.waitForTimeout(1500); console.log("after pick:", await page.evaluate(() => location.hash + " " + document.querySelector(".gloss")?.textContent)); }
  }
  // 2. paste a sentence
  await page.goto(base + "#home"); await page.waitForTimeout(300);
  await page.fill("#lookup-text", "我听说你想学中文。");
  await page.click(".lookup button[type=submit]");
  await page.waitForTimeout(1500);
  console.log("sentence ->", await page.evaluate(() => location.hash + " strip:" + document.querySelectorAll(".strip .tile").length + " gloss:" + document.querySelector(".gloss")?.textContent));
  await page.locator(".strip a.tile").nth(1).click(); await page.waitForTimeout(1500);
  console.log("second tile ->", await page.evaluate(() => document.querySelector(".tile.now")?.textContent + " " + document.querySelector(".gloss")?.textContent));
  await page.screenshot({ path: path.join(__dirname, "../shots/d-sentence.png") });
  // 3. many pages render
  const chars = await page.evaluate(() => CHARS);
  let bad = 0;
  const pick = [...chars.slice(0, 120), ...chars.filter((_, i) => i % 97 === 0)];
  for (const ch of pick) {
    await page.evaluate((h) => { location.hash = h; }, "#c-" + ch.codePointAt(0).toString(16));
    try { await page.waitForSelector(".dec-grid", { timeout: 4000 }); } catch (e) { bad++; console.log("did not render:", ch); }
    const t = await page.evaluate(() => document.querySelector(".decode").innerText);
    if (/undefined|null|NaN|\[object/.test(t)) { bad++; console.log("odd text on", ch, t.match(/.{0,30}(undefined|null|NaN|\[object).{0,30}/)[0]); }
    await page.evaluate(() => document.querySelector(".dec-grid")?.remove());
  }
  console.log(pick.length, "pages opened,", bad, "problems;", errors.length, "console errors", errors.slice(0, 5));
  await browser.close(); server.close();
});
