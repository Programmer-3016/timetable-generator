/**
 * @file tests/unit/generate.test.js
 * @description Tests for core/generate.js pure functions: formatTime, resolveGenerationSeed.
 */

// ─── formatTime ──────────────────────────────────────────────────────────────

describe("formatTime", () => {
  test("is defined as a function", () => {
    expect(typeof formatTime).toBe("function");
  });

  test("formats midnight as 00:00", () => {
    expect(formatTime(new Date(2024, 0, 1, 0, 0))).toBe("00:00");
  });

  test("formats noon as 12:00", () => {
    expect(formatTime(new Date(2024, 0, 1, 12, 0))).toBe("12:00");
  });

  test("pads single-digit hours", () => {
    expect(formatTime(new Date(2024, 0, 1, 9, 30))).toBe("09:30");
  });

  test("pads single-digit minutes", () => {
    expect(formatTime(new Date(2024, 0, 1, 14, 5))).toBe("14:05");
  });

  test("handles 23:59", () => {
    expect(formatTime(new Date(2024, 0, 1, 23, 59))).toBe("23:59");
  });

  test("handles 00:01", () => {
    expect(formatTime(new Date(2024, 0, 1, 0, 1))).toBe("00:01");
  });
});

// ─── resolveGenerationSeed ───────────────────────────────────────────────────

describe("resolveGenerationSeed", () => {
  test("is defined as a function", () => {
    expect(typeof resolveGenerationSeed).toBe("function");
  });

  test("returns a number", () => {
    expect(typeof resolveGenerationSeed(42)).toBe("number");
  });

  test("returns an unsigned 32-bit integer (0 to 2^32-1)", () => {
    const seed = resolveGenerationSeed(12345, 3);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xFFFFFFFF);
  });

  test("is deterministic for same inputs", () => {
    const a = resolveGenerationSeed(100, 5);
    const b = resolveGenerationSeed(100, 5);
    expect(a).toBe(b);
  });

  test("different attemptIndex produces different seed", () => {
    const a = resolveGenerationSeed(42, 0);
    const b = resolveGenerationSeed(42, 1);
    expect(a).not.toBe(b);
  });

  test("different baseSeed produces different seed", () => {
    const a = resolveGenerationSeed(1, 0);
    const b = resolveGenerationSeed(2, 0);
    expect(a).not.toBe(b);
  });

  test("attemptIndex defaults to 0", () => {
    const a = resolveGenerationSeed(42);
    const b = resolveGenerationSeed(42, 0);
    expect(a).toBe(b);
  });

  test("handles baseSeed = 0", () => {
    const seed = resolveGenerationSeed(0, 0);
    expect(seed).toBe(0);
  });

  test("handles large baseSeed", () => {
    const seed = resolveGenerationSeed(0xFFFFFFFF, 0);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xFFFFFFFF);
  });

  test("handles negative baseSeed via unsigned shift", () => {
    const seed = resolveGenerationSeed(-1, 0);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xFFFFFFFF);
  });

  test("handles non-finite baseSeed (NaN) by deriving from Date.now", () => {
    const seed = resolveGenerationSeed(NaN, 0);
    expect(typeof seed).toBe("number");
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xFFFFFFFF);
  });

  test("handles Infinity baseSeed by deriving from Date.now", () => {
    const seed = resolveGenerationSeed(Infinity, 0);
    expect(typeof seed).toBe("number");
    expect(seed).toBeGreaterThanOrEqual(0);
  });

  test("produces good distribution across attempts", () => {
    const seeds = new Set();
    for (let i = 0; i < 100; i++) {
      seeds.add(resolveGenerationSeed(42, i));
    }
    // at least 95 unique seeds out of 100
    expect(seeds.size).toBeGreaterThanOrEqual(95);
  });
});
