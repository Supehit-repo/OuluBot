// v2 resets the old 2-second turn delay saved in browsers before the
// fast-conversation profile was introduced.
const SETTINGS_STORAGE_KEY = "huomentaHelena.settings.v2";
const SERVICE_NAME_STORAGE_KEY = "ouluInfoBot.serviceName.v1";
const DEFAULT_SERVICE_NAME = "Oulu info bot";
// The service is deployed both at localhost during maintenance and below the
// public ArcticAIChatbotti path. Keep every browser API request on the current
// mount instead of escaping to the origin root.
const API_PATH_PREFIX = window.location.pathname.startsWith("/TKI-hankkeet/ArcticAIChatbotti/")
  ? "./"
  : "/";
const apiEndpoint = (path) => `${API_PATH_PREFIX}${String(path).replace(/^\/+/, "")}`;
const CLIENT_CONFIG_ENDPOINT = apiEndpoint("api/client-config");
const DEFAULT_TTS_ENDPOINT = apiEndpoint("api/tts/speak");
const DEFAULT_TTS_VOICE = "fi_FI-harri-medium";
const DEFAULT_RESPONSE_TEXT_ENABLED = true;
const DEFAULT_RESPONSE_AUDIO_ENABLED = true;
const SILENT_WAV_DATA_URL =
  "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
const DEFAULT_INACTIVITY_TIMEOUT_SECONDS = 60;
const INACTIVITY_TIMEOUT_OPTIONS = [10, 20, 30, 60, 120, 300, 600];
const DEFAULT_CHUNK_SILENCE_TIMEOUT_MS = 800;
const CHUNK_SILENCE_TIMEOUT_OPTIONS = [400, 600, 800, 1000, 1200, 1500];
const DEFAULT_MICROPHONE_SENSITIVITY = "normal";
const MICROPHONE_SENSITIVITY_OPTIONS = ["low", "normal", "high"];
const DEFAULT_THEME = "light";
const THEME_OPTIONS = ["light", "dark"];
const VAD_SENSITIVITY_PROFILES = {
  low: {
    speechThreshold: 0.05,
    silenceThreshold: 0.03,
    label: "Matala",
  },
  normal: {
    speechThreshold: 0.024,
    silenceThreshold: 0.014,
    label: "Normaali",
  },
  high: {
    speechThreshold: 0.022,
    silenceThreshold: 0.012,
    label: "Korkea",
  },
};
const CAPTURE_ENDPOINT = apiEndpoint("api/mutinat");
const SPEECH_TIMING_CONFIG_ENDPOINT = apiEndpoint("api/speech-timing-config");
const UNCERTAINTY_AUDIO_THRESHOLD = 0.62;
const ALWAYS_SEND_AUDIO = true;
const BROWSER_STT_ENABLED = false;
const BROWSER_STT_LANGUAGE = "fi-FI";
const BROWSER_STT_DRAFT_FLUSH_MS = 650;
const BROWSER_STT_DRAFT_FLUSH_INTERVAL_MS = 120;
const INTERRUPT_CAPTURE_ENDPOINT = apiEndpoint("api/interrupt");
const INTERRUPT_COMMAND_THRESHOLD = 0.06;
const INTERRUPT_COMMAND_MIN_SPEECH_MS = 360;
const INTERRUPT_COMMAND_SILENCE_MS = 420;
const INTERRUPT_COMMAND_MAX_MS = 2400;
const INTERRUPT_COMMAND_COOLDOWN_MS = 1400;
// This is deliberately tolerant because a one-word command must win over an
// ongoing answer even when the browser STT loses the initial L or doubles T.
// It is evaluated only while the assistant is speaking.
const VOICE_INTERRUPT_PATTERN = /\b(?:lopet\w*|opeta|seis|stop|keskeyt\w*|kaskalu|keskalu)\b|\bala\s+en+aa\b/;
const CONVERSATION_STOP_PATTERN = /\blopeta(?:\s+(?:tämä\s+)?)?keskustel\w*\b/;
const TARGET_TRANSCRIPTION = {
  endpoint: apiEndpoint("api/transcribe"),
  model: "Finnish-NLP/whisper-large-finnish-v3-ct2",
  language: "fi",
  mode: "word-for-word",
};
const UNCLEAR_TULKKI_TEXT = "en valitettavasti saanut selvää äskeisestä, kysy uudestaan.";
const VAD_CONFIG = {
  sampleIntervalMs: 40,
  minSpeechStartMs: 160,
  minChunkMs: 250,
  minChunkBytes: 1200,
  recorderTimesliceMs: 1000,
};

const NOISE_CALIBRATION_MS = 700;
const NOISE_FLOOR_PERCENTILE = 0.8;
const NOISE_SPEECH_MULTIPLIER = 1.8;
const NOISE_SPEECH_MARGIN = 0.004;
const NOISE_SILENCE_MULTIPLIER = 1.2;
const NOISE_SILENCE_MARGIN = 0.002;
// Keep a short local pre-roll before speech is confirmed. This preserves soft
// opening syllables without uploading background noise: unconfirmed chunks are
// still discarded locally.
const PRE_SPEECH_MAX_WAIT_MS = 700;

const DEFAULT_SPEECH_TIMING_CONFIG = {
  adaptivePauseThresholdMs: 800,
  minPauseThresholdMs: 600,
  maxPauseThresholdMs: 1500,
  falseEndings: 0,
  confirmedEndings: 0,
  consecutiveFalseEndings: 0,
  numberOfConversations: 0,
  backchannelText: "",
  finalResponseTestText: "Puheen loppu varmistui. Odotetaan tulkin tekstivastausta.",
};

const SPEECH_TURN_STATES = {
  LISTENING: "LISTENING",
  LIKELY_END: "LIKELY_END",
  WAITING_CONFIRMATION: "WAITING_CONFIRMATION",
  CONTINUED: "CONTINUED",
  FINAL_END: "FINAL_END",
};

const LIKELY_END_VISIBLE_MS = 0;
const FINAL_RESPONSE_CONFIRMATION_MS = 100;
const ADAPTIVE_FALSE_ENDING_STEP_MS = 100;
const ADAPTIVE_CONFIRMED_ENDING_STEP_MS = 50;
const MIN_MEASUREMENTS_BEFORE_ADAPTIVE_UPDATE = 20;
const MAX_TRANSCRIPT_LINES = 30;

const elements = {
  stateHero: document.querySelector(".state-hero"),
  stateIcon: document.querySelector("#stateIcon"),
  stateLabel: document.querySelector("#stateLabel"),
  stateHelp: document.querySelector("#stateHelp"),
  listenButton: document.querySelector("#listenButton"),
  listenButtonIcon: document.querySelector("#listenButton .button-icon"),
  listenButtonText: document.querySelector("#listenButton span:last-child"),
  stopSpeechButton: document.querySelector("#stopSpeechButton"),
  clearButton: document.querySelector("#clearButton"),
  serviceName: document.querySelector("#serviceName"),
  serviceNameInput: document.querySelector("#serviceNameInput"),
  editNameButton: document.querySelector("#editNameButton"),
  responseTextCheckbox: document.querySelector("#responseTextCheckbox"),
  responseAudioCheckbox: document.querySelector("#responseAudioCheckbox"),
  agentAudioElement: document.querySelector("#agentAudioElement"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsOverlay: document.querySelector("#settingsOverlay"),
  settingsCloseButton: document.querySelector("#settingsCloseButton"),
  privacyPolicyButton: document.querySelector("#privacyPolicyButton"),
  termsButton: document.querySelector("#termsButton"),
  policyModal: document.querySelector("#policyModal"),
  policyCloseButton: document.querySelector("#policyCloseButton"),
  policyTitle: document.querySelector("#policyTitle"),
  policyContents: document.querySelectorAll("[data-policy-content]"),
  timeoutOptions: document.querySelectorAll(".timeout-option"),
  chunkTimeoutOptions: document.querySelectorAll(".chunk-timeout-option"),
  microphoneSensitivityOptions: document.querySelectorAll(".microphone-sensitivity-option"),
  themeOptions: document.querySelectorAll(".theme-option"),
  timerFill: document.querySelector("#timerFill"),
  timerText: document.querySelector("#timerText"),
  transcriptBox: document.querySelector("#transcriptBox"),
  transcriptText: document.querySelector("#transcriptText"),
  interimText: document.querySelector("#interimText"),
  placeholderText: document.querySelector("#placeholderText"),
  supportNote: document.querySelector("#supportNote"),
  recordingStatus: document.querySelector("#recordingStatus"),
  segmentStatus: document.querySelector("#segmentStatus"),
  speechStatus: document.querySelector("#speechStatus"),
  turnStatus: document.querySelector("#turnStatus"),
  saveStatus: document.querySelector("#saveStatus"),
  flowLiveStatus: document.querySelector("#flowLiveStatus"),
};

const states = {
  sleeping: {
    icon: "😴",
    label: "Nukkuu",
    help: "Mikrofoni on päällä vain aktiivisen keskustelusession aikana.",
  },
  listening: {
    icon: "👂",
    label: "Kuuntelee",
    help: "Keskustelu on käynnissä. Voit puhua luonnollisesti ilman uusia painalluksia.",
  },
  processing: {
    icon: "🤔",
    label: "Käsittelee",
    help: "Lähetetään puhechunkia HH-tulkkiAPI:lle.",
  },
  answering: {
    icon: "🗣️",
    label: "Vastaa",
    help: "Puhechunk on käsitelty. Voit jatkaa puhumista saman session aikana.",
  },
  error: {
    icon: "⚠️",
    label: "Tarvitsee huomion",
    help: "Tarkista mikrofonilupa ja käytä Chrome-selainta.",
  },
};

let recorder = null;
let recorderStopPromise = null;
let resolveRecorderStop = null;
let audioStream = null;
let audioContext = null;
let analyser = null;
let analyserBuffer = null;
let audioChunks = [];
let timerId = null;
let vadTimerId = null;
let inactivityStartedAt = 0;
let conversationId = "";
let sessionStartedAt = "";
let sessionStoppedAt = "";
let chunkStartedAt = "";
let chunkStoppedAt = "";
let chunkIndex = 0;
let savedChunkCount = 0;
let isSessionActive = false;
let isStartingSession = false;
let isStoppingSession = false;
let finalTranscript = "";
let silenceStartedAt = 0;
let noiseCalibrationEndsAtMs = 0;
let noiseCalibrationSamples = [];
let noiseFloorRms = 0;
let currentChunkPeakRms = 0;
let speechCandidateStartedAt = 0;
let speechCandidateDurationMs = 0;
let currentChunkConfirmedAt = "";
let isCurrentChunkConfirmed = false;
let pendingSavePromises = new Set();
let appSettings = loadSettings();
let speechTimingConfig = normalizeSpeechTimingConfig(DEFAULT_SPEECH_TIMING_CONFIG);
let speechTurnState = SPEECH_TURN_STATES.LISTENING;
let lastConfirmedSpeechAtMs = 0;
let likelyEndStartedAtMs = 0;
let likelyEndTimerId = null;
let finalResponseTimerId = null;
let speechTimingSavePromise = Promise.resolve();
let sessionSpeechTimingStats = createEmptySpeechTimingStats();
let serviceNameBeforeEdit = DEFAULT_SERVICE_NAME;
let isEditingServiceName = false;
let speechRecognition = null;
let speechRecognitionMode = null;
let speechRecognitionRestartTimerId = null;
let browserSttResultMap = new Map();
let browserSttErrors = [];
let browserSttLastInterimText = "";
let browserSttChunkStartFinalIndex = 0;
let browserSttStarted = false;
let isSpeakingAgentAnswer = false;
let ttsAbortController = null;
let agentAudio = null;
let agentAudioObjectUrl = "";
let agentSpeechRequestId = 0;
let isAgentAudioUnlocked = false;
let activeQuestionId = "";
let captureAbortController = null;
let messageFlowTimerIds = [];
let interruptCommandRecorder = null;
let interruptCommandAudioChunks = [];
let interruptCommandStartedAtMs = 0;
let interruptCommandSilenceAtMs = 0;
let interruptCommandSpeechMs = 0;
let interruptCommandChecking = false;
let interruptCommandCooldownUntilMs = 0;
let clientConfig = {
  ttsEndpoint: DEFAULT_TTS_ENDPOINT,
  ttsVoice: DEFAULT_TTS_VOICE,
};

function setState(name) {
  const nextState = states[name] || states.sleeping;
  elements.stateHero.dataset.state = name;
  elements.stateIcon.textContent = nextState.icon;
  elements.stateLabel.textContent = nextState.label;
  elements.stateHelp.textContent = nextState.help;
}

function getMessageFlowNodes() {
  return Array.from(document.querySelectorAll("[data-flow-step]"));
}

function getMessageFlowConnectors() {
  return Array.from(document.querySelectorAll("[data-flow-connector]"));
}

function clearMessageFlowTimers() {
  messageFlowTimerIds.forEach((timerId) => window.clearTimeout(timerId));
  messageFlowTimerIds = [];
}

function setMessageFlowStatus(text, state = "idle") {
  const panel = document.querySelector(".architecture-panel");
  if (panel) {
    panel.dataset.flowState = state;
  }
  if (elements.flowLiveStatus) {
    elements.flowLiveStatus.lastChild.textContent = text;
  }
}

function setMessageFlowStep(step, statusText, state = "processing") {
  const currentStep = Number(step);
  getMessageFlowNodes().forEach((node) => {
    const nodeStep = Number(node.dataset.flowStep);
    node.classList.toggle("is-active", nodeStep === currentStep);
    node.classList.toggle("is-complete", nodeStep < currentStep || (state === "complete" && nodeStep === currentStep));
  });
  getMessageFlowConnectors().forEach((connector) => {
    const connectorStep = Number(connector.dataset.flowConnector);
    connector.classList.toggle("is-active", connectorStep < currentStep);
    connector.classList.toggle("is-complete", connectorStep < currentStep);
  });
  setMessageFlowStatus(statusText, state);
}

function startMessageFlow(questionId) {
  clearMessageFlowTimers();
  setMessageFlowStep(2, "Mutinatulkki välittää äänen tulkille", "processing");

  // Palvelu palauttaa tällä hetkellä yhden valmiin vastauksen. Nämä vaiheet
  // perustuvat mitattuihin paikallisiin viiveisiin ja pitävät messunäkymän
  // rehellisenä ilman keksittyä palvelinpuolen prosenttilukua.
  const estimatedSteps = [
    [80, 3, "Faster Whisper tunnistaa puhetta GPU:lla"],
    [650, 4, "HH-tulkkiAPI tarkistaa murteen ja sanaston"],
    [735, 5, "AgentAPI hakee vastausta Oamk Journalista"],
  ];

  estimatedSteps.forEach(([delayMs, step, statusText]) => {
    const timerId = window.setTimeout(() => {
      if (activeQuestionId === questionId) {
        setMessageFlowStep(step, statusText, "processing");
      }
    }, delayMs);
    messageFlowTimerIds.push(timerId);
  });
}

function startMessageFlowVoice(questionId) {
  if (activeQuestionId !== questionId) {
    return;
  }
  clearMessageFlowTimers();
  setMessageFlowStep(6, "Piper muodostaa vastausäänen selaimelle", "processing");
}

function finishMessageFlow(questionId, failed = false, finalStep = 6, completedText = "Vastaus valmis – valmis seuraavaan kysymykseen") {
  if (questionId && activeQuestionId !== questionId) {
    return;
  }
  clearMessageFlowTimers();
  if (failed) {
    getMessageFlowNodes().forEach((node) => node.classList.remove("is-active", "is-complete"));
    getMessageFlowConnectors().forEach((connector) => connector.classList.remove("is-active", "is-complete"));
    setMessageFlowStatus("Käsittely keskeytyi – valmis uuteen kysymykseen", "error");
    return;
  }
  setMessageFlowStep(finalStep, completedText, "complete");
}

function setSupport(message, isError = false) {
  elements.supportNote.textContent = message;
  elements.supportNote.classList.toggle("is-error", isError);
}

function loadServiceName() {
  try {
    const savedName = localStorage.getItem(SERVICE_NAME_STORAGE_KEY);
    return savedName && savedName.trim() ? savedName.trim() : DEFAULT_SERVICE_NAME;
  } catch {
    return DEFAULT_SERVICE_NAME;
  }
}

function saveServiceName(name) {
  try {
    localStorage.setItem(SERVICE_NAME_STORAGE_KEY, name);
  } catch {
    // Nimen muokkaus toimii silti nykyisessä näkymässä, vaikka paikallinen tallennus olisi estetty.
  }
}

function sanitizeServiceName(name) {
  return String(name || "").replace(/\s+/g, " ").trim().slice(0, 40) || DEFAULT_SERVICE_NAME;
}

function setServiceName(name) {
  const cleanName = sanitizeServiceName(name);
  elements.serviceName.textContent = cleanName;
  elements.serviceNameInput.value = cleanName;
  document.title = cleanName;
  saveServiceName(cleanName);
}

function editServiceName() {
  resetInactivityTimer();
  serviceNameBeforeEdit = elements.serviceName.textContent.trim() || DEFAULT_SERVICE_NAME;
  isEditingServiceName = true;
  elements.serviceNameInput.value = serviceNameBeforeEdit;
  elements.serviceName.hidden = true;
  elements.serviceNameInput.hidden = false;
  elements.serviceNameInput.focus();
  elements.serviceNameInput.select();
}

function finishServiceNameEdit(options = {}) {
  if (!isEditingServiceName) {
    return;
  }

  isEditingServiceName = false;
  const nextName = options.cancel ? serviceNameBeforeEdit : elements.serviceNameInput.value;
  setServiceName(nextName);
  elements.serviceNameInput.hidden = true;
  elements.serviceName.hidden = false;
}

function handleServiceNameInputKeydown(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    finishServiceNameEdit();
    elements.editNameButton.focus();
  }

  if (event.key === "Escape") {
    event.preventDefault();
    finishServiceNameEdit({ cancel: true });
    elements.editNameButton.focus();
  }
}

