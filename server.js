// JARVIS MIDAS — servidor gratuito con Google Gemini
// Node 18+ · sin dependencias.
// La clave de Gemini vive SOLO aquí (variable de entorno). La web se identifica con un token propio.
//
// GET  /health                → { ok, model, keyConfigured, search }
// POST /chat  (Authorization: Bearer <JARVIS_DEVICE_TOKEN>)
//      body:  { system, messages:[{role:"user"|"assistant", content}], image?:{media_type,data}, timezone }
//      reply: { text, sources:[{title,url}] }
//
// Herramientas que Gemini puede usar:
//   buscar_web  → Tavily (gratis 1.000/mes con TAVILY_API_KEY) o Wikipedia si no hay clave
//   tiempo      → Open-Meteo (gratis, sin clave)
//   calcular    → calculadora exacta (calc.js)

"use strict";
const http = require("node:http");
const crypto = require("node:crypto");
const { calcEval } = require("./calc");

const PORT = Number(process.env.PORT || 8787);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
// Si el modelo principal está saturado (503) o no disponible, se prueba con estos, en orden.
const FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS || "gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash-lite")
  .split(",").map((m) => m.trim()).filter((m) => m && m !== MODEL);
const GEMINI_BASE = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com";
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";
const TAVILY_BASE = process.env.TAVILY_BASE_URL || "https://api.tavily.com";
const WIKI_BASE = process.env.WIKI_BASE_URL || "https://es.wikipedia.org";
const GEO_BASE = process.env.GEO_BASE_URL || "https://geocoding-api.open-meteo.com";
const METEO_BASE = process.env.METEO_BASE_URL || "https://api.open-meteo.com";
const DEVICE_TOKEN = process.env.JARVIS_DEVICE_TOKEN || "";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);

if (!GEMINI_API_KEY) console.warn("[midas] Falta GEMINI_API_KEY: /chat devolverá 503.");
if (DEVICE_TOKEN.length < 24) console.warn("[midas] JARVIS_DEVICE_TOKEN falta o tiene menos de 24 caracteres: se rechazará todo.");
if (!TAVILY_API_KEY) console.warn("[midas] Sin TAVILY_API_KEY: la búsqueda usará solo Wikipedia (sin noticias de actualidad).");

// ---------------------------------------------------------------- herramientas

const TOOLS = [{
  functionDeclarations: [
    {
      name: "buscar_web",
      description: "Busca en internet información actual o que pueda haber cambiado: noticias, resultados deportivos, clasificaciones, precios, estrenos, horarios, quién ocupa un cargo, datos recientes. Devuelve resultados con título, url y extracto.",
      parameters: {
        type: "object",
        properties: {
          consulta: { type: "string", description: "Qué buscar, en pocas palabras clave." },
          tema: { type: "string", enum: ["general", "noticias"], description: "'noticias' para actualidad reciente." },
          periodo: { type: "string", enum: ["dia", "semana", "mes", "año"], description: "Limita a resultados recientes." },
        },
        required: ["consulta"],
      },
    },
    {
      name: "tiempo",
      description: "Tiempo actual y previsión para un lugar (hasta 7 días).",
      parameters: {
        type: "object",
        properties: {
          lugar: { type: "string", description: "Ciudad o pueblo, p. ej. 'Sevilla' o 'Jerez de la Frontera'." },
          dias: { type: "integer", description: "Días de previsión, de 1 a 7." },
        },
        required: ["lugar"],
      },
    },
    {
      name: "calcular",
      description: "Calculadora exacta. Pasa una expresión matemática: '21% de 350', '(1+0.035/12)^(12*20)', 'sqrt(2)*pi', '7!'.",
      parameters: { type: "object", properties: { expresion: { type: "string" } }, required: ["expresion"] },
    },
  ],
}];

const PREAMBLE = `Herramientas disponibles:
- buscar_web: úsala SIEMPRE que la respuesta dependa de algo actual o que pueda haber cambiado (noticias, deportes, precios, estrenos, quién ocupa un cargo). No inventes datos de actualidad: si no encuentras nada fiable, dilo. Resume con tus palabras y menciona la fuente principal en una frase; no leas URLs.
- tiempo: para el tiempo o la previsión. Si el usuario no dice el lugar y no lo sabes por la memoria, pregúntaselo.
- calcular: para cualquier cálculo no trivial; da el resultado exacto que devuelve.
Tu respuesta FINAL debe ser únicamente el objeto JSON que piden las instrucciones siguientes, sin texto antes ni después y sin bloques de código.`;

