const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const root = __dirname;
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 5500);
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES || 80 * 1024 * 1024);

const tulkkiApiUrl = trimTrailingSlash(process.env.TULKKI_API_URL || "http://127.0.0.1:5600");
const agentApiUrl = trimTrailingSlash(process.env.AGENT_API_URL || "http://127.0.0.1:8010");
const ttsApiUrl = trimTrailingSlash(process.env.TTS_API_URL || "http://127.0.0.1:5620");
const publicTtsEndpoint = process.env.PUBLIC_TTS_ENDPOINT || "/api/tts/speak";
const ttsVoice = process.env.TTS_VOICE || "fi_FI-harri-medium";
const agentTopK = Number(process.env.AGENT_TOP_K || 3);
const tulkkiTenantId = process.env.TULKKI_TENANT_ID || "local-mutinatulkki";
const tulkkiConfigId = process.env.TULKKI_CONFIG_ID || "cfg_default_mutinatulkki";
const activeCaptureByConversation = new Map();

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

const defaultSpeechTimingConfig = {
  adaptivePauseThresholdMs: 1500,
  minPauseThresholdMs: 800,
  maxPauseThresholdMs: 3000,
  falseEndings: 0,
  confirmedEndings: 0,
  consecutiveFalseEndings: 0,
  numberOfConversations: 0,
  backchannelText: "",
  finalResponseTestText: "Puheen loppu varmistui. Odotetaan tulkin tekstivastausta.",
};

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function isStopConversationCommand(value) {
  const normalized = String(value || "")
    .toLocaleLowerCase("fi-FI")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return /^(?:lopeta|opeta|kaskalu|keskalu)[.!?]*$/.test(normalized) || /\b(?:lopeta|opeta)(?:\s+(?:tama\s+)?)?keskustel\w*\b/.test(normalized);
}

function normalizeTulkkiQuery(value) {
  // Defense in depth for a known Whisper initial-syllable confusion.  The
  // browser must show and the RAG service must receive the repaired question,
  // even if a lower speech-normalization layer was temporarily restarted.
  return String(value || "")
    .replace(/\btämä\s+on\s+(tiedolla\s+johtaminen|datamaturiteetti)\b/iu, "mitä on $1")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (character) => character.toLocaleUpperCase("fi-FI"));
}

function sendBuffer(response, statusCode, headers, body, skipBody = false) {
  response.writeHead(statusCode, {
    "Content-Length": body.length,
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    ...headers,
  });

  if (skipBody) {
    response.end();
    return;
  }

  response.end(body);
}

function sendText(response, statusCode, text) {
  const body = Buffer.from(String(text), "utf8");
  sendBuffer(
    response,
    statusCode,
    {
      "Content-Type": "text/plain; charset=utf-8",
    },
    body,
  );
}

function sendJson(response, statusCode, value) {
  const body = Buffer.from(JSON.stringify(value), "utf8");
  sendBuffer(
    response,
    statusCode,
    {
      "Content-Type": "application/json; charset=utf-8",
    },
    body,
  );
}

async function sendFile(request, response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = contentTypes[extension] || "application/octet-stream";
  const stat = await fsp.stat(filePath);

  response.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": stat.size,
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  fs.createReadStream(filePath).pipe(response);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let finished = false;

    function fail(error) {
      if (finished) {
        return;
      }

      finished = true;
      reject(error);
    }

    request.on("data", (chunk) => {
      totalBytes += chunk.length;

      if (totalBytes > maxBodyBytes) {
        fail(new Error("Pyynto on liian suuri."));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on("end", () => {
      if (finished) {
        return;
      }

      finished = true;
      resolve(Buffer.concat(chunks));
    });

    request.on("error", fail);
    request.on("aborted", () => fail(new Error("Pyynto keskeytyi.")));
  });
}

async function readJsonBody(request) {
  const body = await readBody(request);

  if (body.length === 0) {
    return {};
  }

  const value = JSON.parse(body.toString("utf8"));

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("JSON-rungon pitaa olla objekti.");
  }

  return value;
}

function speechTimingConfigPath() {
  return path.join(root, "config", "speech_timing_config.json");
}