function normalizeResponseOutput(textEnabled, audioEnabled) {
  const normalized = {
    responseTextEnabled:
      typeof textEnabled === "boolean" ? textEnabled : DEFAULT_RESPONSE_TEXT_ENABLED,
    responseAudioEnabled:
      typeof audioEnabled === "boolean" ? audioEnabled : DEFAULT_RESPONSE_AUDIO_ENABLED,
  };

  if (!normalized.responseTextEnabled && !normalized.responseAudioEnabled) {
    normalized.responseTextEnabled = true;
  }

  return normalized;
}

function loadSettings() {
  try {
    const savedSettings = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}");
    const savedTimeout = Number(savedSettings.inactivityTimeoutSeconds);
    const savedChunkSilenceTimeout = Number(savedSettings.chunkSilenceTimeoutMs);
    const savedMicrophoneSensitivity = String(savedSettings.microphoneSensitivity || "");
    const savedTheme = String(savedSettings.theme || "");
    const responseOutput = normalizeResponseOutput(
      savedSettings.responseTextEnabled,
      savedSettings.responseAudioEnabled,
    );

    return {
      inactivityTimeoutSeconds: INACTIVITY_TIMEOUT_OPTIONS.includes(savedTimeout)
        ? savedTimeout
        : DEFAULT_INACTIVITY_TIMEOUT_SECONDS,
      chunkSilenceTimeoutMs: CHUNK_SILENCE_TIMEOUT_OPTIONS.includes(savedChunkSilenceTimeout)
        ? savedChunkSilenceTimeout
        : DEFAULT_CHUNK_SILENCE_TIMEOUT_MS,
      microphoneSensitivity: MICROPHONE_SENSITIVITY_OPTIONS.includes(savedMicrophoneSensitivity)
        ? savedMicrophoneSensitivity
        : DEFAULT_MICROPHONE_SENSITIVITY,
      theme: THEME_OPTIONS.includes(savedTheme) ? savedTheme : DEFAULT_THEME,
      ...responseOutput,
    };
  } catch {
    return {
      inactivityTimeoutSeconds: DEFAULT_INACTIVITY_TIMEOUT_SECONDS,
      chunkSilenceTimeoutMs: DEFAULT_CHUNK_SILENCE_TIMEOUT_MS,
      microphoneSensitivity: DEFAULT_MICROPHONE_SENSITIVITY,
      theme: DEFAULT_THEME,
      ...normalizeResponseOutput(),
    };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(appSettings));
  } catch {
    // Paikallinen muisti voi olla estetty, mutta asetuksen pitää silti toimia nykyisessä sessiossa.
  }
}

function getInactivityTimeoutSeconds() {
  return appSettings.inactivityTimeoutSeconds;
}

function getInactivityTimeoutMs() {
  return getInactivityTimeoutSeconds() * 1000;
}

function getChunkSilenceTimeoutMs() {
  return appSettings.chunkSilenceTimeoutMs;
}

function getMicrophoneSensitivity() {
  return appSettings.microphoneSensitivity;
}

function getTheme() {
  return appSettings.theme === "dark" ? "dark" : DEFAULT_THEME;
}

function applyTheme() {
  const theme = getTheme();
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    theme === "dark" ? "#121923" : "#f5f7fb",
  );
}

function setTheme(theme) {
  if (!THEME_OPTIONS.includes(theme)) {
    return;
  }

  appSettings = { ...appSettings, theme };
  saveSettings();
  applyTheme();
  updateSettingsUi();
}

function isResponseTextEnabled() {
  return appSettings.responseTextEnabled !== false;
}

function isResponseAudioEnabled() {
  return appSettings.responseAudioEnabled === true;
}

function setResponseOutput(kind, enabled) {
  const nextSettings = {
    ...appSettings,
    responseTextEnabled: isResponseTextEnabled(),
    responseAudioEnabled: isResponseAudioEnabled(),
  };

  if (kind === "text") {
    nextSettings.responseTextEnabled = Boolean(enabled);
  }

  if (kind === "audio") {
    nextSettings.responseAudioEnabled = Boolean(enabled);
  }

  const normalized = normalizeResponseOutput(
    nextSettings.responseTextEnabled,
    nextSettings.responseAudioEnabled,
  );

  appSettings = {
    ...nextSettings,
    ...normalized,
  };

  saveSettings();
  updateResponseOutputUi();

  if (!isResponseAudioEnabled()) {
    stopAgentSpeech();
  }
}

function getVadSensitivityProfile() {
  return VAD_SENSITIVITY_PROFILES[getMicrophoneSensitivity()] || VAD_SENSITIVITY_PROFILES.normal;
}

function getVadConfigSnapshot() {
  const sensitivityProfile = getVadSensitivityProfile();
  const calibratedSpeechThreshold = noiseFloorRms > 0
    ? Math.max(
      sensitivityProfile.speechThreshold,
      noiseFloorRms * NOISE_SPEECH_MULTIPLIER + NOISE_SPEECH_MARGIN,
    )
    : sensitivityProfile.speechThreshold;
  const calibratedSilenceThreshold = noiseFloorRms > 0
    ? Math.max(
      sensitivityProfile.silenceThreshold,
      noiseFloorRms * NOISE_SILENCE_MULTIPLIER + NOISE_SILENCE_MARGIN,
    )
    : sensitivityProfile.silenceThreshold;

  const speechThreshold = Math.min(0.12, calibratedSpeechThreshold);

  return {
    ...VAD_CONFIG,
    speechThreshold,
    // Start local capture well before speech confirmation. Noise calibration
    // may raise speechThreshold in a busy room, but it must not make a soft
    // opening such as "mitä on" disappear. The chunk is only uploaded after
    // normal speech has been confirmed for minSpeechStartMs.
    preSpeechThreshold: Math.max(0.004, Math.min(0.008, speechThreshold * 0.25)),
    silenceThreshold: Math.min(0.09, calibratedSilenceThreshold),
    noiseFloorRms: Number(noiseFloorRms.toFixed(5)),
    noiseCalibrated: noiseCalibrationEndsAtMs > 0,
    microphoneSensitivity: getMicrophoneSensitivity(),
    microphoneSensitivityLabel: sensitivityProfile.label,
    endOfSpeechSilenceMs: getChunkSilenceTimeoutMs(),
    chunk_silence_timeout: getChunkSilenceTimeoutMs(),
  };
}

function clampNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  const safeNumber = Number.isFinite(number) ? number : fallback;

  return Math.max(minimum, Math.min(maximum, safeNumber));
}

function createEmptySpeechTimingStats() {
  return {
    falseEndings: 0,
    confirmedEndings: 0,
    consecutiveFalseEndings: 0,
  };
}

function normalizeSpeechTimingConfig(config = {}) {
  const minPauseThresholdMs = clampNumber(
    config.minPauseThresholdMs,
    DEFAULT_SPEECH_TIMING_CONFIG.minPauseThresholdMs,
    300,
    10000,
  );
  const maxPauseThresholdMs = Math.max(
    minPauseThresholdMs,
    clampNumber(
      config.maxPauseThresholdMs,
      DEFAULT_SPEECH_TIMING_CONFIG.maxPauseThresholdMs,
      300,
      10000,
    ),
  );

  return {
    adaptivePauseThresholdMs: clampNumber(
      config.adaptivePauseThresholdMs,
      DEFAULT_SPEECH_TIMING_CONFIG.adaptivePauseThresholdMs,
      minPauseThresholdMs,
      maxPauseThresholdMs,
    ),
    minPauseThresholdMs,
    maxPauseThresholdMs,
    falseEndings: Math.max(0, Math.round(Number(config.falseEndings) || 0)),
    confirmedEndings: Math.max(0, Math.round(Number(config.confirmedEndings) || 0)),
    consecutiveFalseEndings: Math.max(0, Math.round(Number(config.consecutiveFalseEndings) || 0)),
    numberOfConversations: Math.max(0, Math.round(Number(config.numberOfConversations) || 0)),
    backchannelText: String(config.backchannelText ?? DEFAULT_SPEECH_TIMING_CONFIG.backchannelText),
    finalResponseTestText: String(
      config.finalResponseTestText || DEFAULT_SPEECH_TIMING_CONFIG.finalResponseTestText,
    ),
  };
}

function getSpeechTimingSnapshot() {
  return {
    state: speechTurnState,
    adaptivePauseThresholdMs: speechTimingConfig.adaptivePauseThresholdMs,
    minPauseThresholdMs: speechTimingConfig.minPauseThresholdMs,
    maxPauseThresholdMs: speechTimingConfig.maxPauseThresholdMs,
    falseEndings: speechTimingConfig.falseEndings,
    confirmedEndings: speechTimingConfig.confirmedEndings,
    consecutiveFalseEndings: speechTimingConfig.consecutiveFalseEndings,
    numberOfConversations: speechTimingConfig.numberOfConversations,
    backchannelText: speechTimingConfig.backchannelText,
    finalResponseTestText: speechTimingConfig.finalResponseTestText,
    confirmationWindowMs: FINAL_RESPONSE_CONFIRMATION_MS,
    minimumMeasurementsBeforeAdaptiveUpdate: MIN_MEASUREMENTS_BEFORE_ADAPTIVE_UPDATE,
  };
}

function updateSpeechTurnUi() {
  if (!elements.turnStatus) {
    return;
  }

  elements.turnStatus.textContent =
    `${speechTurnState} / ${getChunkSilenceTimeoutMs()} ms`;
}

function setSpeechTurnState(nextState) {
  speechTurnState = nextState;
  updateSpeechTurnUi();
}

async function loadSpeechTimingConfig() {
  try {
    const response = await fetch(SPEECH_TIMING_CONFIG_ENDPOINT);
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.error || `Taukoprofiilin lataus epäonnistui (${response.status})`);
    }

    speechTimingConfig = normalizeSpeechTimingConfig(result.config);
    updateSpeechTurnUi();
  } catch (error) {
    console.warn("Taukoprofiilia ei saatu ladattua, käytetään oletusarvoja.", error);
    speechTimingConfig = normalizeSpeechTimingConfig(DEFAULT_SPEECH_TIMING_CONFIG);
    updateSpeechTurnUi();
  }
}

