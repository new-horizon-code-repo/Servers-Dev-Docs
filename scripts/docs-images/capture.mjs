#!/usr/bin/env node
/*
  Photographs the panel for the docs and sets each shot on a Backdrop background.

  The panel runs in demo mode, with made-up data and no server (in atoll-main):

    cd panel && npm run demo                                # http://localhost:8083

  Each shot in manifest.mjs opens its route in headless Chrome, light theme and reduced motion, does what the shot
  needs (open a menu, type a search), and photographs part of the page at the device scale it will be drawn at, so
  nothing is resampled. The shot is set in a frosted tray on one of the Heather backgrounds and written to
  images/<id>.webp in this repo: a board of 1280 × 840 at 3× (3840 × 2520), the size syrupv3's boards use.

    node capture.mjs                              # every shot
    node capture.mjs observe/logs storage/        # some shots: ids, or every id under a folder
    node capture.mjs --base http://localhost:8083 # where the panel runs
    node capture.mjs --scale 2                    # a lighter 2× export
    node capture.mjs --keep out/                  # also keep each raw shot as PNG
    node capture.mjs --list                       # the shots and their backgrounds

  The backgrounds are Backdrop's Heather pack (backdrop.love), 20 PNGs of 2048 × 2048, downloaded under the team's
  account and used under its licence. They stay out of the repo: set BACKDROPS to the folder that holds
  Heather-1.png to Heather-20.png, or keep them in Downloads/backdrop-heather/Heather.

  Chrome, Chromium or Edge is looked for where each platform usually installs it; set CHROME to use another binary.
*/
import { access, mkdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { BOARD, shots } from "./manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  if (at === -1) return fallback;
  const [value] = args.splice(at, 2).slice(1);
  return value;
};
const flag = (name) => {
  const at = args.indexOf(name);
  if (at === -1) return false;
  args.splice(at, 1);
  return true;
};
const base = option("--base", "http://localhost:8083").replace(/\/$/, "");
const scale = Number(option("--scale", "3"));
const keep = option("--keep", null);
const parallel = Number(option("--parallel", "2"));
const listOnly = flag("--list");
const backdrops = process.env.BACKDROPS ?? path.join(os.homedir(), "Downloads", "backdrop-heather", "Heather");

// The board, in CSS px: the tray sits MARGIN from the top (and at least that from the sides), PAD around the screen.
const MARGIN = 64;
const PAD = 10;
const RADIUS = 14;

const wanted = args.length
  ? shots.filter((shot) => args.some((arg) => (arg.endsWith("/") ? shot.id.startsWith(arg) : shot.id === arg)))
  : shots;
if (args.length && !wanted.length) throw new Error(`No shots match ${args.join(", ")}; see manifest.mjs`);

if (listOnly) {
  for (const shot of wanted) console.log(`${shot.id.padEnd(34)} Heather-${backdropOf(shot).n}${backdropOf(shot).flip ? " flipped" : ""}  ${shot.route}`);
  process.exit(0);
}

/** $CHROME, else Chrome, Chromium or Edge wherever this platform usually installs them. */
async function findChrome() {
  const env = process.env;
  const candidates = env.CHROME ? [env.CHROME] : [];
  if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    );
  } else if (process.platform === "win32") {
    const roots = [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter(Boolean);
    for (const dir of roots) candidates.push(path.join(dir, "Google/Chrome/Application/chrome.exe"), path.join(dir, "Chromium/Application/chrome.exe"));
    for (const dir of roots) candidates.push(path.join(dir, "Microsoft/Edge/Application/msedge.exe"));
  } else {
    candidates.push("/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge");
  }
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Not installed there; try the next.
    }
  }
  throw new Error("Capturing needs Chrome, Chromium or Edge. Install one, or set CHROME to its path.");
}

function backdropOf(shot) {
  return typeof shot.backdrop === "number" ? { n: shot.backdrop } : shot.backdrop;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Fonts, images and two frames, then a moment for charts and anything else that eases in. */
async function settle(page, ms = 400) {
  await page.waitForFunction(() => document.fonts.status === "loaded" && [...document.images].every((img) => img.complete), { timeout: 30_000, polling: 100 });
  // A page Chrome considers hidden gets no frames, so the wait for two has a ceiling.
  await page.evaluate(() => Promise.race([new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))), new Promise((resolve) => setTimeout(resolve, 500))]));
  await sleep(ms);
}

