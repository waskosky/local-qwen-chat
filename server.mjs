import http from "node:http";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const HOST = process.env.CHAT_HOST || "127.0.0.1";
const PORT = Number(process.env.CHAT_PORT || 8090);
const UPSTREAM_HOST = process.env.QWEN_HOST || "127.0.0.1";
const UPSTREAM_PORT = Number(process.env.QWEN_PORT || 8080);
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_CONTROL_REQUEST_BYTES = 4 * 1024;
const MODEL_STATE_DIR = process.env.MODEL_STATE_DIR || "/var/lib/local-qwen-chat";
const MODEL_STATE_FILE = path.join(MODEL_STATE_DIR, "active-model");
const SYSTEMCTL = process.env.SYSTEMCTL_BIN || "/usr/bin/systemctl";
const execFileAsync = promisify(execFile);

const MODEL_CONFIGS = Object.freeze({
  q4: Object.freeze({
    key: "q4",
    id: "qwen3.6-27b-q4",
    label: "Qwen3.6 27B",
    quantization: "Q4_K_M",
    unit: "qwen36-q4.service",
    modelPath: process.env.QWEN_Q4_MODEL || "/var/lib/local-qwen-chat/models/Qwen_Qwen3.6-27B-Q4_K_M.gguf",
    contextWindow: 8192,
    parameterCount: 27_320_697_856,
    sizeBytes: 17_984_872_960,
    description: "Faster · recommended default",
  }),
  q6: Object.freeze({
    key: "q6",
    id: "qwen3.6-27b-q6",
    label: "Qwen3.6 27B",
    quantization: "Q6_K_L",
    unit: "qwen36-q6.service",
    modelPath: process.env.QWEN_Q6_MODEL || "/var/lib/local-qwen-chat/models/Qwen_Qwen3.6-27B-Q6_K_L.gguf",
    contextWindow: 8192,
    parameterCount: 27_320_697_856,
    sizeBytes: 24_291_299_840,
    description: "Higher fidelity · slower",
  }),
});

let switchTask = null;
let transition = null;

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
]);

const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function sendJson(res, statusCode, value, extraHeaders = {}) {
  const body = JSON.stringify(value);
  res.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

function checkModelHealth() {
  return new Promise((resolve) => {
    const request = http.get(
      {
        hostname: UPSTREAM_HOST,
        port: UPSTREAM_PORT,
        path: "/health",
        timeout: 1200,
        headers: { Accept: "application/json" },
      },
      (response) => {
        response.resume();
        resolve(response.statusCode === 200 ? "ready" : "loading");
      },
    );
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve("offline"));
  });
}

function requestModelCatalog() {
  return new Promise((resolve) => {
    const request = http.get(
      {
        hostname: UPSTREAM_HOST,
        port: UPSTREAM_PORT,
        path: "/v1/models",
        timeout: 1500,
        headers: { Accept: "application/json" },
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          if (body.length <= 1024 * 1024) body += chunk;
        });
        response.on("end", () => {
          if (response.statusCode !== 200 || body.length > 1024 * 1024) {
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
      },
    );
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(null));
  });
}

async function getUnitState(unit) {
  try {
    const { stdout } = await execFileAsync(
      SYSTEMCTL,
      [
        "show",
        unit,
        "--no-pager",
        "--property=ActiveState",
        "--property=SubState",
        "--property=MainPID",
        "--property=NRestarts",
      ],
      { timeout: 5000, maxBuffer: 64 * 1024 },
    );
    const fields = Object.fromEntries(
      stdout.trim().split("\n").filter(Boolean).map((line) => {
        const index = line.indexOf("=");
        return index === -1 ? [line, ""] : [line.slice(0, index), line.slice(index + 1)];
      }),
    );
    return {
      activeState: fields.ActiveState || "unknown",
      subState: fields.SubState || "unknown",
      mainPid: Number(fields.MainPID) || 0,
      restarts: Number(fields.NRestarts) || 0,
    };
  } catch {
    return { activeState: "unknown", subState: "unknown", mainPid: 0, restarts: 0 };
  }
}

async function readSelectedModel() {
  try {
    const selected = (await readFile(MODEL_STATE_FILE, "utf8")).trim();
    return MODEL_CONFIGS[selected] ? selected : "q4";
  } catch {
    return "q4";
  }
}

