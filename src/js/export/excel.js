// @ts-check
/**
 * @module export/excel.js
 * @description Workbook export pipeline for multi-sheet Excel output.
 */

/* ═══════════════════════════════════════════════════════
   Section: EXCEL EXPORT
═══════════════════════════════════════════════════════ */

/** @typedef {{ [key: string]: any }} ExcelWorksheet */

/**
 * Exports the full timetable as a multi-sheet Excel workbook including overview, per-class schedules, teacher report, and lab schedule.
 * @async
 * @returns {Promise<void>}
 */
async function exportToExcel() {
  if (!generated) {
    showToast("Generate timetable first.", {
      type: "warn"
    });
    return;
  }
  if (typeof XLSX === "undefined") {
    showToast("SheetJS library not loaded. Check your internet connection.", {
      type: "error"
    });
    return;
  }
  const excelName = ensureFilenameExtension(
    `timetable_export-${new Date().toISOString().replace(/[:\.]/g, "-")}`,
    "xlsx"
  );
  const saveTarget = await createFileSaveTarget(excelName, {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    description: "Excel workbook",
  });
  if (saveTarget.cancelled) return;

  const wb = XLSX.utils.book_new();
  const enabledKeys = Array.isArray(gEnabledKeys) ? gEnabledKeys : [];
  const safeReportData = Array.isArray(reportData) ? reportData : [];
  const configuredDays = parseInt(/** @type {HTMLInputElement} */ (document.getElementById("days"))?.value || "5", 10);
  const derivedDays = Math.max(
    configuredDays,
    ...(enabledKeys.map((key) =>
      Array.isArray(gSchedules?.[key]) ? gSchedules[key].length : 0
    ))
  );
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].slice(0, derivedDays || configuredDays || 5);

  /**
   * Converts a zero-based column index into an Excel column label.
   * @param {number} columnIndex
   * @returns {string}
   */
  function encodeCol(columnIndex) {
    return XLSX.utils.encode_col(columnIndex);
  }

  /**
   * Appends merge ranges to a worksheet.
   * @param {ExcelWorksheet} worksheet
   * @param {string[]} refs
   * @returns {void}
   */
  function pushMerges(worksheet, refs) {
    worksheet["!merges"] = worksheet["!merges"] || [];
    refs.forEach((ref) => {
      worksheet["!merges"].push(XLSX.utils.decode_range(ref));
    });
  }

  /**
   * Applies worksheet row heights using zero-based row indexes.
   * @param {ExcelWorksheet} worksheet
   * @param {Array<{ index: number, hpx: number }>} rows
   * @returns {void}
   */
  function setRowHeights(worksheet, rows) {
    worksheet["!rows"] = worksheet["!rows"] || [];
    rows.forEach(({ index, hpx }) => {
      worksheet["!rows"][index] = Object.assign({}, worksheet["!rows"][index], { hpx });
    });
  }

  /**
   * Adds an autofilter range when the section contains a real header row plus data.
   * @param {ExcelWorksheet} worksheet
   * @param {{ startRow: number, startCol: number, rowCount: number, colCount: number }} args
   * @returns {void}
   */
  function setAutoFilter(worksheet, { startRow, startCol, rowCount, colCount }) {
    if (rowCount < 2 || colCount < 1) return;
    worksheet["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: startRow, c: startCol },
        e: { r: startRow + rowCount - 1, c: startCol + colCount - 1 },
      })
    };
  }

  /**
   * Returns a unique and Excel-safe worksheet name.
   * @param {string} desiredName
   * @returns {string}
   */
  function makeUniqueSheetName(desiredName) {
    const sanitize = (value) => String(value || "Sheet")
      .replace(/[\\\/*?\[\]:]/g, "")
      .trim() || "Sheet";
    const base = sanitize(desiredName).slice(0, 31) || "Sheet";
    let candidate = base;
    let suffix = 2;
    while ((wb.SheetNames || []).includes(candidate)) {
      const suffixLabel = ` (${suffix})`;
      candidate = `${base.slice(0, Math.max(1, 31 - suffixLabel.length))}${suffixLabel}`;
      suffix += 1;
    }
    return candidate;
  }

  /**
   * Converts report severity into a readable export label.
   * @param {{ status?: string, flags?: string[] }} row
   * @returns {string}
   */
  function formatTeacherStatus(row) {
    const flags = Array.isArray(row?.flags) ? row.flags.filter(Boolean) : [];
    if (row?.status === "err") return flags.length ? `Error: ${flags.join(" · ")}` : "Error";
    if (row?.status === "warn") return flags.length ? `Warning: ${flags.join(" · ")}` : "Warning";
    return "OK";
  }

  /**
   * Measures readable column widths for a 2D array block.
   * @param {Array<Array<unknown>>} matrix
   * @param {{ min?: number, max?: number }} [options]
   * @returns {number[]}
   */
  function computeWidths(matrix, options = {}) {
    const min = options.min || 10;
    const max = options.max || 32;
    const widths = [];
    matrix.forEach((row) => {
      row.forEach((cell, colIndex) => {
        const length = String(cell ?? "").trim().length;
        const next = Math.min(Math.max(length + 2, min), max);
        widths[colIndex] = Math.max(widths[colIndex] || min, next);
      });
    });
    return widths;
  }

  const generatedAt = new Date().toLocaleString();
  const overviewData = [
    ["Timetable Export Overview"],
    ["Generated on", generatedAt],
    [],
    ["Setting", "Value"],
    ["Day Start Time", /** @type {HTMLInputElement} */ (document.getElementById("startTime"))?.value || ""],
    ["Number of Periods", /** @type {HTMLInputElement} */ (document.getElementById("slots"))?.value || ""],
    ["Number of Days", derivedDays],
    ["Period Duration (min)", /** @type {HTMLInputElement} */ (document.getElementById("duration"))?.value || ""],
    ["Lunch After Period", /** @type {HTMLInputElement} */ (document.getElementById("lunchPeriod"))?.value || ""],
    ["Lunch Duration (min)", /** @type {HTMLInputElement} */ (document.getElementById("lunchDuration"))?.value || ""],
    ["Lab Rooms", /** @type {HTMLInputElement} */ (document.getElementById("labCount"))?.value || ""],
    ["Classes Generated", enabledKeys.length],
  ];
  const wsOverview = XLSX.utils.aoa_to_sheet(overviewData);
  pushMerges(wsOverview, ["A1:B1"]);
  wsOverview["!cols"] = [{
    wch: 24
  }, {
    wch: 22
  }];
  setRowHeights(wsOverview, [
    { index: 0, hpx: 28 },
    { index: 3, hpx: 22 },
  ]);
  XLSX.utils.book_append_sheet(wb, wsOverview, "Overview");

  enabledKeys.forEach((key, idx) => {
    const label = gClassLabels[key] || `Class ${idx + 1}`;
    const parts = label.split(/[\s-]+/);
    const suffix = parts.length > 1 ? parts[parts.length - 1] : "";
    const desiredSheetName = `C${idx + 1} ${suffix}`.replace(/[\/*?\[\]:]/g, "").trim() || `Class ${idx + 1}`;
    const sheetName = makeUniqueSheetName(desiredSheetName);

    const table = document.querySelector(`#timetable${key} table`);
    const scheduleByDay = Array.isArray(gSchedules[key]) ? gSchedules[key] : [];
    const classDayCount = scheduleByDay.length || derivedDays;
    const activeDayNames = dayNames.slice(0, classDayCount);
    const headers = ["Day / Period"];
    if (table) {
      const ths = table.querySelectorAll("thead th");
      ths.forEach((th, i) => {
        if (i === 0) return; // skip first "Day / Period" header
        headers.push(th.textContent.trim());
      });
    } else {
      periodTimings.forEach((pt) => {
        headers.push(pt.type === "lunch" ? "Lunch" : `P${pt.classIdx + 1}`);
      });
    }

    const timetableRows = [headers];
    for (let d = 0; d < classDayCount; d++) {
      const row = [activeDayNames[d] || `Day ${d + 1}`];
      let classCol = 0;
      for (let p = 0; p < periodTimings.length; p++) {
        if (periodTimings[p].type === "lunch") {
          row.push("LUNCH");
          continue;
        }
        const short = scheduleByDay[d]?.[classCol] || "";
        row.push(short);
        classCol++;
      }
      timetableRows.push(row);
    }

    const subjectMap = gSubjectByShort[key] || {};
    const quotaMap = gWeeklyQuotaByClass[key] || {};
    const slotCount = {};
    scheduleByDay.forEach((dayRow) => {
      (dayRow || []).forEach((sh) => {
        if (sh) slotCount[sh] = (slotCount[sh] || 0) + 1;
      });
    });

    const subjectRows = [["Short", "Full Name", "Teacher", "Credits", "Used / Target"]];
    Object.keys(subjectMap).sort((a, b) => {
      const labelA = subjectMap[a]?.originalShort || a;
      const labelB = subjectMap[b]?.originalShort || b;
      return labelA.localeCompare(labelB, undefined, { numeric: true, sensitivity: "base" });
    }).forEach((sh) => {
      const info = subjectMap[sh];
      const target = quotaMap[sh] || "";
      const used = slotCount[sh] || 0;
      subjectRows.push([
        info.originalShort || sh,
        info.subject || "",
        info.teacher || "",
        info.credits || "",
        target ? `${used}/${target}` : String(used),
      ]);
    });
    if (subjectRows.length === 1) {
      subjectRows.push(["-", "No subjects available", "", "", ""]);
    }

    const ws = XLSX.utils.aoa_to_sheet([]);
    const scheduleTitleRow = 3;
    const scheduleStartRow = 4;
    const subjectTitleRow = scheduleStartRow + timetableRows.length + 1;
    const subjectStartRow = subjectTitleRow + 1;
    const totalCols = Math.max(headers.length, subjectRows[0].length);

    XLSX.utils.sheet_add_aoa(ws, [[label]], { origin: { r: 0, c: 0 } });
    XLSX.utils.sheet_add_aoa(ws, [["Generated on", generatedAt]], { origin: { r: 1, c: 0 } });
    XLSX.utils.sheet_add_aoa(ws, [["Weekly Timetable"]], { origin: { r: scheduleTitleRow, c: 0 } });
    XLSX.utils.sheet_add_aoa(ws, timetableRows, { origin: { r: scheduleStartRow, c: 0 } });
    XLSX.utils.sheet_add_aoa(ws, [["Subject Info"]], { origin: { r: subjectTitleRow, c: 0 } });
    XLSX.utils.sheet_add_aoa(ws, subjectRows, { origin: { r: subjectStartRow, c: 0 } });

    pushMerges(ws, [
      `A1:${encodeCol(totalCols - 1)}1`,
      `A${scheduleTitleRow + 1}:${encodeCol(headers.length - 1)}${scheduleTitleRow + 1}`,
      `A${subjectTitleRow + 1}:${encodeCol(subjectRows[0].length - 1)}${subjectTitleRow + 1}`,
    ]);

    const scheduleWidths = computeWidths(timetableRows, { min: 12, max: 20 }).map((wch, columnIndex) => {
      if (columnIndex === 0) return Math.max(wch, 16);
      return wch;
    });
    const subjectWidths = computeWidths(subjectRows, { min: 12, max: 30 }).map((wch, columnIndex) => {
      if (columnIndex === 1) return Math.max(wch, 28);
      if (columnIndex === 2) return Math.max(wch, 22);
      return wch;
    });
    const columnCount = Math.max(scheduleWidths.length, subjectWidths.length);
    ws["!cols"] = Array.from({ length: columnCount }, (_, index) => ({
      wch: Math.max(scheduleWidths[index] || 10, subjectWidths[index] || 10)
    }));
    setRowHeights(ws, [
      { index: 0, hpx: 28 },
      { index: 1, hpx: 20 },
      { index: scheduleTitleRow, hpx: 22 },
      { index: subjectTitleRow, hpx: 22 },
    ]);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  if (safeReportData.length) {
    const statusRank = {
      err: 0,
      warn: 1,
      ok: 2
    };
    const reportRows = [
      ["Teacher Report"],
      ["Generated on", generatedAt],
      [],
      ["Summary", `${safeReportData.length} teachers exported`],
      ["Teacher", "Theory Slots", "Lab Slots", "Total Hours", "1st Period Count", "Status"]
    ];
    safeReportData.slice().sort((a, b) => {
      const rankA = statusRank[a?.status] ?? 9;
      const rankB = statusRank[b?.status] ?? 9;
      if (rankA !== rankB) return rankA - rankB;
      const hoursA = (a?.minutes || 0) / 60;
      const hoursB = (b?.minutes || 0) / 60;
      if (hoursB !== hoursA) return hoursB - hoursA;
      return String(a?.teacher || "").localeCompare(String(b?.teacher || ""), undefined, {
        sensitivity: "base"
      });
    }).forEach((r) => {
      reportRows.push([
        r.teacher,
        r.theory,
        r.labs,
        ((r.minutes || 0) / 60).toFixed(1),
        r.first,
        formatTeacherStatus(r),
      ]);
    });
    const wsReport = XLSX.utils.aoa_to_sheet(reportRows);
    pushMerges(wsReport, ["A1:F1"]);
    setRowHeights(wsReport, [
      { index: 0, hpx: 28 },
      { index: 3, hpx: 20 },
      { index: 4, hpx: 22 },
    ]);
    wsReport["!cols"] = [{
      wch: 30
    }, {
      wch: 14
    }, {
      wch: 10
    }, {
      wch: 12
    }, {
      wch: 16
    }, {
      wch: 22
    }, ];
    setAutoFilter(wsReport, {
      startRow: 4,
      startCol: 0,
      rowCount: reportRows.length - 4,
      colCount: 6
    });
    XLSX.utils.book_append_sheet(wb, wsReport, "Teacher Report");
  }

  const labPanel = document.getElementById("labPanel");
  if (labPanel) {
    const labTables = Array.from(labPanel.querySelectorAll("table"));
    const labRows = [["Lab Schedule"], ["Generated on", generatedAt], []];
    let hasLabContent = false;
    labTables.forEach((lt) => {
      let currentTableHasContent = false;
      const caption = lt.previousElementSibling;
      if (caption?.textContent?.trim()) {
        labRows.push([caption.textContent.trim()]);
        hasLabContent = true;
        currentTableHasContent = true;
      }
      lt.querySelectorAll("tr").forEach((tr) => {
        const cells = [];
        tr.querySelectorAll("th, td").forEach((td) => {
          cells.push(td.textContent.trim());
        });
        if (cells.some(Boolean)) {
          labRows.push(cells);
          hasLabContent = true;
          currentTableHasContent = true;
        }
      });
      if (currentTableHasContent) labRows.push([]);
    });
    if (hasLabContent) {
      const wsLab = XLSX.utils.aoa_to_sheet(labRows);
      const labColumnCount = Math.max(1, ...labRows.map((row) => row.length || 0));
      pushMerges(wsLab, [`A1:${encodeCol(labColumnCount - 1)}1`]);
      wsLab["!cols"] = computeWidths(labRows, { min: 12, max: 28 }).map((wch) => ({ wch }));
      setRowHeights(wsLab, [
        { index: 0, hpx: 28 },
      ]);
      XLSX.utils.book_append_sheet(wb, wsLab, "Lab Schedule");
    }
  }

  const wbArray = XLSX.write(wb, {
    bookType: "xlsx",
    type: "array",
    cellStyles: true
  });
  const excelBlob = new Blob([wbArray], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  await saveTarget.save(excelBlob);
}

document.getElementById("exportExcelBtn")?.addEventListener("click", exportToExcel);
