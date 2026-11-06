import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const port = 8790;
const uiFile = path.join(here, "game-manager.html");
const libraryFile = path.join(root, "game-library.json");
const gamesDir = path.join(root, "public", "games");
const logosDir = path.join(root, "public", "game-logos");

function safeEqualHost(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
function slugify(value) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/g, "");
}
async function readGames() {
  try {
    const games = JSON.parse(await fs.readFile(libraryFile, "utf8"));
    return Array.isArray(games) ? games.filter((game) => game && /^[a-z0-9-]{1,48}$/.test(game.id) && typeof game.title === "string" && typeof game.htmlFile === "string" && path.basename(game.htmlFile) === game.htmlFile && typeof game.imageUrl === "string") : [];
  } catch { return []; }
}
function validBase64(value, maxBytes) {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return null;
  const data = Buffer.from(value, "base64");
  return data.length > 0 && data.length <= maxBytes ? data : null;
}
function validImage(data, mime) {
  if (mime === "image/png") return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mime === "image/jpeg") return data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255;
  if (mime === "image/webp") return data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP";
  return false;
}
function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) { reject(Object.assign(new Error("Upload is too large."), { status: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(body);
}
async function saveGame(body) {
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 60) : "";
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 140) : "";
  const ext = path.extname(typeof body.htmlFileName === "string" ? body.htmlFileName : "").toLowerCase();
  const html = validBase64(body.htmlBase64, 8 * 1024 * 1024);
  const image = validBase64(body.imageBase64, 5 * 1024 * 1024);
  const imageMime = body.imageMime;
  if (!title) throw Object.assign(new Error("Enter a game title."), { status: 400 });
  if (!new Set([".html", ".htm"]).has(ext) || !html || !/<\s*(?:!doctype\s+html|html|script|canvas|body)\b/i.test(html.toString("utf8", 0, Math.min(html.length, 128 * 1024)))) throw Object.assign(new Error("Choose a valid HTML game file under 8 MB."), { status: 400 });
  if (!image || !validImage(image, imageMime)) throw Object.assign(new Error("Choose a PNG, JPG, or WebP image under 5 MB."), { status: 400 });
  const id = slugify(title);
  if (!id) throw Object.assign(new Error("The title needs at least one English letter or number."), { status: 400 });
  const games = await readGames();
  if (games.some((game) => game.id === id)) throw Object.assign(new Error("A game with this title already exists."), { status: 409 });
  const imageExt = imageMime === "image/png" ? ".png" : imageMime === "image/jpeg" ? ".jpg" : ".webp";
  const game = { id, title, description, htmlFile: `${id}.html`, imageUrl: `/game-logos/${id}${imageExt}` };
  const htmlPath = path.join(gamesDir, game.htmlFile);
  const imagePath = path.join(logosDir, `${id}${imageExt}`);
  let temp = "";
  try {
    await fs.mkdir(gamesDir, { recursive: true }); await fs.mkdir(logosDir, { recursive: true });
    await fs.writeFile(htmlPath, html, { flag: "wx" }); await fs.writeFile(imagePath, image, { flag: "wx" });
    temp = `${libraryFile}.${crypto.randomBytes(6).toString("hex")}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify([...games, game], null, 2)}\n`, { flag: "wx" });
    await fs.rename(temp, libraryFile);
  } catch (error) {
    await Promise.allSettled([fs.rm(htmlPath, { force: true }), fs.rm(imagePath, { force: true }), temp ? fs.rm(temp, { force: true }) : Promise.resolve()]);
    throw Object.assign(new Error("Could not save files in the project folder. Check folder permissions."), { status: 500 });
  }
  return { id: game.id, title: game.title, description: game.description, imageUrl: game.imageUrl, path: `/games/${game.id}/` };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (!safeEqualHost(req)) return sendJson(res, 403, { error: "Invalid request origin." });
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/game-manager/")) {
    try {
      const html = await fs.readFile(uiFile);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": html.length, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
      return res.end(html);
    } catch { return sendJson(res, 500, { error: "Could not read Game Manager UI." }); }
  }
  if (req.method === "GET" && url.pathname === "/api/games") {
    const games = (await readGames()).map((game) => ({ id: game.id, title: game.title, description: game.description || "", imageUrl: game.imageUrl }));
    return sendJson(res, 200, games);
  }
  if (req.method === "POST" && url.pathname === "/api/games") {
    try {
      const body = JSON.parse(await readBody(req, 19 * 1024 * 1024));
      const game = await saveGame(body);
      return sendJson(res, 201, { message: `${game.title} was added to the project. Restart Firemon to load it.`, game });
    } catch (error) { return sendJson(res, error.status || 400, { error: error.status ? error.message : "Could not read the upload. Please retry." }); }
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); res.end("Not found.");
});
server.on("error", (error) => {
  console.error(`Game Manager could not start: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
  console.log(`Firemon Game Manager listening at http://127.0.0.1:${port}/`);
  console.log("This tool only edits the local project; it does not start the proxy server.");
});