function getConfigValue(config, name, fallback) {
  if (!config || typeof config !== "object") {
    return fallback;
  }

  return Object.prototype.hasOwnProperty.call(config, name) ? config[name] : fallback;
}

function clampInt(value, fallback, minimum, maximum) {
  const number = Number.parseInt(value, 10);
  const safeNumber = Number.isFinite(number) ? number : fallback;
  return Math.min(maximum, Math.max(minimum, safeNumber));
}

function normalizeSpeechTimingConfig(config = {}) {
  const minPauseThresholdMs = clampInt(
    getConfigValue(config, "minPauseThresholdMs", defaultSpeechTimingConfig.minPauseThresholdMs),
    defaultSpeechTimingConfig.minPauseThresholdMs,
    300,
    10000,
  );
  const maxPauseThresholdMs = Math.max(
    minPauseThresholdMs,
    clampInt(
      getConfigValue(config, "maxPauseThresholdMs", defaultSpeechTimingConfig.maxPauseThresholdMs),
      defaultSpeechTimingConfig.maxPauseThresholdMs,
      300,
      10000,
    ),
  );

  return {
    adaptivePauseThresholdMs: clampInt(
      getConfigValue(
        config,
        "adaptivePauseThresholdMs",
        defaultSpeechTimingConfig.adaptivePauseThresholdMs,
      ),
      defaultSpeechTimingConfig.adaptivePauseThresholdMs,
      minPauseThresholdMs,
      maxPauseThresholdMs,
    ),
    minPauseThresholdMs,
    maxPauseThresholdMs,
    falseEndings: clampInt(
      getConfigValue(config, "falseEndings", defaultSpeechTimingConfig.falseEndings),
      defaultSpeechTimingConfig.falseEndings,
      0,
      1000000,
    ),
    confirmedEndings: clampInt(
      getConfigValue(config, "confirmedEndings", defaultSpeechTimingConfig.confirmedEndings),
      defaultSpeechTimingConfig.confirmedEndings,
      0,
      1000000,
    ),
    consecutiveFalseEndings: clampInt(
      getConfigValue(
        config,
        "consecutiveFalseEndings",
        defaultSpeechTimingConfig.consecutiveFalseEndings,
      ),
      defaultSpeechTimingConfig.consecutiveFalseEndings,
      0,
      1000000,
    ),
    numberOfConversations: clampInt(
      getConfigValue(
        config,
        "numberOfConversations",
        defaultSpeechTimingConfig.numberOfConversations,
      ),
      defaultSpeechTimingConfig.numberOfConversations,
      0,
      1000000,
    ),
    backchannelText: String(
      getConfigValue(config, "backchannelText", defaultSpeechTimingConfig.backchannelText),
    ),
    finalResponseTestText: String(
      getConfigValue(
        config,
        "finalResponseTestText",
        defaultSpeechTimingConfig.finalResponseTestText,
      ) || defaultSpeechTimingConfig.finalResponseTestText,
    ),
  };
}

async function writeSpeechTimingConfig(config) {
  const normalized = normalizeSpeechTimingConfig(config);
  const filePath = speechTimingConfigPath();

  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");

  return normalized;
}

async function readSpeechTimingConfig() {
  const filePath = speechTimingConfigPath();

  try {
    const text = await fsp.readFile(filePath, "utf8");
    return writeSpeechTimingConfig(JSON.parse(text));
  } catch {
    return writeSpeechTimingConfig(defaultSpeechTimingConfig);
  }
}

async function updateSpeechTimingConfig(payload) {
  const current = await readSpeechTimingConfig();
  return writeSpeechTimingConfig({
    ...current,
    ...payload,
  });
}

function getAudioSizeFromBase64(base64Audio) {
  if (!base64Audio || typeof base64Audio !== "string") {
    return 0;
  }

  const padding = base64Audio.endsWith("==") ? 2 : base64Audio.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64Audio.length * 3) / 4) - padding);
}

function cloneMetadataWithoutAudio(payload) {
  const metadata = {};

  Object.entries(payload || {}).forEach(([key, value]) => {
    if (key !== "audio") {
      metadata[key] = value;
    }
  });

  return metadata;
}

