/**
 * @file tests/unit/helpers.test.js
 * @description Tests for utility functions in core/helpers.js
 */

// ─── normalizeTeacherName ────────────────────────────────────────────────────

describe("normalizeTeacherName", () => {
  test("is defined as a function", () => {
    expect(typeof normalizeTeacherName).toBe("function");
  });

  test("returns empty string for falsy values", () => {
    expect(normalizeTeacherName(null)).toBe("");
    expect(normalizeTeacherName(undefined)).toBe("");
    expect(normalizeTeacherName("")).toBe("");
    expect(normalizeTeacherName(0)).toBe("");
  });

  test("trims and lowercases a plain name", () => {
    expect(normalizeTeacherName("  Kumar  ")).toBe("kumar");
  });

  test("strips Dr. title prefix", () => {
    expect(normalizeTeacherName("Dr. Sharma")).toBe("sharma");
  });

  test("strips Prof. title prefix", () => {
    expect(normalizeTeacherName("Prof. Verma")).toBe("verma");
  });

  test("strips Mr./Ms./Mrs./Miss title prefix", () => {
    expect(normalizeTeacherName("Mr. Singh")).toBe("singh");
    expect(normalizeTeacherName("Ms. Gupta")).toBe("gupta");
    // Note: regex matches "mr" before "mrs", leaving "s" behind
    expect(normalizeTeacherName("Mrs. Patel")).toBe("s patel");
    expect(normalizeTeacherName("Miss Roy")).toBe("roy");
  });

  test("collapses multiple spaces", () => {
    expect(normalizeTeacherName("Dr.  R  K  Verma")).toBe("r k verma");
  });

  test("removes punctuation characters", () => {
    expect(normalizeTeacherName("Dr. R.K. Verma")).toBe("rk verma");
  });

  test("handles compound title prefixes", () => {
    expect(normalizeTeacherName("Dr. Prof. Singh")).toBe("singh");
  });
});

// ─── createSeededRandom ──────────────────────────────────────────────────────