const sources = () => {
  const list = [];
  return {
    add(title, url) { if (url && list.length < 6 && !list.some((s) => s.url === url)) list.push({ title: String(title || url).slice(0, 140), url }); },
    list,
  };
};

async function getJson(url, opts = {}, ms = 9000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal, headers: { "user-agent": "JarvisMidas/1.0", ...(opts.headers || {}) } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function buscarWeb({ consulta, tema, periodo }, src) {
  const q = String(consulta || "").slice(0, 300).trim();
  if (!q) return { error: "consulta vacía" };
  if (TAVILY_API_KEY) {
    try {
      const body = { query: q, max_results: 5, include_answer: "basic", search_depth: "basic", topic: tema === "noticias" ? "news" : "general" };
      const tr = { dia: "day", semana: "week", mes: "month", "año": "year" }[periodo];
      if (tr) body.time_range = tr;
      const j = await getJson(`${TAVILY_BASE}/search`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${TAVILY_API_KEY}` },
        body: JSON.stringify(body),
      });
      const results = (j.results || []).slice(0, 5).map((r) => { src.add(r.title, r.url); return { titulo: r.title, url: r.url, extracto: String(r.content || "").slice(0, 600) }; });
      return { fuente: "búsqueda web", resumen: j.answer || null, resultados: results };
    } catch (e) {
      console.error("[midas] tavily", e.message);
      // sigue con Wikipedia
    }
  }
  try {
    const s = await getJson(`${WIKI_BASE}/w/api.php?action=query&list=search&format=json&srlimit=3&utf8=1&srsearch=${encodeURIComponent(q)}`);
    const hits = (s.query && s.query.search) || [];
    const results = [];
    for (const h of hits.slice(0, 2)) {
      try {
        const p = await getJson(`${WIKI_BASE}/api/rest_v1/page/summary/${encodeURIComponent(h.title.replace(/ /g, "_"))}`);
        const url = (p.content_urls && p.content_urls.desktop && p.content_urls.desktop.page) || `${WIKI_BASE}/wiki/${encodeURIComponent(h.title)}`;
        src.add(`Wikipedia: ${h.title}`, url);
        results.push({ titulo: h.title, url, extracto: String(p.extract || "").slice(0, 900) });
      } catch { /* siguiente */ }
    }
    return {
      fuente: "Wikipedia",
      aviso: TAVILY_API_KEY ? "La búsqueda web falló; solo hay Wikipedia." : "Solo Wikipedia: no hay noticias ni resultados de última hora. Si preguntan algo de actualidad, dilo claramente.",
      resultados: results,
    };
  } catch (e) {
    return { error: "No se pudo buscar ahora mismo." };
  }
}

const WMO = { 0: "despejado", 1: "casi despejado", 2: "parcialmente nublado", 3: "nublado", 45: "niebla", 48: "niebla con escarcha",
  51: "llovizna débil", 53: "llovizna", 55: "llovizna intensa", 56: "llovizna helada", 57: "llovizna helada intensa",
  61: "lluvia débil", 63: "lluvia", 65: "lluvia fuerte", 66: "lluvia helada", 67: "lluvia helada fuerte",
  71: "nieve débil", 73: "nieve", 75: "nieve fuerte", 77: "granizo fino", 80: "chubascos débiles", 81: "chubascos", 82: "chubascos fuertes",
  85: "chubascos de nieve", 86: "chubascos de nieve fuertes", 95: "tormenta", 96: "tormenta con granizo", 99: "tormenta fuerte con granizo" };

async function tiempo({ lugar, dias }, src) {
  const name = String(lugar || "").slice(0, 100).trim();
  if (!name) return { error: "falta el lugar" };
  const n = Math.min(7, Math.max(1, parseInt(dias, 10) || 3));
  try {
    const g = await getJson(`${GEO_BASE}/v1/search?count=1&language=es&format=json&name=${encodeURIComponent(name)}`);
    const p = g.results && g.results[0];
    if (!p) return { error: `No encuentro el lugar "${name}".` };
    const f = await getJson(`${METEO_BASE}/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&timezone=auto&forecast_days=${n}` +
      "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max");
    src.add(`Open-Meteo: ${p.name}`, `https://open-meteo.com/`);
    const d = f.daily || {};
    return {
      lugar: [p.name, p.admin1, p.country].filter(Boolean).join(", "),
      ahora: f.current ? {
        temperatura_c: f.current.temperature_2m, sensacion_c: f.current.apparent_temperature, humedad: f.current.relative_humidity_2m,
        cielo: WMO[f.current.weather_code] || "desconocido", viento_kmh: f.current.wind_speed_10m,
      } : null,
      prevision: (d.time || []).map((day, i) => ({
        fecha: day, cielo: WMO[d.weather_code[i]] || "desconocido", max_c: d.temperature_2m_max[i], min_c: d.temperature_2m_min[i],
        prob_lluvia: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null, viento_max_kmh: d.wind_speed_10m_max ? d.wind_speed_10m_max[i] : null,
      })),
    };
  } catch (e) {
    console.error("[midas] meteo", e.message);
    return { error: "El servicio del tiempo no responde ahora." };
  }
}

function calcular({ expresion }) {
  try { return { resultado: +calcEval(String(expresion || "")).toPrecision(15) }; }
  catch (e) { return { error: e.message }; }
}

async function runTool(call, src) {
  const args = call.args || {};
  switch (call.name) {
    case "buscar_web": return buscarWeb(args, src);
    case "tiempo": return tiempo(args, src);
    case "calcular": return calcular(args);
    default: return { error: "herramienta desconocida" };
  }
}

// ---------------------------------------------------------------- /chat

function toContents(messages) {
  if (!Array.isArray(messages)) return null;
  const out = [];
  for (const m of messages.slice(-40)) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    const text = String(m.content || "").slice(0, 8000).trim();
    if (!text) continue;
    const role = m.role === "assistant" ? "model" : "user";
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts[0].text += "\n" + text;
    else out.push({ role, parts: [{ text }] });
  }
  while (out.length && out[0].role !== "user") out.shift();
  if (!out.length || out[out.length - 1].role !== "user") return null;
  return out;
}

async function handleChat(req, res) {
  const body = await readJson(req, 8 * 1024 * 1024);
  const contents = toContents(body.messages);
  if (!contents) return sendJson(res, 400, { code: "bad_request" });
  if (!GEMINI_API_KEY) return sendJson(res, 503, { code: "no_key" });

  const img = body.image;
  if (img && typeof img.data === "string" && /^image\/(jpeg|png|webp|gif)$/.test(img.media_type || "") && img.data.length < 7_000_000) {
    contents[contents.length - 1].parts.push({ inlineData: { mimeType: img.media_type, data: img.data } });
  }

  const system = PREAMBLE + "\n\n" + String(body.system || "").slice(0, 40000) +
    `\nZona horaria del usuario: ${String(body.timezone || "Europe/Madrid").slice(0, 60)}.`;
  const abort = new AbortController();
  res.on("close", () => { if (!res.writableEnded) abort.abort(); });
  const src = sources();

  for (let round = 0; round < 6; round++) {
    const payload = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      tools: TOOLS,
      generationConfig: { maxOutputTokens: 2048 },
    });
    let r;
    try {
      r = await callGemini(payload, abort.signal);
    } catch (e) {
      if (abort.signal.aborted) return;
      return sendJson(res, 502, { code: "upstream_unreachable" });
    }
    if (!r.ok) {
      const detail = (await r.text().catch(() => "")).slice(0, 400);
      console.error("[midas] gemini", r.status, detail);
      if (r.status === 429) return sendJson(res, 429, { code: "rate_limited" });
      if (r.status === 503 || r.status === 500) return sendJson(res, 200, { text: JSON.stringify({ reply: "Los servidores de Google están saturados ahora mismo. Pregúntamelo otra vez en unos segundos.", emotion: "annoyed" }), sources: [] });
      if ((r.status === 400 || r.status === 401 || r.status === 403) && /API key|API_KEY|permission|unauthenticated/i.test(detail)) return sendJson(res, 502, { code: "bad_key" });
      if (r.status === 404) return sendJson(res, 502, { code: "bad_model" });
      return sendJson(res, 502, { code: `upstream_${r.status}` });
    }
    const j = await r.json();
    if (j.promptFeedback && j.promptFeedback.blockReason) {
      return sendJson(res, 200, { text: JSON.stringify({ reply: "De eso prefiero no hablar. ¿Te ayudo con otra cosa?" }), sources: [] });
    }
    const cand = (j.candidates || [])[0];
    const content = cand && cand.content;
    const parts = (content && content.parts) || [];
    const calls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);

    if (calls.length) {
      // Se devuelve el turno del modelo tal cual (incluye las firmas de pensamiento que Gemini 3 exige).
      contents.push({ role: "model", parts });
      const responses = [];
      for (const c of calls.slice(0, 4)) {
        const result = await runTool(c, src);
        const fr = { name: c.name, response: { result } };
        if (c.id) fr.id = c.id;
        responses.push({ functionResponse: fr });
      }
      contents.push({ role: "user", parts: responses });
      continue;
    }

    const text = parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("").trim();
    if (!text) {
      const why = cand && cand.finishReason;
      console.error("[midas] respuesta vacía", why);
      return sendJson(res, 200, { text: JSON.stringify({ reply: why === "SAFETY" ? "De eso prefiero no hablar." : "Se me ha quedado la mente en blanco. ¿Me lo repites?" }), sources: src.list });
    }
    return sendJson(res, 200, { text, sources: src.list });
  }
  sendJson(res, 200, { text: JSON.stringify({ reply: "Me he liado buscando. ¿Me lo preguntas de otra forma?" }), sources: src.list });
}