/** What a shot's prepare step can do on the page. */
const helpers = {
  sleep,
  /** Clicks the visible element that reads [text] (exactly, or containing it with `partial`), innermost first. */
  async click(page, text, { within = "body", partial = false, nth = 0 } = {}) {
    const handle = await page.evaluateHandle(
      (text, within, partial, nth) => {
        const scope = document.querySelector(within) ?? document.body;
        const label = (el) => (el.getAttribute("aria-label") ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
        const visible = (el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const candidates = [...scope.querySelectorAll("button, a, [role=menuitem], [role=tab], [role=option], [role=button], summary, label, input")]
          .filter(visible)
          .filter((el) => (partial ? label(el).includes(text) : label(el) === text));
        return candidates[nth] ?? null;
      },
      text,
      within,
      partial,
      nth,
    );
    const element = handle.asElement();
    if (!element) throw new Error(`Nothing to click reads "${text}"`);
    await element.click();
    await settle(page, 350);
  },
  async press(page, key) {
    await page.keyboard.press(key);
    await settle(page, 350);
  },
  async type(page, text) {
    await page.keyboard.type(text, { delay: 30 });
    await settle(page, 500);
  },
  /** Goes to another route of the same page load, keeping what the demo has changed (a new link, say). */
  async go(page, route) {
    await page.evaluate((hash) => {
      window.location.hash = hash;
    }, route.replace(/^.*#/, "#"));
    await settle(page, 1200);
  },
  /** Waits until text on the page matches [pattern], for what the demo answers after a moment. */
  async waitFor(page, pattern) {
    await page.waitForFunction((source) => new RegExp(source).test(document.body.textContent), { timeout: 15_000, polling: 100 }, pattern.source);
    await settle(page, 300);
  },
  /** The first text on the page, or value of a field, that matches [pattern]. */
  async find(page, pattern) {
    const found = await page.evaluate((source) => {
      // innerText, which keeps elements apart: in textContent a link runs into the label after it.
      const fields = [...document.querySelectorAll("input, textarea")].map((field) => field.value);
      return [document.body.innerText, ...fields].join("\n").match(new RegExp(source))?.[0] ?? null;
    }, pattern.source);
    if (!found) {
      const seen = await page.evaluate(() => (document.querySelector("[role=dialog]") ?? document.body).innerText.replace(/\s+/g, " ").slice(0, 300));
      throw new Error(`Nothing on the page matches ${pattern}; it reads: ${seen}`);
    }
    return found;
  },
  /** Scrolls the panel's main column so the element that reads [text] sits [offset] px from its top. */
  async scrollTo(page, text, offset = 24) {
    await page.evaluate(
      (text, offset) => {
        const scroller = document.querySelector('main[data-scroll-restoration-id="main"]') ?? document.scrollingElement;
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let target = null;
        while (walker.nextNode()) {
          if (walker.currentNode.textContent.trim() === text) {
            target = walker.currentNode.parentElement;
            break;
          }
        }
        if (!target) throw new Error(`No text "${text}" to scroll to`);
        scroller.scrollTop += target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - offset;
      },
      text,
      offset,
    );
    await settle(page, 350);
  },
};

/** The part of the page a shot keeps, in CSS px of the viewport. */
async function measure(page, crop, viewport) {
  if (crop === "window") return { x: 0, y: 0, width: viewport.width, height: viewport.height };
  if (crop.rect) return crop.rect;
  const rect = await page.evaluate((crop) => {
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    /** The innermost visible element whose own text reads [text]; [text, n] for its n-th (0-based) occurrence. */
    const byText = (wanted) => {
      const [text, nth] = Array.isArray(wanted) ? wanted : [wanted, 0];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let seen = 0;
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent.replace(/\s+/g, " ").includes(text)) continue;
        const el = node.parentElement;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && seen++ === nth) return el;
      }
      throw new Error(`No text "${text}" on the page`);
    };
    const main = () => document.querySelector('main[data-scroll-restoration-id="main"]') ?? document.querySelector('main[data-scroll-restoration-id="bare"]');
    let b;
    if (crop === "main") b = box(main());
    else if (crop.selector) b = box(document.querySelector(crop.selector));
    else if (crop.union) {
      // The smallest box around every listed text, or around the closest ancestor each matches.
      const boxes = crop.union.map((text) => box(crop.closest ? byText(text).closest(crop.closest) : byText(text)));
      b = {
        left: Math.min(...boxes.map((r) => r.left)),
        top: Math.min(...boxes.map((r) => r.top)),
        right: Math.max(...boxes.map((r) => r.right)),
        bottom: Math.max(...boxes.map((r) => r.bottom)),
      };
    } else if (crop.text) b = box(byText(crop.text).closest(crop.closest ?? "*"));
    else throw new Error(`Unknown crop ${JSON.stringify(crop)}`);
    // Padding, then optional edges taken from the main column (a full-width strip of it, say).
    const pad = crop.pad ?? 0;
    const padX = crop.padX ?? pad;
    const padY = crop.padY ?? pad;
    const out = { left: b.left - padX, top: b.top - padY, right: b.right + padX, bottom: b.bottom + padY };
    if (crop.edges) {
      const m = box(main());
      for (const edge of crop.edges) out[edge] = m[edge];
    }
    if (crop.height) out.bottom = out.top + crop.height;
    if (crop.width) out.right = out.left + crop.width;
    return out;
  }, crop);
  const x = Math.max(0, Math.floor(rect.left));
  const y = Math.max(0, Math.floor(rect.top));
  const right = Math.min(viewport.width, Math.ceil(rect.right));
  const bottom = Math.min(viewport.height, Math.ceil(rect.bottom));
  return { x, y, width: right - x, height: bottom - y };
}

/** How much larger the shot is drawn on the board than on the page. */
function zoomFor(shot, rect) {
  if (shot.zoom) return shot.zoom;
  const max = shot.maxZoom ?? 1.5;
  const width = (BOARD.width - 2 * MARGIN - 2 * PAD) / rect.width;
  if ((shot.frame ?? "bleed") !== "center") return Math.min(max, width);
  const height = (BOARD.height - 2 * MARGIN - 2 * PAD) / rect.height;
  return Math.min(max, width, height);
}

// The panel is opened at the server address the docs use, so links it shows (shared downloads, billing, invites) read
// as they would in production rather than as localhost. Its requests are answered from the dev server.
const ORIGIN = "https://atoll.example.com";
const responses = new Map();

async function proxy(request) {
  const url = request.url();
  if (!url.startsWith(`${ORIGIN}/`)) return request.continue();
  try {
    const target = `${base}${url.slice(ORIGIN.length)}`;
    const cacheable = request.method() === "GET";
    let answer = cacheable ? responses.get(target) : undefined;
    if (!answer) {
      const response = await fetch(target, {
        method: request.method(),
        headers: { accept: request.headers().accept ?? "*/*", ...(request.postData() ? { "content-type": request.headers()["content-type"] ?? "application/json" } : {}) },
        body: request.postData(),
      });
      const headers = {};
      for (const [name, value] of response.headers) {
        // fetch has already decoded the body.
        if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(name)) headers[name] = value;
      }
      answer = { status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) };
      if (cacheable && response.ok) responses.set(target, answer);
    }
    await request.respond(answer);
  } catch (error) {
    console.error(`  could not load ${url}: ${error.message}`);
    await request.abort();
  }
}