function fetchWithTimeout(url, options = {}, timeoutMs = 180000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = options.signal;
  const abortFromCaller = () => controller.abort(externalSignal?.reason);

  if (externalSignal?.aborted) {
    abortFromCaller();
  } else {
    externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  return fetch(url, {
    ...options,
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  });
}

async function postJson(url, value, timeoutMs = 180000, signal) {
  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(value),
      signal,
    },
    timeoutMs,
  );
  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {
      ok: false,
      error: text || `HTTP ${response.status}`,
    };
  }

  if (!response.ok) {
    const detail = data.detail || data.error || text || `HTTP ${response.status}`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }

  return data;
}

async function invokeHHTulkkiAudio(payload, signal) {
  const chunkIndex = payload?.recording?.chunk?.index || "?";
  const audioBytesLength = getAudioSizeFromBase64(payload?.audio?.base64);
  const forwardPayload = {
    tenantId: tulkkiTenantId,
    configId: tulkkiConfigId,
    source: "Mutinatulkki",
    conversationId: payload.conversationId,
    sourceLanguage: "fi",
    targetLanguages: ["fi"],
    metadata: cloneMetadataWithoutAudio(payload),
    audio: payload.audio,
    processing: {
      mode: "transcribe",
      dialectProfile: {
        enabled: true,
        language: "fit",
        name: "meankieli",
        useLocalDialectDatabase: true,
      },
      voiceIdentity: {
        enabled: false,
      },
    },
  };

  console.log(
    `[${new Date().toISOString()}] POST /api/mutinat chunk=${chunkIndex} audioBytes=${audioBytesLength} -> ${tulkkiApiUrl}/api/v1/audio`,
  );

  const result = await postJson(`${tulkkiApiUrl}/api/v1/audio`, forwardPayload, 180000, signal);
  const textLength = result.text ? String(result.text).length : 0;
  const rawTextLength = result.rawTranscript ? String(result.rawTranscript).length : 0;
  const provider = result.transcription?.provider || "tuntematon";
  const attemptCount = Array.isArray(result.transcription?.attempts)
    ? result.transcription.attempts.length
    : 0;
  const totalMs = result.debug?.timingsMs?.total || "?";

  console.log(
    `[${new Date().toISOString()}] HH-tulkkiAPI OK chunk=${chunkIndex} status=${result.status} job=${result.jobId} stt=${provider} attempts=${attemptCount} rawChars=${rawTextLength} textChars=${textLength} totalMs=${totalMs}`,
  );

  return result;
}

async function invokeAgentChat(query, candidates, signal) {
  if (!query || !String(query).trim()) {
    return {
      ok: false,
      skipped: true,
      reason: "empty_tulkki_text",
      answer: null,
    };
  }

  try {
    const result = await postJson(
      `${agentApiUrl}/chat`,
      {
        query,
        top_k: agentTopK,
        candidates,
      },
      180000,
      signal,
    );

    return {
      ok: true,
      service: "AgentAPI",
      endpoint: `${agentApiUrl}/chat`,
      query: result.query,
      answer: result.answer,
      found: result.found,
      bestScore: result.best_score,
      candidateAssessments: result.candidate_assessments || [],
      sources: result.sources,
    };
  } catch (error) {
    if (signal?.aborted || error?.name === "AbortError") {
      throw error;
    }
    console.log(`[${new Date().toISOString()}] AgentAPI ERROR: ${error.message}`);
    return {
      ok: false,
      service: "AgentAPI",
      endpoint: `${agentApiUrl}/chat`,
      query,
      answer: null,
      error: error.message,
    };
  }
}

function getResponseAudioRequested(payload) {
  return payload?.responseOutput?.audioEnabled === true;
}

function getResponseTtsVoice(payload) {
  return payload?.responseOutput?.ttsVoice || ttsVoice;
}

