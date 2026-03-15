/**
 * @file Global type declarations for the Antigravity timetable generator.
 *
 * Provides TypeScript-compatible type information for:
 *  - Browser globals defined across script-tag modules
 *  - Custom Window properties used for cross-module state
 *  - Third-party libraries loaded via CDN script tags
 */

/* ═══════════════════════════════════════════════════════
   Section: EXTERNAL LIBRARY DECLARATIONS
═══════════════════════════════════════════════════════ */

/** SheetJS (XLSX) library loaded via CDN */
declare var XLSX: any;

/** html2canvas library loaded via CDN */
declare var html2canvas: any;

/** Tesseract.js OCR library loaded via CDN */
declare var Tesseract: any;

/** PDF.js library loaded via CDN */
declare var pdfjsLib: any;

/* ═══════════════════════════════════════════════════════
   Section: PROJECT GLOBAL FUNCTIONS
═══════════════════════════════════════════════════════ */

/** Switch the active tab in the UI (defined in tabs.js) */
declare function switchTab(tabName: string): void;

/** Enable post-generation tabs after schedule is built (defined in tabs.js) */
declare function enablePostGenerateTabs(): void;

/** Get the currently active tab name (defined in tabs.js) */
declare function getActiveTab(): string;

/** Ensure minimum number of input rows exist (defined in init.js) */
declare function _ensureInputRows(n: number): void;

/** Show generation animation overlay (optional, may not be defined) */
declare function showGenerationAnimation(): void;

/** PDF import API base URL (defined in pdf-import/index.js) */
declare var IMPORT_API_URL: string;

/* ═══════════════════════════════════════════════════════
   Section: SCHEDULER STATE GLOBALS
═══════════════════════════════════════════════════════ */

/** Lab-number assignment map from last generation */
declare var gLabNumberAssigned: Record<string, any>;

/** Teacher assignment map from last generation */
declare var gAssignedTeacher: Record<string, any>;

/* ═══════════════════════════════════════════════════════
   Section: WINDOW CUSTOM PROPERTIES
═══════════════════════════════════════════════════════ */

interface Window {
  /* ─────────────────────────────────────────────────────
     Subsection: GENERATION STATE FLAGS
  ─────────────────────────────────────────────────────── */

  /** True while a generation request is queued */
  __ttGenerationPending?: boolean;

  /** True while the scheduler is actively running */
  __ttGenerationRunning?: boolean;

  /** Seed value used in the last generation run */
  __ttLastSeed?: number;

  /* ─────────────────────────────────────────────────────
     Subsection: GENERATION RESULTS
  ─────────────────────────────────────────────────────── */

  /** Full schedule state snapshot from last generation */
  __ttLastScheduleState?: Record<string, any>;

  /** Validation results from last generation */
  __ttLastValidation?: Record<string, any>;

  /** Unresolved teacher/room clashes from last generation */
  __ttUnresolvedClashes?: Array<Record<string, any>>;

  /** Post-lunch compaction report from last generation */
  __ttPostLunchCompactReport?: Record<string, any>;

  /** Metadata about strict generation mode */
  __ttStrictGenerationMeta?: {
    strictMode: boolean;
    maxAttempts: number;
    attemptsUsed: number;
    baseSeed: number;
    lastSeed: number;
    valid: boolean;
    forced: boolean;
    violations: any[];
  };

  /* ─────────────────────────────────────────────────────
     Subsection: SCHEDULER CONFIGURATION FLAGS
  ─────────────────────────────────────────────────────── */

  /** Allow emergency P5 filler placement (default: true) */
  allowP5FillerEmergency?: boolean;

  /** Force strict filler placement in last two periods */
  strictFillersLastTwo?: boolean;

  /** Guarantee P5 periods are filled (default: true) */
  guaranteeFilledP5?: boolean;

  /* ─────────────────────────────────────────────────────
     Subsection: CROSS-MODULE FUNCTIONS AND STATE
  ─────────────────────────────────────────────────────── */

  /** Switch active tab */
  switchTab?: (tabName: string) => void;

  /** Enable post-generation tabs */
  enablePostGenerateTabs?: () => void;

  /** Get currently active tab */
  getActiveTab?: () => string;

  /** Show generation animation overlay */
  showGenerationAnimation?: () => void;

  /** Ensure minimum input rows */
  _ensureInputRows?: (n: number) => void;

  /** Lab-number assignment map */
  gLabNumberAssigned?: Record<string, any>;

  /** Teacher assignment map */
  gAssignedTeacher?: Record<string, any>;

  /** Main timetable generation entry point (wrapped by skeleton shim) */
  generateTimetable?: (options?: Record<string, any>) => void;

  /** Render multi-class schedules to the DOM */
  renderMultiClasses?: (params: Record<string, any>) => any;

  /** Apply parsed backend import data to the UI */
  applyBackendImportData?: (data: any) => Promise<any>;

  /* ─────────────────────────────────────────────────────
     Subsection: EXTERNAL LIBRARIES
  ─────────────────────────────────────────────────────── */

  /** jsPDF constructor (loaded via CDN) */
  jspdf?: any;

  /** jsPDF namespace */
  jsPDF?: any;

  /** PDF.js library */
  pdfjsLib?: any;

  /** Tesseract OCR library */
  Tesseract?: any;
}