/** The shot's page at [dpr], loaded, settled and prepared. */
async function open(browser, shot, viewport, dpr) {
  const page = await browser.newPage();
  await page.setViewport({ ...viewport, deviceScaleFactor: dpr });
  await page.emulateMediaFeatures([
    { name: "prefers-color-scheme", value: shot.theme ?? "light" },
    { name: "prefers-reduced-motion", value: "reduce" },
  ]);
  await page.setRequestInterception(true);
  page.on("request", proxy);
  await page.goto(`${ORIGIN}/${shot.route}`, { waitUntil: "networkidle0", timeout: 90_000 });
  // Charts draw in over about a second and a half.
  await settle(page, 1600);
  if (shot.prepare) {
    await shot.prepare(page, helpers);
    await settle(page, 600);
  }
  return page;
}

async function shoot(browser, shot) {
  const viewport = { width: 1180, height: 840, ...shot.viewport };
  const crop = shot.crop ?? "main";
  let zoom = shot.zoom;
  if (!zoom) {
    // A first look to size the crop. The shot itself is drawn on a fresh page: layers Chrome has already
    // rasterised keep their old resolution when the device scale changes, and come out soft.
    const page = await open(browser, shot, viewport, 1);
    try {
      zoom = Math.round(zoomFor(shot, await measure(page, crop, viewport)) * 1000) / 1000;
    } finally {
      await page.close();
    }
  }
  // Drawn at the scale it will be shown at, so the board needs no resampling.
  const page = await open(browser, shot, viewport, scale * zoom);
  try {
    const rect = await measure(page, crop, viewport);
    const png = await page.screenshot({ type: "png", clip: rect, captureBeyondViewport: false });
    return { png: Buffer.from(png), zoom, rect };
  } finally {
    await page.close();
  }
}

