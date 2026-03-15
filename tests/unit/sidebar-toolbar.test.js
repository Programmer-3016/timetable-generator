/**
 * @file tests/unit/sidebar-toolbar.test.js
 * @description Unit tests for ui/sidebar-toolbar.js: sidebar toggle, class key
 *   extraction, class name filtering, and toolbar construction.
 */

/* ═══════════════════════════════════════════════════════
   Section: DOM SETUP & TEARDOWN
═══════════════════════════════════════════════════════ */

beforeEach(() => {
  document.body.className = "";
  document.body.innerHTML = "";

  // Sidebar toggle button
  const btn = document.createElement("button");
  btn.id = "sidebarToggleBtn";
  document.body.appendChild(btn);

  // Timetable wrapper with class blocks
  const wrap = document.createElement("div");
  wrap.id = "timetableWrap";

  ["A", "B", "C"].forEach((key) => {
    const block = document.createElement("div");
    block.id = `class${key}Block`;
    block.textContent = `Block ${key}`;
    wrap.appendChild(block);
  });
  document.body.appendChild(wrap);

  // Filter hint element
  const hint = document.createElement("span");
  hint.id = "classFilterHint";
  document.body.appendChild(hint);

  // Filter input
  const input = document.createElement("input");
  input.id = "classFilterInput";
  document.body.appendChild(input);

  // Clear filter button
  const clearBtn = document.createElement("button");
  clearBtn.id = "clearClassFilterBtn";
  document.body.appendChild(clearBtn);

  // Set up global state used by applyClassNameFilter
  global.gEnabledKeys = ["A", "B", "C"];
  global.gClassLabels = { A: "Physics", B: "Chemistry", C: "Mathematics" };
});

afterEach(() => {
  document.body.className = "";
  document.body.innerHTML = "";
  global.gEnabledKeys = [];
  global.gClassLabels = {};
});

/* ═══════════════════════════════════════════════════════
   Section: extractClassKeyFromBlock
═══════════════════════════════════════════════════════ */

describe("extractClassKeyFromBlock", () => {
  test("extracts single-letter key from valid block ID", () => {
    expect(extractClassKeyFromBlock("classABlock")).toBe("A");
  });

  test("extracts two-letter key from valid block ID", () => {
    expect(extractClassKeyFromBlock("classABBlock")).toBe("AB");
  });

  test("returns empty string for ID without class prefix", () => {
    expect(extractClassKeyFromBlock("reportPanel")).toBe("");
  });

  test("returns empty string for null/undefined input", () => {
    expect(extractClassKeyFromBlock(null)).toBe("");
    expect(extractClassKeyFromBlock(undefined)).toBe("");
  });

  test("returns empty string for empty string input", () => {
    expect(extractClassKeyFromBlock("")).toBe("");
  });

  test("returns empty string for lowercase key", () => {
    expect(extractClassKeyFromBlock("classaBlock")).toBe("");
  });

  test("returns empty string for numeric key", () => {
    expect(extractClassKeyFromBlock("class1Block")).toBe("");
  });
});

/* ═══════════════════════════════════════════════════════
   Section: toggleSidebarLayout
═══════════════════════════════════════════════════════ */

describe("toggleSidebarLayout", () => {
  test("adds fullwide class when not present", () => {
    expect(document.body.classList.contains("fullwide")).toBe(false);
    toggleSidebarLayout();
    expect(document.body.classList.contains("fullwide")).toBe(true);
  });

  test("removes fullwide class when already present", () => {
    document.body.classList.add("fullwide");
    toggleSidebarLayout();
    expect(document.body.classList.contains("fullwide")).toBe(false);
  });

  test("updates toggle button text after toggling", () => {
    const btn = document.getElementById("sidebarToggleBtn");
    toggleSidebarLayout(); // collapsed
    expect(btn.textContent).toBe("Expand");
    toggleSidebarLayout(); // expanded
    expect(btn.textContent).toBe("Collapse Sidebar");
  });
});

/* ═══════════════════════════════════════════════════════
   Section: refreshSidebarToggleButton
═══════════════════════════════════════════════════════ */

