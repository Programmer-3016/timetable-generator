/* exported validateAndGenerate */
/**
 * @module core/input-validator.js
 * @description Pre-generate input validation and error boundary wrapper.
 * Does NOT modify any existing logic — purely additive.
 */

// Section: INPUT VALIDATION

/**
 * Validate inputs before running the scheduler.
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateInputsBeforeGenerate() {
  const errors = [];

  const slots = parseInt(document.getElementById("slots")?.value);
  const days = parseInt(document.getElementById("days")?.value);
  const duration = parseInt(document.getElementById("duration")?.value);

  if (!Number.isFinite(slots) || slots < 1) {
    errors.push("Number of periods must be at least 1.");
  }
  if (!Number.isFinite(days) || days < 1) {
    errors.push("Number of days must be at least 1.");
  }
  if (!Number.isFinite(duration) || duration < 10) {
    errors.push("Period duration must be at least 10 minutes.");
  }

  // Check that at least one class has subjects
  const classCountEl = document.getElementById("classCount");
  const classCount = Math.min(
    (typeof CLASS_KEYS !== "undefined" ? CLASS_KEYS.length : 26),
    Math.max(1, parseInt(classCountEl?.value || "1", 10))
  );

  let classesWithSubjects = 0;
  // eslint-disable-next-line no-unused-vars
  let classesWithMissingTeachers = 0;
  const warnings = [];

  for (let i = 0; i < classCount; i++) {
    const key = (typeof CLASS_KEYS !== "undefined" && CLASS_KEYS[i]) ? // class identifier for this iteration
      CLASS_KEYS[i] : String.fromCharCode(65 + i);
    const textarea = document.getElementById(`pairs${key}`);
    if (!textarea) continue;

    const rawText = textarea.value.trim();
    if (!rawText) continue;

    classesWithSubjects++;
    const lines = rawText.split("\n").filter((l) => l.trim());
    let missingTeacher = 0;

    lines.forEach((line) => {
      const parts = line.split("-").map((p) => p.trim());
      // Typical format: SHORT - FULL - TEACHER - CREDITS
      // If only 1-2 parts, teacher is likely missing
      if (parts.length >= 3) {
        const teacherPart = parts[2] || "";
        if (!teacherPart || /not\s*mentioned/i.test(teacherPart)) {
          missingTeacher++;
        }
      } else if (parts.length <= 2) {
        missingTeacher++;
      }
    });

    if (missingTeacher > 0) {
      classesWithMissingTeachers++; // eslint-disable-line no-unused-vars
      warnings.push(
        `Class ${i + 1}: ${missingTeacher} subject(s) may be missing teacher names.`
      );
    }

    // Check total slots vs total credits
    if (Number.isFinite(slots) && Number.isFinite(days)) {
      const totalSlots = slots * days;
      let totalCredits = 0;
      lines.forEach((line) => {
        const parts = line.split("-").map((p) => p.trim());
        const creditPart = parts[parts.length - 1];
        const credit = parseInt(creditPart);
        if (Number.isFinite(credit) && credit > 0) {
          totalCredits += credit;
        }
      });

      if (totalCredits > totalSlots) {
        errors.push(
          `Class ${i + 1}: Total credits (${totalCredits}) exceed available slots (${totalSlots}). Reduce subjects or increase periods/days.`
        );
      }
    }
  }

  if (classesWithSubjects === 0) {
    errors.push(
      "No subjects entered! Fill in at least one class before generating."
    );
  }

  // Warnings shown as toasts but don't block generation
  if (warnings.length > 0 && errors.length === 0) {
    const warnMsg = warnings.length <= 2 ?
      warnings.join("\n") :
      `${warnings.length} classes have subjects without teacher names.`;
    if (typeof showToast === "function") {
      showToast(warnMsg, { type: "warn", duration: 5000 });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Wraps generateTimetable with input validation + error boundary.
 * The original generateTimetable() function is NOT modified.
 */
function validateAndGenerate() {
  // Step 1: Validate inputs
  const result = validateInputsBeforeGenerate();
  if (!result.valid) {
    const errorMsg = result.errors.join("\n");
    if (typeof showToast === "function") {
      showToast(errorMsg, { type: "error", duration: 6000 });
    }
    return;
  }

  // Step 2: Call original function with error boundary
  try {
    generateTimetable();
  } catch (err) {
    // Reset generation flags
    window.__ttGenerationRunning = false;
    window.__ttGenerationPending = false;

    // Show user-friendly error
    const message = err && err.message ?
      `Generation failed: ${err.message}` :
      "Generation failed unexpectedly. Please check your inputs and try again.";

    if (typeof showToast === "function") {
      showToast(message, { type: "error", duration: 8000 });
    }

    console.error("[Timetable] Generation error:", err);
  }
}