const rounded = (width, height, radius, { fill = "#fff", opacity = 1, stroke = null, strokeWidth = 0 } = {}) => {
  const inset = strokeWidth / 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<rect x="${inset}" y="${inset}" width="${width - strokeWidth}" height="${height - strokeWidth}" rx="${radius}" ry="${radius}" ` +
      (stroke ? `fill="none" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${strokeWidth}"` : `fill="${fill}" fill-opacity="${opacity}"`) +
      `/></svg>`,
  );
};

/** The part of [rect] that falls on a canvas of [width] × [height], or null. */
const onCanvas = (rect, width, height) => {
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(width, rect.left + rect.width);
  const bottom = Math.min(height, rect.top + rect.height);
  return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
};

/** A layer of [width] × [height] drawn from SVG, clipped to the board at [left], [top]. */
async function layer(svg, rect, board) {
  const visible = onCanvas(rect, board.width, board.height);
  if (!visible) return null;
  const input = await sharp(svg)
    .extract({ left: visible.left - rect.left, top: visible.top - rect.top, width: visible.width, height: visible.height })
    .png()
    .toBuffer();
  return { input, left: visible.left, top: visible.top };
}

async function compose(shot, { png, zoom }) {
  const board = { width: BOARD.width * scale, height: BOARD.height * scale };
  const { width: sw, height: sh } = await sharp(png).metadata();
  const pad = PAD * scale;
  // A dialog cropped to its edge keeps its own corners; anything else gets the board's.
  const radius = Math.round((shot.cornerRadius ? shot.cornerRadius * zoom + 1 : RADIUS) * scale);
  const frame = shot.frame ?? "bleed";
  const top = (shot.top ?? MARGIN) * scale + pad;
  const screen = {
    left: frame === "corner" ? MARGIN * scale + pad : Math.round((board.width - sw) / 2),
    top: frame === "center" ? Math.round((board.height - sh) / 2) : top,
    width: sw,
    height: sh,
  };
  const tray = { left: screen.left - pad, top: screen.top - pad, width: sw + 2 * pad, height: sh + 2 * pad };

  // The background: a band of the square original, as wide as the board.
  const { n, band = "middle", flip = false } = backdropOf(shot);
  let backdrop = sharp(path.join(backdrops, `Heather-${n}.png`)).resize(board.width, board.height, {
    fit: "cover",
    position: band === "top" ? "north" : band === "bottom" ? "south" : "centre",
    kernel: "lanczos3",
  });
  if (flip) backdrop = backdrop.flop();
  // A touch of blur takes the edge off the film grain, which is most of the file's weight, and keeps its look.
  const backdropPng = await backdrop.blur(Math.max(0.3, (1.2 * scale) / 3)).removeAlpha().png().toBuffer();

  const layers = [];

  // Two shadows under the tray: a close one and a wide, soft one. Blurred small and scaled up, since a blur
  // this wide at full size takes seconds.
  const shrink = 8;
  for (const [offset, blur, opacity] of [
    [3, 6, 0.22],
    [22, 34, 0.34],
  ]) {
    const spread = Math.ceil((blur * 3 * scale) / shrink) * shrink;
    const rect = { left: tray.left - spread, top: tray.top - spread + offset * scale, width: tray.width + 2 * spread, height: tray.height + 2 * spread };
    const w = Math.ceil(rect.width / shrink);
    const h = Math.ceil(rect.height / shrink);
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
        `<rect x="${spread / shrink}" y="${spread / shrink}" width="${tray.width / shrink}" height="${tray.height / shrink}" rx="${(radius + pad) / shrink}" fill="#0b1a0e" fill-opacity="${opacity}"/></svg>`,
    );
    const blurred = await sharp(svg)
      .blur(Math.max(0.3, (blur * scale) / shrink))
      .resize(rect.width, rect.height, { kernel: "cubic" })
      .png()
      .toBuffer();
    const piece = await layer(blurred, rect, board);
    if (piece) layers.push(piece);
  }

  // The frosted tray: the background behind it blurred and lifted, a white wash and a bright edge.
  const trayOnBoard = onCanvas(tray, board.width, board.height);
  if (trayOnBoard) {
    const small = Math.max(1, Math.round(scale * 4));
    const trayMask = await layer(rounded(tray.width, tray.height, radius + pad), tray, board);
    const frosted = await sharp(backdropPng)
      .extract(trayOnBoard)
      .resize(Math.ceil(trayOnBoard.width / small), Math.ceil(trayOnBoard.height / small))
      .blur(6)
      .resize(trayOnBoard.width, trayOnBoard.height, { kernel: "cubic" })
      .modulate({ brightness: 1.12, saturation: 1.15 })
      .ensureAlpha()
      .composite([{ input: trayMask.input, blend: "dest-in" }])
      .png()
      .toBuffer();
    layers.push({ input: frosted, left: trayOnBoard.left, top: trayOnBoard.top });
  }
  for (const svg of [
    rounded(tray.width, tray.height, radius + pad, { fill: "#ffffff", opacity: 0.3 }),
    rounded(tray.width, tray.height, radius + pad, { stroke: "#ffffff", opacity: 0.55, strokeWidth: scale }),
  ]) {
    const piece = await layer(svg, tray, board);
    if (piece) layers.push(piece);
  }

  // The screen, with rounded corners and a hairline.
  const visible = onCanvas(screen, board.width, board.height);
  const mask = await layer(rounded(sw, sh, radius), screen, board);
  const cut = await sharp(png)
    .extract({ left: visible.left - screen.left, top: visible.top - screen.top, width: visible.width, height: visible.height })
    .ensureAlpha()
    .composite([{ input: mask.input, blend: "dest-in" }])
    .png()
    .toBuffer();
  layers.push({ input: cut, left: visible.left, top: visible.top });
  const hairline = await layer(rounded(sw, sh, radius, { stroke: "#000000", opacity: 0.1, strokeWidth: scale }), screen, board);
  if (hairline) layers.push(hairline);

  return sharp(backdropPng).composite(layers);
}

