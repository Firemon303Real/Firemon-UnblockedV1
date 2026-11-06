import http from "node:http";
import crypto from "node:crypto";
import net from "node:net";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "public");
const gamesDir = path.join(publicDir, "games");
const gameLogosDir = path.join(publicDir, "game-logos");
const gameLibraryFile = path.join(here, "game-library.json");
const managerFile = path.join(here, "tools", "game-manager.html");
const dirOf = (specifier) => path.dirname(require.resolve(specifier));

const port = Number(process.env.PORT || 8789);
const host = process.env.HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const password = process.env.FIREMON_ACCESS_PASSWORD || "";
const publicBind = !isLoopback(host);
const suppliedSessionSecret = process.env.FIREMON_SESSION_SECRET || "";
const trustProxy = process.env.TRUST_PROXY || "true";
const authEnabled = Boolean(password);
const sessionSecret = suppliedSessionSecret || (authEnabled ? crypto.randomBytes(32).toString("hex") : "");
const production = process.env.NODE_ENV === "production";

function isLocalRequest(req) { return isLoopback(req.socket.remoteAddress || ""); }
async function readGameLibrary() {
  try { const data = JSON.parse(await fs.readFile(gameLibraryFile, "utf8")); return Array.isArray(data) ? data.filter((game) => game && /^[a-z0-9-]{1,48}$/.test(game.id) && typeof game.title === "string" && typeof game.htmlFile === "string" && path.basename(game.htmlFile) === game.htmlFile && /\.html?$/i.test(game.htmlFile) && typeof game.imageUrl === "string" && /^\/game-logos\/[a-zA-Z0-9._-]+\.(?:png|jpe?g|webp)$/i.test(game.imageUrl)) : []; }
  catch { return []; }
}
function publicGame(game) { return { id: game.id, title: game.title, description: game.description || "", imageUrl: game.imageUrl, path: `/games/${game.id}/` }; }
function gameSlug(title) { return title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/g, ""); }
function decodeUpload(value, maxBytes) {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return null;
  const buffer = Buffer.from(value, "base64"); return buffer.length > 0 && buffer.length <= maxBytes ? buffer : null;
}
function hasImageSignature(buffer, mime) {
  if (mime === "image/png") return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mime === "image/jpeg") return buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  if (mime === "image/webp") return buffer.length >= 12 && buffer.toString("ascii",0,4) === "RIFF" && buffer.toString("ascii",8,12) === "WEBP";
  return false;
}
function isLoopback(value) {
  const normalized = value.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "::1" ||
    normalized.startsWith("::ffff:127.") || (net.isIPv4(normalized) && normalized.startsWith("127."));
}

if (password && password.length < 12) {
  throw new Error("FIREMON_ACCESS_PASSWORD must be at least 12 characters.");
}
if (suppliedSessionSecret && Buffer.byteLength(suppliedSessionSecret) < 32) {
  throw new Error("FIREMON_SESSION_SECRET must be at least 32 bytes.");
}
if (publicBind && (!password || !suppliedSessionSecret)) {
  throw new Error("Public binding requires FIREMON_ACCESS_PASSWORD (12+ characters) and FIREMON_SESSION_SECRET (32+ bytes).");
}
if (publicBind && !trustProxy) {
  throw new Error("Public binding requires TRUST_PROXY for the trusted HTTPS reverse proxy in front of this server.");
}

const app = express();
app.disable("x-powered-by");
if (trustProxy) app.set("trust proxy", trustProxy);

app.use((_req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://www.google.com https://*.gstatic.com; font-src 'self' data:; connect-src 'self' ws: wss:; frame-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  if (publicBind && !_isSecureRequest(_req)) {
    res.status(426).type("text/plain").send("HTTPS is required. Connect through the configured TLS reverse proxy.");
    return;
  }
  next();
});

const loginPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Firemon · Sign in</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#030407;color:#f4f2f0;font:15px system-ui,sans-serif}.card{width:min(390px,calc(100% - 32px));padding:30px;border:1px solid #ffffff18;border-radius:18px;background:#111219;box-shadow:0 20px 70px #0009}h1{margin:0 0 8px;font-size:25px;letter-spacing:-.04em}p{margin:0 0 24px;color:#a5a5af;font-size:13px}label{display:block;margin-bottom:7px;color:#c6c4ca;font-size:12px}input{width:100%;height:44px;padding:0 12px;border:1px solid #3b3c46;border-radius:9px;background:#090a0f;color:#fff;font:14px system-ui,sans-serif}button{width:100%;height:42px;margin-top:13px;border:0;border-radius:9px;background:#f07854;color:#21130f;font-weight:700;cursor:pointer}#error{min-height:20px;margin-top:12px;color:#ff937d;font-size:12px}.mark{color:#ff8564}</style></head>
<body><form class="card" id="login"><h1><span class="mark">🔥 Firemon</span> Unblocked</h1><p>This proxy is restricted. Enter the access password to continue.</p><label for="password">Access password</label><input id="password" type="password" autocomplete="current-password" required autofocus><button>Continue</button><div id="error" role="status" aria-live="polite"></div></form>
<script>document.querySelector("#login").addEventListener("submit",async e=>{e.preventDefault();const error=document.querySelector("#error");error.textContent="";try{const r=await fetch("/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:document.querySelector("#password").value})});if(!r.ok)throw new Error(r.status===429?"Too many attempts. Try again later.":"Password not accepted.");location.replace("/")}catch(x){error.textContent=x.message}})</script></body></html>`;

function safeEqual(left, right) {
  const a = crypto.createHash("sha256").update(left).digest();
  const b = crypto.createHash("sha256").update(right).digest();
  return crypto.timingSafeEqual(a, b) && Buffer.byteLength(left) === Buffer.byteLength(right);
}

function signExpiry(expiry) {
  return crypto.createHmac("sha256", sessionSecret).update(expiry).digest("base64url");
}

function cookieValue(req, name) {
  const cookies = req.headers.cookie || "";
  for (const part of cookies.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
}

function hasValidSession(req) {
  if (!authEnabled) return true;
  const value = cookieValue(req, "firemon_session");
  const [expiry, signature, extra] = value.split(".");
  if (!expiry || !signature || extra || !/^\d+$/.test(expiry) || Number(expiry) <= Math.floor(Date.now() / 1000)) return false;
  return safeEqual(signature, signExpiry(expiry));
}

function setSessionCookie(res) {
  const expiry = String(Math.floor(Date.now() / 1000) + 12 * 60 * 60);
  const signature = signExpiry(expiry);
  const secure = publicBind || production ? "; Secure" : "";
  res.setHeader("Set-Cookie", `firemon_session=${expiry}.${signature}; Path=/; Max-Age=43200; HttpOnly; SameSite=Strict${secure}`);
}

const attempts = new Map();
function loginThrottle(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.until <= now) {
    attempts.delete(ip);
    return { blocked: false };
  }
  return { blocked: entry.count >= 5, retryAfter: Math.ceil((entry.until - now) / 1000) };
}
function recordFailure(ip) {
  const now = Date.now();
  let entry = attempts.get(ip);
  if (!entry || entry.until <= now) entry = { count: 0, until: now + 15 * 60 * 1000 };
  entry.count++;
  attempts.set(ip, entry);
  if (attempts.size > 5000) {
    for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
    while (attempts.size > 5000) attempts.delete(attempts.keys().next().value);
  }
}
function _isSecureRequest(req) {
  if (req.socket.encrypted) return true;
  if (!trustProxy) return false;
  return String(req.get?.("x-forwarded-proto") || req.headers["x-forwarded-proto"] || "")
    .split(",")[0].trim().toLowerCase() === "https";
}

app.get("/login", (_req, res) => {
  if (!authEnabled) return res.redirect("/");
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(loginPage);
});

app.post("/auth/login", express.json({ limit: "2kb" }), (req, res) => {
  if (!authEnabled) return res.status(404).end();
  const origin = req.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.get("host")) return res.status(403).json({ error: "Invalid origin." });
    } catch {
      return res.status(403).json({ error: "Invalid origin." });
    }
  }
  const throttle = loginThrottle(req.ip);
  if (throttle.blocked) {
    res.setHeader("Retry-After", String(throttle.retryAfter));
    return res.status(429).json({ error: "Too many attempts." });
  }
  const candidate = typeof req.body?.password === "string" ? req.body.password : "";
  if (!safeEqual(candidate, password)) {
    recordFailure(req.ip);
    return res.status(401).json({ error: "Authentication failed." });
  }
  attempts.delete(req.ip);
  setSessionCookie(res);
  res.setHeader("Cache-Control", "no-store");
  return res.json({ ok: true });
});

app.use((req, res, next) => {
  if (!authEnabled || req.path === "/auth/login" || hasValidSession(req)) return next();
  if (req.path === "/") return res.redirect(302, "/login");
  res.setHeader("Cache-Control", "no-store");
  return res.status(401).type("text/plain").send("Authentication required.");
});

app.use((req, res, next) => {
  if (/(^|\/)\.env(?:\.|\/|$)/i.test(req.path)) return res.status(404).end();
  next();
});

app.use("/scram/", express.static(scramjetPath, { fallthrough: false, dotfiles: "ignore" }));
app.use("/utils/", express.static(dirOf("@mercuryworkshop/scramjet-utils"), { fallthrough: false, dotfiles: "ignore" }));
app.use("/controller/", express.static(dirOf("@mercuryworkshop/scramjet-controller"), { fallthrough: false, dotfiles: "ignore" }));
app.use("/libcurl/", express.static(dirOf("@mercuryworkshop/libcurl-transport"), { fallthrough: false, dotfiles: "ignore" }));
const gameContentPolicy = "default-src 'self' https://cdn.jsdelivr.net; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://cdn.jsdelivr.net; font-src 'self' data: https://cdn.jsdelivr.net; connect-src 'self' ws: wss: https://cdn.jsdelivr.net; media-src 'self' data: blob: https://cdn.jsdelivr.net; frame-src 'self' https://cdn.jsdelivr.net; worker-src 'self' blob: https://cdn.jsdelivr.net; object-src 'none'; base-uri 'self' https://cdn.jsdelivr.net; form-action 'self'; frame-ancestors 'self'";
app.use("/games/", (_req, res, next) => {
  res.removeHeader("X-Frame-Options");
  res.setHeader("Content-Security-Policy", gameContentPolicy);
  res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
  next();
});
function managerAvailable(req) { return !publicBind && isLocalRequest(req); }
app.get("/game-manager/", async (req, res) => {
  if (!managerAvailable(req)) return res.status(404).end();
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(managerFile);
});
app.get("/api/games", async (_req, res) => { res.setHeader("Cache-Control", "no-store"); res.json((await readGameLibrary()).map(publicGame)); });
app.post("/api/games", express.json({ limit: "19mb" }), async (req, res) => {
  if (!managerAvailable(req)) return res.status(404).json({ error: "The local game manager is disabled on public servers." });
  const origin = req.get("origin");
  if (origin) { try { if (new URL(origin).host !== req.get("host")) return res.status(403).json({ error: "Invalid origin." }); } catch { return res.status(403).json({ error: "Invalid origin." }); } }
  const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 60) : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim().slice(0, 140) : "";
  const ext = path.extname(typeof req.body?.htmlFileName === "string" ? req.body.htmlFileName : "").toLowerCase();
  const html = decodeUpload(req.body?.htmlBase64, 8 * 1024 * 1024);
  const image = decodeUpload(req.body?.imageBase64, 5 * 1024 * 1024);
  const imageMime = req.body?.imageMime;
  if (!title) return res.status(400).json({ error: "Enter a game title." });
  if (!['.html', '.htm'].includes(ext) || !html || !/<\s*(?:!doctype\s+html|html|script|canvas|body)\b/i.test(html.toString("utf8", 0, Math.min(html.length, 128 * 1024)))) return res.status(400).json({ error: "Choose a valid HTML game file under 8 MB." });
  if (!image || !hasImageSignature(image, imageMime)) return res.status(400).json({ error: "Choose a PNG, JPG, or WebP image under 5 MB." });
  const id = gameSlug(title);
  if (!id) return res.status(400).json({ error: "The title needs at least one English letter or number." });
  const games = await readGameLibrary();
  if (games.some((game) => game.id === id)) return res.status(409).json({ error: "A game with this title already exists." });
  const imageExt = imageMime === "image/png" ? ".png" : imageMime === "image/jpeg" ? ".jpg" : ".webp";
  const game = { id, title, description, htmlFile: \`\${id}.html\`, imageUrl: \`/game-logos/\${id}\${imageExt}\` };
  const htmlPath = path.join(gamesDir, game.htmlFile), imagePath = path.join(gameLogosDir, \`\${id}\${imageExt}\`);
  let temp = "";
  try {
    await fs.mkdir(gamesDir, { recursive: true }); await fs.mkdir(gameLogosDir, { recursive: true });
    await fs.writeFile(htmlPath, html, { flag: "wx" }); await fs.writeFile(imagePath, image, { flag: "wx" });
    temp = \`\${gameLibraryFile}.\${crypto.randomBytes(6).toString("hex")}.tmp\`;
    await fs.writeFile(temp, \`\${JSON.stringify([...games, game], null, 2)}\n\`, { flag: "wx" });
    await fs.rename(temp, gameLibraryFile);
    return res.status(201).json({ message: \`\${title} was added to Games.\`, game: publicGame(game) });
  } catch (error) {
    await Promise.allSettled([fs.rm(htmlPath, { force: true }), fs.rm(imagePath, { force: true }), temp ? fs.rm(temp, { force: true }) : Promise.resolve()]);
    console.error("Could not save uploaded game:", error.message);
    return res.status(500).json({ error: "Could not save the game. Check that the project folder is writable." });
  }
});
app.get("/games/:id/", async (req, res, next) => {
  const game = (await readGameLibrary()).find((item) => item.id === req.params.id);
  if (!game) return next();
  res.removeHeader("X-Frame-Options"); res.setHeader("Content-Security-Policy", gameContentPolicy); res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
  res.sendFile(path.join(gamesDir, game.htmlFile), (error) => { if (error) next(error); });
});
app.use("/games/", express.static(gamesDir, { dotfiles: "ignore" }));
app.use(express.static(publicDir, { dotfiles: "ignore" }));

app.use((_req, res) => res.status(404).type("text/plain").send("Not found."));

const server = http.createServer(app);
server.on("upgrade", (req, socket, head) => {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  const origin = req.headers.origin;
  let sameOrigin = false;
  try { sameOrigin = Boolean(origin) && new URL(origin).host === req.headers.host; } catch {}
  if (pathname !== "/wisp/" || !sameOrigin || (publicBind && !_isSecureRequest(req)) || !hasValidSession(req)) {
    socket.destroy();
    return;
  }
  req.url = pathname;
  wisp.routeRequest(req, socket, head);
});

server.on("error", (error) => {
  console.error("Firemon failed to start:", error.message);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(\`Firemon Unblocked listening on \${host}:\${port}\`);
  if (authEnabled) console.log("Server-side password protection is enabled.");
  if (publicBind) console.log("Public binding is protected by password authentication and a trusted HTTPS proxy.");
});