describe("refreshSidebarToggleButton", () => {
  test("sets button text to 'Collapse Sidebar' when expanded", () => {
    refreshSidebarToggleButton();
    const btn = document.getElementById("sidebarToggleBtn");
    expect(btn.textContent).toBe("Collapse Sidebar");
  });

  test("sets button text to 'Expand' when collapsed", () => {
    document.body.classList.add("fullwide");
    refreshSidebarToggleButton();
    const btn = document.getElementById("sidebarToggleBtn");
    expect(btn.textContent).toBe("Expand");
  });

  test("sets title attribute based on state", () => {
    refreshSidebarToggleButton();
    const btn = document.getElementById("sidebarToggleBtn");
    expect(btn.title).toBe("Hide controls for full-width timetable");

    document.body.classList.add("fullwide");
    refreshSidebarToggleButton();
    expect(btn.title).toBe("Show full controls");
  });

  test("does not throw when button is missing", () => {
    document.getElementById("sidebarToggleBtn").remove();
    expect(() => refreshSidebarToggleButton()).not.toThrow();
  });
});

/* ═══════════════════════════════════════════════════════
   Section: applyClassNameFilter
═══════════════════════════════════════════════════════ */

describe("applyClassNameFilter", () => {
  test("shows all enabled blocks when query is empty", () => {
    applyClassNameFilter("");
    const wrap = document.getElementById("timetableWrap");
    Array.from(wrap.children).forEach((child) => {
      expect(child.style.display).toBe("");
    });
  });

  test("filters blocks by matching label", () => {
    applyClassNameFilter("Physics");
    const blockA = document.getElementById("classABlock");
    const blockB = document.getElementById("classBBlock");
    const blockC = document.getElementById("classCBlock");
    expect(blockA.style.display).toBe("");
    expect(blockB.style.display).toBe("none");
    expect(blockC.style.display).toBe("none");
  });

  test("filter is case-insensitive", () => {
    applyClassNameFilter("physics");
    const blockA = document.getElementById("classABlock");
    expect(blockA.style.display).toBe("");

    applyClassNameFilter("CHEMISTRY");
    const blockB = document.getElementById("classBBlock");
    expect(blockB.style.display).toBe("");
  });

  test("filters by class key", () => {
    applyClassNameFilter("B");
    const blockA = document.getElementById("classABlock");
    const blockB = document.getElementById("classBBlock");
    expect(blockA.style.display).toBe("none");
    expect(blockB.style.display).toBe("");
  });

  test("hides all blocks when no match", () => {
    applyClassNameFilter("Zoology");
    const wrap = document.getElementById("timetableWrap");
    Array.from(wrap.children).forEach((child) => {
      expect(child.style.display).toBe("none");
    });
  });

  test("updates hint element with match count", () => {
    applyClassNameFilter("math");
    const hint = document.getElementById("classFilterHint");
    expect(hint.textContent).toBe("1 class shown");
    expect(hint.style.display).toBe("inline");
  });

  test("shows 'No class match' hint when nothing matches", () => {
    applyClassNameFilter("Zoology");
    const hint = document.getElementById("classFilterHint");
    expect(hint.textContent).toBe("No class match");
  });

  test("hides hint when query is empty", () => {
    applyClassNameFilter("Physics");
    applyClassNameFilter("");
    const hint = document.getElementById("classFilterHint");
    expect(hint.style.display).toBe("none");
    expect(hint.textContent).toBe("");
  });

  test("hides blocks for disabled keys", () => {
    global.gEnabledKeys = ["A"];
    applyClassNameFilter("");
    const blockB = document.getElementById("classBBlock");
    const blockC = document.getElementById("classCBlock");
    expect(blockB.style.display).toBe("none");
    expect(blockC.style.display).toBe("none");
  });
});

/* ═══════════════════════════════════════════════════════
   Section: buildToolbar
═══════════════════════════════════════════════════════ */

describe("buildToolbar", () => {
  test("calls refreshSidebarToggleButton on build", () => {
    document.body.classList.add("fullwide");
    buildToolbar();
    const btn = document.getElementById("sidebarToggleBtn");
    expect(btn.textContent).toBe("Expand");
  });

  test("wires filter input to applyClassNameFilter", () => {
    buildToolbar();
    const input = document.getElementById("classFilterInput");
    input.value = "Chem";
    input.dispatchEvent(new Event("input"));

    const blockA = document.getElementById("classABlock");
    const blockB = document.getElementById("classBBlock");
    expect(blockA.style.display).toBe("none");
    expect(blockB.style.display).toBe("");
  });

  test("clear button resets filter and shows all blocks", () => {
    buildToolbar();
    applyClassNameFilter("Physics");
    const clearBtn = document.getElementById("clearClassFilterBtn");
    clearBtn.click();

    const input = document.getElementById("classFilterInput");
    expect(input.value).toBe("");
    Array.from(document.getElementById("timetableWrap").children).forEach((child) => {
      expect(child.style.display).toBe("");
    });
  });
});
