// Toripolliisi 3D avatar.
// Deliberately decoupled from app.js: it only reads the app state from
// `.state-hero[data-state]` and lip-syncs to the `#agentAudioElement` audio.
// Loudness opens the mouth. The mouth shape comes from the Piper phoneme timings
// in the WAV's `phon` chunk (see HH-TTSservice), or from the voice spectrum without it.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODEL_URL = new URL("./assets/Toripolliisi-261117.glb", import.meta.url).href;
const PANEL_STORAGE_KEY = "avatarPanelOpen";

// Calibration knobs. Tune on real Piper audio.
const NOISE_FLOOR = 0.015; // RMS below this keeps the mouth closed
const MOUTH_GAIN = 4; // RMS above the floor -> mouth opening 0..1 (Piper harri: RMS p50 ~0.1, p90 ~0.28)
const MOUTH_ATTACK = 25; // per second, how fast the mouth opens
const MOUTH_RELEASE = 12; // per second, how fast it closes
const CENTROID_ROUND_HZ = 700; // linear spectral centroid below this -> rounded vowels (o, u)
const CENTROID_SPREAD_HZ = 1300; // above this -> spread vowels (e, i); measured on Piper harri, see Materials/NOTES.md
const VOWEL_SPEED = 10; // per second, how fast the vowel shape follows the voice (~100 ms)
const VISEME_SPEED = 18; // per second, same for Piper phoneme timings (exact, so faster)
const VISEME_LEAD_SEC = 0.04; // lips move slightly before the sound, as in real speech
const EXPRESSION_SPEED = 3; // per second, how fast expressions blend
const FACING_Y = 0; // model already faces +Z (glTF front); adjust if a re-export turns it
const FRAME_TOP = 1.08; // camera frame as a fraction of model height
const FRAME_BOTTOM = 0.45;

// Head offsets are radians on top of the rest pose.
// ponytail: four fixed poses + procedural motion, add clips when the model gets animations.
const EXPRESSIONS = {
  sleeping: { eyes: 1, pitch: 0.22, yaw: 0, roll: 0.06, sway: 0, breath: 0.4, blinks: 0 },
  listening: { eyes: 0, pitch: -0.03, yaw: 0, roll: 0.07, sway: 0.03, breath: 1, blinks: 1 },
  processing: { eyes: 0.45, pitch: -0.12, yaw: 0.18, roll: -0.05, sway: 0.12, breath: 1, blinks: 1 },
  answering: { eyes: 0, pitch: 0, yaw: 0, roll: 0, sway: 0.04, breath: 1, blinks: 1 },
};

// Piper (espeak) phonemes -> blend shape weights. Unlisted symbols (most consonants,
// length mark ː, stress, punctuation) keep the previous shape, like coarticulation.
const VISEMES = {
  a: { aa: 1 },
  ɑ: { aa: 1 },
  æ: { aa: 0.7, ee: 0.4 }, // ä
  e: { ee: 1 },
  ɛ: { ee: 1 },
  i: { ih: 1 },
  ɪ: { ih: 1 },
  j: { ih: 0.6 },
  o: { oh: 1 },
  ɔ: { oh: 1 },
  ø: { oh: 0.6, ee: 0.4 }, // ö
  u: { ou: 1 },
  ʊ: { ou: 1 },
  y: { ou: 0.7, ih: 0.4 },
};
const LIP_CLOSURE = { p: 1, b: 1, m: 1, f: 0.5, v: 0.5 }; // 1 = lips shut
const VOWEL_NAMES = ["aa", "ee", "ih", "oh", "ou"];

const panel = document.getElementById("avatarPanel");
const stage = document.getElementById("avatarStage");
const stateSource = document.querySelector(".state-hero");
const audioElement = document.getElementById("agentAudioElement");

let analyser = null;
let timeData = null;
let freqData = null;
let timeline = null; // [{ end, shape, closure }] for the current audio, or null
let timelineSrc = "";
let timelineIndex = 0;

// Reads the custom RIFF `phon` chunk written by HH-TTSservice. Returns null without it.
function parsePhonemeChunk(buffer) {
  const view = new DataView(buffer);
  const tag = (offset) => String.fromCharCode(...new Uint8Array(buffer, offset, 4));
  if (buffer.byteLength < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") {
    return null;
  }

  for (let offset = 12; offset + 8 <= buffer.byteLength; ) {
    const size = view.getUint32(offset + 4, true);
    if (tag(offset) === "phon") {
      const { rate, phonemes } = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, offset + 8, size)));
      let end = 0;
      return phonemes.map(([symbol, samples]) => {
        end += samples / rate;
        return { end, shape: VISEMES[symbol] || null, closure: LIP_CLOSURE[symbol] || 0 };
      });
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}

