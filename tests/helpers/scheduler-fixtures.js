/**
 * @file tests/helpers/scheduler-fixtures.js
 * @description Canonical regression scenario fixtures for scheduler end-to-end tests.
 *
 * Fixture schema:
 * - periodTimings
 * - days
 * - enabledKeys
 * - pairsByClass
 * - mainShortsByClass
 * - fillerShortsByClass
 * - fillerCreditsByClass
 * - fixedSlotsByClass
 * - labCapacity
 * - seed
 */

const realSixteenClassAktuSavedInput = require("./real-sixteen-class-input.json");

/**
 * Builds a period-timing array with an optional lunch break after a class slot.
 * @param {number} numClasses - Number of class slots in a day.
 * @param {number} lunchAfter - Insert lunch after this many class slots.
 * @returns {Array<Object>} Period timing entries for the scenario.
 */
function buildPeriodTimings(numClasses, lunchAfter) {
  const timings = [];
  for (let i = 0; i < numClasses; i++) {
    if (i === lunchAfter) {
      timings.push({ type: "lunch", label: "Lunch", duration: 30 });
    }
    timings.push({
      type: "class",
      label: `P${i + 1}`,
      duration: 50,
    });
  }
  return timings;
}

let fixtureTextareaCounter = 0;

/**
 * Parses raw pair text using the production parser through a temporary textarea.
 * @param {string} raw - Raw multiline subject/teacher input.
 * @returns {Array<{short: string, originalShort: string, subject: string, teacher: string, teachers: string[], credits: ?number}>}
 */
function parsePairsTextForFixture(raw) {
  const textarea = document.createElement("textarea");
  const id = `fixturePairs_${fixtureTextareaCounter++}`;
  textarea.id = id;
  textarea.value = String(raw || "");
  document.body.appendChild(textarea);
  try {
    return typeof parsePairs === "function" ? parsePairs(id) : [];
  } finally {
    textarea.remove();
  }
}

/**
 * Parses a comma-separated shorts string into uppercase shorts.
 * @param {string} raw - Raw CSV value.
 * @returns {string[]} Parsed short codes.
 */