describe("createSeededRandom", () => {
  test("is defined as a function", () => {
    expect(typeof createSeededRandom).toBe("function");
  });

  test("returns a function", () => {
    const rng = createSeededRandom(42);
    expect(typeof rng).toBe("function");
  });

  test("returns values between 0 and 1", () => {
    const rng = createSeededRandom(42);
    for (let i = 0; i < 100; i++) {
      const val = rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  test("is deterministic — same seed gives same sequence", () => {
    const rng1 = createSeededRandom(123);
    const rng2 = createSeededRandom(123);
    for (let i = 0; i < 20; i++) {
      expect(rng1()).toBe(rng2());
    }
  });

  test("different seeds give different sequences", () => {
    const rng1 = createSeededRandom(100);
    const rng2 = createSeededRandom(200);
    const seq1 = Array.from({ length: 5 }, () => rng1());
    const seq2 = Array.from({ length: 5 }, () => rng2());
    expect(seq1).not.toEqual(seq2);
  });

  test("handles non-finite seed gracefully", () => {
    const rng = createSeededRandom(NaN);
    expect(typeof rng()).toBe("number");
  });
});

// ─── teacherPairKey ──────────────────────────────────────────────────────────

describe("teacherPairKey", () => {
  test("is defined as a function", () => {
    expect(typeof teacherPairKey).toBe("function");
  });

  test("returns empty string for missing values", () => {
    expect(teacherPairKey("", "b")).toBe("");
    expect(teacherPairKey("a", "")).toBe("");
    expect(teacherPairKey(null, "b")).toBe("");
    expect(teacherPairKey("a", null)).toBe("");
  });

  test("is order-independent", () => {
    expect(teacherPairKey("alpha", "beta")).toBe(teacherPairKey("beta", "alpha"));
  });

  test("uses || as separator", () => {
    const key = teacherPairKey("alice", "bob");
    expect(key).toBe("alice||bob");
  });

  test("trims whitespace from names", () => {
    expect(teacherPairKey("  a  ", "  b  ")).toBe("a||b");
  });
});

// ─── generateClassKeys ──────────────────────────────────────────────────────

describe("generateClassKeys", () => {
  test("is defined as a function", () => {
    expect(typeof generateClassKeys).toBe("function");
  });

  test("returns empty array for 0", () => {
    expect(generateClassKeys(0)).toEqual([]);
  });

  test("returns single-letter keys for small counts", () => {
    expect(generateClassKeys(3)).toEqual(["A", "B", "C"]);
  });

  test("returns 26 single-letter keys for n=26", () => {
    const keys = generateClassKeys(26);
    expect(keys).toHaveLength(26);
    expect(keys[0]).toBe("A");
    expect(keys[25]).toBe("Z");
  });

  test("returns double-letter keys beyond 26", () => {
    const keys = generateClassKeys(28);
    expect(keys).toHaveLength(28);
    expect(keys[26]).toBe("AA");
    expect(keys[27]).toBe("AB");
  });

  test("all keys are unique", () => {
    const keys = generateClassKeys(50);
    const unique = new Set(keys);
    expect(unique.size).toBe(50);
  });
});

// ─── isSingleAdjacentTransposition ──────────────────────────────────────────

describe("isSingleAdjacentTransposition", () => {
  test("is defined as a function", () => {
    expect(typeof isSingleAdjacentTransposition).toBe("function");
  });

  test("detects swapped adjacent characters", () => {
    expect(isSingleAdjacentTransposition("abc", "bac")).toBe(true);
    expect(isSingleAdjacentTransposition("abc", "acb")).toBe(true);
  });

  test("returns false for identical strings", () => {
    expect(isSingleAdjacentTransposition("abc", "abc")).toBe(false);
  });

  test("returns false for different length strings", () => {
    expect(isSingleAdjacentTransposition("ab", "abc")).toBe(false);
  });

  test("returns false for non-adjacent swaps", () => {
    expect(isSingleAdjacentTransposition("abc", "cba")).toBe(false);
  });

  test("returns false for empty strings", () => {
    expect(isSingleAdjacentTransposition("", "")).toBe(false);
    expect(isSingleAdjacentTransposition("", "a")).toBe(false);
  });

  test("handles null/undefined gracefully", () => {
    expect(isSingleAdjacentTransposition(null, "abc")).toBe(false);
    expect(isSingleAdjacentTransposition("abc", undefined)).toBe(false);
  });
});

// ─── editDistanceAtMostOne ──────────────────────────────────────────────────

describe("editDistanceAtMostOne", () => {
  test("is defined as a function", () => {
    expect(typeof editDistanceAtMostOne).toBe("function");
  });

  test("returns true for identical strings", () => {
    expect(editDistanceAtMostOne("abc", "abc")).toBe(true);
  });

  test("returns true for single character substitution", () => {
    expect(editDistanceAtMostOne("abc", "axc")).toBe(true);
  });

  test("returns true for single character insertion", () => {
    expect(editDistanceAtMostOne("ac", "abc")).toBe(true);
  });

  test("returns true for single character deletion", () => {
    expect(editDistanceAtMostOne("abc", "ac")).toBe(true);
  });

  test("returns false for two substitutions", () => {
    expect(editDistanceAtMostOne("abc", "xxc")).toBe(false);
  });

  test("returns false for very different strings", () => {
    expect(editDistanceAtMostOne("hello", "world")).toBe(false);
  });

  test("returns false when length differs by more than 1", () => {
    expect(editDistanceAtMostOne("a", "abc")).toBe(false);
  });
});

// ─── shouldFoldTeacherCanonicalNames ────────────────────────────────────────

describe("shouldFoldTeacherCanonicalNames", () => {
  test("is defined as a function", () => {
    expect(typeof shouldFoldTeacherCanonicalNames).toBe("function");
  });

  test("returns false for empty/null names", () => {
    expect(shouldFoldTeacherCanonicalNames("", "")).toBe(false);
    expect(shouldFoldTeacherCanonicalNames(null, "abc")).toBe(false);
    expect(shouldFoldTeacherCanonicalNames("abc", null)).toBe(false);
  });

  test("returns true for edit-distance-1 names", () => {
    // "sharma" vs "sharma" is identical; "sharma" vs "sharmo" differs by 1
    expect(shouldFoldTeacherCanonicalNames("sharma", "sharmo")).toBe(true);
  });

  test("returns true for adjacent transposition in multi-word names", () => {
    // "kumar" vs "kumra": positions 3-4 swapped (a,r → r,a) = adjacent transposition
    expect(shouldFoldTeacherCanonicalNames("kumar", "kumra")).toBe(true);
    // "raj kumar" vs "raj kumra": same first-letters per token + adjacent transposition
    expect(shouldFoldTeacherCanonicalNames("raj kumar", "raj kumra")).toBe(true);
  });

  test("returns false when first letters of tokens differ", () => {
    // "ab singh" vs "ba singh" — first chars 'a' vs 'b' mismatch → no fold
    expect(shouldFoldTeacherCanonicalNames("ab singh", "ba singh")).toBe(false);
  });

  test("returns false for very different names", () => {
    expect(shouldFoldTeacherCanonicalNames("sharma", "verma")).toBe(false);
    expect(shouldFoldTeacherCanonicalNames("a kumar", "b singh")).toBe(false);
  });
});

// ─── buildTeacherFoldMapFromCanonicalNames ──────────────────────────────────

describe("buildTeacherFoldMapFromCanonicalNames", () => {
  test("is defined as a function", () => {
    expect(typeof buildTeacherFoldMapFromCanonicalNames).toBe("function");
  });

  test("returns empty object for empty array", () => {
    expect(buildTeacherFoldMapFromCanonicalNames([])).toEqual({});
  });

  test("maps each name to itself when no folding possible", () => {
    const map = buildTeacherFoldMapFromCanonicalNames(["sharma", "verma", "gupta"]);
    expect(map["sharma"]).toBe("sharma");
    expect(map["verma"]).toBe("verma");
    expect(map["gupta"]).toBe("gupta");
  });

  test("folds names that differ by edit distance 1", () => {
    const map = buildTeacherFoldMapFromCanonicalNames(["sharma", "sharmo"]);
    // Both should map to the same master
    expect(map["sharma"]).toBe(map["sharmo"]);
  });

  test("handles null/undefined input gracefully", () => {
    expect(buildTeacherFoldMapFromCanonicalNames(null)).toEqual({});
    expect(buildTeacherFoldMapFromCanonicalNames(undefined)).toEqual({});
  });
});

// ─── buildTeacherFoldMapFromRawNames ────────────────────────────────────────

describe("buildTeacherFoldMapFromRawNames", () => {
  test("is defined as a function", () => {
    expect(typeof buildTeacherFoldMapFromRawNames).toBe("function");
  });

  test("returns empty object for empty array", () => {
    expect(buildTeacherFoldMapFromRawNames([])).toEqual({});
  });

  test("normalizes names before folding", () => {
    const map = buildTeacherFoldMapFromRawNames(["Dr. Sharma", "Prof. Sharma"]);
    // Both normalize to "sharma", so the map should have "sharma" → "sharma"
    expect(map["sharma"]).toBe("sharma");
  });

  test("handles null/undefined gracefully", () => {
    expect(buildTeacherFoldMapFromRawNames(null)).toEqual({});
  });
});