// Llama a Gemini; si el modelo está saturado o no existe, reintenta y cambia a un modelo de respaldo.
let preferred = MODEL;
async function callGemini(payload, signal) {
  const models = [preferred, ...[MODEL, ...FALLBACK_MODELS].filter((m) => m !== preferred)];
  let last;
  for (let i = 0; i < models.length; i++) {
    const m = models[i];
    for (let attempt = 0; attempt < 2; attempt++) {
      last = await fetch(`${GEMINI_BASE}/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
        method: "POST", signal,
        headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
        body: payload,
      });
      if (last.ok) {
        if (m !== preferred) { console.warn(`[midas] usando modelo de respaldo ${m}`); preferred = m; setTimeout(() => { preferred = MODEL; }, 10 * 60_000); }
        return last;
      }
      const retryable = last.status === 503 || last.status === 500;
      const tryNextModel = retryable || last.status === 404 || (last.status === 429 && i < models.length - 1);
      if (!tryNextModel) return last;
      console.warn(`[midas] ${m} respondió ${last.status}`);
      if (retryable && attempt === 0) { await last.text().catch(() => {}); await new Promise((r) => setTimeout(r, 900)); continue; }
      break;
    }
    if (i < models.length - 1) await last.text().catch(() => {});
  }
  return last;
}

// ---------------------------------------------------------------- utilidades HTTP

function authorized(req) {
  const h = req.headers["authorization"] || "";
  const tok = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (DEVICE_TOKEN.length < 24 || tok.length !== DEVICE_TOKEN.length) return false;
  return crypto.timingSafeEqual(Buffer.from(tok), Buffer.from(DEVICE_TOKEN));
}

const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > 30;
}

function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(Object.assign(new Error("bad json"), { status: 400 })); } });
    req.on("error", reject);
  });
}

function sendJson(res, status, obj) {
  if (res.headersSent) return res.end();
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function cors(req, res) {
  const o = req.headers.origin;
  if (o && (ALLOWED_ORIGINS.includes(o) || ALLOWED_ORIGINS.includes("*"))) {
    res.setHeader("access-control-allow-origin", o);
    res.setHeader("vary", "origin");
    res.setHeader("access-control-allow-headers", "authorization, content-type");
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    res.setHeader("access-control-max-age", "600");
  }
}

const server = http.createServer(async (req, res) => {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  cors(req, res);
  try {
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
      return sendJson(res, 200, { ok: true, model: MODEL, keyConfigured: !!GEMINI_API_KEY, search: TAVILY_API_KEY ? "tavily" : "wikipedia" });
    }
    if (req.method === "POST" && req.url === "/chat") {
      if (!authorized(req)) return sendJson(res, 401, { code: "unauthorized" });
      if (rateLimited(ip)) return sendJson(res, 429, { code: "rate_limited" });
      return await handleChat(req, res);
    }
    sendJson(res, 404, { code: "not_found" });
  } catch (e) {
    console.error("[midas]", e.message);
    sendJson(res, e.status || 500, { code: "server_error" });
  }
});
server.listen(PORT, () => console.log(`[midas] servidor en :${PORT} · ${MODEL} · búsqueda ${TAVILY_API_KEY ? "Tavily" : "Wikipedia"}`));
