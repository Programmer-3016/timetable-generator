/**
 * @file tests/parser.test.js
 * @description Tests for parsePairs — the input parsing engine.
 */

describe("parsePairs", () => {
  beforeEach(() => {
    // Create a mock textarea element for parsePairs to read from
    const textarea = document.createElement("textarea");
    textarea.id = "testPairs";
    document.body.appendChild(textarea);
  });

  afterEach(() => {
    const el = document.getElementById("testPairs");
    if (el) el.remove();
  });

  test("parsePairs is defined as a function", () => {
    expect(typeof parsePairs).toBe("function");
  });

  test("returns empty array for empty input", () => {
    document.getElementById("testPairs").value = "";
    const result = parsePairs("testPairs");
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  test("parses basic SHORT - FULL - TEACHER - CREDITS format", () => {
    document.getElementById("testPairs").value = "MATH - Mathematics - Dr. Kumar - 4";
    const result = parsePairs("testPairs");
    expect(result.length).toBe(1);
    expect(result[0].short).toBeDefined();
    expect(result[0].subject).toBeDefined();
  });

  test("parses multiple lines", () => {
    document.getElementById("testPairs").value =
      "MATH - Mathematics - Dr. Kumar - 4\nOOPS - Object Oriented - Dr. Singh - 3";
    const result = parsePairs("testPairs");
    expect(result.length).toBe(2);
  });

  test("skips blank lines", () => {
    document.getElementById("testPairs").value =
      "MATH - Mathematics - Dr. Kumar - 4\n\n\nOOPS - Object Oriented - Dr. Singh - 3";
    const result = parsePairs("testPairs");
    expect(result.length).toBe(2);
  });

  test("returns empty array for nonexistent textarea ID (null guard)", () => {
    expect(parsePairs("nonExistentId")).toEqual([]);
  });
});
