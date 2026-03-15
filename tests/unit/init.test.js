/**
 * @file tests/unit/init.test.js
 * @description Unit tests for ui/init.js: input row creation, state persistence
 *   via localStorage, pagination (prev/next), and search filtering.
 */

const fs = require("fs");
const path = require("path");

/* ═══════════════════════════════════════════════════════
   Section: HELPERS
═══════════════════════════════════════════════════════ */

/**
 * Strips the outer DOMContentLoaded wrapper from init.js source so
 * the body can be evaluated directly in the test environment.
 * @returns {string} The unwrapped source code.
 */
function getInitBody() {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../src/js/ui/init.js"),
    "utf-8"
  );
  // Remove leading `document.addEventListener("DOMContentLoaded", () => {`
  let code = src.replace(
    /^[\s\S]*?document\.addEventListener\(\s*"DOMContentLoaded"\s*,\s*\(\)\s*=>\s*\{/,
    ""
  );
  // Remove trailing `});` that closes the listener
  code = code.replace(/\}\s*\)\s*;?\s*$/, "");
  return code;
}

/**
 * Builds the minimal DOM structure that init.js expects and evaluates
 * the init body so all internal closures execute.
 */
function bootInit() {
  // classInputsPanel with table > tbody
  const panel = document.createElement("div");
  panel.id = "classInputsPanel";
  const table = document.createElement("table");
  const tbody = document.createElement("tbody");
  table.appendChild(tbody);
  panel.appendChild(table);
  document.body.appendChild(panel);

  // classCount select
  const countSel = document.createElement("select");
  countSel.id = "classCount";
  document.body.appendChild(countSel);

  // pager controls
  const prev = document.createElement("button");
  prev.id = "inputsPrev";
  document.body.appendChild(prev);

  const next = document.createElement("button");
  next.id = "inputsNext";
  document.body.appendChild(next);

  const pageLabel = document.createElement("span");
  pageLabel.id = "inputsPageLabel";
  document.body.appendChild(pageLabel);

  // search controls
  const searchInput = document.createElement("input");
  searchInput.id = "inputsSearch";
  document.body.appendChild(searchInput);

  const searchClear = document.createElement("button");
  searchClear.id = "inputsSearchClear";
  document.body.appendChild(searchClear);

  const searchMeta = document.createElement("span");
  searchMeta.id = "inputsSearchMeta";
  document.body.appendChild(searchMeta);

  // settings inputs
  ["startTime", "slots", "days", "duration", "lunchPeriod", "lunchDuration", "labCount"].forEach(
    (id) => {
      const inp = document.createElement("input");
      inp.id = id;
      document.body.appendChild(inp);
    }
  );

  // .timetable-area
  const ttArea = document.createElement("div");
  ttArea.className = "timetable-area";
  document.body.appendChild(ttArea);

  // .controls
  const controls = document.createElement("div");
  controls.className = "controls";
  document.body.appendChild(controls);

  // Stubs
  global.switchTab = jest.fn();
  global.showToast = jest.fn();
  global.parsePairs = jest.fn(() => []);

  // Evaluate init body
  const indirectEval = eval;
  indirectEval(getInitBody());
}

/* ═══════════════════════════════════════════════════════
   Section: SETUP / TEARDOWN
═══════════════════════════════════════════════════════ */

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  delete window._ensureInputRows;
});

/* ═══════════════════════════════════════════════════════
   Section: _ensureInputRows TESTS
═══════════════════════════════════════════════════════ */

