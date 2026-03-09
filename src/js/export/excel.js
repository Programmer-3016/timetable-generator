/**
 * @module export/excel.js
 * @description Workbook export pipeline for multi-sheet Excel output.
 */

// Section: EXCEL EXPORT

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
  const days = parseInt(document.getElementById("days")?.value || "5", 10);
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].slice(0, days);

  const overviewData = [
    ["Timetable Settings"],
    ["Day Start Time", document.getElementById("startTime")?.value || ""],
    ["Number of Periods", document.getElementById("slots")?.value || ""],
    ["Number of Days", days],
    ["Period Duration (min)", document.getElementById("duration")?.value || ""],
    ["Lunch After Period", document.getElementById("lunchPeriod")?.value || ""],
    ["Lunch Duration (min)", document.getElementById("lunchDuration")?.value || ""],
    ["Lab Rooms", document.getElementById("labCount")?.value || ""],
    ["Classes Generated", gEnabledKeys.length],
    [],
    ["Generated on", new Date().toLocaleString()],
  ];
  const wsOverview = XLSX.utils.aoa_to_sheet(overviewData);
  wsOverview["!cols"] = [{
    wch: 22
  }, {
    wch: 20
  }];
  XLSX.utils.book_append_sheet(wb, wsOverview, "Overview");

  gEnabledKeys.forEach((key, idx) => {
    const label = gClassLabels[key] || `Class ${idx + 1}`;
    const parts = label.split(/[\s-]+/);
    const suffix = parts.length > 1 ? parts[parts.length - 1] : "";
    let sheetName = `C${idx + 1} ${suffix}`.replace(/[\\\/*?\[\]:]/g, "").trim().slice(0, 31);
    const existingNames = wb.SheetNames || [];
    if (existingNames.includes(sheetName)) {
      sheetName = `Class ${idx + 1}`.slice(0, 31);
    }

    const table = document.querySelector(`#timetable${key} table`);
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

    const rows = [headers];
    for (let d = 0; d < days; d++) {
      const row = [dayNames[d]];
      let classCol = 0;
      for (let p = 0; p < periodTimings.length; p++) {
        if (periodTimings[p].type === "lunch") {
          row.push("LUNCH");
          continue;
        }
        const short = gSchedules[key]?.[d]?.[classCol] || "";
        row.push(short);
        classCol++;
      }
      rows.push(row);
    }

    rows.push([]);
    rows.push(["Subject Info"]);
    rows.push(["Short", "Full Name", "Teacher", "Credits", "Slots/Week"]);

    const subjectMap = gSubjectByShort[key] || {};
    const quotaMap = gWeeklyQuotaByClass[key] || {};
    const slotCount = {};
    for (let d = 0; d < days; d++) {
      const classesPerDay = parseInt(document.getElementById("slots")?.value || "7", 10);
      for (let c = 0; c < classesPerDay; c++) {
        const sh = gSchedules[key]?.[d]?.[c];
        if (sh) slotCount[sh] = (slotCount[sh] || 0) + 1;
      }
    }

    Object.keys(subjectMap).forEach((sh) => {
      const info = subjectMap[sh];
      const target = quotaMap[sh] || "";
      const used = slotCount[sh] || 0;
      rows.push([
        info.originalShort || sh,
        info.subject || "",
        info.teacher || "",
        info.credits || "",
        target ? `${used}/${target}` : String(used),
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = headers.map((h, i) => {
      let maxW = h.length;
      rows.forEach((r) => {
        if (r[i] && String(r[i]).length > maxW) maxW = String(r[i]).length;
      });
      return {
        wch: Math.min(maxW + 2, 30)
      };
    });
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  if (reportData.length) {
    const reportRows = [
      ["Teacher", "Theory Slots", "Lab Slots", "Total Hours", "1st Period Count", "Status"]
    ];
    reportData.forEach((r) => {
      reportRows.push([
        r.teacher,
        r.theory,
        r.labs,
        ((r.minutes || 0) / 60).toFixed(1),
        r.first,
        r.status,
      ]);
    });
    const wsReport = XLSX.utils.aoa_to_sheet(reportRows);
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
      wch: 10
    }, ];
    XLSX.utils.book_append_sheet(wb, wsReport, "Teacher Report");
  }

  const labPanel = document.getElementById("labPanel");
  if (labPanel) {
    const labTables = labPanel.querySelectorAll("table");
    const labRows = [];
    labTables.forEach((lt) => {
      const caption = lt.previousElementSibling;
      if (caption) labRows.push([caption.textContent.trim()]);
      lt.querySelectorAll("tr").forEach((tr) => {
        const cells = [];
        tr.querySelectorAll("th, td").forEach((td) => {
          cells.push(td.textContent.trim());
        });
        labRows.push(cells);
      });
      labRows.push([]);
    });
    if (labRows.length) {
      const wsLab = XLSX.utils.aoa_to_sheet(labRows);
      XLSX.utils.book_append_sheet(wb, wsLab, "Lab Schedule");
    }
  }

  const wbArray = XLSX.write(wb, {
    bookType: "xlsx",
    type: "array"
  });
  const excelBlob = new Blob([wbArray], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  await saveTarget.save(excelBlob);
}

document.getElementById("exportExcelBtn")?.addEventListener("click", exportToExcel);