function persistSpeechTimingConfig() {
  const payload = normalizeSpeechTimingConfig(speechTimingConfig);
  speechTimingConfig = payload;
  updateSpeechTurnUi();

  speechTimingSavePromise = speechTimingSavePromise
    .catch(() => {})
    .then(async () => {
      const response = await fetch(SPEECH_TIMING_CONFIG_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || `Taukoprofiilin tallennus epäonnistui (${response.status})`);
      }

      speechTimingConfig = normalizeSpeechTimingConfig(result.config);
      updateSpeechTurnUi();
    })
    .catch((error) => {
      console.warn("Taukoprofiilin tallennus epäonnistui.", error);
    });

  return speechTimingSavePromise;
}

function setInactivityTimeout(seconds) {
  const nextTimeout = Number(seconds);

  if (!INACTIVITY_TIMEOUT_OPTIONS.includes(nextTimeout)) {
    return;
  }

  appSettings = {
    ...appSettings,
    inactivityTimeoutSeconds: nextTimeout,
  };
  saveSettings();
  updateSettingsUi();
  updateInactivityMeter();

  if (isSessionActive) {
    setSupport(
      `Passiivisuuskatkaisu päivitetty: ${nextTimeout} sekuntia. Uusi aika on voimassa heti.`,
    );
  }
}

function setChunkSilenceTimeout(milliseconds) {
  const nextTimeout = Number(milliseconds);

  if (!CHUNK_SILENCE_TIMEOUT_OPTIONS.includes(nextTimeout)) {
    return;
  }

  appSettings = {
    ...appSettings,
    chunkSilenceTimeoutMs: nextTimeout,
  };
  saveSettings();
  updateSettingsUi();

  if (isSessionActive) {
    setSupport(
      `Puheenvuoron loppuviive päivitetty: ${nextTimeout} ms. Uusi arvo vaikuttaa heti seuraavaan hiljaisuuteen.`,
    );
  }
}

function setMicrophoneSensitivity(sensitivity) {
  if (!MICROPHONE_SENSITIVITY_OPTIONS.includes(sensitivity)) {
    return;
  }

  appSettings = {
    ...appSettings,
    microphoneSensitivity: sensitivity,
  };
  saveSettings();
  updateSettingsUi();

  if (isSessionActive) {
    setSupport(
      `Mikrofonin herkkyys päivitetty: ${getVadSensitivityProfile().label}. Uusi arvo vaikuttaa heti.`,
    );
  }
}

function updateTranscript() {
  const hasText = finalTranscript.length > 0;
  const lines = hasText ? finalTranscript.split("\n") : [];

  elements.placeholderText.hidden = hasText;
  elements.transcriptText.replaceChildren();

  lines.forEach((line, index) => {
    const highlightedStarts = [
      {
        marker: "Kysyjä kysyi:",
        className: "tulkki-main-text",
      },
      {
        marker: "Mutinatulkki tulkitsi:",
        className: "tulkki-main-text",
      },
      {
        marker: "Vastaus:",
        className: "agent-answer-text",
      },
      {
        marker: "Lähteet:",
        className: "source-links-text",
      },
    ];
    const highlightedStart = highlightedStarts
      .map((item) => ({
        ...item,
        index: line.indexOf(item.marker),
      }))
      .filter((item) => item.index >= 0)
      .sort((a, b) => a.index - b.index)[0];

    if (highlightedStart) {
      const prefixText = line.slice(0, highlightedStart.index);
      const highlightedText = line.slice(highlightedStart.index);
      const highlightedTextElement = document.createElement("strong");

      highlightedTextElement.className = highlightedStart.className;
      appendTextWithLinks(highlightedTextElement, highlightedText);
      elements.transcriptText.append(document.createTextNode(prefixText), highlightedTextElement);
    } else {
      appendTextWithLinks(elements.transcriptText, line);
    }

    if (index < lines.length - 1) {
      elements.transcriptText.append(document.createElement("br"));
    }
  });

  if (elements.transcriptBox) {
    elements.transcriptBox.scrollTop = elements.transcriptBox.scrollHeight;
  }
}

function appendTextWithLinks(parent, text) {
  const urlPattern = /https?:\/\/[^\s|]+/g;
  let cursor = 0;
  let match = urlPattern.exec(text);

  while (match) {
    const url = match[0];

    if (match.index > cursor) {
      parent.append(document.createTextNode(text.slice(cursor, match.index)));
    }

    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = url;
    parent.append(link);

    cursor = match.index + url.length;
    match = urlPattern.exec(text);
  }

  if (cursor < text.length) {
    parent.append(document.createTextNode(text.slice(cursor)));
  }
}

function isVisibleTranscriptMessage(message) {
  return (
    message.startsWith("Kysyjä kysyi:") ||
    message.startsWith("Mutinatulkki tulkitsi:") ||
    message.startsWith("Vastaus:") ||
    message.startsWith("Lähteet:")
  );
}

function appendSessionLine(message) {
  if (!isVisibleTranscriptMessage(message)) {
    console.debug("[Mutinatulkki]", message);
    return;
  }

  const lines = finalTranscript ? finalTranscript.split("\n") : [];

  lines.push(message);
  finalTranscript = lines.slice(-MAX_TRANSCRIPT_LINES).join("\n");
  updateTranscript();
}

function getTulkkiText(result) {
  if (isUnclearTulkkiResult(result)) {
    return UNCLEAR_TULKKI_TEXT;
  }

  const candidates = [
    result?.interpretedQuestion,
    result?.text,
    result?.transcriptText,
    result?.interpretation?.text,
    result?.rawTranscript,
  ];

  return candidates.find((value) => typeof value === "string" && value.trim())?.trim() || "";
}

function isUnclearTulkkiResult(result) {
  return result?.status === "unclear" || result?.quality?.accepted === false;
}

function getClarificationPrompt(result) {
  const message = normalizeWhitespace(result?.message || result?.quality?.message || "");
  return message || "En saanut puheesta riittävän varmaa tulkintaa. Voit sanoa asian uudelleen omalla tavallasi; myös lyhyt avainsana riittää.";
}

function getRawTulkkiText(result) {
  const rawText = result?.rawQuestion || result?.rawTranscript;
  return typeof rawText === "string" && rawText.trim() ? rawText.trim() : "";
}

function getAgentAnswer(result) {
  const candidates = [
    result?.agent?.answer,
    result?.agentAnswer,
    result?.answer,
  ];

  return candidates.find((value) => typeof value === "string" && value.trim())?.trim() || "";
}

function getAgentSourceLine(result) {
  const rawSources = Array.isArray(result?.agent?.sources) ? result.agent.sources : [];
  const sources = [];
  const seenUrls = new Set();

  rawSources.forEach((source) => {
    const url = typeof source?.source === "string" ? source.source.trim() : "";

    if (!/^https?:\/\//i.test(url) || seenUrls.has(url)) {
      return;
    }

    seenUrls.add(url);
    sources.push({
      title: typeof source?.title === "string" ? source.title.trim() : "",
      url,
    });
  });

  if (sources.length === 0) {
    return "";
  }

  const sourceTexts = sources.map((source, index) => {
    const label = source.title ? `${index + 1}. ${source.title}:` : `${index + 1}.`;
    return `${label} ${source.url}`;
  });

  return `Lähteet: ${sourceTexts.join(" | ")}`;
}

function setSpeechStopButton(isVisible) {
  if (!elements.stopSpeechButton) {
    return;
  }

  elements.stopSpeechButton.hidden = !isVisible;
  elements.stopSpeechButton.disabled = !isVisible;
}

async function loadClientConfig() {
  try {
    const response = await fetch(CLIENT_CONFIG_ENDPOINT, {
      cache: "no-store",
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.error || `Client-konfigin lataus epäonnistui (${response.status})`);
    }

    const ttsEndpoint =
      typeof result.ttsEndpoint === "string" && result.ttsEndpoint.trim()
        ? result.ttsEndpoint.trim()
        : typeof result.ttsApiUrl === "string" && result.ttsApiUrl.trim()
        ? `${result.ttsApiUrl.trim().replace(/\/+$/, "")}/speak`
        : DEFAULT_TTS_ENDPOINT;
    const ttsVoice =
      typeof result.ttsVoice === "string" && result.ttsVoice.trim()
        ? result.ttsVoice.trim()
        : DEFAULT_TTS_VOICE;

    clientConfig = {
      ttsEndpoint,
      ttsVoice,
    };
  } catch (error) {
    console.warn("Client-konfigia ei saatu ladattua, käytetään oletus-TTS-osoitetta.", error);
    clientConfig = {
      ttsEndpoint: DEFAULT_TTS_ENDPOINT,
      ttsVoice: DEFAULT_TTS_VOICE,
    };
  }
}

function getTtsEndpoint() {
  return clientConfig.ttsEndpoint || DEFAULT_TTS_ENDPOINT;
}

function getTtsVoice() {
  return clientConfig.ttsVoice || DEFAULT_TTS_VOICE;
}

function getAgentAudioElement() {
  if (agentAudio) {
    return agentAudio;
  }

  agentAudio = elements.agentAudioElement || new Audio();
  agentAudio.preload = "auto";
  agentAudio.setAttribute("playsinline", "playsinline");
  setAgentAudioAutoplay(isResponseAudioEnabled(), agentAudio);
  return agentAudio;
}

function setAgentAudioAutoplay(enabled, audio = getAgentAudioElement()) {
  audio.autoplay = Boolean(enabled);

  if (enabled) {
    audio.setAttribute("autoplay", "");
  } else {
    audio.removeAttribute("autoplay");
  }
}

function updateAgentAudioPlayerVisibility() {
  if (!elements.agentAudioElement) {
    return;
  }

  const audioEnabled = isResponseAudioEnabled();

  setAgentAudioAutoplay(audioEnabled);
  elements.agentAudioElement.hidden = !audioEnabled;
}

async function unlockAgentAudioPlayback() {
  if (isAgentAudioUnlocked || !isResponseAudioEnabled()) {
    return;
  }

  const audio = getAgentAudioElement();
  const previousVolume = audio.volume;

  if (agentAudioObjectUrl || audio.currentSrc) {
    isAgentAudioUnlocked = true;
    return;
  }

  try {
    audio.pause();
    audio.muted = false;
    audio.volume = 1;
    audio.src = SILENT_WAV_DATA_URL;
    audio.load();
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    audio.removeAttribute("src");
    audio.load();
    audio.muted = false;
    audio.volume = previousVolume;
    isAgentAudioUnlocked = true;
    console.debug("[Mutinatulkki] Piilotettu audioelementti aktivoitu.");
  } catch (error) {
    audio.muted = false;
    audio.volume = previousVolume;
    console.debug("[Mutinatulkki] Audioelementin aktivointi odottaa käyttäjän elettä.", error);
  }
}

function pauseAgentAudio() {
  const audio = getAgentAudioElement();

  audio.pause();
  audio.onplay = null;
  audio.onended = null;
  audio.onerror = null;
  audio.muted = false;
}

function clearAgentAudioSource() {
  const audio = getAgentAudioElement();

  pauseAgentAudio();
  audio.removeAttribute("src");
  audio.load();

  if (agentAudioObjectUrl) {
    URL.revokeObjectURL(agentAudioObjectUrl);
    agentAudioObjectUrl = "";
  }
}

function finishAgentSpeech() {
  stopReliableVoiceInterruptCapture();
  stopInterruptRecognition();
  isSpeakingAgentAnswer = false;
  setSpeechStopButton(false);

  if (isSessionActive) {
    resetInactivityTimer();
    elements.speechStatus.textContent = "Hiljaisuus";
  } else {
    elements.speechStatus.textContent = "Odottaa";
  }
}

function stopAgentSpeech() {
  agentSpeechRequestId += 1;

  if (ttsAbortController) {
    ttsAbortController.abort();
    ttsAbortController = null;
  }

  if (window.speechSynthesis?.speaking || window.speechSynthesis?.pending) {
    window.speechSynthesis.cancel();
  }

  pauseAgentAudio();
  finishAgentSpeech();
}

function interruptAgentSpeech(transcript) {
  if (!isSpeakingAgentAnswer) {
    return;
  }

  stopAgentSpeech();
  setState("listening");
  elements.speechStatus.textContent = "Kuunnellaan puhetta";
  appendSessionLine(`Vastaus keskeytettiin puhekäskyllä: ${transcript}.`);
  setSupport("Vastaus keskeytettiin. Voit jatkaa puhumista.");
  resetInactivityTimer();
}

function startAgentSpeechPlayback(statusText) {
  stopAgentSpeech();

  const requestId = agentSpeechRequestId + 1;
  agentSpeechRequestId = requestId;
  isSpeakingAgentAnswer = true;
  setSpeechStopButton(true);
  resetInactivityTimer();
  updateAgentAudioPlayerVisibility();
  elements.speechStatus.textContent = statusText;
  startInterruptRecognition();

  return requestId;
}

