// server/server.js
// ------------------------------------------------------------
// Local server for Sports Command Center.
// Responsibilities:
// 1) Proxy NCAA API requests to avoid browser CORS issues
// 2) Serve dashboard and settings static files
// 3) Save/load settings overrides for phone-based tuning
// ------------------------------------------------------------

const fs = require("fs/promises");
const http = require("http");
const https = require("https");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const NCAA_API_BASE = "https://ncaa-api.henrygd.me";
const PROJECT_ROOT = path.resolve(__dirname, "..");
const OVERRIDES_FILE_PATH = path.join(__dirname, "settings.overrides.json");
const LOCAL_LOGOS_ROOT = path.join(PROJECT_ROOT, "assets", "logos");
const LOGO_CATALOG_TTL_MS = 60 * 1000;

let logoCatalogCache = null;
let logoCatalogLoadedAt = 0;

function setCorsHeaders(res) {
  // Dev-friendly CORS so dashboard/settings pages can call this server.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  const contentTypeMap = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
  };

  return contentTypeMap[extension] || "application/octet-stream";
}

function isSafeScoreboardPath(pathname) {
  return /^[a-zA-Z0-9/_-]+$/.test(pathname);
}

function isSafeRankingsPath(pathname) {
  return /^[a-zA-Z0-9/_-]+$/.test(pathname);
}

function isSafeStaticPath(pathname) {
  const decodedPath = decodePathSafely(pathname);

  if (!decodedPath || decodedPath.includes("..")) {
    return false;
  }

  const allowedTopLevel = new Set(["/", "/index.html", "/settings", "/settings.html"]);

  if (allowedTopLevel.has(decodedPath)) {
    return true;
  }

  return decodedPath.startsWith("/src/") || decodedPath.startsWith("/assets/");
}

function normalizeStaticPath(pathname) {
  const decodedPath = decodePathSafely(pathname);

  if (decodedPath === "/") {
    return "/index.html";
  }

  if (decodedPath === "/settings") {
    return "/settings.html";
  }

  return decodedPath;
}

async function serveStaticFile(res, pathname) {
  const normalizedPath = normalizeStaticPath(pathname);
  const safeRelativePath = normalizedPath.startsWith("/")
    ? normalizedPath.slice(1)
    : normalizedPath;

  const filePath = path.resolve(PROJECT_ROOT, safeRelativePath);
  const projectRootPrefix = `${PROJECT_ROOT}${path.sep}`;

  if (filePath !== PROJECT_ROOT && !filePath.startsWith(projectRootPrefix)) {
    sendJson(res, 403, { error: "Forbidden path." });
    return;
  }

  try {
    const fileBuffer = await fs.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": getContentType(filePath),
      "Cache-Control": "no-store",
      "Content-Length": fileBuffer.length,
    });
    res.end(fileBuffer);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(res, 404, { error: "File not found." });
      return;
    }

    sendJson(res, 500, { error: "Failed to read file.", details: error.message });
  }
}

function decodePathSafely(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch (error) {
    return pathname;
  }
}

function fetchNcaaData(pathAndQuery) {
  const url = `${NCAA_API_BASE}${pathAndQuery}`;

  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        const chunks = [];

        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");

          resolve({
            statusCode: response.statusCode || 502,
            contentType: response.headers["content-type"] || "application/json",
            body,
          });
        });
      })
      .on("error", (error) => reject(error));
  });
}

async function readRequestJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString("utf8");

      // Basic safety limit (1 MB)
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });

    req.on("error", (error) => reject(error));
  });
}

