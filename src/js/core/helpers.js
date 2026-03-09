/**
 * @module core/helpers.js
 * @description Shared constants, global runtime state, and helper utilities.
 */

// Section: HELPER FUNCTIONS

function normalizeTeacherName(t) {
  if (!t) return "";
  let s = ("" + t).trim(); // working string — title-stripped, whitespace-collapsed
  s = s.replace(
    /^(\s*(?:\(*\s*(?:prof|dr|mr|ms|mrs|miss)\s*\)*\.?\s*)+)/i,
    ""
  );
  const key = s
    .replace(/[.,()\[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
  return key;
}

/** Creates a deterministic PRNG from a numeric seed. */
function createSeededRandom(seed) {
  let state = Number.isFinite(seed) ?
    (seed >>> 0) :
    ((Date.now() ^ 0x9e3779b9) >>> 0);
  if (state === 0) state = 0x6d2b79f5;
  return function seededRandom() {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Returns a canonical, order-independent key for a pair of teacher names. */
function teacherPairKey(a, b) {
  const x = String(a || "").trim();
  const y = String(b || "").trim();
  if (!x || !y) return "";
  return x < y ? `${x}||${y}` : `${y}||${x}`;
}

/** Generates up to n unique alphabetic class keys (A, B, …, AA, AB, …). */
function generateClassKeys(n) {
  const keys = [];
  const A = "A".charCodeAt(0);
  let count = 0;
  for (let i = 0; i < 26 && count < n; i++) {
    keys.push(String.fromCharCode(A + i));
    count++;
  }
  for (let i = 0; count < n && i < 26; i++) {
    for (let j = 0; count < n && j < 26; j++) {
      keys.push(String.fromCharCode(A + i) + String.fromCharCode(A + j));
      count++;
    }
  }
  return keys;
}

// Section: Global State Variables

const CLASS_KEYS = generateClassKeys(50);

let subjectTeacherPairsByClass = {};

let periodTimings = [];

let generated = false;

const daysOfWeek = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

let reportData = [];
let reportSort = {
  key: "teacher",
  dir: "asc"
};

let gWeeklyQuotaByClass = {};

let gSchedules = {}; // {classKey: day→col→short}
let gTeacherForShort = {}; // {classKey: short→teacher}
let gSubjectByShort = {}; // {classKey: short→{subject, teacher, ...}}
let gImportedLtpByClass = {}; // {classKey: short→{ltp, subjectKey}}
let gImportedFixedSlotsByClass = {}; // {classKey: [{day, slot, short, teacher?}]}
let gTeacherDisplayByCanon = {}; // {canonicalName: displayName}
let gTeacherAliasMap = {}; // {canonicalShortName: canonicalFullName}
let gTeacherForcedSeparatePairs = {}; // {"canonA||canonB": true}

const TEACHER_ALIAS_STORE_KEY = "tt_teacher_alias_map_v2";
const TEACHER_SEPARATE_STORE_KEY = "tt_teacher_separate_pairs_v2";

let gEnabledKeys = [];

let gClassLabels = CLASS_KEYS.reduce((acc, key, idx) => {
  acc[key] = `Class ${idx + 1}`;
  return acc;
}, {});

let gLabsAtSlot = [];

let gFillerShortsByClass = {};
let gFillerLabelsByClass = {};

let aggregateStats = {};

let gCanonFoldMap = {};

// Section: TEACHER ALIAS HELPERS

function isSingleAdjacentTransposition(a, b) {
  const x = String(a || "");
  const y = String(b || "");
  if (!x || !y || x.length !== y.length || x === y) return false;
  let firstDiff = -1;
  for (let i = 0; i < x.length; i++) {
    if (x[i] !== y[i]) {
      firstDiff = i;
      break;
    }
  }
  if (firstDiff < 0 || firstDiff >= x.length - 1) return false;
  if (
    x[firstDiff] !== y[firstDiff + 1] ||
    x[firstDiff + 1] !== y[firstDiff]
  ) {
    return false;
  }
  for (let i = firstDiff + 2; i < x.length; i++) {
    if (x[i] !== y[i]) return false;
  }
  return true;
}

/** Follows the alias chain to resolve a teacher name to its canonical form. */
function resolveTeacherAliasCanonical(baseName) {
  let out = String(baseName || "").trim();
  if (!out) return "";
  const seen = new Set();
  for (let i = 0; i < 12; i++) {
    const next = gTeacherAliasMap[out];
    if (!next || next === out) break;
    if (seen.has(out)) break;
    seen.add(out);
    out = String(next).trim();
  }
  return out;
}

/** Checks whether two teachers have been explicitly marked as separate (not aliases). */
function isTeacherPairForcedSeparate(a, b) {
  const key = teacherPairKey(a, b);
  return !!(key && gTeacherForcedSeparatePairs[key]);
}

/** Persists the current alias and forced-separate maps to localStorage. */
function saveTeacherAliasDecisionsToStorage() {
  try {
    localStorage.setItem(TEACHER_ALIAS_STORE_KEY, JSON.stringify(gTeacherAliasMap));
    localStorage.setItem(
      TEACHER_SEPARATE_STORE_KEY,
      JSON.stringify(gTeacherForcedSeparatePairs)
    );
  } catch (_e) {}
}

/** Restores alias and forced-separate maps from localStorage into globals. */
function loadTeacherAliasDecisionsFromStorage() {
  try {
    const aliasRaw = localStorage.getItem(TEACHER_ALIAS_STORE_KEY);
    const separateRaw = localStorage.getItem(TEACHER_SEPARATE_STORE_KEY);
    const aliasObj = aliasRaw ? JSON.parse(aliasRaw) : {};
    const separateObj = separateRaw ? JSON.parse(separateRaw) : {};

    gTeacherAliasMap = {};
    Object.entries(aliasObj || {}).forEach(([k, v]) => {
      const from = normalizeTeacherName(k);
      const to = normalizeTeacherName(v);
      if (!from || !to || from === to) return;
      gTeacherAliasMap[from] = to;
    });

    gTeacherForcedSeparatePairs = {};
    Object.keys(separateObj || {}).forEach((key) => {
      if (!key || typeof key !== "string" || !separateObj[key]) return;
      gTeacherForcedSeparatePairs[key] = true;
    });
  } catch (_e) {
    gTeacherAliasMap = {};
    gTeacherForcedSeparatePairs = {};
  }
}

/**
 * Applies merge and separate decisions to the global teacher alias state.
 * @param {{ mergePairs?: Array, separatePairs?: Array }} options
 * @returns {boolean} Whether any change was made.
 */
function setTeacherAliasDecisions({ mergePairs = [], separatePairs = [] } = {}) {
  let changed = false;

  (mergePairs || []).forEach((pair) => {
    const fromRaw = normalizeTeacherName(pair?.from || pair?.short || "");
    const toRaw = normalizeTeacherName(pair?.to || pair?.full || "");
    if (!fromRaw || !toRaw || fromRaw === toRaw) return;
    const from = resolveTeacherAliasCanonical(fromRaw);
    const to = resolveTeacherAliasCanonical(toRaw);
    if (!from || !to || from === to) return;
    if (gTeacherAliasMap[from] !== to) {
      gTeacherAliasMap[from] = to;
      changed = true;
    }
    const forcedKey = teacherPairKey(from, to);
    if (forcedKey && gTeacherForcedSeparatePairs[forcedKey]) {
      delete gTeacherForcedSeparatePairs[forcedKey];
      changed = true;
    }
  });

  (separatePairs || []).forEach((pair) => {
    const aRaw = normalizeTeacherName(pair?.[0] || pair?.a || pair?.short || "");
    const bRaw = normalizeTeacherName(pair?.[1] || pair?.b || pair?.full || "");
    if (!aRaw || !bRaw || aRaw === bRaw) return;
    const key = teacherPairKey(aRaw, bRaw);
    if (!key) return;
    if (!gTeacherForcedSeparatePairs[key]) {
      gTeacherForcedSeparatePairs[key] = true;
      changed = true;
    }
    if (gTeacherAliasMap[aRaw] === bRaw) {
      delete gTeacherAliasMap[aRaw];
      changed = true;
    }
    if (gTeacherAliasMap[bRaw] === aRaw) {
      delete gTeacherAliasMap[bRaw];
      changed = true;
    }

    // If any side currently resolves into the other side because of a prior
    // alias choice, remove the direct alias from that raw side.
    const aResolved = resolveTeacherAliasCanonical(aRaw);
    const bResolved = resolveTeacherAliasCanonical(bRaw);
    if (aResolved === bRaw && gTeacherAliasMap[aRaw]) {
      delete gTeacherAliasMap[aRaw];
      changed = true;
    }
    if (bResolved === aRaw && gTeacherAliasMap[bRaw]) {
      delete gTeacherAliasMap[bRaw];
      changed = true;
    }
  });

  if (changed) saveTeacherAliasDecisionsToStorage();
  return changed;
}

/** Normalizes and resolves a teacher name through the alias chain. */
function canonicalTeacherName(name) {
  const base = normalizeTeacherName(name);
  return resolveTeacherAliasCanonical(base);
}

/** Returns true if the edit distance between strings a and b is at most 1. */
function editDistanceAtMostOne(a, b) {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  let j = 0;
  let diffs = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    diffs++;
    if (diffs > 1) return false;
    if (la > lb) i++;
    else if (lb > la) j++;
    else {
      i++;
      j++;
    }
  }
  if (i < la || j < lb) diffs++;
  return diffs <= 1;
}

/** Determines if two canonical teacher names are similar enough to fold/merge. */
function shouldFoldTeacherCanonicalNames(a, b) {
  if (!a || !b) return false;
  if (isTeacherPairForcedSeparate(a, b)) return false;
  const aa = resolveTeacherAliasCanonical(a);
  const bb = resolveTeacherAliasCanonical(b);
  if (isTeacherPairForcedSeparate(aa, bb)) return false;
  if (aa === bb) return true;
  const ta = aa.split(/\s+/).filter(Boolean);
  const tb = bb.split(/\s+/).filter(Boolean);
  if (Math.abs(ta.length - tb.length) > 1) return false;
  if (aa.startsWith(bb + " ") || bb.startsWith(aa + " ")) return false;
  const minLen = Math.min(ta.length, tb.length);
  for (let k = 0; k < minLen; k++) {
    if (ta[k][0] !== tb[k][0]) return false;
  }
  if (ta.length !== tb.length) return false;
  if (editDistanceAtMostOne(aa, bb)) return true;
  return isSingleAdjacentTransposition(aa, bb);
}

/**
 * Builds a mapping from each canonical teacher name to its fold-group master.
 * @param {string[]} canonicalNames
 * @returns {Object<string, string>} name → master name
 */
function buildTeacherFoldMapFromCanonicalNames(canonicalNames = []) {
  const names = Array.from(
    new Set(
      (canonicalNames || [])
      .map((n) => resolveTeacherAliasCanonical(String(n || "").trim()))
      .filter(Boolean)
    )
  ).sort((a, b) => b.length - a.length || a.localeCompare(b));
  const masters = [];
  const map = {};
  names.forEach((name) => {
    let mergedInto = null;
    for (const master of masters) {
      if (shouldFoldTeacherCanonicalNames(name, master)) {
        mergedInto = master;
        break;
      }
    }
    if (!mergedInto) {
      masters.push(name);
      map[name] = name;
      return;
    }
    map[name] = mergedInto;
  });
  const multiByFirst = {};
  names.forEach((name) => {
    const toks = name.split(/\s+/).filter(Boolean);
    if (toks.length < 2) return;
    const first = toks[0];
    if (!first) return;
    if (!multiByFirst[first]) multiByFirst[first] = [];
    multiByFirst[first].push(map[name] || name);
  });
  Object.keys(multiByFirst).forEach((first) => {
    multiByFirst[first] = Array.from(new Set(multiByFirst[first]));
  });
  names.forEach((name) => {
    const toks = name.split(/\s+/).filter(Boolean);
    if (toks.length !== 1) return;
    const first = toks[0];
    const candidates = (multiByFirst[first] || []).filter(Boolean); // multi-word names sharing this first token
    if (
      candidates.length === 1 &&
      !isTeacherPairForcedSeparate(name, candidates[0])
    ) {
      map[name] = candidates[0];
    }
  });
  return map;
}

/** Builds a teacher fold map from raw (un-normalized) teacher names. */
function buildTeacherFoldMapFromRawNames(rawNames = []) {
  const canonical = (rawNames || []) // resolved canonical names used for folding
    .map((name) => canonicalTeacherName(name))
    .filter(Boolean);
  return buildTeacherFoldMapFromCanonicalNames(canonical);
}

loadTeacherAliasDecisionsFromStorage();
window.setTeacherAliasDecisions = setTeacherAliasDecisions;
window.resolveTeacherAliasCanonical = resolveTeacherAliasCanonical;
window.isTeacherPairForcedSeparate = isTeacherPairForcedSeparate;

// Section: UI FEEDBACK HELPERS (toast)

function ensureToastHost() {
  let host = document.getElementById("toastHost");
  if (host) return host;
  host = document.createElement("div");
  host.id = "toastHost";
  host.setAttribute("aria-live", "polite");
  host.setAttribute("aria-atomic", "false");
  document.body.appendChild(host);
  return host;
}

/**
 * Displays a temporary toast notification.
 * @param {string} message - Text to display.
 * @param {{ type?: string, duration?: number }} options
 */
function showToast(message, {
  type = "info",
  duration = 2800
} = {}) {
  const msg = String(message || "").trim();
  if (!msg) return;
  const host = ensureToastHost();
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const text = document.createElement("div");
  text.className = "toast-text";
  text.textContent = msg;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "toast-close";
  closeBtn.setAttribute("aria-label", "Dismiss notification");
  closeBtn.textContent = "×";

  const safeDuration = Math.max(1200, Number(duration) || 2800);

  const countdown = document.createElement("div");
  countdown.className = "toast-countdown";
  countdown.style.setProperty("--toast-duration", safeDuration + "ms");

  toast.style.position = "relative";
  toast.style.overflow = "hidden";
  toast.appendChild(text);
  toast.appendChild(closeBtn);
  toast.appendChild(countdown);
  host.appendChild(toast);

  const dismiss = () => { // removes the toast with a fade-out animation
    toast.classList.add("toast-hide");
    setTimeout(() => toast.remove(), 220);
  };

  closeBtn.addEventListener("click", dismiss);
  requestAnimationFrame(() => toast.classList.add("toast-show"));
  setTimeout(dismiss, safeDuration);
}

window.showToast = showToast;