async function writeSelectedModel(key) {
  await mkdir(MODEL_STATE_DIR, { recursive: true });
  const temporaryFile = `${MODEL_STATE_FILE}.${process.pid}.tmp`;
  await writeFile(temporaryFile, `${key}\n`, { encoding: "utf8", mode: 0o644 });
  await rename(temporaryFile, MODEL_STATE_FILE);
}

async function modelIsInstalled(config) {
  try {
    const file = await stat(config.modelPath);
    return file.isFile() && file.size > 1024 * 1024;
  } catch {
    return false;
  }
}

function publicModel(config, unitState, servingModel, installed) {
  let status = installed ? "stopped" : "unavailable";
  if (["activating", "active"].includes(unitState.activeState)) status = "loading";
  if (unitState.activeState === "deactivating") status = "stopping";
  if (unitState.activeState === "failed") status = "error";
  if (unitState.activeState === "active" && servingModel === config.key) status = "ready";
  return {
    key: config.key,
    id: config.id,
    label: config.label,
    quantization: config.quantization,
    contextWindow: config.contextWindow,
    parameterCount: config.parameterCount,
    sizeBytes: config.sizeBytes,
    description: config.description,
    installed,
    status,
    process: {
      activeState: unitState.activeState,
      subState: unitState.subState,
      pid: unitState.mainPid,
      restarts: unitState.restarts,
    },
  };
}

async function getModelsStatus() {
  const [selectedModel, q4State, q6State, q4Installed, q6Installed, catalog] = await Promise.all([
    readSelectedModel(),
    getUnitState(MODEL_CONFIGS.q4.unit),
    getUnitState(MODEL_CONFIGS.q6.unit),
    modelIsInstalled(MODEL_CONFIGS.q4),
    modelIsInstalled(MODEL_CONFIGS.q6),
    requestModelCatalog(),
  ]);
  const catalogModel = catalog?.data?.[0] || null;
  const catalogId = catalogModel?.id || catalogModel?.model || null;
  const servingModel = Object.values(MODEL_CONFIGS).find((config) => config.id === catalogId)?.key || null;
  const activeModel = [
    ["q4", q4State],
    ["q6", q6State],
  ].find(([, state]) => ["activating", "active"].includes(state.activeState))?.[0] || null;
  const models = [
    publicModel(MODEL_CONFIGS.q4, q4State, servingModel, q4Installed),
    publicModel(MODEL_CONFIGS.q6, q6State, servingModel, q6Installed),
  ];

  const readyTarget = transition && models.find((model) => model.key === transition.target)?.status === "ready";
  if (readyTarget) transition = null;

  return {
    selectedModel,
    activeModel,
    servingModel,
    transition,
    models,
  };
}

async function readJsonBody(req) {
  const declaredSize = Number(req.headers["content-length"] || 0);
  if (declaredSize > MAX_CONTROL_REQUEST_BYTES) throw new Error("Request is too large");
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_CONTROL_REQUEST_BYTES) throw new Error("Request is too large");
  }
  try {
    return JSON.parse(body || "{}");
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

function safeControlError(error) {
  if (error?.killed) return "The model service switch timed out.";
  return String(error?.message || "The model service could not be switched.").split("\n")[0].slice(0, 240);
}

async function switchModel(key) {
  const config = MODEL_CONFIGS[key];
  if (!config) {
    const error = new Error("Unknown model. Choose q4 or q6.");
    error.statusCode = 400;
    throw error;
  }
  if (!await modelIsInstalled(config)) {
    const error = new Error(`${config.quantization} is not installed. Re-run the installer with --models both.`);
    error.statusCode = 409;
    throw error;
  }
  if (switchTask) {
    const error = new Error("A model switch is already in progress.");
    error.statusCode = 409;
    throw error;
  }

  const before = await getModelsStatus();
  if (before.activeModel === key && before.servingModel === key) {
    transition = null;
    await writeSelectedModel(key);
    return getModelsStatus();
  }

  transition = {
    from: before.activeModel || before.servingModel,
    target: key,
    phase: "switching",
    startedAt: new Date().toISOString(),
  };
  switchTask = (async () => {
    const other = key === "q4" ? MODEL_CONFIGS.q6 : MODEL_CONFIGS.q4;
    await execFileAsync(SYSTEMCTL, ["stop", other.unit], {
      timeout: 60_000,
      maxBuffer: 256 * 1024,
    });
    await execFileAsync(SYSTEMCTL, ["start", config.unit], {
      timeout: 60_000,
      maxBuffer: 256 * 1024,
    });
    await writeSelectedModel(key);
    return getModelsStatus();
  })();

  try {
    return await switchTask;
  } catch (error) {
    const message = safeControlError(error);
    transition = { ...transition, phase: "error", error: message };
    const wrapped = new Error(message);
    wrapped.statusCode = 500;
    throw wrapped;
  } finally {
    switchTask = null;
  }
}

async function handleModelsApi(req, res) {
  if (req.method === "GET") {
    sendJson(res, 200, await getModelsStatus());
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: { message: "Method not allowed" } }, { Allow: "GET, POST" });
    return;
  }
  if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    sendJson(res, 415, { error: { message: "Content-Type must be application/json" } });
    return;
  }
  if (req.headers["x-local-qwen-action"] !== "switch-model") {
    sendJson(res, 403, { error: { message: "Missing model-switch authorization header" } });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const result = await switchModel(String(body.model || "").toLowerCase());
    sendJson(res, 202, result);
  } catch (error) {
    sendJson(res, error.statusCode || (error.message === "Request is too large" ? 413 : 400), {
      error: { message: safeControlError(error) },
    });
  }
}