function parseShortCsvForFixture(raw) {
  return String(raw || "")
    .split(/\s*,\s*/)
    .map((entry) => String(entry || "").split(/\s*-\s*/)[0].trim())
    .map((entry) => entry.toUpperCase().replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Parses the filler CSV used by the UI into shorts and optional credit overrides.
 * @param {string} raw - Raw filler input from saved UI state.
 * @returns {{ shorts: string[], credits: Object<string, number> }}
 */
function parseFillerCsvForFixture(raw) {
  const shorts = [];
  const credits = {};
  String(raw || "")
    .split(/\s*,\s*/)
    .forEach((entry) => {
      if (!entry) return;
      const parts = entry.split(/\s*-\s*/);
      const short = String(parts[0] || "")
        .toUpperCase()
        .replace(/\s+/g, " ")
        .trim();
      if (!short) return;
      shorts.push(short);
      const joinedTail = parts.slice(1).join(" - ");
      const creditMatch =
        joinedTail.match(/\b(\d{1,2})\s*(?:cr|credits?)\b/i) ||
        joinedTail.match(/\((\d{1,2})\)/);
      if (creditMatch) {
        const parsed = parseInt(creditMatch[1], 10);
        if (Number.isFinite(parsed) && parsed > 0) credits[short] = parsed;
      }
    });
  return { shorts, credits };
}

/**
 * Converts a saved-input snapshot into a canonical scheduler scenario fixture.
 * @param {{ settings?: Record<string, string>, classes?: Record<string, {label?: string, pairs?: string, fillers?: string, mains?: string}> }} savedInputSnapshot
 * @returns {Object}
 */
function buildScenarioFromSavedInputSnapshot(savedInputSnapshot) {
  const settings = savedInputSnapshot?.settings || {};
  const classes = savedInputSnapshot?.classes || {};
  const classCount = Math.max(1, parseInt(String(settings.classCount || "1"), 10) || 1);
  const labCapacity = Math.max(1, parseInt(String(settings.labCount || "3"), 10) || 3);
  const slots = Math.max(1, parseInt(String(settings.slots || "1"), 10) || 1);
  const lunchAfter = Math.max(
    0,
    Math.min(slots, parseInt(String(settings.lunchPeriod || "0"), 10) || 0)
  );
  const allKeys = Array.isArray(global.CLASS_KEYS) && global.CLASS_KEYS.length ?
    global.CLASS_KEYS.slice() :
    Object.keys(classes);
  const enabledKeys = [];
  for (let i = 0; i < allKeys.length && enabledKeys.length < classCount; i++) {
    const key = allKeys[i];
    const cls = classes[key];
    if (!cls) continue;
    if (!String(cls.label || "").trim() && !String(cls.pairs || "").trim()) continue;
    enabledKeys.push(key);
  }

  const pairsByClass = {};
  const mainShortsByClass = {};
  const fillerShortsByClass = {};
  const fillerCreditsByClass = {};
  const fixedSlotsByClass = {};

  enabledKeys.forEach((key) => {
    const cls = classes[key] || {};
    pairsByClass[key] = parsePairsTextForFixture(cls.pairs || "");
    mainShortsByClass[key] = parseShortCsvForFixture(cls.mains || "");
    const fillerParsed = parseFillerCsvForFixture(cls.fillers || "");
    fillerShortsByClass[key] = fillerParsed.shorts;
    fillerCreditsByClass[key] = fillerParsed.credits;
    fixedSlotsByClass[key] = [];
  });

  return {
    periodTimings: buildPeriodTimings(slots, lunchAfter),
    days: Math.max(1, parseInt(String(settings.days || "1"), 10) || 1),
    enabledKeys,
    pairsByClass,
    mainShortsByClass,
    fillerShortsByClass,
    fillerCreditsByClass,
    fixedSlotsByClass,
    labCapacity,
    seed: 0,
  };
}

const schedulerScenarioFixtures = {
  healthySharedTeacherLoad: {
    periodTimings: buildPeriodTimings(6, 3),
    days: 5,
    enabledKeys: ["A", "B"],
    pairsByClass: {
      A: [
        { short: "MATH", subject: "Mathematics", teacher: "T1", credits: 2 },
        { short: "PHY", subject: "Physics", teacher: "T2", credits: 3 },
        { short: "CHEM", subject: "Chemistry", teacher: "T3", credits: 3 },
      ],
      B: [
        { short: "ENG", subject: "English", teacher: "T1", credits: 2 },
        { short: "BIO", subject: "Biology", teacher: "T4", credits: 3 },
        { short: "HIST", subject: "History", teacher: "T5", credits: 3 },
      ],
    },
    mainShortsByClass: {
      A: ["MATH", "PHY", "CHEM"],
      B: ["ENG", "BIO", "HIST"],
    },
    fillerShortsByClass: {
      A: ["PT", "LIB"],
      B: ["PT", "LIB"],
    },
    fillerCreditsByClass: {
      A: { PT: 2, LIB: 2 },
      B: { PT: 2, LIB: 2 },
    },
    fixedSlotsByClass: {
      A: [],
      B: [],
    },
    seed: 4242,
  },

  healthyLabNearLunch: {
    periodTimings: buildPeriodTimings(6, 3),
    days: 5,
    enabledKeys: ["A"],
    pairsByClass: {
      A: [
        { short: "MATH", subject: "Mathematics", teacher: "T1", credits: 3 },
        { short: "PHY", subject: "Physics", teacher: "T2", credits: 3 },
        { short: "CSLAB", subject: "Computer Lab", teacher: "T3", credits: 2 },
      ],
    },
    mainShortsByClass: {
      A: ["MATH", "PHY"],
    },
    fillerShortsByClass: {
      A: ["PT"],
    },
    fillerCreditsByClass: {
      A: { PT: 2 },
    },
    fixedSlotsByClass: {
      A: [],
    },
    seed: 1337,
  },

  healthyTeacherlessFillers: {
    periodTimings: buildPeriodTimings(4, 2),
    days: 2,
    enabledKeys: ["A"],
    pairsByClass: {
      A: [
        { short: "MATH", subject: "Mathematics", teacher: "T1", credits: 1 },
        { short: "PHY", subject: "Physics", teacher: "T2", credits: 1 },
      ],
    },
    mainShortsByClass: {
      A: ["MATH", "PHY"],
    },
    fillerShortsByClass: {
      A: ["PT", "LIB"],
    },
    fillerCreditsByClass: {
      A: { PT: 1, LIB: 1 },
    },
    fixedSlotsByClass: {
      A: [
        { day: 0, slot: 0, short: "MATH", teacher: "T1" },
        { day: 0, slot: 1, short: "PHY", teacher: "T2" },
        { day: 1, slot: 0, short: "MATH", teacher: "T1" },
        { day: 1, slot: 1, short: "PHY", teacher: "T2" },
      ],
    },
    seed: 77,
  },

  impossibleFixedTeacherConflict: {
    periodTimings: buildPeriodTimings(4, 2),
    days: 3,
    enabledKeys: ["A", "B"],
    pairsByClass: {
      A: [
        { short: "MATH", subject: "Mathematics", teacher: "T1", credits: 2 },
      ],
      B: [
        { short: "PHY", subject: "Physics", teacher: "T1", credits: 2 },
      ],
    },
    mainShortsByClass: {
      A: ["MATH"],
      B: ["PHY"],
    },
    fillerShortsByClass: {
      A: ["PT"],
      B: ["LIB"],
    },
    fillerCreditsByClass: {
      A: { PT: 1 },
      B: { LIB: 1 },
    },
    fixedSlotsByClass: {
      A: [{ day: 0, slot: 0, short: "MATH", teacher: "T1" }],
      B: [{ day: 0, slot: 0, short: "PHY", teacher: "T1" }],
    },
    seed: 9001,
  },

  realSixteenClassAktuSnapshot: buildScenarioFromSavedInputSnapshot(
    realSixteenClassAktuSavedInput
  ),
};

module.exports = {
  buildPeriodTimings,
  buildScenarioFromSavedInputSnapshot,
  schedulerScenarioFixtures,
};