function base64ToBlob(base64, mimeType = "audio/wav") {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

function getServerTtsAudio(result) {
  return result?.ttsAudio && typeof result.ttsAudio === "object" ? result.ttsAudio : null;
}

function isInterruptedAudioPlay(error) {
  const message = String(error?.message || "");
  return error?.name === "AbortError" || message.includes("play() request was interrupted");
}

function getPlaybackErrorMessage(error) {
  return String(error?.message || "").trim() || "tuntematon virhe";
}

async function playServerTtsAudio(ttsAudio) {
  if (!ttsAudio) {
    return false;
  }

  if (!ttsAudio.ok) {
    throw new Error(ttsAudio.error || "HH-TTSservice ei palauttanut ääntä.");
  }

  if (!ttsAudio.base64) {
    throw new Error("HH-TTSservice palautti äänen ilman audiodataa.");
  }

  const requestId = startAgentSpeechPlayback("Käynnistetään puheääntä");
  const audioBlob = base64ToBlob(ttsAudio.base64, ttsAudio.mimeType || "audio/wav");
  await playAgentAudioBlob(audioBlob, requestId);
  return true;
}

async function playAgentAudioBlob(audioBlob, requestId) {
  if (!audioBlob || audioBlob.size <= 0) {
    throw new Error("HH-TTSservice palautti tyhjän audion.");
  }

  const audio = getAgentAudioElement();

  updateAgentAudioPlayerVisibility();
  pauseAgentAudio();

  if (agentAudioObjectUrl) {
    URL.revokeObjectURL(agentAudioObjectUrl);
    agentAudioObjectUrl = "";
  }

  agentAudioObjectUrl = URL.createObjectURL(audioBlob);
  audio.muted = false;
  audio.volume = 1;
  setAgentAudioAutoplay(isResponseAudioEnabled(), audio);
  audio.src = agentAudioObjectUrl;
  audio.preload = "auto";
  audio.load();
  audio.onplay = () => {
    if (requestId !== agentSpeechRequestId) {
      return;
    }
    resetInactivityTimer();
    elements.speechStatus.textContent = "Luetaan vastausta";
  };
  audio.onended = () => {
    if (requestId === agentSpeechRequestId) {
      finishAgentSpeech();
    }
  };
  audio.onerror = () => {
    if (requestId !== agentSpeechRequestId) {
      return;
    }
    setSupport("Äänen toisto epäonnistui selaimessa. Voit yrittää uudelleen näkyvän soittimen play-napista.", true);
    finishAgentSpeech();
  };

  try {
    if (!isResponseAudioEnabled() || requestId !== agentSpeechRequestId) {
      return;
    }

    await audio.play();
  } catch (error) {
    if (isInterruptedAudioPlay(error) && requestId !== agentSpeechRequestId) {
      return;
    }
    throw error;
  }
}

async function speakAgentAnswer(answer, hasSources = false) {
  const cleanAnswer = normalizeWhitespace(answer);

  if (!cleanAnswer || !isResponseAudioEnabled()) {
    return;
  }

  const speechText = cleanAnswer;
  const requestId = startAgentSpeechPlayback("Muodostetaan puheääntä");
  const controller = new AbortController();

  ttsAbortController = controller;

  try {
    const response = await fetch(getTtsEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: speechText,
        voice: getTtsVoice(),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorMessage = `HH-TTSservice palautti virheen (${response.status})`;
      const errorText = await response.text();

      try {
        const errorBody = errorText ? JSON.parse(errorText) : {};
        errorMessage = errorBody.detail || errorBody.error || errorText || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      throw new Error(errorMessage);
    }

    const audioBlob = await response.blob();

    if (controller.signal.aborted || requestId !== agentSpeechRequestId) {
      return;
    }

    await playAgentAudioBlob(audioBlob, requestId);
  } catch (error) {
    if (requestId !== agentSpeechRequestId) {
      return;
    }

    if (error.name === "NotAllowedError") {
      isAgentAudioUnlocked = false;
      setSupport("Selain esti automaattisen toiston. Uusin ääni on ladattu näkyvään soittimeen, paina sen play-nappia.", true);
    } else if (!isInterruptedAudioPlay(error)) {
      setSupport(`Puheäänen muodostus tai toisto epäonnistui: ${getPlaybackErrorMessage(error)}`, true);
    }
    finishAgentSpeech();
  } finally {
    if (ttsAbortController === controller) {
      ttsAbortController = null;
    }
  }
}

function appendTulkkiLog(message) {
  appendSessionLine(`Tulkki: ${message}`);
}

function formatBytes(bytes) {
  const safeBytes = Number(bytes) || 0;

  if (safeBytes < 1024) {
    return `${safeBytes} B`;
  }

  if (safeBytes < 1024 * 1024) {
    return `${(safeBytes / 1024).toFixed(1)} kB`;
  }

  return `${(safeBytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getTulkkiPipelineSummary(result) {
  const transcription = result?.transcription || {};
  const interpretation = result?.interpretation || {};
  const normalization = result?.normalization || interpretation.normalization || {};
  const sttProvider = transcription.provider || "tuntematon";
  const rawChars = String(transcription.text || result?.rawTranscript || "").length;
  const attemptCount = Array.isArray(transcription.attempts)
    ? transcription.attempts.length
    : Array.isArray(result?.debug?.stt?.attempts)
      ? result.debug.stt.attempts.length
      : 0;
  const sttState = transcription.draftUsed
    ? "selaindraft"
    : transcription.configured === false
      ? "ei määritetty"
      : rawChars > 0
        ? "ok"
        : "ei tekstiä";
  const interpretationProvider = interpretation.provider || "tuntematon";
  const model = interpretation.model ? `/${interpretation.model}` : "";
  const dialectProfile = normalization?.dialect?.profile;
  const dialect = dialectProfile && dialectProfile !== "standard_fi"
    ? `, normalisointi ${dialectProfile}`
    : "";

  return `STT ${sttProvider} (${sttState}, raakateksti ${rawChars} merkkiä, yrityksiä ${attemptCount}), teksti ${interpretationProvider}${model}${dialect}.`;
}

function formatTulkkiAttempt(attempt) {
  const provider = attempt?.provider || "tuntematon";
  const state = attempt?.configured === false ? "ei määritetty" : "ajettu";
  const chars = Number(attempt?.textChars || 0);
  const timing = Number.isFinite(Number(attempt?.timingMs)) ? `, ${attempt.timingMs} ms` : "";
  const model = attempt?.model ? `, malli=${attempt.model}` : "";
  const endpoint = attempt?.endpoint ? `, endpoint=${attempt.endpoint}` : "";
  const error = attempt?.error ? `, virhe=${attempt.error}` : "";

  return `${provider}: ${state}, teksti ${chars} merkkiä${timing}${model}${endpoint}${error}`;
}

function getTulkkiDebugLines(result) {
  const transcription = result?.transcription || {};
  const debug = result?.debug || {};
  const quality = result?.quality || {};
  const attempts = Array.isArray(transcription.attempts)
    ? transcription.attempts
    : Array.isArray(debug?.stt?.attempts)
      ? debug.stt.attempts
      : [];
  const timings = debug.timingsMs || {};
  const audio = debug.audio || {};
  const hints = Array.isArray(transcription.setupHints)
    ? transcription.setupHints
    : Array.isArray(debug?.stt?.readiness?.setupHints)
      ? debug.stt.readiness.setupHints
      : [];
  const segments = Array.isArray(transcription.segments) ? transcription.segments : [];
  const rejectedSegments = Array.isArray(transcription.rejectedSegments) ? transcription.rejectedSegments : [];
  const lines = [];

  if (debug.requestId || result?.requestId || timings.total !== undefined) {
    lines.push(
      `debug request=${debug.requestId || result?.requestId || "-"}, chunk=${audio.chunkIndex || "-"}, kokonaisaika=${timings.total ?? "-"} ms, STT=${timings.transcribe ?? "-"} ms, tulkinta=${timings.interpret ?? "-"} ms.`,
    );
  }

  const rawTranscript = normalizeWhitespace(transcription.text || result?.rawTranscript || "");
  if (rawTranscript) {
    lines.push(`Raakateksti: "${rawTranscript.slice(0, 180)}"`);
  }

  if (quality.accepted === false) {
    const reasons = Array.isArray(quality.reasons) && quality.reasons.length > 0
      ? quality.reasons.join(", ")
      : "ei tarkkaa syytä";
    const rejected = normalizeWhitespace(quality.candidateRejected || result?.candidateRejected || "");
    const preview = rejected ? ` Hylätty ehdokas: "${rejected.slice(0, 120)}"` : "";
    lines.push(`Laatuportti: puhe jäi epäselväksi (${reasons}).${preview}`);
  }

  attempts.slice(0, 3).forEach((attempt, index) => {
    lines.push(`STT yritys ${index + 1}: ${formatTulkkiAttempt(attempt)}.`);
  });

  if (segments.length > 0) {
    const preview = segments
      .slice(0, 3)
      .map((segment) => `${segment.start}-${segment.end}s "${segment.text}"`)
      .join(" | ");
    lines.push(`STT segmentit ${segments.length}: ${preview}`);
  }

  if (rejectedSegments.length > 0) {
    const preview = rejectedSegments
      .slice(0, 2)
      .map((segment) => {
        const reasons = Array.isArray(segment.rejectedReasons)
          ? ` (${segment.rejectedReasons.join(", ")})`
          : "";
        return `${segment.start}-${segment.end}s "${segment.text}"${reasons}`;
      })
      .join(" | ");
    lines.push(`STT hylkäsi ${rejectedSegments.length} epäilyttävää segmenttiä: ${preview}`);
  }

  const interpretation = result?.interpretation || {};
  const normalization = result?.normalization || interpretation.normalization || {};
  if (normalization?.mode) {
    const dialect = normalization?.dialect?.label || normalization?.dialect?.profile || "tuntematon";
    const replacementCount = Number(normalization.replacementCount || 0);
    const replacements = Array.isArray(normalization.replacements)
      ? normalization.replacements.slice(0, 4)
      : [];
    const preview = replacements.length > 0
      ? `: ${replacements.map((item) => `${item.from}->${item.to}`).join(", ")}`
      : "";
    lines.push(`Normalisointi: ${dialect}, muutoksia ${replacementCount}${preview}.`);
  }

  const interpretationNote = normalizeWhitespace(interpretation.note || "");
  if (interpretationNote && !transcription.text) {
    lines.push(`Tulkin huomio: ${interpretationNote}`);
  }

  if (hints.length > 0 && !transcription.text) {
    hints.slice(0, 3).forEach((hint) => {
      lines.push(`STT-ohje: ${hint}`);
    });
  }

  if (transcription.note && !transcription.text) {
    lines.push(`STT huomio: ${transcription.note}`);
  }

  return lines;
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getSpeechRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function getBrowserSttFinalSegments() {
  return Array.from(browserSttResultMap.entries())
    .sort(([left], [right]) => left - right)
    .map(([, value]) => value)
    .filter(Boolean);
}

function resetBrowserSttDraft() {
  browserSttResultMap = new Map();
  browserSttErrors = [];
  browserSttLastInterimText = "";
  browserSttChunkStartFinalIndex = 0;
  browserSttStarted = false;

  if (elements.interimText) {
    elements.interimText.textContent = "";
  }
}

function markBrowserSttChunkStart() {
  browserSttChunkStartFinalIndex = getBrowserSttFinalSegments().length;
  browserSttLastInterimText = "";
}

function getBrowserSttChunkDraft() {
  const finalSegments = getBrowserSttFinalSegments();
  const chunkSegments = finalSegments.slice(browserSttChunkStartFinalIndex);
  const finalText = normalizeWhitespace(chunkSegments.join(" "));
  const interimText = normalizeWhitespace(browserSttLastInterimText);
  const available = Boolean(getSpeechRecognitionConstructor());

  return {
    enabled: BROWSER_STT_ENABLED,
    available,
    started: browserSttStarted,
    source: finalText
      ? "browser_speech_recognition"
      : interimText
        ? "browser_speech_recognition_interim"
        : "none",
    language: BROWSER_STT_LANGUAGE,
    finalText: finalText || null,
    interimText: interimText || null,
    finalSegments: chunkSegments,
    sessionFinalSegments: finalSegments,
    errors: [...browserSttErrors],
    userCorrections: [],
    note: "Selain tuottaa vertailudraftin. Lopullinen teksti tulee serverin audiontulkinnasta.",
  };
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForBrowserSttDraftFlush() {
  if (!BROWSER_STT_ENABLED || !getSpeechRecognitionConstructor()) {
    return;
  }

  const startedAt = performance.now();
  let previousText = "";
  let stableCount = 0;

  while (performance.now() - startedAt < BROWSER_STT_DRAFT_FLUSH_MS) {
    const draft = getBrowserSttChunkDraft();
    const text = normalizeWhitespace(draft.finalText || draft.interimText || "");

    if (text && text === previousText) {
      stableCount += 1;
      if (stableCount >= 2) {
        return;
      }
    } else {
      stableCount = 0;
      previousText = text;
    }

    await wait(BROWSER_STT_DRAFT_FLUSH_INTERVAL_MS);
  }
}

function normalizeInterruptCommand(text) {
  return normalizeWhitespace(text)
    .toLocaleLowerCase("fi-FI")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isVoiceInterruptCommand(text) {
  const normalized = normalizeInterruptCommand(text);
  // While sound is playing Chrome may return the tail of the assistant's
  // answer together with the user's command as one long transcript. The
  // command itself is at the end, so do not reject it just because the whole
  // recognition result contains more than a few words.
  const commandTail = normalized.split(/\s+/).filter(Boolean).slice(-5).join(" ");
  if (VOICE_INTERRUPT_PATTERN.test(commandTail)) {
    return true;
  }

  // Faster Whisper can split a short command into syllables (for example
  // "Lope a e ta"). Joining only the command candidate keeps this tolerant
  // without treating ordinary answer text as a stop command.
  const compactCommand = commandTail.replace(/[^a-z]/g, "");
  return /^(?:lop\w{0,6}ta|ope\w{0,5}ta|kaskalu|keskalu|seis|stop|keskeyt\w*)$/.test(compactCommand);
}

function isConversationStopCommand(text, allowBareStop = false) {
  const normalized = normalizeInterruptCommand(text);
  return (
    CONVERSATION_STOP_PATTERN.test(normalized) ||
    // The recognizer occasionally loses the soft initial L in "lopeta" or
    // returns the observed one-word form "käskälu".  These forms are only
    // accepted as commands when no normal answer is being handled.
    (allowBareStop && /^(?:lopeta|opeta|kaskalu|keskalu)[.!?]*$/.test(normalized))
  );
}

function stopConversationByVoiceCommand(transcript) {
  appendTulkkiLog(`Keskustelun lopetus tunnistettiin puhekomennosta: "${transcript}".`);
  stopConversation("voice_command").catch((error) => {
    setSupport(`Keskustelun lopetus epäonnistui: ${error.message}`, true);
  });
}

function startInterruptRecognition() {
  if (isSessionActive && isSpeakingAgentAnswer) {
    startBrowserSpeechRecognition("interrupt");
  }
}

function stopInterruptRecognition() {
  if (speechRecognitionMode === "interrupt" || (speechRecognition && isSpeakingAgentAnswer)) {
    stopBrowserSpeechRecognition();
  }
}

function startBrowserSpeechRecognition(mode = "draft") {
  const isInterruptMode = mode === "interrupt";

  if (!BROWSER_STT_ENABLED && !isInterruptMode) {
    return;
  }

  const SpeechRecognitionConstructor = getSpeechRecognitionConstructor();

  if (!SpeechRecognitionConstructor) {
    if (isInterruptMode) {
      setSupport("Puhekäskyjen keskeytys vaatii Chrome-selaimen puheentunnistuksen. Käytä tarvittaessa Pysäytä puhe -painiketta.");
    } else {
      appendTulkkiLog("selaimen STT-draft ei ole käytettävissä tässä selaimessa.");
    }
    return;
  }

  if (speechRecognition) {
    return;
  }

  const recognition = new SpeechRecognitionConstructor();
  recognition.lang = BROWSER_STT_LANGUAGE;
  recognition.continuous = true;
  recognition.interimResults = true;
  // During TTS playback a spoken stop command is more important than the
  // top transcription candidate (which may contain sound from the speaker).
  recognition.maxAlternatives = isInterruptMode ? 3 : 1;

  recognition.onstart = () => {
    browserSttStarted = true;
    speechRecognitionMode = mode;
    if (!isInterruptMode) {
      appendTulkkiLog(`selaimen STT-draft käynnissä (${BROWSER_STT_LANGUAGE}).`);
    }
  };

  recognition.onresult = (event) => {
    const interimParts = [];

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const alternatives = Array.from(result || [])
        .map((alternative) => normalizeWhitespace(alternative?.transcript))
        .filter(Boolean);
      const transcript = alternatives[0] || "";

      if (!transcript) {
        continue;
      }

      if (isInterruptMode) {
        // Check every interim alternative before doing anything else. This
        // makes "lopeta" interrupt immediately even if the answer leaking
        // from the loudspeaker became the recognizer's first candidate.
        const stopConversationTranscript = alternatives.find((candidate) => isConversationStopCommand(candidate));
        if (stopConversationTranscript) {
          stopConversationByVoiceCommand(stopConversationTranscript);
          return;
        }

        const interruptTranscript = alternatives.find((candidate) => isVoiceInterruptCommand(candidate));
        if (interruptTranscript) {
          interruptAgentSpeech(interruptTranscript);
          return;
        }

        continue;
      }

      if (result.isFinal) {
        browserSttResultMap.set(index, transcript);
      } else {
        interimParts.push(transcript);
      }
    }

    if (isInterruptMode) {
      return;
    }

    browserSttLastInterimText = normalizeWhitespace(interimParts.join(" "));
    elements.interimText.textContent = browserSttLastInterimText
      ? `Kuulen: ${browserSttLastInterimText}`
      : "";
  };

  recognition.onerror = (event) => {
    const message = event?.error || "tuntematon virhe";
    browserSttErrors.push(message);

    if (!isInterruptMode && !["no-speech", "aborted"].includes(message)) {
      appendTulkkiLog(`selaimen STT-draft virhe: ${message}.`);
    }
  };

  recognition.onend = () => {
    browserSttStarted = false;
    speechRecognition = null;
    speechRecognitionMode = null;

    const shouldRestartInterrupt = isInterruptMode && isSessionActive && isSpeakingAgentAnswer && !isStoppingSession;
    const shouldRestartDraft = !isInterruptMode && BROWSER_STT_ENABLED && isSessionActive && !isStoppingSession;
    if (shouldRestartInterrupt || shouldRestartDraft) {
      window.clearTimeout(speechRecognitionRestartTimerId);
      speechRecognitionRestartTimerId = window.setTimeout(() => startBrowserSpeechRecognition(mode), 350);
    }
  };

  speechRecognition = recognition;

  try {
    recognition.start();
  } catch (error) {
    browserSttErrors.push(error.message);
    speechRecognition = null;
    appendTulkkiLog(`selaimen STT-draft ei käynnistynyt: ${error.message}.`);
  }
}

function stopBrowserSpeechRecognition() {
  window.clearTimeout(speechRecognitionRestartTimerId);
  speechRecognitionRestartTimerId = null;

  if (!speechRecognition) {
    browserSttStarted = false;
    return;
  }

  const recognition = speechRecognition;
  speechRecognition = null;
  speechRecognitionMode = null;
  recognition.onend = null;

  try {
    recognition.stop();
  } catch {
    try {
      recognition.abort();
    } catch {
      // Lopetus on paras yritys; selain voi jo olla sulkenut tunnistuksen.
    }
  }

  browserSttStarted = false;
}

function setTimer(progress, secondsLeft) {
  const safeProgress = Math.max(0, Math.min(100, progress));
  elements.timerFill.style.width = `${safeProgress}%`;
  elements.timerText.textContent = `${secondsLeft} s`;
}

function resetTimer() {
  setTimer(0, getInactivityTimeoutSeconds());
}

function createConversationId() {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  return `keskustelu-${timestamp}`;
}

function calculateUncertainty(audioBlob) {
  const score = audioBlob && audioBlob.size > 0 ? 1 : 0;

  return {
    score,
    threshold: UNCERTAINTY_AUDIO_THRESHOLD,
    sendAudio: Boolean(
      audioBlob &&
        audioBlob.size > 0 &&
        (ALWAYS_SEND_AUDIO || score >= UNCERTAINTY_AUDIO_THRESHOLD),
    ),
    reasons: ["audio_sent_with_browser_stt_draft"],
    signals: {
      alwaysSendAudio: ALWAYS_SEND_AUDIO,
      browserSttEnabled: BROWSER_STT_ENABLED,
      audioBytes: audioBlob?.size || 0,
    },
  };
}

function resetInactivityTimer() {
  if (!isSessionActive) {
    return;
  }

  inactivityStartedAt = Date.now();
  updateInactivityMeter();
}

function startInactivityTimer() {
  stopInactivityTimer();
  resetInactivityTimer();
  timerId = window.setInterval(updateInactivityMeter, 250);
}

function stopInactivityTimer() {
  window.clearInterval(timerId);
  timerId = null;
}

function updateInactivityMeter() {
  if (!isSessionActive || inactivityStartedAt === 0) {
    resetTimer();
    return;
  }

  const elapsedMs = Date.now() - inactivityStartedAt;
  const inactivityTimeoutMs = getInactivityTimeoutMs();
  const progress = (elapsedMs / inactivityTimeoutMs) * 100;
  const secondsLeft = Math.max(0, Math.ceil((inactivityTimeoutMs - elapsedMs) / 1000));

  setTimer(progress, secondsLeft);

  if (elapsedMs >= inactivityTimeoutMs) {
    stopConversation("timeout");
  }
}

function clearSpeechTurnTimers() {
  window.clearTimeout(likelyEndTimerId);
  window.clearTimeout(finalResponseTimerId);
  likelyEndTimerId = null;
  finalResponseTimerId = null;
}

function resetSpeechTurnDetection() {
  clearSpeechTurnTimers();
  lastConfirmedSpeechAtMs = 0;
  likelyEndStartedAtMs = 0;
  setSpeechTurnState(SPEECH_TURN_STATES.LISTENING);
}

function resetSessionSpeechTimingStats() {
  sessionSpeechTimingStats = {
    ...createEmptySpeechTimingStats(),
    consecutiveFalseEndings: speechTimingConfig.consecutiveFalseEndings,
  };
}

function setVadSpeechStatus(message) {
  const waitingForTurnEnd =
    speechTurnState === SPEECH_TURN_STATES.LIKELY_END ||
    speechTurnState === SPEECH_TURN_STATES.WAITING_CONFIRMATION;

  if (!waitingForTurnEnd) {
    elements.speechStatus.textContent = message;
  }
}

function registerConfirmedSpeechActivity(now) {
  if (!isSessionActive) {
    return;
  }

  lastConfirmedSpeechAtMs = now;
  resetInactivityTimer();

  if (
    speechTurnState === SPEECH_TURN_STATES.LIKELY_END ||
    speechTurnState === SPEECH_TURN_STATES.WAITING_CONFIRMATION
  ) {
    markSpeechContinued();
    return;
  }

  if (speechTurnState !== SPEECH_TURN_STATES.LISTENING) {
    setSpeechTurnState(SPEECH_TURN_STATES.LISTENING);
  }
}

function recordFalseEndingMeasurement() {
  sessionSpeechTimingStats.falseEndings += 1;
  sessionSpeechTimingStats.consecutiveFalseEndings += 1;
}

function recordConfirmedEndingMeasurement() {
  sessionSpeechTimingStats.confirmedEndings += 1;
  sessionSpeechTimingStats.consecutiveFalseEndings = 0;
}

function markSpeechContinued() {
  clearSpeechTurnTimers();
  recordFalseEndingMeasurement();
  setSpeechTurnState(SPEECH_TURN_STATES.CONTINUED);
  elements.speechStatus.textContent = "Puhe jatkui, lopetus peruttiin";
  setState("listening");
  setSupport(
    "Puhe jatkui välikuittauksen jälkeen. Merkintä kerätään trendiin, mutta konfigia säädetään vasta keskustelun lopussa.",
  );

  window.setTimeout(() => {
    if (isSessionActive && speechTurnState === SPEECH_TURN_STATES.CONTINUED) {
      setSpeechTurnState(SPEECH_TURN_STATES.LISTENING);
    }
  }, VAD_CONFIG.sampleIntervalMs);
}

async function confirmFinalSpeechEnd() {
  if (
    !isSessionActive ||
    (
      speechTurnState !== SPEECH_TURN_STATES.LIKELY_END &&
      speechTurnState !== SPEECH_TURN_STATES.WAITING_CONFIRMATION
    )
  ) {
    return;
  }

  if (recorder?.state === "recording" && !isCurrentChunkConfirmed && speechCandidateDurationMs > 0) {
    finalResponseTimerId = window.setTimeout(confirmFinalSpeechEnd, VAD_CONFIG.minSpeechStartMs);
    elements.speechStatus.textContent = "Tarkistetaan jatkaako käyttäjä";
    return;
  }

  clearSpeechTurnTimers();
  recordConfirmedEndingMeasurement();
  setSpeechTurnState(SPEECH_TURN_STATES.FINAL_END);
  lastConfirmedSpeechAtMs = 0;
  likelyEndStartedAtMs = 0;
  elements.speechStatus.textContent = "Lopetus varmistettu";
  setState("answering");
  appendSessionLine("Puheen loppu varmistui. Odotetaan tulkin tekstivastausta.");
  setSupport(
    "Lopetus varmistui. Mittaus kirjataan trendiin keskustelun lopussa.",
  );

  if (recorder?.state === "recording") {
    await stopSpeechChunk("final_silence");
  }

  window.setTimeout(() => {
    if (isSessionActive && speechTurnState === SPEECH_TURN_STATES.FINAL_END) {
      setSpeechTurnState(SPEECH_TURN_STATES.LISTENING);
      setState("listening");
      elements.speechStatus.textContent = "Hiljaisuus";
    }
  }, FINAL_RESPONSE_CONFIRMATION_MS);
}

function enterLikelySpeechEnd(now) {
  if (speechTurnState !== SPEECH_TURN_STATES.LISTENING || lastConfirmedSpeechAtMs === 0) {
    return;
  }

  likelyEndStartedAtMs = now;
  setSpeechTurnState(SPEECH_TURN_STATES.LIKELY_END);
  elements.speechStatus.textContent = "Mahdollinen puheen lopetus";
  setState("answering");
  if (speechTimingConfig.backchannelText.trim()) {
    appendSessionLine(speechTimingConfig.backchannelText);
  }

  likelyEndTimerId = window.setTimeout(() => {
    if (isSessionActive && speechTurnState === SPEECH_TURN_STATES.LIKELY_END) {
      setSpeechTurnState(SPEECH_TURN_STATES.WAITING_CONFIRMATION);
      elements.speechStatus.textContent = "Odotetaan jatkaako käyttäjä";
    }
  }, LIKELY_END_VISIBLE_MS);

  finalResponseTimerId = window.setTimeout(
    confirmFinalSpeechEnd,
    LIKELY_END_VISIBLE_MS + FINAL_RESPONSE_CONFIRMATION_MS,
  );
}

function updateSpeechTurnTaking(now) {
  if (!isSessionActive || lastConfirmedSpeechAtMs === 0) {
    return;
  }

  if (speechTurnState !== SPEECH_TURN_STATES.LISTENING) {
    return;
  }

  if (now - lastConfirmedSpeechAtMs >= getChunkSilenceTimeoutMs()) {
    enterLikelySpeechEnd(now);
  }
}

function getSpeechTimingTrendDecision(nextConfig) {
  const endingCount = nextConfig.falseEndings + nextConfig.confirmedEndings;

  if (endingCount < MIN_MEASUREMENTS_BEFORE_ADAPTIVE_UPDATE) {
    return {
      adaptivePauseThresholdMs: nextConfig.adaptivePauseThresholdMs,
      changed: false,
      reason: `odotetaan vähintään ${MIN_MEASUREMENTS_BEFORE_ADAPTIVE_UPDATE} puheen lopetuksen mittauspistettä`,
    };
  }

  const falseEndingRate = nextConfig.falseEndings / endingCount;

  if (falseEndingRate >= 0.3 || nextConfig.consecutiveFalseEndings >= 2) {
    return {
      adaptivePauseThresholdMs: nextConfig.adaptivePauseThresholdMs + ADAPTIVE_FALSE_ENDING_STEP_MS,
      changed: true,
      reason: "käyttäjä jatkoi usein välikuittauksen jälkeen",
    };
  }

  if (falseEndingRate <= 0.15 && nextConfig.confirmedEndings > nextConfig.falseEndings) {
    return {
      adaptivePauseThresholdMs: nextConfig.adaptivePauseThresholdMs - ADAPTIVE_CONFIRMED_ENDING_STEP_MS,
      changed: true,
      reason: "lopetukset ovat olleet enimmäkseen oikeita",
    };
  }

  return {
    adaptivePauseThresholdMs: nextConfig.adaptivePauseThresholdMs,
    changed: false,
    reason: "trendi ei vielä puolla säätöä",
  };
}

function buildSpeechTimingConfigMessage(previousConfig, nextConfig, decision, measurementCount) {
  const pauseChange =
    previousConfig.adaptivePauseThresholdMs === nextConfig.adaptivePauseThresholdMs
      ? `taukoraja pysyi ${nextConfig.adaptivePauseThresholdMs} ms`
      : `taukoraja ${previousConfig.adaptivePauseThresholdMs} -> ${nextConfig.adaptivePauseThresholdMs} ms`;

  if (measurementCount === 0) {
    return [
      "Konfigipäivitys:",
      `keskustelut ${previousConfig.numberOfConversations} -> ${nextConfig.numberOfConversations}`,
      "ei puheen lopetuksen mittauspisteitä",
      `${pauseChange}.`,
    ].join(" ");
  }

  return [
    "Konfigipäivitys:",
    `keskustelut ${previousConfig.numberOfConversations} -> ${nextConfig.numberOfConversations}`,
    `väärät lopetukset +${sessionSpeechTimingStats.falseEndings}`,
    `vahvistetut lopetukset +${sessionSpeechTimingStats.confirmedEndings}`,
    `${pauseChange} (${decision.reason}).`,
  ].join(" ");
}

async function finalizeSpeechTimingConversation() {
  const measurementCount =
    sessionSpeechTimingStats.falseEndings + sessionSpeechTimingStats.confirmedEndings;
  const previousConfig = normalizeSpeechTimingConfig(speechTimingConfig);
  const mergedConfig = normalizeSpeechTimingConfig({
    ...previousConfig,
    falseEndings: previousConfig.falseEndings + sessionSpeechTimingStats.falseEndings,
    confirmedEndings: previousConfig.confirmedEndings + sessionSpeechTimingStats.confirmedEndings,
    consecutiveFalseEndings: sessionSpeechTimingStats.consecutiveFalseEndings,
    numberOfConversations: previousConfig.numberOfConversations + 1,
  });
  const decision = getSpeechTimingTrendDecision(mergedConfig);

  speechTimingConfig = normalizeSpeechTimingConfig({
    ...mergedConfig,
    adaptivePauseThresholdMs: decision.adaptivePauseThresholdMs,
  });

  appendSessionLine(
    buildSpeechTimingConfigMessage(previousConfig, speechTimingConfig, decision, measurementCount),
  );

  await persistSpeechTimingConfig();
}

function stopVad() {
  window.clearInterval(vadTimerId);
  vadTimerId = null;
  silenceStartedAt = 0;
  noiseCalibrationEndsAtMs = 0;
  noiseCalibrationSamples = [];
  noiseFloorRms = 0;
}

function startNoiseCalibration() {
  noiseFloorRms = 0;
  noiseCalibrationSamples = [];
  noiseCalibrationEndsAtMs = Date.now() + NOISE_CALIBRATION_MS;
}

function updateNoiseCalibration(rms, now) {
  if (!noiseCalibrationEndsAtMs) {
    return false;
  }

  if (now < noiseCalibrationEndsAtMs) {
    noiseCalibrationSamples.push(rms);
    elements.speechStatus.textContent = "Kalibroidaan taustamelua";
    return true;
  }

  const sortedSamples = [...noiseCalibrationSamples].sort((a, b) => a - b);
  const percentileIndex = Math.min(
    sortedSamples.length - 1,
    Math.floor(sortedSamples.length * NOISE_FLOOR_PERCENTILE),
  );
  noiseFloorRms = sortedSamples.length > 0 ? sortedSamples[percentileIndex] : 0;
  noiseCalibrationSamples = [];
  noiseCalibrationEndsAtMs = 0;
  elements.speechStatus.textContent = "Kuunnellaan puhetta";
  return false;
}

function cleanupStream() {
  if (!audioStream) {
    return;
  }

  audioStream.getTracks().forEach((track) => track.stop());
  audioStream = null;
}

async function cleanupAudioAnalysis() {
  stopVad();
  analyser = null;
  analyserBuffer = null;

  if (audioContext) {
    const contextToClose = audioContext;
    audioContext = null;

    if (contextToClose.state !== "closed") {
      await contextToClose.close();
    }
  }
}

function setupAudioAnalysis(stream) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    throw new Error("Selain ei tue äänen voimakkuuden tunnistusta.");
  }

  audioContext = new AudioContextClass();
  const source = audioContext.createMediaStreamSource(stream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.25;
  analyserBuffer = new Uint8Array(analyser.fftSize);
  source.connect(analyser);
}

function getCurrentRms() {
  if (!analyser || !analyserBuffer) {
    return 0;
  }

  analyser.getByteTimeDomainData(analyserBuffer);

  let sum = 0;

  for (const sample of analyserBuffer) {
    const centered = (sample - 128) / 128;
    sum += centered * centered;
  }

  return Math.sqrt(sum / analyserBuffer.length);
}

function isReliableVoiceInterruptCommand(text) {
  const normalized = normalizeInterruptCommand(text);
  if (/\blopet\w*\s+(?:vasta\w*|puhe\w*)\b/.test(normalized)) {
    return true;
  }

  // Whisper may split the command into syllables, so also recognize the
  // compact form of the two-word command.
  const compact = normalized.replace(/[^a-z]/g, "");
  return /^lop\w{0,8}(?:vasta\w*|puhe\w*)$/.test(compact);
}

async function checkReliableVoiceInterrupt(audioBlob, speechRequestId) {
  try {
    const response = await fetch(INTERRUPT_CAPTURE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId,
        recording: {
          chunk: {
            index: `interrupt-${Date.now()}`,
            durationMs: Date.now() - interruptCommandStartedAtMs,
          },
        },
        audio: {
          fileName: "lopeta-vastaaminen.webm",
          mimeType: audioBlob.type || "audio/webm",
          sizeBytes: audioBlob.size,
          base64: await blobToBase64(audioBlob),
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    const transcript = normalizeWhitespace(result?.text || result?.rawTranscript || "");
    if (
      speechRequestId === agentSpeechRequestId
      && isSpeakingAgentAnswer
      && isReliableVoiceInterruptCommand(transcript)
    ) {
      interruptAgentSpeech(transcript);
    }
  } catch (error) {
    appendTulkkiLog(`keskeytyskomennon paikallinen tarkistus epäonnistui: ${error.message}`);
  } finally {
    interruptCommandChecking = false;
    interruptCommandCooldownUntilMs = Date.now() + INTERRUPT_COMMAND_COOLDOWN_MS;
  }
}

function stopReliableVoiceInterruptCapture() {
  if (interruptCommandRecorder?.state === "recording") {
    interruptCommandRecorder.stop();
  }
}

function startReliableVoiceInterruptCapture() {
  if (
    interruptCommandRecorder?.state === "recording"
    || interruptCommandChecking
    || !audioStream
    || !window.MediaRecorder
  ) {
    return;
  }

  const speechRequestId = agentSpeechRequestId;
  interruptCommandAudioChunks = [];
  interruptCommandStartedAtMs = Date.now();
  interruptCommandSilenceAtMs = 0;
  interruptCommandSpeechMs = VAD_CONFIG.sampleIntervalMs;

  const mimeType = getSupportedMimeType();
  const activeRecorder = mimeType
    ? new MediaRecorder(audioStream, { mimeType })
    : new MediaRecorder(audioStream);
  interruptCommandRecorder = activeRecorder;

  activeRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      interruptCommandAudioChunks.push(event.data);
    }
  };

  activeRecorder.onstop = () => {
    if (interruptCommandRecorder === activeRecorder) {
      interruptCommandRecorder = null;
    }

    const audioBlob = new Blob(interruptCommandAudioChunks, { type: activeRecorder.mimeType || "audio/webm" });
    interruptCommandAudioChunks = [];
    if (
      interruptCommandSpeechMs < INTERRUPT_COMMAND_MIN_SPEECH_MS
      || audioBlob.size < VAD_CONFIG.minChunkBytes
      || speechRequestId !== agentSpeechRequestId
      || !isSpeakingAgentAnswer
    ) {
      interruptCommandCooldownUntilMs = Date.now() + INTERRUPT_COMMAND_COOLDOWN_MS;
      return;
    }

    interruptCommandChecking = true;
    checkReliableVoiceInterrupt(audioBlob, speechRequestId);
  };

  activeRecorder.start(100);
}

function handleReliableVoiceInterruptVadTick() {
  const now = Date.now();
  const rms = getCurrentRms();

  if (interruptCommandRecorder?.state !== "recording") {
    if (
      !interruptCommandChecking
      && now >= interruptCommandCooldownUntilMs
      && rms >= INTERRUPT_COMMAND_THRESHOLD
    ) {
      startReliableVoiceInterruptCapture();
    }
    return;
  }

  if (rms >= INTERRUPT_COMMAND_THRESHOLD) {
    interruptCommandSpeechMs += VAD_CONFIG.sampleIntervalMs;
    interruptCommandSilenceAtMs = 0;
  } else {
    interruptCommandSilenceAtMs = interruptCommandSilenceAtMs || now;
  }

  if (
    now - interruptCommandStartedAtMs >= INTERRUPT_COMMAND_MAX_MS
    || (
      interruptCommandSilenceAtMs
      && now - interruptCommandSilenceAtMs >= INTERRUPT_COMMAND_SILENCE_MS
    )
  ) {
    stopReliableVoiceInterruptCapture();
  }
}

function startVad() {
  stopVad();
  vadTimerId = window.setInterval(handleVadTick, VAD_CONFIG.sampleIntervalMs);
}

function handleVadTick() {
  if (!isSessionActive || !analyser) {
    return;
  }

  if (isSpeakingAgentAnswer) {
    handleReliableVoiceInterruptVadTick();
    setVadSpeechStatus("Luetaan vastausta");
    return;
  }

  const rms = getCurrentRms();
  const now = Date.now();

  if (updateNoiseCalibration(rms, now)) {
    return;
  }

  const isRecording = recorder?.state === "recording";
  const vadSettings = getVadConfigSnapshot();

  if (!isRecording && rms >= vadSettings.preSpeechThreshold) {
    startSpeechChunk(rms);
    elements.speechStatus.textContent = "Tarkistetaan puheen alkua";
    return;
  }

  if (rms >= vadSettings.speechThreshold) {
    silenceStartedAt = 0;
    currentChunkPeakRms = Math.max(currentChunkPeakRms, rms);

    if (!isRecording) {
      startSpeechChunk(rms);
      elements.speechStatus.textContent = "Tarkistetaan puhetta";
      updateSpeechTurnTaking(now);
      return;
    }

    if (!isCurrentChunkConfirmed) {
      speechCandidateStartedAt = speechCandidateStartedAt || now;
      speechCandidateDurationMs += VAD_CONFIG.sampleIntervalMs;

      if (speechCandidateDurationMs >= VAD_CONFIG.minSpeechStartMs) {
        confirmSpeechChunk(now);
      } else {
        elements.speechStatus.textContent = "Tarkistetaan puhetta";
      }

      updateSpeechTurnTaking(now);
      return;
    }

    registerConfirmedSpeechActivity(now);
    elements.speechStatus.textContent = "Puhetta havaittu";
    updateSpeechTurnTaking(now);
    return;
  }

  if (isRecording) {
    if (rms <= vadSettings.silenceThreshold) {
      silenceStartedAt = silenceStartedAt || now;

      if (!isCurrentChunkConfirmed && now - silenceStartedAt >= PRE_SPEECH_MAX_WAIT_MS) {
        stopSpeechChunk("unconfirmed_pre_speech");
        setVadSpeechStatus("Ohitetaan lyhyttä ääntä");
        return;
      }

      if (now - silenceStartedAt >= getChunkSilenceTimeoutMs()) {
        setVadSpeechStatus(
          isCurrentChunkConfirmed
            ? "Odotetaan puhevuoron loppua"
            : "Ohitetaan lyhyttä ääntä",
        );
      } else {
        setVadSpeechStatus(
          isCurrentChunkConfirmed
            ? "Odottaa hiljaisuuden varmistusta"
            : "Ohitetaan lyhyttä ääntä",
        );
      }
    } else {
      silenceStartedAt = 0;
      setVadSpeechStatus(isCurrentChunkConfirmed ? "Puhechunk jatkuu" : "Tarkistetaan puhetta");
    }

    updateSpeechTurnTaking(now);
    return;
  }

  setVadSpeechStatus("Hiljaisuus");
  updateSpeechTurnTaking(now);
}

function confirmSpeechChunk(confirmedAtMs) {
  if (isCurrentChunkConfirmed) {
    return;
  }

  isCurrentChunkConfirmed = true;
  currentChunkConfirmedAt = new Date(confirmedAtMs).toISOString();
  registerConfirmedSpeechActivity(confirmedAtMs);
  elements.recordingStatus.textContent = `Puhechunk ${chunkIndex} tallentuu`;
  appendSessionLine(`Puhechunk ${chunkIndex} alkoi.`);
}

function startSpeechChunk(initialRms) {
  if (!isSessionActive || !window.MediaRecorder || recorder?.state === "recording") {
    return;
  }

  chunkIndex += 1;
  markBrowserSttChunkStart();
  audioChunks = [];
  chunkStartedAt = new Date().toISOString();
  chunkStoppedAt = "";
  currentChunkPeakRms = initialRms;
  speechCandidateStartedAt = Date.now();
  speechCandidateDurationMs = VAD_CONFIG.sampleIntervalMs;
  currentChunkConfirmedAt = "";
  isCurrentChunkConfirmed = false;

  const mimeType = getSupportedMimeType();
  const activeRecorder = mimeType
    ? new MediaRecorder(audioStream, { mimeType })
    : new MediaRecorder(audioStream);

  recorder = activeRecorder;
  recorderStopPromise = new Promise((resolve) => {
    resolveRecorderStop = resolve;
  });

  activeRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      audioChunks.push(event.data);

      if (isCurrentChunkConfirmed) {
        resetInactivityTimer();
      }
    }
  };

  activeRecorder.onstart = () => {
    elements.recordingStatus.textContent = "Tarkistetaan puhetta";
    elements.segmentStatus.textContent = `${savedChunkCount}/${chunkIndex} käsitelty`;
  };

  activeRecorder.onstop = () => {
    const stoppedAt = chunkStoppedAt || new Date().toISOString();
    const audioBlob = new Blob(audioChunks, { type: activeRecorder.mimeType || "audio/webm" });
    const durationMs = getDurationMs(chunkStartedAt, stoppedAt);
    const chunkDetails = {
      id: `${conversationId}-chunk-${String(chunkIndex).padStart(3, "0")}`,
      index: chunkIndex,
      startedAt: chunkStartedAt,
      stoppedAt,
      durationMs,
      dataPartCount: audioChunks.length,
      endReason: activeRecorder.datasetEndReason || "unknown",
      rmsPeak: Number(currentChunkPeakRms.toFixed(5)),
      vad: getVadConfigSnapshot(),
      turnTaking: getSpeechTimingSnapshot(),
      speech: {
        confirmed: isCurrentChunkConfirmed,
        candidateStartedAt: chunkStartedAt,
        speechLikeDurationMs: speechCandidateDurationMs,
        confirmedAt: currentChunkConfirmedAt || null,
        minimumSpeechStartMs: VAD_CONFIG.minSpeechStartMs,
        confirmedSpeechMs: currentChunkConfirmedAt
          ? getDurationMs(currentChunkConfirmedAt, stoppedAt)
          : 0,
      },
    };

    if (recorder === activeRecorder) {
      recorder = null;
    }

    if (isMeaningfulChunk(audioBlob, durationMs, chunkDetails)) {
      const savePromise = saveMutinaCapture(audioBlob, chunkDetails);
      pendingSavePromises.add(savePromise);
      savePromise.finally(() => pendingSavePromises.delete(savePromise));
    } else {
      elements.recordingStatus.textContent = "Lyhyt taustaääni jätettiin tallentamatta";

      if (isCurrentChunkConfirmed) {
        appendSessionLine(`Puhechunk ${chunkIndex} oli liian lyhyt, sitä ei tallennettu.`);
      }
    }

    audioChunks = [];
    currentChunkPeakRms = 0;
    speechCandidateStartedAt = 0;
    speechCandidateDurationMs = 0;
    currentChunkConfirmedAt = "";
    isCurrentChunkConfirmed = false;

    if (resolveRecorderStop) {
      resolveRecorderStop();
      resolveRecorderStop = null;
    }
  };

  activeRecorder.start(VAD_CONFIG.recorderTimesliceMs);
}

function stopSpeechChunk(endReason) {
  if (!recorder) {
    return Promise.resolve();
  }

  recorder.datasetEndReason = endReason;
  chunkStoppedAt = new Date().toISOString();

  if (recorder.state !== "inactive") {
    recorder.stop();
    return recorderStopPromise || Promise.resolve();
  }

  return Promise.resolve();
}

function isMeaningfulChunk(audioBlob, durationMs, chunkDetails) {
  return (
    chunkDetails.speech.confirmed &&
    audioBlob &&
    audioBlob.size >= VAD_CONFIG.minChunkBytes &&
    durationMs >= VAD_CONFIG.minChunkMs
  );
}

function getSupportedMimeType() {
  const preferredTypes = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];

  return preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function getDurationMs(startedAt, stoppedAt) {
  if (!startedAt || !stoppedAt) {
    return 0;
  }

  return Math.max(0, new Date(stoppedAt).getTime() - new Date(startedAt).getTime());
}

function getClientMetadata(audioBlob, uncertainty, clientAudioFileName, chunkDetails) {
  const decisionReasons = [...uncertainty.reasons];
  const recognitionDraft = chunkDetails.recognitionDraft || getBrowserSttChunkDraft();
  const browserRawText = normalizeWhitespace(
    recognitionDraft.finalText || recognitionDraft.interimText || "",
  );

  if (ALWAYS_SEND_AUDIO && clientAudioFileName) {
    decisionReasons.unshift("always_send_audio_to_preserve_dialect");
  } else if (ALWAYS_SEND_AUDIO) {
    decisionReasons.unshift("always_send_ephemeral_audio_to_preserve_dialect");
  }

  return {
    schemaVersion: "mutinatulkki.local-capture.v2",
    capturedAt: new Date().toISOString(),
    conversationId,
    browser_raw_text: browserRawText || null,
    server_transcript_raw: null,
    normalized: null,
    audio_ref: clientAudioFileName,
    audioLifecycle: {
      storage: "ephemeral",
      persisted: false,
      browserBufferPolicy: "cleared_after_upload_response",
      serverPolicy: "audio_may_be_processed_in_memory_but_not_written_to_disk",
      note: "Ääni lähetetään tulkintaa varten, mutta sitä ei säilytetä kummassakaan päässä.",
    },
    uncertainty: uncertainty.score,
    target: TARGET_TRANSCRIPTION,
    clientDecision: {
      sendAudio: uncertainty.sendAudio,
      audioThreshold: uncertainty.threshold,
      reasons: decisionReasons,
      note: "MVP lähettää sekä audion että selaimen raakatekstidraftin. Serveripuolen STT korvaa tämän myöhemmin.",
    },
    browser: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      languages: navigator.languages,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
    },
    recording: {
      startedAt: chunkDetails.startedAt,
      stoppedAt: chunkDetails.stoppedAt,
      durationMs: chunkDetails.durationMs,
      chunkCount: chunkDetails.dataPartCount,
      mimeType: audioBlob?.type || null,
      sizeBytes: audioBlob?.size || 0,
      mediaConstraints: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      session: {
        mode: "active_conversation_session",
        microphonePolicy: "microphone_enabled_only_while_session_is_active",
        startedAt: sessionStartedAt,
        stoppedAt: sessionStoppedAt || null,
        inactivityTimeoutMs: getInactivityTimeoutMs(),
        inactivityTimeoutSeconds: getInactivityTimeoutSeconds(),
        turnTaking: getSpeechTimingSnapshot(),
      },
      chunk: {
        id: chunkDetails.id,
        index: chunkDetails.index,
        startedAt: chunkDetails.startedAt,
        stoppedAt: chunkDetails.stoppedAt,
        durationMs: chunkDetails.durationMs,
        endReason: chunkDetails.endReason,
        rmsPeak: chunkDetails.rmsPeak,
        vad: chunkDetails.vad,
        turnTaking: chunkDetails.turnTaking,
        speech: chunkDetails.speech,
      },
    },
    uncertaintyDetails: uncertainty,
    recognitionDraft,
    responseOutput: {
      textEnabled: isResponseTextEnabled(),
      audioEnabled: isResponseAudioEnabled(),
      ttsEndpoint: getTtsEndpoint(),
      ttsVoice: getTtsVoice(),
    },
  };
}

async function saveMutinaCapture(audioBlob, chunkDetails) {
  const questionId = chunkDetails.id;
  if (captureAbortController) {
    captureAbortController.abort();
  }
  const controller = new AbortController();
  captureAbortController = controller;
  activeQuestionId = questionId;
  startMessageFlow(questionId);
  stopAgentSpeech();
  finalTranscript = "";
  elements.interimText.textContent = "";
  updateTranscript();

  elements.saveStatus.textContent = `Lähetetään chunk ${chunkDetails.index}...`;
  setState("processing");
  await waitForBrowserSttDraftFlush();

  if (controller.signal.aborted || activeQuestionId !== questionId) {
    return;
  }

  const uncertainty = calculateUncertainty(audioBlob);
  const includeAudio = uncertainty.sendAudio;
  const mimeType = audioBlob?.type || "audio/webm";
  const clientAudioFileName = null;
  const audioSize = audioBlob?.size || 0;
  const startedAtMs = performance.now();

  appendTulkkiLog(
    `chunk ${chunkDetails.index} valmistellaan (${formatBytes(audioSize)}, ${mimeType || "ei MIME-tyyppiä"}).`,
  );

  const audioPayload = includeAudio
    ? {
        fileName: null,
        mimeType,
        base64: await blobToBase64(audioBlob),
      }
    : null;

  if (controller.signal.aborted || activeQuestionId !== questionId) {
    return;
  }

  const payload = {
    ...getClientMetadata(audioBlob, uncertainty, clientAudioFileName, chunkDetails),
    audio: audioPayload,
  };
  const browserRawText = normalizeWhitespace(payload.browser_raw_text || "");

  try {
    appendTulkkiLog(
      browserRawText
        ? `selaimen STT-draft vertailuun: "${browserRawText}".`
        : "selaimen STT-draft ei tuottanut vertailutekstiä tälle chunkille.",
    );

    appendTulkkiLog(
      includeAudio
        ? `chunk ${chunkDetails.index} lähetetään Mutinatulkki proxylle -> HH-tulkkiAPI.`
        : `chunk ${chunkDetails.index} lähetetään ilman audioa, koska päätös oli sendAudio=false.`,
    );

    const requestBody = JSON.stringify(payload);

    if (payload.audio) {
      payload.audio.base64 = "";
      payload.audio = null;
    }

    const response = await fetch(CAPTURE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: requestBody,
      signal: controller.signal,
    });

    const responseText = await response.text();
    const elapsedMs = Math.round(performance.now() - startedAtMs);
    let result = {};

    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch (error) {
      result = {
        ok: false,
        error: `Proxy palautti virheellisen JSON-vastauksen: ${error.message}`,
      };
    }

    if (activeQuestionId !== questionId) {
      appendTulkkiLog(`chunk ${chunkDetails.index} ohitettiin, koska uudempi kysymys on jo aloitettu.`);
      return;
    }

    appendTulkkiLog(`proxy vastasi HTTP ${response.status} ${response.statusText || ""} (${elapsedMs} ms).`);

    if (!response.ok || !result.ok) {
      throw new Error(result.error || `Tallennus epäonnistui (${response.status})`);
    }

    const tulkkiText = getTulkkiText(result);
    const rawTulkkiText = getRawTulkkiText(result);
    const tulkkiResultUnclear = isUnclearTulkkiResult(result);
    const agentAnswer = getAgentAnswer(result);
    const agentError = result?.agent?.error;
    const agentSourceLine = getAgentSourceLine(result);

    if (result?.command === "stop_conversation" || isConversationStopCommand(tulkkiText, true)) {
      stopConversationByVoiceCommand(tulkkiText);
      return;
    }

    savedChunkCount += 1;
    elements.segmentStatus.textContent = `${savedChunkCount}/${chunkIndex} käsitelty`;
    elements.recordingStatus.textContent = `Chunk ${chunkDetails.index} käsitelty`;
    elements.saveStatus.textContent = tulkkiResultUnclear
      ? "Puhe jäi epäselväksi"
      : agentAnswer
      ? "Vastaus haettu AgentAPI:lta"
      : tulkkiText
      ? `Tulkittu HH-tulkkiAPI:ssa: ${result.jobId || "valmis"}`
      : `Lähetetty HH-tulkkiAPI:lle: ${result.jobId || "valmis"}`;
    appendSessionLine(`Puhechunk ${chunkDetails.index} lähetetty tulkille. Audioa ei tallennettu.`);
    appendTulkkiLog(
      `HH status=${result.status || "tuntematon"}, job=${result.jobId || "ei jobId:tä"}, audio=${result.audioReceived ? formatBytes(result.audioBytes) : "ei audioa"}.`,
    );
    appendTulkkiLog(getTulkkiPipelineSummary(result));
    getTulkkiDebugLines(result).forEach((line) => appendTulkkiLog(line));

    if (tulkkiText) {
      // The demo must always make the speech-to-text and the normalized,
      // retrieval-bound form visible. A dialect may already have been partly
      // normalized by Whisper, so profile detection is not a reliable UI gate.
      appendSessionLine(`Kysyjä kysyi: ${rawTulkkiText || tulkkiText}`);
      appendSessionLine(`Mutinatulkki tulkitsi: ${tulkkiText}`);
      if (tulkkiResultUnclear) {
        setSupport(getClarificationPrompt(result));
      }
    } else {
      appendTulkkiLog(`chunk ${chunkDetails.index} käsiteltiin, mutta tekstivastaus oli tyhjä.`);
    }

    if (agentAnswer) {
      if (isResponseTextEnabled()) {
        appendSessionLine(`Vastaus: ${agentAnswer}`);
        if (agentSourceLine) {
          appendSessionLine(agentSourceLine);
        }
      } else {
        appendTulkkiLog("Agentin tekstivastaus jätettiin näyttämättä käyttäjän vastausmuodon mukaan.");
      }

      if (isResponseAudioEnabled()) {
        startMessageFlowVoice(questionId);
        const serverTtsAudio = getServerTtsAudio(result);
        const audioPromise = serverTtsAudio
          ? playServerTtsAudio(serverTtsAudio)
          : speakAgentAnswer(agentAnswer, Boolean(agentSourceLine));

        audioPromise.catch((error) => {
          if (isInterruptedAudioPlay(error)) {
            return;
          }

          if (error.name === "NotAllowedError") {
            setSupport("Uusin ääni on ladattu näkyvään soittimeen. Paina soittimen play-nappia.", true);
          } else {
            setSupport(`Puheäänen muodostus tai toisto epäonnistui: ${getPlaybackErrorMessage(error)}`, true);
          }
        }).finally(() => finishMessageFlow(questionId));
      } else {
        finishMessageFlow(questionId, false, 5, "Vastaus valmis – valmis seuraavaan kysymykseen");
      }
    } else if (agentError) {
      appendSessionLine(`Vastaus: Agenttipalvelu ei vastannut: ${agentError}`);
      finishMessageFlow(questionId, true);
    } else {
      finishMessageFlow(questionId, false, 4, "Tulkinta valmis – ei vastausta aineistosta");
    }

    if (isSessionActive) {
      setState("listening");
      setSupport(
        `Keskustelu jatkuu. Mikrofoni sulkeutuu automaattisesti ${getInactivityTimeoutSeconds()} sekunnin hiljaisuuden jälkeen.`,
      );
    }
  } catch (error) {
    if (controller.signal.aborted || error?.name === "AbortError") {
      return;
    }

    if (activeQuestionId !== questionId) {
      appendTulkkiLog(`vanhan chunkin ${chunkDetails.index} virhe ohitettiin: ${error.message}`);
      return;
    }

    elements.saveStatus.textContent = "Tulkinta epäonnistui";
    finishMessageFlow(questionId, true);
    appendTulkkiLog(`chunk ${chunkDetails.index} epäonnistui: ${error.message}`);
    setSupport(`HH-tulkkiAPI-käsittely epäonnistui: ${error.message}`, true);

    if (isSessionActive) {
      setState("listening");
    }
  } finally {
    if (captureAbortController === controller) {
      captureAbortController = null;
    }
  }
}

async function startConversation() {
  if (isSessionActive || isStartingSession) {
    return;
  }

  try {
    isStartingSession = true;
    conversationId = createConversationId();
    sessionStartedAt = new Date().toISOString();
    sessionStoppedAt = "";
    chunkStartedAt = "";
    chunkStoppedAt = "";
    chunkIndex = 0;
    savedChunkCount = 0;
    audioChunks = [];
    finalTranscript = "";
    resetBrowserSttDraft();
    resetSpeechTurnDetection();
    resetSessionSpeechTimingStats();
    elements.interimText.textContent = "";
    updateTranscript();
    setConversationButton("starting");
    setSupport("Pyydetään mikrofonilupaa. Mikrofoni pysyy päällä vain tämän keskustelun ajan.");
    setState("processing");
    elements.segmentStatus.textContent = "0/0 käsitelty";
    elements.saveStatus.textContent = "Odottaa puhetta";
    elements.recordingStatus.textContent = "Pyydetään mikrofonia";
    elements.speechStatus.textContent = "VAD käynnistyy";

    audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        latency: { ideal: 0.01 },
      },
    });

    setupAudioAnalysis(audioStream);

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    isSessionActive = true;
    isStartingSession = false;
    setConversationButton("active");
    setState("listening");
    elements.recordingStatus.textContent = "Mikrofoni päällä session aikana";
    elements.speechStatus.textContent = "Kalibroidaan taustamelua";
    appendSessionLine("Keskustelusessio alkoi.");
    setSupport(
      "Mikrofoni kalibroidaan ensin hetkeksi. Puhu vasta, kun tila näyttää Kuunnellaan puhetta.",
    );
    startBrowserSpeechRecognition();
    startInactivityTimer();
    startNoiseCalibration();
    startVad();
  } catch (error) {
    const isPermissionError =
      error.name === "NotAllowedError" || error.name === "PermissionDeniedError";

    setSupport(
      isPermissionError
        ? "Mikrofonilupa estettiin. Salli mikrofoni ja yritä uudelleen."
        : `Mikrofonin käynnistys epäonnistui: ${error.message}`,
      true,
    );
    elements.recordingStatus.textContent = "Ei tallennettu";
    elements.speechStatus.textContent = "Ei käynnistynyt";
    setState("error");
    await finishConversation();
  }
}

async function stopConversation(reason = "manual") {
  if ((!isSessionActive && !isStartingSession) || isStoppingSession) {
    return;
  }

  isStoppingSession = true;
  sessionStoppedAt = new Date().toISOString();
  isSessionActive = false;
  stopInactivityTimer();
  stopVad();
  setConversationButton("stopping");
  setState("processing");
  elements.speechStatus.textContent =
    reason === "timeout"
      ? "Automaattinen hiljaisuustauko"
      : reason === "voice_command"
        ? "Lopetetaan puhekomennolla"
        : "Lopetetaan käsin";

  if (recorder?.state === "recording") {
    await stopSpeechChunk(reason === "timeout" ? "inactivity_timeout" : "manual_stop");
  }

  await Promise.allSettled([...pendingSavePromises]);
  await finalizeSpeechTimingConversation();
  await finishConversation();

  const message =
    reason === "timeout"
      ? `Keskustelu suljettiin automaattisesti ${getInactivityTimeoutSeconds()} sekunnin hiljaisuuden jälkeen.`
      : reason === "voice_command"
        ? "Keskustelu lopetettiin puhekomennolla. Mikrofoni on pois päältä."
        : "Keskustelu lopetettiin. Mikrofoni on pois päältä.";

  appendSessionLine(message);
  setSupport(message);
}

async function finishConversation() {
  stopAgentSpeech();
  isSessionActive = false;
  isStartingSession = false;
  isStoppingSession = false;
  recorder = null;
  recorderStopPromise = null;
  resolveRecorderStop = null;
  audioChunks = [];
  silenceStartedAt = 0;
  currentChunkPeakRms = 0;
  speechCandidateStartedAt = 0;
  speechCandidateDurationMs = 0;
  currentChunkConfirmedAt = "";
  isCurrentChunkConfirmed = false;
  resetSpeechTurnDetection();
  stopBrowserSpeechRecognition();
  stopInactivityTimer();
  await cleanupAudioAnalysis();
  cleanupStream();
  setConversationButton("inactive");
  setState("sleeping");
  resetTimer();
  elements.recordingStatus.textContent = "Mikrofoni pois päältä";
  elements.speechStatus.textContent = "Odottaa";
}

function setConversationButton(mode) {
  const isActive = mode === "active";
  const isBusy = mode === "starting" || mode === "stopping";

  elements.listenButton.disabled = isBusy;
  elements.listenButton.classList.toggle("is-active", isActive);
  elements.listenButtonIcon.textContent = isActive ? "⏹️" : "🎙️";

  if (mode === "starting") {
    elements.listenButtonText.textContent = "Käynnistetään...";
  } else if (mode === "stopping") {
    elements.listenButtonText.textContent = "Lopetetaan...";
  } else if (isActive) {
    elements.listenButtonText.textContent = "Lopeta keskustelu";
  } else {
    elements.listenButtonText.textContent = "Aloita keskustelu";
  }
}

function setResponseCheckboxState(checkbox, isSelected) {
  if (!checkbox) {
    return;
  }

  checkbox.checked = isSelected;
  checkbox.setAttribute("aria-checked", String(isSelected));
  checkbox.closest(".response-choice")?.classList.toggle("is-selected", isSelected);
}

function updateResponseOutputUi() {
  setResponseCheckboxState(elements.responseTextCheckbox, isResponseTextEnabled());
  setResponseCheckboxState(elements.responseAudioCheckbox, isResponseAudioEnabled());
  updateAgentAudioPlayerVisibility();
}

function updateSettingsUi() {
  updateResponseOutputUi();

  elements.timeoutOptions.forEach((option) => {
    const isSelected = Number(option.dataset.timeout) === getInactivityTimeoutSeconds();

    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-checked", String(isSelected));
    option.setAttribute("tabindex", "0");
  });

  elements.chunkTimeoutOptions.forEach((option) => {
    const isSelected = Number(option.dataset.chunkTimeout) === getChunkSilenceTimeoutMs();

    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-checked", String(isSelected));
    option.setAttribute("tabindex", "0");
  });

  elements.microphoneSensitivityOptions.forEach((option) => {
    const isSelected = option.dataset.sensitivity === getMicrophoneSensitivity();

    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-checked", String(isSelected));
    option.setAttribute("tabindex", "0");
  });

  elements.themeOptions.forEach((option) => {
    const isSelected = option.dataset.theme === getTheme();

    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-checked", String(isSelected));
    option.setAttribute("tabindex", "0");
  });

  if (isSessionActive) {
    updateInactivityMeter();
  } else {
    resetTimer();
  }
}

function openSettings() {
  resetInactivityTimer();
  updateSettingsUi();
  closePolicyView({ restoreFocus: false });
  elements.settingsOverlay.hidden = false;

  const selectedOption = document.querySelector(".timeout-option.is-selected");
  selectedOption?.focus();
}

function closeSettings() {
  closePolicyView({ restoreFocus: false });
  elements.settingsOverlay.hidden = true;
  elements.settingsButton.focus();
}

function openPolicyView(viewName) {
  resetInactivityTimer();

  const titles = {
    privacy: "Privacy Policy",
    terms: "Terms of Service",
  };

  elements.policyTitle.textContent = titles[viewName] || titles.privacy;
  elements.policyContents.forEach((content) => {
    content.hidden = content.dataset.policyContent !== viewName;
  });
  elements.policyModal.hidden = false;
  elements.policyCloseButton.focus();
}

function closePolicyView(options = {}) {
  if (!elements.policyModal || elements.policyModal.hidden) {
    return;
  }

  elements.policyModal.hidden = true;

  if (options.restoreFocus !== false) {
    elements.privacyPolicyButton.focus();
  }
}

function handleSettingsOverlayClick(event) {
  if (event.target === elements.settingsOverlay) {
    closeSettings();
  }
}

function handleSettingsKeydown(event) {
  if (event.key !== "Escape" || elements.settingsOverlay.hidden) {
    return;
  }

  if (!elements.policyModal.hidden) {
    closePolicyView();
  } else {
    closeSettings();
  }
}

function clearTranscript() {
  resetInactivityTimer();
  finalTranscript = "";
  elements.interimText.textContent = "";
  updateTranscript();
  elements.speechStatus.textContent = isSessionActive ? "Hiljaisuus" : "Odottaa";
  elements.recordingStatus.textContent = isSessionActive ? "Mikrofoni päällä session aikana" : "Mikrofoni pois päältä";
  elements.segmentStatus.textContent = `${savedChunkCount}/${chunkIndex} käsitelty`;
  elements.saveStatus.textContent = "Odottaa";
  setSupport("Mikrofoni on päällä vain aktiivisen keskustelusession aikana.");

  if (!isSessionActive) {
    setState("sleeping");
    resetTimer();
  }
}

function checkBrowserSupport() {
  const missing = [];

  if (!navigator.mediaDevices?.getUserMedia) {
    missing.push("mikrofoni");
  }

  if (!window.MediaRecorder) {
    missing.push("äänitallennus");
  }

  if (!(window.AudioContext || window.webkitAudioContext)) {
    missing.push("äänen voimakkuuden tunnistus");
  }

  elements.speechStatus.textContent = "Odottaa";
  elements.recordingStatus.textContent = "Mikrofoni pois päältä";

  if (missing.length > 0) {
    setSupport(`Selain ei tue kaikkia toimintoja: ${missing.join(", ")}. Käytä Chromea.`, true);
    elements.listenButton.disabled = true;
  } else {
    setSupport("Henkilökohtainen avustaja arjen askareisiin. Lisää tietoa Palvelutiedoissa asetusten alla.");
  }
}

async function toggleConversation() {
  resetInactivityTimer();
  unlockAgentAudioPlayback();

  if (isSessionActive || isStartingSession) {
    await stopConversation("manual");
    return;
  }

  await startConversation();
}

function handleUserActivity() {
  resetInactivityTimer();
}

elements.listenButton.addEventListener("click", toggleConversation);
elements.stopSpeechButton.addEventListener("click", () => {
  stopAgentSpeech();
  elements.speechStatus.textContent = isSessionActive ? "Puhe pysäytetty" : "Odottaa";
});
elements.clearButton.addEventListener("click", clearTranscript);
elements.editNameButton.addEventListener("click", editServiceName);
elements.serviceNameInput.addEventListener("keydown", handleServiceNameInputKeydown);
elements.serviceNameInput.addEventListener("blur", () => finishServiceNameEdit());
elements.responseTextCheckbox.addEventListener("change", () => {
  setResponseOutput("text", elements.responseTextCheckbox.checked);
});
elements.responseAudioCheckbox.addEventListener("change", () => {
  setResponseOutput("audio", elements.responseAudioCheckbox.checked);

  if (elements.responseAudioCheckbox.checked) {
    unlockAgentAudioPlayback();
  }
});
elements.settingsButton.addEventListener("click", openSettings);
elements.settingsCloseButton.addEventListener("click", closeSettings);
elements.privacyPolicyButton.addEventListener("click", () => openPolicyView("privacy"));
elements.termsButton.addEventListener("click", () => openPolicyView("terms"));
elements.policyCloseButton.addEventListener("click", closePolicyView);
elements.settingsOverlay.addEventListener("click", handleSettingsOverlayClick);
elements.timeoutOptions.forEach((option) => {
  option.addEventListener("click", () => setInactivityTimeout(option.dataset.timeout));
});
elements.chunkTimeoutOptions.forEach((option) => {
  option.addEventListener("click", () => setChunkSilenceTimeout(option.dataset.chunkTimeout));
});
elements.microphoneSensitivityOptions.forEach((option) => {
  option.addEventListener("click", () => setMicrophoneSensitivity(option.dataset.sensitivity));
});
elements.themeOptions.forEach((option) => {
  option.addEventListener("click", () => setTheme(option.dataset.theme));
});
document.addEventListener("pointerdown", (event) => {
  handleUserActivity(event);
  unlockAgentAudioPlayback();
}, true);
document.addEventListener("keydown", handleUserActivity, true);
document.addEventListener("keydown", handleSettingsKeydown);

setState("sleeping");
setConversationButton("inactive");
setServiceName(loadServiceName());
applyTheme();
updateSettingsUi();
updateSpeechTurnUi();
resetTimer();
updateTranscript();
checkBrowserSupport();
loadClientConfig();
loadSpeechTimingConfig();