// The agent audio is a blob/same-origin URL, so the avatar can read the same bytes it plays.
async function loadTimeline() {
  const src = audioElement.currentSrc;
  if (src === timelineSrc) {
    return;
  }
  timelineSrc = src;
  timeline = null;
  timelineIndex = 0;

  try {
    const parsed = parsePhonemeChunk(await (await fetch(src)).arrayBuffer());
    if (audioElement.currentSrc === src) {
      timeline = parsed;
    }
  } catch (error) {
    console.warn("Avatar: phoneme timings unreadable, using the voice spectrum.", error);
  }
}

function currentPhoneme(time) {
  if (!timeline || audioElement.paused) {
    return null;
  }
  if (timelineIndex > 0 && time < timeline[timelineIndex - 1].end) {
    timelineIndex = 0; // seeked backwards
  }
  while (timelineIndex < timeline.length && timeline[timelineIndex].end <= time) {
    timelineIndex += 1;
  }
  return timeline[timelineIndex] || null;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function restorePanelState() {
  if (panel?.tagName !== "DETAILS") {
    return;
  }

  try {
    if (localStorage.getItem(PANEL_STORAGE_KEY) === "false") {
      panel.open = false;
    }
  } catch {
    // Storage blocked: keep the default (open).
  }

  panel.addEventListener("toggle", () => {
    try {
      localStorage.setItem(PANEL_STORAGE_KEY, String(panel.open));
    } catch {
      // Not persisted; the panel still works.
    }
  });
}

function isAvatarVisible() {
  return panel?.tagName !== "DETAILS" || panel.open;
}

// createMediaElementSource reroutes the element's output through Web Audio,
// so the context must be created and resumed inside a user gesture or the
// agent would go silent. Hence the first pointer/key event, not page load.
function connectAudio() {
  if (analyser || !audioElement) {
    return;
  }

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextClass();
    const source = context.createMediaElementSource(audioElement);
    analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.3;
    source.connect(analyser);
    analyser.connect(context.destination);
    timeData = new Float32Array(analyser.fftSize);
    freqData = new Float32Array(analyser.frequencyBinCount);
    context.resume();
    audioElement.addEventListener("play", () => context.resume());
  } catch (error) {
    analyser = null;
    console.warn("Avatar: lip sync disabled, audio analyser failed.", error);
  }
}

function readVoice() {
  if (!analyser || audioElement.paused) {
    return { level: 0, centroid: 0 };
  }

  analyser.getFloatTimeDomainData(timeData);
  let sum = 0;
  for (const sample of timeData) {
    sum += sample * sample;
  }
  const rms = Math.sqrt(sum / timeData.length);

  // Spectral centroid over the speech band (~150-4000 Hz) tells open/round/spread vowels apart.
  // Linear magnitudes: the dB scale flattens the spectrum and pulls every vowel to the band middle.
  analyser.getFloatFrequencyData(freqData);
  const hzPerBin = analyser.context.sampleRate / analyser.fftSize;
  let weighted = 0;
  let total = 0;
  for (let bin = Math.floor(150 / hzPerBin); bin < Math.min(freqData.length, 4000 / hzPerBin); bin += 1) {
    const magnitude = 10 ** (freqData[bin] / 20);
    weighted += bin * hzPerBin * magnitude;
    total += magnitude;
  }

  return {
    level: clamp01((rms - NOISE_FLOOR) * MOUTH_GAIN),
    centroid: total > 0 ? weighted / total : 0,
  };
}