async function invokeHHTtsSpeak(text, voice) {
  if (!text || !String(text).trim()) {
    return {
      ok: false,
      skipped: true,
      reason: "empty_tts_text",
    };
  }

  try {
    const response = await fetchWithTimeout(
      `${ttsApiUrl}/speak`,
      {
        method: "POST",
        headers: {
          Accept: "audio/wav",
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          text,
          voice,
        }),
      },
      180000,
    );
    const arrayBuffer = await response.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);

    if (!response.ok) {
      const errorText = bytes.toString("utf8") || `HTTP ${response.status}`;
      throw new Error(errorText);
    }

    return {
      ok: true,
      service: "HH-TTSservice",
      endpoint: `${ttsApiUrl}/speak`,
      voice,
      mimeType: response.headers.get("content-type") || "audio/wav",
      bytes: bytes.length,
      base64: bytes.toString("base64"),
    };
  } catch (error) {
    console.log(`[${new Date().toISOString()}] HH-TTSservice ERROR: ${error.message}`);
    return {
      ok: false,
      service: "HH-TTSservice",
      endpoint: `${ttsApiUrl}/speak`,
      voice,
      error: error.message,
    };
  }
}

async function saveMutinaCapture(payload, signal) {
  const hasAudio = Boolean(payload?.audio?.base64);
  const audioBytesLength = getAudioSizeFromBase64(payload?.audio?.base64);
  const tulkkiResult = await invokeHHTulkkiAudio(payload, signal);

  if (!tulkkiResult.ok) {
    throw new Error("HH-tulkkiAPI ei palauttanut onnistunutta vastausta.");
  }

  const tulkkiText = normalizeTulkkiQuery(tulkkiResult.text);
  const stopConversationCommand = isStopConversationCommand(tulkkiText);

  let agentResult = {
    ok: false,
    skipped: true,
    reason: "tulkki_status_unclear",
    answer: null,
  };

  if (tulkkiResult.status !== "unclear" && !stopConversationCommand) {
    const candidateQueries = Array.isArray(tulkkiResult?.interpretation?.candidates)
      ? tulkkiResult.interpretation.candidates.map((candidate) => candidate?.text).filter(Boolean)
      : [tulkkiText];
    agentResult = await invokeAgentChat(tulkkiText, candidateQueries, signal);
  }

  // Return the answer immediately after RAG. The browser starts the same TTS
  // request itself, so embedding a generated WAV here only adds a full extra
  // server round trip and a large base64 response before anything is shown.
  const ttsAudio = null;

  return {
    ok: true,
    service: "HH-tulkkiAPI",
    endpoint: `${tulkkiApiUrl}/api/v1/audio`,
    requestId: tulkkiResult.requestId,
    audioId: tulkkiResult.audioId,
    jobId: tulkkiResult.jobId,
    status: tulkkiResult.status,
    rawQuestion: tulkkiResult.rawTranscript || "",
    interpretedQuestion: agentResult.query || tulkkiText,
    text: agentResult.query || tulkkiText,
    transcriptText: agentResult.query || tulkkiText,
    rawTranscript: tulkkiResult.rawTranscript,
    message: tulkkiResult.message,
    candidateRejected: tulkkiResult.candidateRejected,
    quality: tulkkiResult.quality,
    transcription: tulkkiResult.transcription,
    interpretation: tulkkiResult.interpretation,
    normalization: tulkkiResult.normalization,
    agent: agentResult,
    ttsAudio,
    debug: tulkkiResult.debug,
    voiceIdentity: tulkkiResult.voiceIdentity,
    command: stopConversationCommand ? "stop_conversation" : null,
    audioReceived: hasAudio,
    audioSaved: false,
    audioPersisted: false,
    audioBytes: audioBytesLength,
  };
}

async function proxyTtsSpeak(request, response) {
  const body = await readBody(request);
  const upstreamResponse = await fetchWithTimeout(
    `${ttsApiUrl}/speak`,
    {
      method: "POST",
      headers: {
        Accept: request.headers.accept || "audio/wav",
        "Content-Type": request.headers["content-type"] || "application/json; charset=utf-8",
      },
      body,
    },
    180000,
  );
  const upstreamBody = Buffer.from(await upstreamResponse.arrayBuffer());

  sendBuffer(
    response,
    upstreamResponse.status,
    {
      "Content-Type": upstreamResponse.headers.get("content-type") || "audio/wav",
    },
    upstreamBody,
  );
}