describe("_ensureInputRows", () => {
  beforeEach(bootInit);

  test("creates the requested number of rows with correct IDs", () => {
    window._ensureInputRows(3);
    const tbody = document.querySelector("#classInputsPanel table tbody");
    expect(tbody.children.length).toBe(3);

    const keys = CLASS_KEYS.slice(0, 3);
    keys.forEach((key, i) => {
      const row = document.getElementById(`classRow${key}`);
      expect(row).not.toBeNull();
      expect(row.tagName).toBe("TR");
    });
  });

  test("each row contains label input, textarea, fillers input, mains input", () => {
    window._ensureInputRows(2);
    const keys = CLASS_KEYS.slice(0, 2);

    // First row (index 0) uses bare IDs: "pairs", "fillerShorts", "mainShorts"
    expect(document.getElementById(`class${keys[0]}Label`)).not.toBeNull();
    expect(document.getElementById("pairs")).not.toBeNull();
    expect(document.getElementById("fillerShorts")).not.toBeNull();
    expect(document.getElementById("mainShorts")).not.toBeNull();

    // Second row uses suffixed IDs
    const k = keys[1];
    expect(document.getElementById(`class${k}Label`)).not.toBeNull();
    expect(document.getElementById(`pairs${k}`)).not.toBeNull();
    expect(document.getElementById(`fillerShorts${k}`)).not.toBeNull();
    expect(document.getElementById(`mainShorts${k}`)).not.toBeNull();
  });

  test("does not duplicate rows on repeated calls", () => {
    window._ensureInputRows(3);
    window._ensureInputRows(3);
    const tbody = document.querySelector("#classInputsPanel table tbody");
    expect(tbody.children.length).toBe(3);
  });

  test("grows from smaller to larger count", () => {
    window._ensureInputRows(2);
    window._ensureInputRows(5);
    const tbody = document.querySelector("#classInputsPanel table tbody");
    expect(tbody.children.length).toBe(5);
  });

  test("rows beyond classCount remain hidden", () => {
    const countSel = document.getElementById("classCount");
    countSel.value = "2";
    window._ensureInputRows(5);
    countSel.dispatchEvent(new Event("change"));

    // Rows 1-2 should be visible (page 1), rows 3-5 should be hidden
    expect(document.getElementById(`classRow${CLASS_KEYS[2]}`).style.display).toBe("none");
    expect(document.getElementById(`classRow${CLASS_KEYS[3]}`).style.display).toBe("none");
    expect(document.getElementById(`classRow${CLASS_KEYS[4]}`).style.display).toBe("none");
  });
});

/* ═══════════════════════════════════════════════════════
   Section: STATE PERSISTENCE TESTS
═══════════════════════════════════════════════════════ */

describe("State persistence (save → localStorage → restore)", () => {
  test("saves state to localStorage after input change (debounced)", () => {
    bootInit();
    window._ensureInputRows(2);

    // Simulate typing in the classInputsPanel (triggers scheduleSave)
    const panel = document.getElementById("classInputsPanel");
    panel.dispatchEvent(new Event("input", { bubbles: true }));

    // Advance past the 400ms debounce
    jest.advanceTimersByTime(500);

    const raw = localStorage.getItem("tt_inputs_v1");
    expect(raw).not.toBeNull();
    const state = JSON.parse(raw);
    expect(state).toHaveProperty("settings");
    expect(state).toHaveProperty("classes");
    expect(state).toHaveProperty("view");
  });

  test("restores saved state on next boot", () => {
    // First boot — set values and trigger save
    bootInit();
    window._ensureInputRows(2);

    const startEl = document.getElementById("startTime");
    startEl.value = "09:30";

    const countSel = document.getElementById("classCount");
    countSel.value = "2";

    const pairsEl = document.getElementById("pairs");
    pairsEl.value = "MATH - Mathematics - Prof X - 4";

    // Trigger save
    const panel = document.getElementById("classInputsPanel");
    panel.dispatchEvent(new Event("input", { bubbles: true }));
    jest.advanceTimersByTime(500);

    const savedJSON = localStorage.getItem("tt_inputs_v1");
    expect(savedJSON).not.toBeNull();

    // Second boot — clear DOM, re-init with saved state in localStorage
    document.body.innerHTML = "";
    delete window._ensureInputRows;
    bootInit();

    expect(document.getElementById("startTime").value).toBe("09:30");
    expect(document.getElementById("pairs").value).toBe(
      "MATH - Mathematics - Prof X - 4"
    );
  });

  test("settings field changes trigger save via scheduleSave", () => {
    bootInit();

    const slotsEl = document.getElementById("slots");
    slotsEl.value = "8";
    slotsEl.dispatchEvent(new Event("input", { bubbles: true }));
    jest.advanceTimersByTime(500);

    const raw = localStorage.getItem("tt_inputs_v1");
    expect(raw).not.toBeNull();
    const state = JSON.parse(raw);
    expect(state.settings.slots).toBe("8");
  });
});

/* ═══════════════════════════════════════════════════════
   Section: PAGINATION TESTS
═══════════════════════════════════════════════════════ */

