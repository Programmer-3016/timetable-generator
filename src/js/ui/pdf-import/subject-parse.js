/* exported pdfImportParseSubjectTableLines */
/**
 * @module ui/pdf-import/subject-parse.js
 * @description Subject-row reconstruction and dedupe from extracted PDF lines.
 */

// Section: ENTRY PARSING HELPERS

function pdfImportParseSubjectTableLines(lines) {
  const entries = [];
  let pendingSubject = "";
  let pendingLtp = "";
  const startsWithOcrArtifact = (text) => // Returns true if text begins with a known OCR artifact token
    /^(?:dye|ode|ame|bye|p|q|n|an)\b/i.test(pdfImportNormalizeLine(text || ""));

  const pushFinalEntry = (short, subject, teacher, ltp = "") => { // Finalizes and pushes a subject entry to the entries array
    const finalEntry = pdfImportFinalizeEntry(short, subject, teacher, ltp);
    if (!finalEntry) return false;
    entries.push(finalEntry);
    return true;
  };

  const tryParseDashEntries = (text) => { // Attempts to parse dash-separated merged entries from text
    const chunks = pdfImportSplitMergedDashEntries(text);
    if (!chunks.length) return false;
    let hit = false;
    chunks.forEach((chunk) => {
      const parsed = pdfImportParseSubjectLine(chunk);
      if (!parsed) return;
      const ltp = pdfImportExtractLtpFromLine(chunk);
      if (pushFinalEntry(parsed.short, parsed.subject, parsed.teacher, ltp)) {
        hit = true;
      }
    });
    return hit;
  };

  /** @description Builds a subject entry from core text with optional teacher and LTP. */
  const tryBuildEntryFromCore = (coreInput, teacherInput, forcedLtp = "") => {
    let core = pdfImportPreprocessLine(coreInput || "", {
      convertWideGaps: true,
    });
    const coreLtp = pdfImportNormalizeLtpTriplet(forcedLtp) ||
      pdfImportExtractLtpFromLine(coreInput || "") ||
      pendingLtp;
    let teacher = pdfImportCleanTeacher(teacherInput || "");
    const teacherWasMissing = !teacherInput || /^not\s*mentioned$/i.test(teacher);
    if (!core) return false;

    const pendingPrefix =
      pendingSubject && !pdfImportLooksLikeNoiseSubject(pendingSubject) ?
      pdfImportNormalizeLine(pendingSubject) :
      "";
    if (pendingPrefix) {
      core = `${pendingPrefix} ${core}`.trim();
    }

    const commit = (ok) => { // Clears pending state on successful parse and returns the result
      if (ok && pendingPrefix) pendingSubject = "";
      if (ok) pendingLtp = "";
      return ok;
    };

    if (tryParseDashEntries(core)) {
      return commit(true);
    }

    let parsed = null;
    {
      const cols = pdfImportSplitTabularColumns(coreInput || core);
      const usefulCols = cols.filter(
        (c) =>
          !/^\d+(?:\s+\d+){0,3}$/.test(c) &&
          !/^(?:L|T|P|TH|PR|LTP)$/i.test(c)
      );
      if (usefulCols.length >= 2) {
        const firstColShort = pdfImportNormalizeShort(usefulCols[0] || "");
        const teacherFromLastCol = pdfImportCleanTeacher(
          usefulCols[usefulCols.length - 1] || ""
        );
        if (
          !parsed &&
          usefulCols.length >= 3 &&
          pdfImportIsStrictShort(firstColShort) &&
          !/^not\s*mentioned$/i.test(teacherFromLastCol)
        ) {
          const subjectFromMiddle = pdfImportNormalizeSubjectForShort(
            firstColShort,
            usefulCols.slice(1, usefulCols.length - 1).join(" ")
          );
          if (
            subjectFromMiddle &&
            !pdfImportLooksLikeNoiseSubject(subjectFromMiddle)
          ) {
            parsed = {
              short: firstColShort,
              subject: subjectFromMiddle,
            };
            if (teacherWasMissing) teacher = teacherFromLastCol;
          }
        }

        let shortIdx = -1;
        for (let idx = usefulCols.length - 1; idx >= 0; idx--) {
          if (pdfImportIsStrictShort(usefulCols[idx])) {
            shortIdx = idx;
            break;
          }
        }
        if (shortIdx > 0) {
          const subj = pdfImportCleanSubject(
            usefulCols.slice(0, shortIdx).join(" ")
          );
          if (subj && !pdfImportLooksLikeNoiseSubject(subj)) {
            parsed = {
              short: pdfImportNormalizeShort(usefulCols[shortIdx]),
              subject: subj,
            };
            const teacherFromCols = pdfImportCleanTeacher(
              usefulCols.slice(shortIdx + 1).join(" ")
            );
            if (teacherWasMissing && !/^not\s*mentioned$/i.test(teacherFromCols)) {
              teacher = teacherFromCols;
            }
          }
        }
        if (!parsed) {
          for (let idx = usefulCols.length - 1; idx >= 0; idx--) {
            const col = usefulCols[idx];

            const leadShortMatch = col.match(/^([A-Z0-9&]{2,12})\s+(.+)$/);
            if (leadShortMatch && pdfImportIsStrictShort(leadShortMatch[1])) {
              const leadShort = pdfImportNormalizeShort(leadShortMatch[1]);
              const allowLeadShortParse =
                idx > 0 || leadShort.length <= 4 || /\bLAB\b/.test(leadShort);
              if (!allowLeadShortParse) {
                continue;
              }
              const tailText = pdfImportCleanSubject(leadShortMatch[2]);
              const tailTeacher = pdfImportCleanTeacher(leadShortMatch[2]);
              const tailIsTeacher = !/^not\s*mentioned$/i.test(tailTeacher);
              const subjectFromCols = pdfImportCleanSubject(
                tailIsTeacher ?
                usefulCols.slice(0, idx).join(" ") :
                [...usefulCols.slice(0, idx), tailText].join(" ")
              );
              if (
                subjectFromCols &&
                !pdfImportLooksLikeNoiseSubject(subjectFromCols)
              ) {
                parsed = {
                  short: leadShort,
                  subject: subjectFromCols,
                };
                const teacherFromCols = pdfImportCleanTeacher(
                  [
                    tailIsTeacher ? leadShortMatch[2] : "",
                    ...usefulCols.slice(idx + 1),
                  ]
                  .join(" ")
                  .trim()
                );
                if (
                  teacherWasMissing &&
                  !/^not\s*mentioned$/i.test(teacherFromCols)
                ) {
                  teacher = teacherFromCols;
                }
                break;
              }
            }

            const tailShortParsed = pdfImportExtractShortFromTail(col);
            if (!tailShortParsed) continue;
            const subjectFromCols = pdfImportCleanSubject(
              [...usefulCols.slice(0, idx), tailShortParsed.subject].join(" ")
            );
            if (!subjectFromCols || pdfImportLooksLikeNoiseSubject(subjectFromCols)) {
              continue;
            }
            parsed = {
              short: pdfImportNormalizeShort(tailShortParsed.short),
              subject: subjectFromCols,
            };
            const teacherFromCols = pdfImportCleanTeacher(
              usefulCols.slice(idx + 1).join(" ")
            );
            if (teacherWasMissing && !/^not\s*mentioned$/i.test(teacherFromCols)) {
              teacher = teacherFromCols;
            }
            break;
          }
        }
        if (!parsed && usefulCols.length >= 2) {
          const teacherFromLast = pdfImportCleanTeacher(
            usefulCols[usefulCols.length - 1]
          );
          if (!/^not\s*mentioned$/i.test(teacherFromLast)) {
            const subjectFromCols = pdfImportCleanSubject(
              usefulCols.slice(0, usefulCols.length - 1).join(" ")
            );
            const shortFromCols =
              pdfImportDeriveShortFromSubject(subjectFromCols);
            if (shortFromCols && subjectFromCols) {
              parsed = {
                short: shortFromCols,
                subject: subjectFromCols,
              };
              if (teacherWasMissing) teacher = teacherFromLast;
            }
          }
        }
      }
    }
    if (!parsed) parsed = pdfImportExtractShortFromTail(core);
    if (!parsed) {
      const fallbackSplit = pdfImportExtractTeacherAndHead(core);
      const fallbackSubject = pdfImportCleanSubject(
        fallbackSplit.head || core
      );
      const fallbackShort = pdfImportDeriveShortFromSubject(fallbackSubject);
      if (fallbackShort && fallbackSubject) {
        parsed = {
          short: fallbackShort,
          subject: fallbackSubject,
        };
        const teacherFromFallback = pdfImportCleanTeacher(
          fallbackSplit.teacher || ""
        );
        if (teacherWasMissing && !/^not\s*mentioned$/i.test(teacherFromFallback)) {
          teacher = teacherFromFallback;
        }
      }
    }
    if (!parsed) return false;
    return commit(pushFinalEntry(parsed.short, parsed.subject, teacher, coreLtp));
  };

  for (const raw of lines) {
    const line = pdfImportPreprocessLine(raw, {
      convertWideGaps: true,
    });
    const lineForCode = line.replace(/^(?:\||:|-|\s)+/, "");
    const lineHasSubjectCode = /^(VAC|[A-Z]{2,}\s*-?\s*\d{2,}[A-Z]*)\b/i.test(
      lineForCode
    );
    if (!line || (pdfImportShouldSkipLine(line) && !lineHasSubjectCode)) {
      pendingSubject = "";
      pendingLtp = "";
      continue;
    }

    const codeSegments = pdfImportSplitLineBySubjectCode(line);
    let consumed = false;

    for (const segmentRaw of codeSegments) {
      const segment = pdfImportPreprocessLine(segmentRaw, {
        convertWideGaps: true,
      });
      const segmentForCode = segment.replace(/^(?:\||:|-|\s)+/, "");
      const segmentHasSubjectCode =
        /^(VAC|[A-Z]{2,}\s*-?\s*\d{2,}[A-Z]*)\b/i.test(segmentForCode);
      if (!segment || (pdfImportShouldSkipLine(segment) && !segmentHasSubjectCode))
        continue;

      if (tryParseDashEntries(segment)) {
        consumed = true;
        continue;
      }

      // Typical code formats: IMC201, IBC 201, BCA-405, VAC.
      const codeMatch = segmentForCode.match(
        /^(VAC|[A-Z]{2,}\s*-?\s*\d{2,}[A-Z]*)\b\s*(.*)$/i
      );

      if (!codeMatch) {
        const creditOnlyMatch = segment.match(/^\d{1,2}\s+(.+)$/);
        if (creditOnlyMatch) {
          const creditOnlySubject = pdfImportCleanSubject(creditOnlyMatch[1]);
          const creditOnlyShort =
            pdfImportDeriveShortFromSubject(creditOnlySubject);
          const creditOnlyLtp = pdfImportExtractLtpFromLine(segment);
          if (
            creditOnlyShort &&
            pushFinalEntry(
              creditOnlyShort,
              creditOnlySubject,
              "Not Mentioned",
              creditOnlyLtp
            )
          ) {
            consumed = true;
            continue;
          }
        }

        if (
          segment.includes("|") &&
          tryBuildEntryFromCore(
            segment,
            "",
            pdfImportExtractLtpFromLine(segment)
          )
        ) {
          consumed = true;
          continue;
        }

        const allowDirectParse = /\s-\s/.test(segment) || segment.includes("|");
        const direct = allowDirectParse ? pdfImportParseSubjectLine(segment) : null;
        if (
          direct &&
          pushFinalEntry(
            direct.short,
            direct.subject,
            direct.teacher,
            pdfImportExtractLtpFromLine(segment)
          )
        ) {
          consumed = true;
          continue;
        }
        if (
          !pdfImportLooksLikeNoiseSubject(segment) &&
          !pdfImportLooksLikeClassHeader(segment)
        ) {
          if (
            /^[A-Za-z]/.test(segment) &&
            !/^\d/.test(segment) &&
            !segment.includes("|") &&
            !startsWithOcrArtifact(segment) &&
            !/^\s*(?:room|day|time|section)\b/i.test(segment)
          ) {
            pendingSubject = pendingSubject ?
              `${pendingSubject} ${segment}` :
              segment;
            const segmentLtp = pdfImportExtractLtpFromLine(segment);
            if (!pendingLtp && segmentLtp) pendingLtp = segmentLtp;
          }
        }
        continue;
      }

      let body = pdfImportNormalizeLine(codeMatch[2] || "");
      let rawBodyLtp = pdfImportExtractLtpFromLine(codeMatch[2] || "");
      body = body.replace(/^[|:\-]+\s*/, "").trim();
      // Capture leading digit(s) as single-value LTP before digit-stripping
      // removes them. Handles PDF formats like "BMC034 | 5 DATA ANALYTICS".
      if (!rawBodyLtp) {
        const leadingSingle = body.match(/^(\d{1,2})(?:\s*\|\s*|\s+)(?=[A-Za-z])/);
        if (leadingSingle) {
          const n = parseInt(leadingSingle[1], 10);
          if (Number.isFinite(n) && n >= 0 && n <= PDF_IMPORT_MAX_LTP_VALUE) {
            rawBodyLtp = pdfImportNormalizeLtpTriplet(String(n));
          }
        }
      }
      body = body.replace(/^(?:\d+\s*\|\s*){1,4}(?=[A-Za-z])/i, "").trim();
      body = body.replace(/^(?:\d+\s+){1,4}/, "").trim();
      while (startsWithOcrArtifact(body)) {
        body = body
          .replace(/^(?:dye|ode|ame|bye|p|q|n|an)\b[\s|:\-]*/i, "")
          .trim();
      }
      if (!body) {
        if (!pendingLtp && rawBodyLtp) pendingLtp = rawBodyLtp;
        continue;
      }

      // Preserve column-aware parsing for PDF table rows (subject | short | teacher).
      if (body.includes("|") && tryBuildEntryFromCore(body, "", rawBodyLtp)) {
        consumed = true;
        continue;
      }

      const teacherSplit = pdfImportExtractTeacherAndHead(body);
      if (
        tryBuildEntryFromCore(
          teacherSplit.head,
          teacherSplit.teacher,
          rawBodyLtp
        )
      ) {
        consumed = true;
      }
    }

    if (consumed) {
      pendingSubject = "";
      pendingLtp = "";
    }
  }

  return pdfImportDedupeSubjects(entries);
}

// Section: SUBJECT DEDUPLICATION

/**
 * @description Deduplicates subject entries by short+subject+teacher key, preserving LTP.
 * @param {Array} entries - Subject entries potentially containing duplicates.
 * @returns {Array} Deduplicated entries.
 */
function pdfImportDedupeSubjects(entries) {
  const byKey = new Map();
  entries.forEach((entry) => {
    const key = `${entry.short}|${entry.subject.toLowerCase()}|${(
      entry.teacher || ""
    ).toLowerCase()}`;
    const normalizedLtp = pdfImportNormalizeLtpTriplet(entry.ltp || "");
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...entry,
        ltp: normalizedLtp,
      });
      return;
    }
    if (!existing.ltp && normalizedLtp) {
      existing.ltp = normalizedLtp;
    }
  });
  return Array.from(byKey.values());
}
