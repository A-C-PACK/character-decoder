// Screenshots for checking the built page by eye. The page fetches its data, so it is served from docs/ first.
//   node tools/shoot.js <d|m|dm> "hash[@js][~y0-y1]" ... [--out dir]
// d = 1280x800, m = 390x844. @js runs in the page after it loads; ~y0-y1 clips the full-page shot.
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require(path.join(process.env.HOME, "projects/curso-espanol/node_modules/playwright"));
const args = process.argv.slice(2);
const oi = args.indexOf("--out");
const out = oi >= 0 ? args.splice(oi, 2)[1] : path.join(__dirname, "..", "shots");
const [modes, ...targets] = args;
const SIZES = { d: { width: 1280, height: 800 }, m: { width: 390, height: 844 } };
const DOCS = path.join(__dirname, "..", "docs");
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".txt": "text/plain; charset=utf-8" };
const server = http.createServer((req, res) => {
  const file = path.join(DOCS, decodeURIComponent(req.url.split("?")[0]).replace(/\/$/, "/index.html"));
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});
server.listen(0, "127.0.0.1", async () => {
  const base = `http://127.0.0.1:${server.address().port}/`;
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  for (const m of modes) {
    for (const t of targets) {
      const [, hash, js, y0, y1] = t.match(/^([^@~]*)(?:@(.*?))?(?:~(\d+)-(\d+))?$/s);
      const ctx = await browser.newContext({ viewport: SIZES[m], deviceScaleFactor: 1, isMobile: m === "m", hasTouch: m === "m" });
      const page = await ctx.newPage();
      page.on("console", (e) => e.type() === "error" && console.log(`[${m} ${hash}] console:`, e.text()));
      page.on("pageerror", (e) => console.log(`[${m} ${hash}] error:`, e.message));
      await page.goto(base + (hash && hash !== "home" ? "#" + hash : ""));
      await page.waitForTimeout(3200);
      if (js) { console.log("->", JSON.stringify(await page.evaluate(js))); await page.waitForTimeout(3000); }
      const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (over > 0) console.log(`[${m} ${hash}] overflows sideways by ${over}px`);
      const name = `${m}-${hash.replace(/[^\w-]/g, "_")}${js ? "-act" : ""}${y0 ? "-" + y0 : ""}.png`;
      const full = await page.evaluate(() => document.documentElement.scrollHeight);
      const opt = { path: path.join(out, name), fullPage: true };
      if (y0) { const a = Math.min(+y0, full - 10); opt.clip = { x: 0, y: a, width: SIZES[m].width, height: Math.min(+y1, full) - a }; }
      await page.screenshot(opt);
      console.log(name, "page height", full);
      await ctx.close();
    }
  }
  await browser.close();
  server.close();
});