async function serveStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: { message: "Method not allowed" } }, { Allow: "GET, HEAD" });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    sendJson(res, 400, { error: { message: "Invalid path" } });
    return;
  }

  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(PUBLIC_DIR, relativePath);
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    sendJson(res, 403, { error: { message: "Forbidden" } });
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("not a file");
    const headers = {
      ...SECURITY_HEADERS,
      "Cache-Control": relativePath === "index.html" ? "no-cache" : "public, max-age=3600",
      "Content-Type": MIME_TYPES.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
      "Content-Length": fileStat.size,
    };
    res.writeHead(200, headers);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(filePath).pipe(res);
  } catch {
    sendJson(res, 404, { error: { message: "Not found" } });
  }
}

function proxyToModel(req, res, url) {
  if (!new Set(["GET", "POST"]).has(req.method)) {
    sendJson(res, 405, { error: { message: "Method not allowed" } }, { Allow: "GET, POST" });
    return;
  }

  const allowedPaths = new Set(["/v1/chat/completions", "/v1/models"]);
  if (!allowedPaths.has(url.pathname)) {
    sendJson(res, 404, { error: { message: "API route not found" } });
    return;
  }

  const declaredSize = Number(req.headers["content-length"] || 0);
  if (declaredSize > MAX_REQUEST_BYTES) {
    sendJson(res, 413, { error: { message: "Request is too large" } });
    return;
  }

  const headers = { ...req.headers };
  for (const name of ["connection", "host", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]) {
    delete headers[name];
  }
  headers.host = `${UPSTREAM_HOST}:${UPSTREAM_PORT}`;
  headers["accept-encoding"] = "identity";

  let received = 0;
  const upstream = http.request(
    {
      hostname: UPSTREAM_HOST,
      port: UPSTREAM_PORT,
      method: req.method,
      path: `${url.pathname}${url.search}`,
      headers,
    },
    (upstreamResponse) => {
      const responseHeaders = { ...upstreamResponse.headers, ...SECURITY_HEADERS };
      for (const name of ["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]) {
        delete responseHeaders[name];
      }
      responseHeaders["Cache-Control"] = "no-store";
      res.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
      upstreamResponse.pipe(res);
    },
  );

  upstream.on("error", (error) => {
    if (!res.headersSent) {
      sendJson(res, 502, {
        error: {
          message: error.code === "ECONNREFUSED"
            ? "The local Qwen model is still starting or is offline. Try again shortly."
            : "The local model connection failed.",
        },
      });
    } else {
      res.destroy(error);
    }
  });

  req.on("data", (chunk) => {
    received += chunk.length;
    if (received > MAX_REQUEST_BYTES) upstream.destroy(new Error("request too large"));
  });
  req.on("aborted", () => upstream.destroy());
  res.on("close", () => {
    if (!res.writableEnded) upstream.destroy();
  });
  req.pipe(upstream);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/healthz") {
    const model = await checkModelHealth();
    sendJson(res, 200, { app: "ready", model });
    return;
  }

  if (url.pathname === "/api/models") {
    await handleModelsApi(req, res);
    return;
  }

  if (url.pathname.startsWith("/v1/")) {
    proxyToModel(req, res, url);
    return;
  }

  await serveStatic(req, res, url);
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;

server.listen(PORT, HOST, () => {
  process.stdout.write(`Local Qwen chat listening on http://${HOST}:${PORT}\n`);
});