async function readOverridesFile() {
  try {
    const raw = await fs.readFile(OVERRIDES_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : {};
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function writeOverridesFile(overrides) {
  const serialized = JSON.stringify(overrides, null, 2);
  await fs.writeFile(OVERRIDES_FILE_PATH, serialized, "utf8");
}

async function resetOverridesFile() {
  try {
    await fs.unlink(OVERRIDES_FILE_PATH);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

function normalizeLogoName(text) {
  const clean = String(text ?? "")
    .toLowerCase()
    .replace(/[_'.’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  return {
    words: clean,
    compact: clean.replace(/\s+/g, ""),
  };
}

async function listFilesRecursive(rootDirectory) {
  const results = [];

  async function walk(currentDirectory) {
    const entries = await fs.readdir(currentDirectory, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(currentDirectory, entry.name);

      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      results.push(absolutePath);
    }
  }

  await walk(rootDirectory);
  return results;
}

function toPublicPathFromAbsolute(absolutePath, rootDirectory) {
  const relativePath = path.relative(rootDirectory, absolutePath).split(path.sep).join("/");
  const encodedRelativePath = relativePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `/assets/logos/${encodedRelativePath}`;
}

async function buildLocalLogoCatalog() {
  try {
    const files = await listFilesRecursive(LOCAL_LOGOS_ROOT);

    const logos = files
      .filter((filePath) => path.extname(filePath).toLowerCase() === ".svg")
      .map((filePath) => {
        const fileName = path.basename(filePath);
        const baseName = path.basename(filePath, ".svg");
        const normalized = normalizeLogoName(baseName);

        return {
          fileName,
          baseName,
          words: normalized.words,
          compact: normalized.compact,
          url: toPublicPathFromAbsolute(filePath, LOCAL_LOGOS_ROOT),
        };
      })
      .sort((a, b) => a.baseName.localeCompare(b.baseName));

    return logos;
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function getLocalLogoCatalog() {
  const now = Date.now();
  const cacheIsFresh = logoCatalogCache && now - logoCatalogLoadedAt < LOGO_CATALOG_TTL_MS;

  if (cacheIsFresh) {
    return logoCatalogCache;
  }

  const freshCatalog = await buildLocalLogoCatalog();
  logoCatalogCache = freshCatalog;
  logoCatalogLoadedAt = now;
  return freshCatalog;
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const requestUrl = new URL(req.url, `http://localhost:${PORT}`);
  const { pathname, search } = requestUrl;

  if (pathname === "/health" && req.method === "GET") {
    sendJson(res, 200, {
      ok: true,
      message: "Server is running.",
      date: new Date().toISOString(),
    });
    return;
  }

  if (pathname.startsWith("/api/scoreboard/") && req.method === "GET") {
    const scoreboardPath = pathname.replace("/api/scoreboard/", "");

    if (!scoreboardPath || !isSafeScoreboardPath(scoreboardPath)) {
      sendJson(res, 400, { error: "Invalid scoreboard path." });
      return;
    }

    const ncaaPath = `/scoreboard/${scoreboardPath}${search}`;

    try {
      const result = await fetchNcaaData(ncaaPath);
      res.writeHead(result.statusCode, {
        "Content-Type": result.contentType,
        "Cache-Control": "no-store",
      });
      res.end(result.body);
    } catch (error) {
      sendJson(res, 502, {
        error: "Failed to fetch data from NCAA API.",
        details: error.message,
      });
    }

    return;
  }

  if (pathname.startsWith("/api/rankings/") && req.method === "GET") {
    const rankingsPath = pathname.replace("/api/rankings/", "");

    if (!rankingsPath || !isSafeRankingsPath(rankingsPath)) {
      sendJson(res, 400, { error: "Invalid rankings path." });
      return;
    }

    const ncaaPath = `/rankings/${rankingsPath}${search}`;

    try {
      const result = await fetchNcaaData(ncaaPath);
      res.writeHead(result.statusCode, {
        "Content-Type": result.contentType,
        "Cache-Control": "no-store",
      });
      res.end(result.body);
    } catch (error) {
      sendJson(res, 502, {
        error: "Failed to fetch rankings from NCAA API.",
        details: error.message,
      });
    }

    return;
  }

  if (pathname.startsWith("/api/standings/") && req.method === "GET") {
    const standingsPath = pathname.replace("/api/standings/", "");

    if (!standingsPath || !isSafeScoreboardPath(standingsPath)) {
      sendJson(res, 400, { error: "Invalid standings path." });
      return;
    }

    const ncaaPath = `/standings/${standingsPath}${search}`;

    try {
      const result = await fetchNcaaData(ncaaPath);
      res.writeHead(result.statusCode, {
        "Content-Type": result.contentType,
        "Cache-Control": "no-store",
      });
      res.end(result.body);
    } catch (error) {
      sendJson(res, 502, {
        error: "Failed to fetch standings from NCAA API.",
        details: error.message,
      });
    }

    return;
  }

  if (pathname === "/settings/config" && req.method === "GET") {
    try {
      const overrides = await readOverridesFile();
      sendJson(res, 200, { overrides });
    } catch (error) {
      sendJson(res, 500, {
        error: "Failed to load saved settings.",
        details: error.message,
      });
    }

    return;
  }

  if (pathname === "/settings/overrides" && req.method === "GET") {
    try {
      const overrides = await readOverridesFile();
      sendJson(res, 200, { overrides });
    } catch (error) {
      sendJson(res, 500, {
        error: "Failed to read override file.",
        details: error.message,
      });
    }

    return;
  }

  if (pathname === "/settings/overrides" && req.method === "POST") {
    try {
      const payload = await readRequestJson(req);

      if (!isPlainObject(payload)) {
        sendJson(res, 400, { error: "Override payload must be a JSON object." });
        return;
      }

      await writeOverridesFile(payload);
      sendJson(res, 200, { ok: true, overrides: payload });
    } catch (error) {
      sendJson(res, 400, {
        error: "Failed to save overrides.",
        details: error.message,
      });
    }

    return;
  }

  if (pathname === "/settings/reset" && req.method === "POST") {
    try {
      await resetOverridesFile();
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 500, {
        error: "Failed to reset overrides.",
        details: error.message,
      });
    }

    return;
  }

  if (pathname === "/logos/catalog" && req.method === "GET") {
    try {
      const logos = await getLocalLogoCatalog();
      sendJson(res, 200, { logos, count: logos.length });
    } catch (error) {
      sendJson(res, 500, {
        error: "Failed to build local logo catalog.",
        details: error.message,
      });
    }

    return;
  }

  if (req.method === "GET" && isSafeStaticPath(pathname)) {
    await serveStaticFile(res, pathname);
    return;
  }

  sendJson(res, 404, { error: "Not found." });
});

server.listen(PORT, HOST, () => {
  console.log(`Sports Command Center server running at http://localhost:${PORT}`);
  console.log("Dashboard: http://localhost:3000/");
  console.log("Settings: http://localhost:3000/settings");
  console.log("Health: http://localhost:3000/health");
});
