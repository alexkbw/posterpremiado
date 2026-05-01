import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");
const host = process.env.HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "4173", 10);

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
]);

function resolveMimeType(filePath) {
  return MIME_TYPES.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);

  response.writeHead(statusCode, {
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(body);
}

function setCommonHeaders(response) {
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "SAMEORIGIN");
}

function getAssetCacheHeader(filePath) {
  const normalized = filePath.replace(/\\/g, "/");

  if (normalized.includes("/assets/")) {
    return "public, max-age=31536000, immutable";
  }

  return "no-cache";
}

function getSafeFilePath(requestPathname) {
  const sanitizedPath = decodeURIComponent(requestPathname.split("?")[0]);
  const relativePath = sanitizedPath === "/" ? "/index.html" : sanitizedPath;
  const absolutePath = path.normalize(path.join(distDir, relativePath));

  if (!absolutePath.startsWith(distDir)) {
    return null;
  }

  return absolutePath;
}

async function readSpaIndex() {
  return readFile(path.join(distDir, "index.html"));
}

if (!existsSync(distDir)) {
  console.error("A pasta dist nao existe. Rode `npm run build` antes de iniciar o servidor.");
  process.exit(1);
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 400, { error: "Invalid request." });
    return;
  }

  setCommonHeaders(response);

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  const requestedFilePath = getSafeFilePath(request.url);

  if (!requestedFilePath) {
    sendJson(response, 403, { error: "Forbidden." });
    return;
  }

  let targetPath = requestedFilePath;

  try {
    const fileStats = statSync(targetPath);

    if (fileStats.isDirectory()) {
      targetPath = path.join(targetPath, "index.html");
    }
  } catch {
    targetPath = path.join(distDir, "index.html");
  }

  if (!existsSync(targetPath)) {
    targetPath = path.join(distDir, "index.html");
  }

  try {
    const fileStats = statSync(targetPath);
    const mimeType = resolveMimeType(targetPath);

    response.statusCode = 200;
    response.setHeader("Cache-Control", getAssetCacheHeader(targetPath));
    response.setHeader("Content-Length", fileStats.size);
    response.setHeader("Content-Type", mimeType);

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    createReadStream(targetPath).pipe(response);
  } catch (error) {
    try {
      const indexBody = await readSpaIndex();

      response.writeHead(200, {
        "Cache-Control": "no-cache",
        "Content-Length": indexBody.byteLength,
        "Content-Type": "text/html; charset=utf-8",
      });
      response.end(indexBody);
    } catch {
      console.error("Falha ao servir o build de producao.", error);
      sendJson(response, 500, { error: "Internal server error." });
    }
  }
});

server.listen(port, host, () => {
  console.log(`Premio Semanal pronto em http://${host}:${port}`);
});

function shutdown(signal) {
  console.log(`Recebido ${signal}. Encerrando servidor...`);
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