async function handleApi(request, response, pathname) {
  if (request.method === "GET" && pathname === "/healthz") {
    sendJson(response, 200, {
      status: "ok",
      service: "Mutinatulkki",
    });
    return true;
  }

  if (request.method === "GET" && pathname === "/readyz") {
    sendJson(response, 200, {
      status: "ready",
      service: "Mutinatulkki",
      upstreams: {
        tulkkiApiUrl,
        agentApiUrl,
        ttsApiUrl,
      },
    });
    return true;
  }

  if (request.method === "GET" && pathname === "/api/client-config") {
    sendJson(response, 200, {
      ok: true,
      ttsApiUrl,
      ttsEndpoint: publicTtsEndpoint,
      ttsVoice,
    });
    return true;
  }

  if (request.method === "GET" && pathname === "/api/speech-timing-config") {
    const config = await readSpeechTimingConfig();
    sendJson(response, 200, {
      ok: true,
      config,
    });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/speech-timing-config") {
    const payload = await readJsonBody(request);
    const config = await updateSpeechTimingConfig(payload);
    sendJson(response, 200, {
      ok: true,
      config,
    });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/mutinat") {
    const payload = await readJsonBody(request);
    const conversationKey = String(payload?.conversationId || "anonymous");
    const previous = activeCaptureByConversation.get(conversationKey);
    if (previous) {
      previous.controller.abort(new Error("Uudempi kysymys korvasi aiemman."));
    }

    const controller = new AbortController();
    const capture = { controller };
    activeCaptureByConversation.set(conversationKey, capture);

    let result;
    try {
      result = await saveMutinaCapture(payload, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) {
        sendJson(response, 409, { ok: false, cancelled: true, error: "Uudempi kysymys korvasi aiemman." });
        return true;
      }
      if (activeCaptureByConversation.get(conversationKey) === capture) {
        activeCaptureByConversation.delete(conversationKey);
      }
      throw error;
    }

    if (controller.signal.aborted || activeCaptureByConversation.get(conversationKey) !== capture) {
      sendJson(response, 409, { ok: false, cancelled: true, error: "Uudempi kysymys korvasi aiemman." });
      return true;
    }

    activeCaptureByConversation.delete(conversationKey);
    sendJson(response, 201, result);
    return true;
  }

  // A dedicated, local-only recognition pass for the explicit spoken
  // interruption command. It never reaches AgentAPI or the conversation RAG.
  if (request.method === "POST" && pathname === "/api/interrupt") {
    const payload = await readJsonBody(request);
    const result = await invokeHHTulkkiAudio(payload);
    sendJson(response, 201, {
      ok: Boolean(result.ok),
      text: result.text || "",
      rawTranscript: result.rawTranscript || "",
      status: result.status || "completed",
    });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/tts/speak") {
    await proxyTtsSpeak(request, response);
    return true;
  }

  return false;
}

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host || `localhost:${port}`}`);
  const pathname = decodeURIComponent(requestUrl.pathname);

  try {
    const apiHandled = await handleApi(request, response, pathname);

    if (apiHandled) {
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      sendText(response, 405, "Vain GET, HEAD ja API POST -reitit ovat tuettuja.");
      return;
    }

    const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
    const filePath = path.resolve(root, relativePath);
    const relativeToRoot = path.relative(root, filePath);

    if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
      sendText(response, 403, "Estetty");
      return;
    }

    await sendFile(request, response, filePath);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      sendText(response, 404, "Ei loytynyt");
      return;
    }

    if (error instanceof SyntaxError) {
      sendJson(response, 400, {
        ok: false,
        error: "Virheellinen JSON.",
      });
      return;
    }

    console.error(error);
    sendJson(response, 500, {
      ok: false,
      error: error.message || "Palvelinvirhe",
    });
  }
}

const server = http.createServer((request, response) => {
  handleRequest(request, response);
});

server.listen(port, host, () => {
  console.log(`Mutinatulkki toimii osoitteessa http://${host}:${port}`);
  console.log(`HH-tulkkiAPI: ${tulkkiApiUrl}`);
  console.log(`AgentAPI: ${agentApiUrl}`);
  console.log(`HH-TTSservice: ${ttsApiUrl}`);
});