describe("Pagination (page size 5, prev/next)", () => {
  beforeEach(() => {
    bootInit();
    // Set up 12 classes to get 3 pages (5+5+2)
    const countSel = document.getElementById("classCount");
    countSel.value = "12";
    window._ensureInputRows(12);
    countSel.dispatchEvent(new Event("change"));
  });

  function visibleRowKeys() {
    const keys = [];
    CLASS_KEYS.slice(0, 12).forEach((key) => {
      const row = document.getElementById(`classRow${key}`);
      if (row && row.style.display !== "none") keys.push(key);
    });
    return keys;
  }

  test("first page shows rows 1-5", () => {
    const visible = visibleRowKeys();
    expect(visible).toEqual(CLASS_KEYS.slice(0, 5));
  });

  test("page label shows '1 / 3'", () => {
    const label = document.getElementById("inputsPageLabel");
    expect(label.textContent).toBe("1 / 3");
  });

  test("prev is disabled on first page", () => {
    const prev = document.getElementById("inputsPrev");
    expect(prev.disabled).toBe(true);
  });

  test("clicking next moves to page 2 (rows 6-10)", () => {
    const next = document.getElementById("inputsNext");
    next.click();

    const visible = visibleRowKeys();
    expect(visible).toEqual(CLASS_KEYS.slice(5, 10));

    const label = document.getElementById("inputsPageLabel");
    expect(label.textContent).toBe("2 / 3");
  });

  test("clicking prev from page 2 returns to page 1", () => {
    const next = document.getElementById("inputsNext");
    const prev = document.getElementById("inputsPrev");
    next.click();
    prev.click();

    const visible = visibleRowKeys();
    expect(visible).toEqual(CLASS_KEYS.slice(0, 5));
  });

  test("next is disabled on last page", () => {
    const next = document.getElementById("inputsNext");
    next.click(); // page 2
    next.click(); // page 3
    expect(next.disabled).toBe(true);
  });

  test("last page shows correct partial rows (rows 11-12)", () => {
    const next = document.getElementById("inputsNext");
    next.click(); // page 2
    next.click(); // page 3

    const visible = visibleRowKeys();
    expect(visible).toEqual(CLASS_KEYS.slice(10, 12));
  });
});

/* ═══════════════════════════════════════════════════════
   Section: SEARCH FILTERING TESTS
═══════════════════════════════════════════════════════ */

describe("Search filtering", () => {
  beforeEach(() => {
    bootInit();
    const countSel = document.getElementById("classCount");
    countSel.value = "5";
    window._ensureInputRows(5);
    countSel.dispatchEvent(new Event("change"));

    // Put distinct text into class 2's pairs
    const key2 = CLASS_KEYS[1];
    const pairs2 = document.getElementById(`pairs${key2}`);
    pairs2.value = "PHY - Physics - Dr Newton - 3";
  });

  function visibleRowCount() {
    let count = 0;
    CLASS_KEYS.slice(0, 5).forEach((key) => {
      const row = document.getElementById(`classRow${key}`);
      if (row && row.style.display !== "none") count++;
    });
    return count;
  }

  test("typing a query filters to matching rows", () => {
    const search = document.getElementById("inputsSearch");
    search.value = "Physics";
    search.dispatchEvent(new Event("input"));

    expect(visibleRowCount()).toBe(1);
    const key2 = CLASS_KEYS[1];
    const row2 = document.getElementById(`classRow${key2}`);
    expect(row2.style.display).not.toBe("none");
  });

  test("search meta shows match count", () => {
    const search = document.getElementById("inputsSearch");
    search.value = "Physics";
    search.dispatchEvent(new Event("input"));

    const meta = document.getElementById("inputsSearchMeta");
    expect(meta.textContent).toContain("1");
    expect(meta.textContent).toContain("match");
  });

  test("pager buttons are disabled during search", () => {
    const search = document.getElementById("inputsSearch");
    search.value = "Physics";
    search.dispatchEvent(new Event("input"));

    expect(document.getElementById("inputsPrev").disabled).toBe(true);
    expect(document.getElementById("inputsNext").disabled).toBe(true);
  });

  test("clearing search restores paginated view", () => {
    const search = document.getElementById("inputsSearch");
    search.value = "Physics";
    search.dispatchEvent(new Event("input"));
    expect(visibleRowCount()).toBe(1);

    // Clear via the clear button
    const clearBtn = document.getElementById("inputsSearchClear");
    clearBtn.click();

    // All 5 rows on page 1 should be visible
    expect(visibleRowCount()).toBe(5);
    expect(search.value).toBe("");
  });

  test("search by class number matches the correct row", () => {
    const search = document.getElementById("inputsSearch");
    search.value = "class 3";
    search.dispatchEvent(new Event("input"));

    expect(visibleRowCount()).toBe(1);
    const key3 = CLASS_KEYS[2];
    const row3 = document.getElementById(`classRow${key3}`);
    expect(row3.style.display).not.toBe("none");
  });

  test("non-matching query hides all rows", () => {
    const search = document.getElementById("inputsSearch");
    search.value = "zzz_no_match_zzz";
    search.dispatchEvent(new Event("input"));

    expect(visibleRowCount()).toBe(0);
    const meta = document.getElementById("inputsSearchMeta");
    expect(meta.textContent).toContain("0");
  });
});