if (!wanted.length) process.exit(0);
await access(path.join(backdrops, "Heather-1.png")).catch(() => {
  throw new Error(`No backgrounds in ${backdrops}; set BACKDROPS to the folder with Heather-1.png to Heather-20.png`);
});
const health = await fetch(`${base}/`).catch(() => null);
if (!health?.ok) throw new Error(`The panel isn't answering at ${base}; start it with \`npm run demo\` in atoll-main/panel`);

const chrome = await findChrome();
const launch = () =>
  puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: [
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      // Rasterised on the CPU: GPU rasterisation drops bands of tiles from large screenshots on Windows.
      "--disable-gpu-rasterization",
      "--force-color-profile=srgb",
    ],
  });

if (keep) await mkdir(path.resolve(keep), { recursive: true });
const queue = [...wanted];
let failed = 0;
// A browser per worker, each showing one page at a time: Chrome stops drawing tabs that aren't in front.
await Promise.all(
  Array.from({ length: Math.min(parallel, queue.length) }, async () => {
    const browser = await launch();
    try {
      while (queue.length) {
        const shot = queue.shift();
        try {
          const taken = await shoot(browser, shot);
          if (keep) await writeFile(path.join(path.resolve(keep), `${shot.id.replace(/\//g, "-")}.png`), taken.png);
          const out = path.join(root, "images", `${shot.id}.webp`);
          await mkdir(path.dirname(out), { recursive: true });
          const image = await compose(shot, taken);
          // Near-lossless: flat UI stays sharp at any zoom, and the photograph around it keeps its grain.
          await image.webp({ quality: 95, effort: 6, smartSubsample: true }).toFile(out);
          const { size } = await stat(out);
          const { n, flip } = backdropOf(shot);
          console.log(`${shot.id.padEnd(34)} ${(size / 1024).toFixed(0).padStart(5)} KB  zoom ${taken.zoom.toFixed(2)}  Heather-${n}${flip ? " flipped" : ""}`);
        } catch (error) {
          failed += 1;
          console.error(`✗ ${shot.id}: ${error.message}`);
        }
      }
    } finally {
      await browser.close();
    }
  }),
);
console.log(failed ? `${failed} of ${wanted.length} failed` : `${wanted.length} images written to images/`);
process.exit(failed ? 1 : 0);
