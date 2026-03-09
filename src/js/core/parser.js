/**
 * @module core/parser.js
 * @description Input parser for subject-teacher lines and normalization helpers.
 */

// Section: SUBJECT/TEACHER PAIR PARSER

function parsePairs(textareaId = "pairs") {
  const el = document.getElementById(textareaId);
  if (!el) return [];
  const raw = el.value.trim();
  if (!raw) return [];

  // Section: SUBJECT NAME NORMALIZATION

  /** Normalizes a subject short code to a canonical uppercase form. */
  const normalizeShort = (s) => {
    let t = (s || "").trim().toUpperCase(); // uppercased working copy
    if (!t) return "";
    const noDots = t.replace(/\./g, "");
    const parts = noDots.split(/\s+/).filter(Boolean);
    if (parts.length > 1 && parts.every((w) => /^[A-Z]$/.test(w))) {
      t = parts.join("");
    }
    const labInitials = t.match(/^([A-Z](?:\s+[A-Z]){1,4})\s+LAB\b/);
    if (labInitials) {
      const letters = labInitials[1].split(/\s+/).join("");
      return `${letters} LAB`;
    }
    const labMatch = t.match(
      /^[A-Z0-9]{1,8}(?:\s+[A-Z0-9]{1,8})?\s+LAB\b/
    );
    if (labMatch) return labMatch[0].trim();
    const headCode = t.match(/^[A-Z0-9]{1,10}(?:-[A-Z0-9]{1,6})?/);
    if (headCode) return headCode[0];
    const first = t.split(/\s+/)[0] || t;
    return first;
  };
  /** Returns true if the string looks like a subject short code. */
  const looksShort = (s) => {
    const t = normalizeShort(s);
    if (!t) return false;
    if (/^[A-Z0-9\-]{1,12}$/.test(t)) return true;
    if (/^[A-Z0-9]{1,8}(\s+[A-Z0-9]{1,8}){1,2}$/.test(t)) return true;
    if (/\bLAB\b/.test(t) && t.length <= 20) return true;
    return false;
  };
  /** Returns true if the string appears to be a full subject name (not a short code). */
  const isLikelyFull = (s) => {
    const t = (s || "").trim(); // trimmed input for analysis
    if (!t) return false;
    const words = t.split(/\s+/).filter(Boolean);
    if (
      /\bLAB\b/i.test(t) &&
      /^[A-Z0-9\s\-]+$/.test(t) &&
      words.length <= 3
    ) {
      return false;
    }
    const hasSpaces = /\s/.test(t);
    const hasLower = /[a-z]/.test(t);
    const longish = t.length >= 15;
    const manyWords = words.length >= 3;
    const hasStop =
      /\b(of|and|in|to|for|with|on|&|Application|Management|System|Skills)\b/i.test(
        t
      );
    return hasSpaces && hasLower && (manyWords || longish || hasStop);
  };

  // Section: SUBJECT/TEACHER DETECTION

  /** Checks if a text fragment looks like a person’s name (2–4 capitalized words, no subject keywords). */
  const looksLikePersonNameChunk = (text) => {
    const cleaned = String(text || "")
      .replace(
        /\b(?:Prof\.\(Dr\.\)|Prof(?:essor)?\.?|Dr\.?|Mr\.?|Ms\.?|Mrs\.?|Miss\.?)\b\.?/gi,
        ""
      )
      .replace(/[^A-Za-z.'\-\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned || /\d/.test(cleaned)) return false;
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 4) return false;
    // Keep this subject-word guard aligned with:
    // - src/js/ui/pdf-import.js (pdfImportLooksLikePersonNameChunk)
    // - parse_pdf.py (subject/teacher noise filters)
    const subjectWords = new Set([
      "analysis",
      "and",
      "aptitude",
      "architecture",
      "aws",
      "cloud",
      "communication",
      "computer",
      "constitution",
      "culture",
      "cyber",
      "data",
      "database",
      "design",
      "discrete",
      "electronics",
      "engineering",
      "graphics",
      "implementation",
      "indian",
      "information",
      "java",
      "knowledge",
      "lab",
      "learning",
      "management",
      "math",
      "mathematics",
      "machine",
      "multimedia",
      "network",
      "operating",
      "optimization",
      "practitioner",
      "presentation",
      "programming",
      "project",
      "python",
      "reasoning",
      "science",
      "security",
      "seminar",
      "skill",
      "skills",
      "software",
      "startup",
      "structure",
      "system",
      "technical",
      "technology",
      "tradition",
      "using",
      "web",
      "with",
    ]);
    for (const token of words) {
      const word = token.replace(/[^A-Za-z.'\-]/g, "");
      if (!word) return false;
      if (subjectWords.has(word.toLowerCase())) return false;
      if (!/^[A-Z][a-z.'\-]*$/.test(word)) return false;
    }
    return true;
  };
  /** Returns true if the text looks like a list of teacher names (slash/comma separated). */
  const looksLikeTeacherNameList = (text) => {
    const t = String(text || "").trim();
    if (!t) return false;
    if (
      /\b(?:lab|project|seminar|startup|aptitude|reasoning|soft\s*skill|math|system|security|technology|programming|electronics|design|analysis|management|communication|constitution|culture|engineering|graphics|multimedia|database|network|python|java|aws)\b/i.test(
        t
      )
    ) {
      return false;
    }
    if (
      /\b(?:Prof\.\(Dr\.\)|Prof(?:essor)?\.?|Dr\.?|Mr\.?|Ms\.?|Mrs\.?|Miss\.?)\b/i.test(
        t
      )
    ) {
      return true;
    }
    const parts = t
      .split(/\s*(?:\/|,|;|\band\b)\s*/i)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length < 2) return false;
    return parts.every((part) => looksLikePersonNameChunk(part));
  };
  /** Returns true if the text looks like a subject keyword rather than a real teacher name. */
  const isLikelyTeacherNoiseValue = (text) => {
    const raw = String(text || "").trim();
    if (!raw) return false;
    if (
      /\b(?:Prof\.\(Dr\.\)|Prof(?:essor)?\.?|Dr\.?|Mr\.?|Ms\.?|Mrs\.?|Miss\.?)\b/i.test(
        raw
      )
    ) {
      return false;
    }
    const cleaned = raw
      .replace(/[^A-Za-z\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (!cleaned) return false;
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (!words.length || words.length > 3) return false;
    const subjectLikeWords = new Set([
      "analysis",
      "aptitude",
      "aws",
      "commerce",
      "communication",
      "computer",
      "constitution",
      "culture",
      "cyber",
      "data",
      "database",
      "design",
      "electronics",
      "engineering",
      "graphics",
      "lab",
      "management",
      "math",
      "mathematics",
      "multimedia",
      "network",
      "operating",
      "programming",
      "project",
      "python",
      "reasoning",
      "science",
      "security",
      "seminar",
      "skill",
      "skills",
      "software",
      "startup",
      "subject",
      "system",
      "technology",
    ]);
    if (words.join("") === "ecommerce") return true;
    return words.every((w) => subjectLikeWords.has(w));
  };
  return raw
    .split("\n")
    .map((line) => {
      if (!line || !line.trim()) return null;
      // Split only on delimiter style " - " to preserve hyphenated words
      // inside subject names (e.g., "E-Commerce").
      const parts = line.split(/\s+-\s+/).map((s) => (s || "").trim());
      let a0 = parts[0] || "";
      let a1 = parts[1] || "";
      let a2 = parts[2] || "";
      let tail = parts.slice(3).join(" - ").trim();
      let a3 = "";
      if (tail) a3 = tail;

      let explicitCredits = null;
      if (a3) {
        const mnum = a3.match(/^\s*(\d{1,2})\s*(?:cr|credits?)?\s*$/i);
        if (mnum) explicitCredits = parseInt(mnum[1], 10);
      }

      let short = a0;
      let subject = a1;
      let teacher = a2;

      let credits = explicitCredits;

      if (!a2 && !a3) {
        const m = line.match(/^(.*?)\s+-\s+(.*?)\s*(?:-\s+(.*))?$/);
        if (!m) return null;
        a0 = (m[1] || "").trim();
        a1 = (m[2] || "").trim();
        a2 = (m[3] || "").trim();
        short = a0;
        subject = a1;
        teacher = a2;
      }

      if (
        (isLikelyFull(short) && looksShort(subject)) ||
        (!looksShort(short) && looksShort(subject))
      ) {
        const tmp = short;
        short = subject;
        subject = tmp;
      }

      const originalShort = (short || "").trim(); // preserved original casing before normalization
      const shortKey = normalizeShort(originalShort);

      if (
        (!teacher || !teacher.trim()) &&
        a3 &&
        explicitCredits == null
      ) {
        teacher = a3;
      }

      // Section: CREDIT SCANNING

      /** Extracts a credit value from a string, returning the cleaned text and credits. */
      const scanForCredits = (s) => {
        if (!s) return {
          text: s,
          credits: null
        };
        const patterns = [
          /\bcredits?\s*[:=]\s*(\d{1,2})\b/i,
          /\bcr\s*[:=]\s*(\d{1,2})\b/i,
          /\((\d{1,2})\s*cr\)/i,
          /\((\d{1,2})\)\s*$/i,
          /\b(\d{1,2})\s*cr\b/i,
          /^(\d{1,2})\s*$/,
        ];
        let out = s;
        let found = null;
        for (const re of patterns) {
          const m = out.match(re);
          if (m) {
            found = parseInt(m[1], 10);
            out = out.replace(re, "").trim();
            break;
          }
        }
        return {
          text: out.trim(),
          credits: Number.isFinite(found) ? found : null,
        };
      };

      if (credits == null) {
        const subjScan = scanForCredits(subject || "");
        subject = subjScan.text;
        if (subjScan.credits != null) credits = subjScan.credits;
      }
      if (credits == null) {
        const teachScan = scanForCredits(teacher || "");
        teacher = teachScan.text;
        if (teachScan.credits != null) credits = teachScan.credits;
      }

      // Recover rows where an extra " - " split moved a subject fragment
      // (e.g., "Commerce") into teacher and pushed the real teacher to tail.
      if (
        a3 &&
        explicitCredits == null &&
        isLikelyTeacherNoiseValue(teacher || "") &&
        !isLikelyTeacherNoiseValue(a3)
      ) {
        subject = [subject, teacher].filter(Boolean).join(" ");
        teacher = a3;
      }

      const teacherList = (teacher || "") // split multi-teacher values into individual names
        .split(/[,|/]+/)
        .map((t) => t.trim())
        .filter((t) => t && !isLikelyTeacherNoiseValue(t));
      if (
        looksLikeTeacherNameList(subject || "") &&
        (teacherList.length > 0 || looksLikeTeacherNameList(teacher || ""))
      ) {
        return null;
      }

      return {
        short: shortKey,
        originalShort,
        subject,
        teacher: teacherList[0] || "",
        teachers: teacherList, // ordered preference
        credits,
      };
    })
    .filter((p) => p && p.short && p.subject);
}