function startAvatar(gltf) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  stage.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x556677, 2.2));
  const keyLight = new THREE.DirectionalLight(0xfff4e6, 2.8);
  keyLight.position.set(1.5, 2, 3);
  scene.add(keyLight);

  const model = gltf.scene;
  model.rotation.y = FACING_Y;
  scene.add(model);

  const box = new THREE.Box3().setFromObject(model);
  const height = box.max.y - box.min.y;
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;

  const camera = new THREE.PerspectiveCamera(26, 1, 0.01, 20);
  const frameBottom = box.min.y + height * FRAME_BOTTOM;
  const frameTop = box.min.y + height * FRAME_TOP;
  const frameCenterY = (frameTop + frameBottom) / 2;
  const distance = (frameTop - frameBottom) / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.set(0, frameCenterY, distance);
  camera.lookAt(0, frameCenterY, 0);

  let face = null;
  model.traverse((object) => {
    if (!face && object.morphTargetDictionary) {
      face = object;
    }
  });
  const head = model.getObjectByName("Head");
  const body = model.getObjectByName("Body");
  const headRest = head?.rotation.clone();
  const bodyRest = body?.rotation.clone();

  const missing = ["blink_L", "blink_R", "aa", "ee", "ih", "oh", "ou"].filter(
    (name) => face?.morphTargetDictionary[name] === undefined,
  );
  if (missing.length || !head || !body) {
    console.warn("Avatar: model is missing", { morphs: missing, head: Boolean(head), body: Boolean(body) });
  }

  function setMorph(name, value) {
    const index = face?.morphTargetDictionary[name];
    if (index !== undefined) {
      face.morphTargetInfluences[index] = value;
    }
  }

  function resize() {
    const { clientWidth, clientHeight } = stage;
    if (clientWidth && clientHeight) {
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    }
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  const pose = { ...EXPRESSIONS.sleeping };
  let mouth = 0;
  const vowel = { aa: 1, ee: 0, ih: 0, oh: 0, ou: 0 };
  let vowelTarget = { aa: 1 };
  let closure = 0;
  let previousMs = performance.now();
  let nextBlinkMs = previousMs + 2000;
  let blinkStartMs = -1000;
  let breathPhase = 0;

  renderer.setAnimationLoop((nowMs) => {
    const dt = Math.min(0.1, (nowMs - previousMs) / 1000);
    previousMs = nowMs;

    if (!isAvatarVisible()) {
      return;
    }

    const seconds = nowMs / 1000;
    const target = EXPRESSIONS[stateSource?.dataset.state] || EXPRESSIONS.listening;
    const blend = 1 - Math.exp(-dt * EXPRESSION_SPEED);
    for (const key of Object.keys(pose)) {
      pose[key] += (target[key] - pose[key]) * blend;
    }

    // Random blinks, 150 ms triangle.
    if (nowMs > nextBlinkMs) {
      blinkStartMs = nowMs;
      nextBlinkMs = nowMs + 2500 + Math.random() * 4000;
    }
    const blink = pose.blinks * clamp01(1 - Math.abs((nowMs - blinkStartMs) / 75 - 1));
    const eyes = Math.max(pose.eyes, blink);
    setMorph("blink_L", eyes);
    setMorph("blink_R", eyes);

    const voice = readVoice();
    const rate = voice.level > mouth ? MOUTH_ATTACK : MOUTH_RELEASE;
    mouth += (voice.level - mouth) * (1 - Math.exp(-dt * rate));
    const phoneme = currentPhoneme(audioElement.currentTime + VISEME_LEAD_SEC);
    let closureTarget = 0;
    let shapeSpeed = VOWEL_SPEED;
    if (phoneme) {
      vowelTarget = phoneme.shape || vowelTarget;
      closureTarget = phoneme.closure;
      shapeSpeed = VISEME_SPEED;
    } else if (voice.level > 0) {
      // Spectrum fallback. The per-frame centroid is noisy (e/i sit near the aa/ee
      // border), hence the smoothing below; pauses keep the last shape.
      // Blend 300 Hz past each threshold instead of switching hard.
      const roundness = clamp01((CENTROID_ROUND_HZ + 300 - voice.centroid) / 300);
      const spread = clamp01((voice.centroid - CENTROID_SPREAD_HZ + 300) / 300);
      vowelTarget = { aa: 1 - Math.max(roundness, spread), oh: roundness, ou: roundness * 0.5, ee: spread, ih: spread * 0.5 };
    }
    const shapeBlend = 1 - Math.exp(-dt * shapeSpeed);
    closure += (closureTarget - closure) * shapeBlend;
    // The dominant vowel gets the full opening so the mouth reads clearly.
    for (const name of VOWEL_NAMES) {
      vowel[name] += ((vowelTarget[name] || 0) - vowel[name]) * shapeBlend;
      setMorph(name, mouth * (1 - closure) * vowel[name]);
    }

    if (head) {
      head.rotation.set(
        headRest.x + pose.pitch + mouth * 0.04,
        headRest.y + pose.yaw + Math.sin(seconds * 0.7) * pose.sway,
        headRest.z + pose.roll + Math.sin(seconds * 0.45) * pose.sway * 0.4,
      );
    }
    if (body) {
      // Accumulate the phase: sin(seconds * rate) would jump when the rate blends between states.
      breathPhase += dt * 1.6 * pose.breath;
      body.rotation.x = bodyRest.x + Math.sin(breathPhase) * 0.012;
    }

    renderer.render(scene, camera);
  });
}

if (panel && stage) {
  restorePanelState();
  for (const eventName of ["pointerdown", "keydown"]) {
    document.addEventListener(eventName, connectAudio, { capture: true });
  }
  audioElement?.addEventListener("loadedmetadata", loadTimeline);

  new GLTFLoader()
    .loadAsync(MODEL_URL)
    .then(startAvatar)
    .catch((error) => {
      panel.hidden = true;
      console.warn("Avatar: disabled, model or WebGL failed to load.", error);
    });
}
