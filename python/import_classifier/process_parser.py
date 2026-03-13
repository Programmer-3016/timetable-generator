"""PDF timetable parsing logic for the /process endpoint.

Extracted from app.py for maintainability — logic is unchanged.
"""

from __future__ import annotations

import io
import re
from typing import Any

try:
    import pdfplumber
except Exception:  # pragma: no cover
    pdfplumber = None

_TIME_RE = re.compile(r"\b\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\b")
_DAY_TOKENS = {"MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"}

def _build_process_classes_from_pdf_tables(pdf_bytes: bytes) -> list[dict[str, Any]]:
    if pdfplumber is None:
        return []

    day_tokens = {"MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"}

    def _clean(text: str) -> str:
        return " ".join(str(text or "").replace("\n", " ").replace("\x0c", " ").split()).strip()

    def _roman_token(value: str) -> str:
        token = _clean(value).upper().replace(".", "")
        if token in {"IT", "IIT"}:
            return "II"
        if token == "IIIT":
            return "III"
        return token if re.fullmatch(r"[IVX]{1,4}", token) else ""

    def _derive_short(subject_name: str) -> str:
        text = _clean(subject_name).upper()
        mapping = {
            "SOFT SKILL": "SS",
            "APTITUDE & REASONING": "AR",
            "SPORTS AND YOGA": "SY",
            "SPORTS AND YOGA*": "SY",
            "MACHINE LEARNING": "ML",
            "DATA ANALYTICS": "DA",
            "BLOCK ARCHITECTURE & DESIGN": "BL",
            "STARTUP AND ENTERPRENEURIAL ACTIVITY ASSESSMENT": "SEA",
            "STARTUP AND ENTERPRENEURIAL ACTIVITY": "SEA",
            "PROJECT": "PROJECT",
            "MAJOR PROJECT": "PROJECT",
            "PRESENTATION/SEMINAR BASED ON MAJOR PROJECT": "SEMINAR",
        }
        for key, value in mapping.items():
            if key in text:
                return value

        words = re.findall(r"[A-Za-z]+", text)
        words = [w for w in words if w not in {"AND", "OF", "THE", "ON", "WITH", "BASED"}]
        if not words:
            return ""
        acronym = "".join(w[0] for w in words[:5]).upper()
        return acronym if len(acronym) >= 2 else ""

    def _parse_ltp_cell(raw_ltp: str, is_lab: bool) -> tuple[str, int]:
        nums = [int(n) for n in re.findall(r"\d{1,2}", _clean(raw_ltp))]
        if len(nums) >= 3:
            return f"{nums[0]} - {nums[1]} - {nums[2]}", nums[0]
        if len(nums) == 1:
            n = nums[0]
            if is_lab and n <= 2:
                return f"0 - 0 - {n}", n
            return f"{n} - 0 - 0", n
        return ("0 - 0 - 2", 2) if is_lab else ("5 - 0 - 0", 5)

    def _build_label(rows: list[list[str]]) -> str:
        header_lines: list[str] = []
        section = ""
        for row in rows[:8]:
            for cell in row:
                text = _clean(cell)
                if not text:
                    continue
                header_lines.append(text)
                sec_match = re.search(r"\bSection\s*[:\-]?\s*([A-Za-z])\b", text, flags=re.I)
                if sec_match:
                    section = sec_match.group(1).upper()

        blob = " ".join(header_lines)
        sem_line = next(
            (line for line in header_lines if "sem" in line.lower() and "year" in line.lower()),
            "",
        )
        if not sem_line:
            sem_line = blob

        program_match = re.search(r"\b(BCA|MCA)\b", sem_line, flags=re.I) or re.search(
            r"\b(BCA|MCA)\b", blob, flags=re.I
        )
        sem_match = re.search(r"\b([IVX]{1,4}|IT|IIT|IIIT)\s*Sem\b", sem_line, flags=re.I) or re.search(
            r"\b([IVX]{1,4}|IT|IIT|IIIT)\s*Sem\b", blob, flags=re.I
        )
        year_match = re.search(r"\b([IVX]{1,4}|IT|IIT|IIIT)\s*Year\b", sem_line, flags=re.I) or re.search(
            r"\b([IVX]{1,4}|IT|IIT|IIIT)\s*Year\b", blob, flags=re.I
        )

        program = (program_match.group(1).upper() if program_match else "").strip()
        sem = _roman_token(sem_match.group(1) if sem_match else "")
        year = _roman_token(year_match.group(1) if year_match else "")
        has_aktu = "AKTU" in blob.upper()

        if program and sem and year:
            label = f"{program} {sem} Sem , {year} Year"
            if has_aktu:
                label += " (AKTU)"
            if section:
                label += f" Section - {section}"
            return label

        fallback = _clean(sem_line)
        if section and "Section" not in fallback:
            fallback = f"{fallback} Section - {section}"
        return fallback or "Imported Class"

    def _extract_fixed_slots_from_timetable_rows(
        rows: list[list[str]], allowed_shorts: set[str]
    ) -> list[dict[str, Any]]:
        if not rows or not allowed_shorts:
            return []
        sorted_shorts = sorted(
            {_clean(s).upper() for s in allowed_shorts if _clean(s)},
            key=len,
            reverse=True,
        )
        if not sorted_shorts:
            return []

        day_index = {
            "MON": 0,
            "TUE": 1,
            "WED": 2,
            "THU": 3,
            "FRI": 4,
            "SAT": 5,
            "SUN": 6,
        }

        def _cell_to_short(cell_text: str) -> str:
            text = _clean(cell_text).upper()
            if not text:
                return ""
            if "LUNCH" in text or "BREAK" in text:
                return ""
            text = re.sub(r"\([^)]*\)", " ", text)
            text = re.sub(r"[^A-Z0-9/& ]", " ", text)
            text = _clean(text).upper()
            if not text:
                return ""
            for short in sorted_shorts:
                pat = r"(?<![A-Z0-9])" + re.escape(short) + r"(?![A-Z0-9])"
                if re.search(pat, text):
                    return short
            compact = text.replace(" ", "")
            for short in sorted_shorts:
                short_compact = short.replace(" ", "")
                if short_compact and short_compact in compact:
                    return short
            return ""

        header_idx = -1
        for idx, row in enumerate(rows[:12]):
            normalized = [_clean(cell) for cell in row]
            if not normalized:
                continue
            blob = " ".join(normalized).lower()
            if "day" not in blob:
                continue
            period_like = sum(
                1
                for cell in normalized[1:]
                if re.search(r"\bP\s*\d+\b", cell, flags=re.I)
                or re.search(r"\d{1,2}:\d{2}", cell)
                or re.fullmatch(r"\d{1,2}", cell.strip())
                or "lunch" in cell.lower()
            )
            if period_like >= 3:
                header_idx = idx
                break
        if header_idx < 0:
            return []

        header = [_clean(cell) for cell in rows[header_idx]]
        use_numeric_header = sum(
            1 for cell in header[1:] if re.fullmatch(r"\d{1,2}", (cell or "").strip())
        ) >= 3
        col_to_slot: dict[int, int] = {}
        class_slot = 0
        for col in range(1, len(header)):
            h = (header[col] or "").lower()
            if "lunch" in h or "break" in h:
                continue
            if use_numeric_header and not re.fullmatch(r"\d{1,2}", (header[col] or "").strip()):
                continue
            col_to_slot[col] = class_slot
            class_slot += 1
        if not col_to_slot:
            return []

        out: list[dict[str, Any]] = []
        seen: set[tuple[int, int, str]] = set()
        for row in rows[header_idx + 1 :]:
            if not isinstance(row, list) or not row:
                continue
            day_cell = _clean(row[0] if len(row) > 0 else "")
            if not day_cell:
                continue
            day_code = day_cell[:3].upper()
            if day_code not in day_index:
                continue
            day_val = day_index[day_code]
            for col, slot in col_to_slot.items():
                if col >= len(row):
                    continue
                short = _cell_to_short(row[col])
                if not short:
                    continue
                key = (day_val, slot, short)
                if key in seen:
                    continue
                seen.add(key)
                out.append({"day": day_val, "slot": slot, "short": short})
        return out

    def _is_timetable_like_rows(rows: list[list[str]]) -> bool:
        if not rows:
            return False
        for row in rows[:12]:
            normalized = [_clean(cell) for cell in row]
            if not normalized:
                continue
            blob = " ".join(normalized).lower()
            if "day" not in blob:
                continue
            period_like = sum(
                1
                for cell in normalized[1:]
                if re.search(r"\bP\s*\d+\b", cell, flags=re.I)
                or re.search(r"\d{1,2}:\d{2}", cell)
                or re.fullmatch(r"\d{1,2}", cell.strip())
                or "lunch" in cell.lower()
            )
            if period_like >= 3:
                return True
        return False

    def _label_key(text: str) -> str:
        return _clean(text).upper()

    classes: list[dict[str, Any]] = []
    page_payloads: list[dict[str, Any]] = []
    timetable_rows_by_label: dict[str, list[list[list[str]]]] = {}
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables() or []
            if not tables:
                continue

            page_tables_rows: list[list[list[str]]] = []
            for table in tables:
                rows = [[_clean(cell) for cell in row] for row in table if isinstance(row, list)]
                if rows:
                    page_tables_rows.append(rows)
            if not page_tables_rows:
                continue

            label_rows: list[list[str]] = []
            for rows in page_tables_rows:
                label_rows.extend(rows[:3])
            page_label = _build_label(label_rows)
            page_payloads.append({"label": page_label, "tables": page_tables_rows})

            lk = _label_key(page_label)
            for rows in page_tables_rows:
                if not _is_timetable_like_rows(rows):
                    continue
                if lk not in timetable_rows_by_label:
                    timetable_rows_by_label[lk] = []
                timetable_rows_by_label[lk].append(rows)

    for payload in page_payloads:
        page_tables_rows = payload["tables"]
        base_label = payload["label"]

        subject_rows: list[list[str]] | None = None
        header_idx = -1
        for rows in page_tables_rows:
            local_header_idx = -1
            for idx, row in enumerate(rows):
                row_text = " ".join(part for part in row if part).lower()
                if "subject code" in row_text and "subject name" in row_text:
                    local_header_idx = idx
                    break
            if local_header_idx >= 0:
                subject_rows = rows
                header_idx = local_header_idx
                break
        if subject_rows is None or header_idx < 0:
            continue

        label_rows: list[list[str]] = []
        for rows in page_tables_rows:
            label_rows.extend(rows[:3])
        label = _build_label(label_rows or subject_rows or [[base_label]])

        parsed_rows: list[dict[str, Any]] = []
        seen_rows: set[tuple[str, str, str]] = set()
        for row in subject_rows[header_idx + 1 :]:
            merged = " ".join(part for part in row if part)
            merged_low = merged.lower()
            if not merged:
                continue
            if "time table coordinator" in merged_low or "head of the department" in merged_low:
                break
            if merged_low.startswith("mentor"):
                continue
            if any(token in merged_low for token in ["roll no", "principal"]):
                continue

            code = row[0] if len(row) > 0 else ""
            ltp_raw = row[1] if len(row) > 1 else ""
            subject = row[2] if len(row) > 2 else ""
            short = row[4] if len(row) > 4 else ""
            teacher = row[5] if len(row) > 5 else ""

            subject = _clean(subject)
            short = _clean(short).replace("-", " ")
            teacher = _clean(re.sub(r"\((?:lab|roll)[^)]+\)", "", teacher, flags=re.I))
            teacher = re.sub(r"\b([A-Za-z]{3,})\.\s+([A-Za-z])", r"\1 \2", teacher)
            teacher = _clean(teacher)

            if not subject:
                continue
            if subject.upper() in day_tokens:
                continue
            if subject.lower() in {"day", "time", "lunch", "period"}:
                continue
            if re.fullmatch(r"\d{1,2}", subject):
                continue

            if not short:
                short = _derive_short(subject)
            short = _clean(" ".join(short.split())).upper()
            if not short and code:
                short = _derive_short(subject)
            if not short:
                continue

            subject = re.sub(r"\bStructure\(", "Structure (", subject, flags=re.I)
            if re.search(r"\bMathematics\s*-\s*III\b", subject, flags=re.I):
                subject = re.sub(r"\bMathematics\s*-\s*III\b", "Mathematics", subject, flags=re.I)
            if re.search(r"\bComputer\s+Graphics\s*&\s*Multimedia\s+Ap+p?\b", subject, flags=re.I):
                subject = "Computer Graphics & Multimedia"
            if re.search(r"\bPractical\s+Based\s+on\s+Subject\s+Code\b", subject, flags=re.I):
                if "CGMA" in short or "CGMA" in merged.upper():
                    subject = "Practical Based on CGMA"
                else:
                    subject = re.sub(
                        r"\bPractical\s+Based\s+on\s+Subject\s+Code\b(?:\s*[-]?\s*\d+)?",
                        "Practical Based on Subject",
                        subject,
                        flags=re.I,
                    )
            subject = re.sub(
                r"(?<=\w)\s*-\s*(I|II|III|IV|V|VI)\b",
                r" \1",
                subject,
                flags=re.I,
            )
            subject = _clean(subject)

            ltp_nums = [int(n) for n in re.findall(r"\d{1,2}", _clean(ltp_raw))]
            is_lab = (
                "LAB" in short
                or "LAB" in subject.upper()
                or "PRACTICAL BASED" in subject.upper()
            )
            if is_lab and "LAB" not in short and short != "AWS":
                short = f"{short} LAB"
            if (
                short == "AWS"
                and len(ltp_nums) >= 3
                and ltp_nums[0] == 0
                and ltp_nums[1] == 0
                and ltp_nums[2] >= 2
            ):
                is_lab = True
                short = "AWS LAB"

            if not teacher:
                if "COMMON LECTURE" in merged.upper():
                    teacher = "Common Lecture"
                else:
                    teacher = "Not Mentioned"

            ltp_value, credit = _parse_ltp_cell(ltp_raw, is_lab=is_lab)
            key = (short, subject.lower(), teacher.lower())
            if key in seen_rows:
                continue
            seen_rows.add(key)
            parsed_rows.append(
                {
                    "short": short,
                    "subject": subject,
                    "teacher": teacher,
                    "ltp": ltp_value,
                    "credit": credit,
                    "is_lab": is_lab,
                }
            )

        if not parsed_rows:
            continue

        mains_rows = [r for r in parsed_rows if not r["is_lab"] and r["credit"] > 2]
        labs_rows = [r for r in parsed_rows if r["is_lab"]]
        fillers_rows = [r for r in parsed_rows if not r["is_lab"] and r["credit"] <= 2]
        ordered = mains_rows + labs_rows + fillers_rows

        mains: list[str] = []
        fillers: list[str] = []
        mains_seen: set[str] = set()
        fillers_seen: set[str] = set()
        ltp_map: dict[str, Any] = {}
        subjects: list[str] = []
        teacher_for_short: dict[str, str] = {}

        for row in ordered:
            short = row["short"]
            subject = row["subject"]
            teacher = row["teacher"]
            subjects.append(f"{short} - {subject} - {teacher}")
            if short not in ltp_map:
                ltp_map[short] = {"ltp": row["ltp"], "subjectKey": subject.lower()}
            if short not in teacher_for_short:
                teacher_for_short[short] = teacher
            if not row["is_lab"] and row["credit"] > 2 and short not in mains_seen:
                mains_seen.add(short)
                mains.append(short)
            if not row["is_lab"] and row["credit"] <= 2 and short not in fillers_seen:
                fillers_seen.add(short)
                fillers.append(short)

        btech_shorts = {
            row["short"]
            for row in ordered
            if re.search(r"\bb\.?\s*tech\b", str(row.get("teacher", "")), flags=re.I)
        }
        fixed_slots: list[dict[str, Any]] = []
        if btech_shorts:
            raw_slots: list[dict[str, Any]] = []
            lk = _label_key(label)
            candidate_tables: list[list[list[str]]] = []
            seen_table_ids: set[int] = set()
            for table_rows in page_tables_rows + timetable_rows_by_label.get(lk, []):
                tid = id(table_rows)
                if tid in seen_table_ids:
                    continue
                seen_table_ids.add(tid)
                candidate_tables.append(table_rows)
            for table_rows in candidate_tables:
                raw_slots.extend(
                    _extract_fixed_slots_from_timetable_rows(table_rows, btech_shorts)
                )
            seen_fixed: set[tuple[int, int, str]] = set()
            for slot in raw_slots:
                day = int(slot.get("day", -1))
                col = int(slot.get("slot", -1))
                short = _clean(slot.get("short", "")).upper()
                if day < 0 or col < 0 or not short:
                    continue
                key = (day, col, short)
                if key in seen_fixed:
                    continue
                seen_fixed.add(key)
                fixed_slots.append(
                    {
                        "day": day,
                        "slot": col,
                        "short": short,
                        "teacher": teacher_for_short.get(short, ""),
                    }
                )

        classes.append(
            {
                "label": label,
                "subjects": subjects,
                "mains": mains,
                "fillers": fillers,
                "ltpByShort": ltp_map,
                "fixedSlots": fixed_slots,
            }
        )

    return classes


def _build_process_classes(lines: list[str] | list[list[str]]) -> list[dict[str, Any]]:
    def _clean(text: str) -> str:
        return " ".join(str(text or "").replace("\x0c", " ").split()).strip()

    def _to_pages(payload: list[str] | list[list[str]]) -> list[list[str]]:
        if not payload:
            return []
        if isinstance(payload[0], list):
            pages = []
            for page in payload:
                page_lines = [_clean(line) for line in page if _clean(line)]
                if page_lines:
                    pages.append(page_lines)
            return pages
        flat = [_clean(line) for line in payload if _clean(line)]
        if not flat:
            return []
        pages: list[list[str]] = []
        current: list[str] = []
        for line in flat:
            if _is_class_header_line(line) and current:
                pages.append(current)
                current = [line]
                continue
            current.append(line)
        if current:
            pages.append(current)
        return pages

    def _normalize_roman(token: str) -> str:
        t = _clean(token).upper().replace(".", "")
        mapping = {
            "IT": "II",
            "IIT": "II",
            "IIIT": "III",
            "IVT": "IV",
            "VIT": "VI",
        }
        if t in mapping:
            return mapping[t]
        if re.fullmatch(r"[IVX]{1,4}", t):
            return t
        if t == "I":
            return "I"
        return ""

    def _is_class_header_line(text: str) -> bool:
        low = _clean(text).lower()
        if not low:
            return False
        if "sem" not in low or "year" not in low:
            return False
        if "time table" in low:
            return False
        if "even semester" in low or "odd semester" in low:
            return False
        return True

    def _extract_section(lines_top: list[str]) -> str:
        for line in lines_top:
            m = re.search(r"\bsection\s*[:\-]?\s*([A-Za-z])\b", line, flags=re.I)
            if m:
                return m.group(1).upper()
        return ""

    def _build_class_label(page_lines: list[str]) -> str:
        top = page_lines[:18]
        section = _extract_section(top)
        top_blob = " ".join(top)
        title_candidates = [line for line in top if _is_class_header_line(line)]
        title = title_candidates[0] if title_candidates else top_blob

        program_match = re.search(r"\b(BCA|MCA)\b", title, flags=re.I) or re.search(
            r"\b(BCA|MCA)\b", top_blob, flags=re.I
        )
        sem_match = re.search(r"\b([IVX]{1,4}|IT|IIT|IIIT)\s*Sem\b", title, flags=re.I)
        if not sem_match:
            sem_match = re.search(r"\b([IVX]{1,4}|IT|IIT|IIIT)\s*Sem\b", top_blob, flags=re.I)
        year_match = re.search(r"\b([IVX]{1,4}|IT|IIT|IIIT|I)\s*Year\b", title, flags=re.I)
        if not year_match:
            year_match = re.search(r"\b([IVX]{1,4}|IT|IIT|IIIT|I)\s*Year\b", top_blob, flags=re.I)

        program = (program_match.group(1).upper() if program_match else "").strip()
        sem = _normalize_roman(sem_match.group(1) if sem_match else "")
        year = _normalize_roman(year_match.group(1) if year_match else "")
        has_aktu = "AKTU" in top_blob.upper()

        if program and sem and year:
            label = f"{program} {sem} Sem , {year} Year"
            if has_aktu:
                label += " (AKTU)"
            if section:
                label += f" Section - {section}"
            return label

        fallback = _clean(title)
        fallback = re.sub(r"\bTIME\s*TABLE\b.*$", "", fallback, flags=re.I)
        fallback = re.sub(r"\bEVEN\s+SEMESTER\b.*$", "", fallback, flags=re.I)
        fallback = re.sub(r"\bROOM\s*NO\.?\b.*$", "", fallback, flags=re.I)
        fallback = re.sub(r"\s+", " ", fallback).strip(" -,:")
        if section and "Section" not in fallback:
            fallback = f"{fallback} Section - {section}".strip()
        return fallback or "Imported Class"

    def _is_subject_header(text: str) -> bool:
        low = _clean(text).lower()
        return "subject code" in low and (
            "subject name" in low or "short form" in low or "teacher" in low
        )

    def _is_subject_row_terminator(text: str) -> bool:
        low = _clean(text).lower()
        if low.startswith("(") and ("/" in low or "prof" in low):
            return True
        return (
            "time table coordinator" in low
            or "head of the department" in low
            or "principal" in low
            or "mentor" in low
        )

    def _is_table_noise(text: str) -> bool:
        low = _clean(text).lower()
        if not low:
            return True
        if _TIME_RE.search(low):
            return True
        if low in {"lunch", "time", "day", "period"}:
            return True
        if low.split()[0].upper() in _DAY_TOKENS:
            return True
        if "subject code" in low or "short form" in low or "subject name" in low:
            return True
        if "name of subject teacher" in low or "coordinator" in low:
            return True
        if "even semester" in low or "room no" in low:
            return True
        return False

    def _extract_subject_table_lines(page_lines: list[str]) -> list[str]:
        in_table = False
        out: list[str] = []
        for line in page_lines:
            if not in_table:
                if _is_subject_header(line):
                    in_table = True
                continue
            if _is_subject_row_terminator(line):
                break
            if _is_class_header_line(line):
                break
            if _clean(line):
                out.append(_clean(line))
        return out

    def _is_code_row_start(text: str) -> bool:
        line = _clean(text)
        if not line:
            return False
        return bool(
            re.match(
                r"^(?:VAC|[A-Z]{2,}\s*-?\s*\d{2,}[A-Z]*|[A-Z]{2,}\b(?=\s+\d)|\d{1,2})\b",
                line,
                flags=re.I,
            )
        )

    def _collect_row_blocks(table_lines: list[str]) -> list[str]:
        code_token_re = re.compile(r"(?:VAC|[A-Z]{2,}\s*-?\s*\d{2,}[A-Z]*)\b", flags=re.I)

        def _split_by_subject_code(line: str) -> list[str]:
            text = _clean(line)
            if not text:
                return []
            matches = list(code_token_re.finditer(text))
            if len(matches) <= 1:
                return [text]
            out: list[str] = []
            for idx, match in enumerate(matches):
                start = match.start()
                end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
                segment = _clean(text[start:end])
                if segment:
                    out.append(segment)
            prefix = _clean(text[: matches[0].start()])
            if prefix and out:
                out[0] = _clean(f"{prefix} {out[0]}")
            return out or [text]

        rows: list[str] = []
        pending_prefix: list[str] = []
        current_parts: list[str] = []
        teacher_token_re = re.compile(
            r"\b(?:Prof\.\(Dr\.\)|Prof(?:essor)?\.?|Dr\.?|Mr\.?|Ms\.?|Mrs\.?|Miss\.?)\b",
            flags=re.I,
        )

        for raw_line in table_lines:
            for line in _split_by_subject_code(raw_line):
                if _is_table_noise(line):
                    continue

                if _is_code_row_start(line):
                    if current_parts:
                        rows.append(_clean(" ".join(current_parts)))
                        current_parts = []
                    prefix = _clean(" ".join(pending_prefix))
                    pending_prefix = []
                    if prefix:
                        current_parts = [prefix, line]
                    else:
                        current_parts = [line]
                    continue

                if current_parts:
                    current_text = _clean(" ".join(current_parts))
                    if (
                        teacher_token_re.search(current_text)
                        and not re.match(
                            r"^(?:,|and\b|Mr\.?|Ms\.?|Mrs\.?|Dr\.?|Prof\.?)",
                            line,
                            flags=re.I,
                        )
                    ):
                        rows.append(current_text)
                        current_parts = []
                        pending_prefix = [line]
                        continue
                    current_parts.append(line)
                else:
                    pending_prefix.append(line)

        if current_parts:
            rows.append(_clean(" ".join(current_parts)))
        return [row for row in rows if row]

    def _normalize_short_candidate(text: str) -> str:
        raw = _clean(text).replace("/", " ").replace("-", " ")
        if not raw:
            return ""
        tokens = [re.sub(r"[^A-Z0-9]", "", tok.upper()) for tok in raw.split()]
        tokens = [tok for tok in tokens if tok]
        if not tokens:
            return ""

        if len(tokens) == 1 and tokens[0].endswith("LAB") and len(tokens[0]) > 3:
            tokens = [tokens[0][:-3], "LAB"]
        elif len(tokens) == 1 and tokens[0] == "CTDSA":
            tokens = ["CT", "DSA"]
        dedup_tokens: list[str] = []
        for tok in tokens:
            if not dedup_tokens or dedup_tokens[-1] != tok:
                dedup_tokens.append(tok)
        tokens = dedup_tokens

        return _clean(" ".join(tokens))

    def _is_short_phrase(text: str) -> bool:
        short = _normalize_short_candidate(text)
        if not short:
            return False
        parts = short.split()
        blocklist = {
            "SUBJECT",
            "CODE",
            "NAME",
            "TEACHER",
            "ROOM",
            "TIME",
            "DAY",
            "LUNCH",
            "EVEN",
            "SEMESTER",
            "WITH",
            "AND",
            "FOR",
            "BASED",
            "PRACTICAL",
            "COMPUTER",
            "SYSTEM",
            "DESIGN",
            "ANALYSIS",
            "NETWORK",
            "SECURITY",
            "MATHEMATICAL",
            "FOUNDATION",
            "TECHNOLOGY",
            "STRUCTURE",
            "OPERATING",
            "DATA",
            "USING",
            "SOFT",
            "SKILL",
            "APTITUDE",
            "REASONING",
            "ACTIVITY",
            "ASSESSMENT",
            "ENTREPRENEURIAL",
        }
        if any(part in blocklist for part in parts):
            return False
        if len(parts) > 3:
            return False
        for part in parts:
            if part.isdigit():
                return False
            if len(part) > 9 and part not in {"PROJECT", "SEMINAR", "MATHS"}:
                return False
            if len(part) < 2 and part != "C":
                return False
        if len(parts) == 1 and parts[0] == "LAB":
            return False
        return True

    def _is_short_piece(token: str) -> bool:
        part = _normalize_short_candidate(token)
        if not part:
            return False
        if not _is_short_phrase(part):
            return False
        if " " in part:
            return False
        if part in {"PROJECT", "SEMINAR", "MATHS", "OOPS", "MFCS", "CGMA", "ITCS", "ISAD", "DBMS", "JAVA", "AWS"}:
            return True
        return 2 <= len(part) <= 5

    def _looks_like_plain_name(text: str) -> bool:
        value = _clean(text)
        if not value or value.upper() == value:
            return False
        parts = [p for p in re.split(r"\s+", value) if p]
        if len(parts) < 2:
            return False
        for part in parts:
            token = re.sub(r"[^A-Za-z.']", "", part)
            if not token:
                return False
            if not token[0].isalpha():
                return False
            if token[0].lower() == token[0]:
                return False
        return True

    def _extract_teacher_and_head(text: str) -> tuple[str, str]:
        line = _clean(text)
        if not line:
            return "", "Not Mentioned"

        nm = re.search(r"\bnot\s*mentioned\b", line, flags=re.I)
        if nm:
            head = _clean(line[: nm.start()] + " " + line[nm.end() :])
            return head, "Not Mentioned"

        title_match = re.search(
            r"\b(?:Prof\.\(Dr\.\)|Prof(?:essor)?\.?|Dr\.?|Mr\.?|Ms\.?|Mrs\.?|Miss\.?)\b",
            line,
            flags=re.I,
        )
        if title_match:
            head = _clean(line[: title_match.start()])
            teacher = _clean(line[title_match.start() :])
            return head, teacher or "Not Mentioned"

        tokens = line.split()
        for take in (5, 4, 3, 2):
            if len(tokens) <= take:
                continue
            tail = " ".join(tokens[-take:])
            if _looks_like_plain_name(tail):
                head = _clean(" ".join(tokens[:-take]))
                return head, _clean(tail)
        return line, "Not Mentioned"

    def _derive_short(subject: str) -> str:
        text = _clean(subject).upper()
        if not text:
            return ""
        if "SOFT SKILL" in text:
            return "SS"
        if "APTITUDE" in text and "REASON" in text:
            return "AR"
        if "SPORTS" in text and "YOGA" in text:
            return "SY"
        if "MACHINE LEARNING" in text:
            return "ML"
        if "DATA ANALYTICS" in text:
            return "DA"
        if "BLOCK ARCHITECTURE" in text:
            return "BL"
        if "STARTUP" in text and "ENTREPRENEURIAL" in text:
            return "SEA"
        if "MAJOR PROJECT" in text:
            return "PROJECT"
        if "SEMINAR" in text:
            return "SEMINAR"
        if "CODE TANTRA" in text and "LAB" in text:
            return "CT LAB"
        if "AWS" in text:
            return "AWS"

        words = re.findall(r"[A-Za-z]+", text)
        words = [w for w in words if w not in {"AND", "OF", "THE", "ON", "WITH", "BASED", "CODE"}]
        if not words:
            return ""
        if words[-1] == "ASSESSMENT" and len(words) >= 2:
            words = words[:-1]
        acronym = "".join(word[0] for word in words[:5])
        return acronym[:8] if len(acronym) >= 2 else ""

    def _normalize_subject_name(subject: str) -> str:
        out = _clean(subject)
        out = re.sub(r"([a-z])([A-Z])", r"\1 \2", out)
        out = re.sub(r"[{}\[\]]", " ", out)
        out = re.sub(r"^\-+\s*", "", out)
        out = re.sub(r"\b\d{1,2}\s+\d{1,2}\s+\d{1,2}\b", " ", out)
        out = re.sub(r"\b\d{1,2}(?=\s+[A-Za-z])", " ", out)
        # OCR noise: subject lines may include leaked 3/4-digit code fragments (e.g., 410, 420).
        out = re.sub(r"\b\d{3,4}(?=\s+[A-Za-z])", " ", out)
        out = re.sub(r"\b(?:AP|APP)\s*$", "", out, flags=re.I)
        out = re.sub(r"\s+", " ", out)
        return out.strip(" -,:")

    def _extract_short_and_subject(head: str) -> tuple[str, str]:
        text = _normalize_subject_name(head)
        if not text:
            return "", ""
        tokens = text.split()
        for idx in range(len(tokens) - 1, -1, -1):
            token = tokens[idx]
            if token == token.lower():
                continue
            normalized = _normalize_short_candidate(token)
            if normalized == "LAB":
                if idx > 0:
                    prev = _normalize_short_candidate(tokens[idx - 1])
                    if _is_short_piece(prev):
                        short = _normalize_short_candidate(f"{prev} LAB")
                        subject_tokens = tokens[: idx - 1]
                        subject = _normalize_subject_name(" ".join(subject_tokens))
                        if subject:
                            return short, subject
                continue
            if not _is_short_piece(normalized):
                continue
            short = normalized
            if idx + 1 < len(tokens):
                next_part = _normalize_short_candidate(tokens[idx + 1])
                if next_part == "LAB":
                    short = _normalize_short_candidate(f"{short} LAB")
            subject_tokens = tokens[:idx]
            subject = _normalize_subject_name(" ".join(subject_tokens))
            if subject:
                return short, subject
        return "", text

    def _parse_ltp_prefix(text: str) -> tuple[list[int], str]:
        tokens = _clean(text).split()
        nums: list[int] = []
        idx = 0
        while idx < len(tokens) and re.fullmatch(r"\d{1,2}", tokens[idx]) and len(nums) < 3:
            nums.append(int(tokens[idx]))
            idx += 1
        return nums, _clean(" ".join(tokens[idx:]))

    def _compose_ltp(nums: list[int], is_lab: bool, credit: int) -> str:
        if len(nums) >= 3:
            return f"{nums[0]} - {nums[1]} - {nums[2]}"
        if nums:
            return f"{nums[0]} - 0 - 0"
        if is_lab:
            return "0 - 0 - 2"
        return f"{credit} - 0 - 0"

    def _default_credit(short: str, subject: str, is_lab: bool) -> int:
        if is_lab:
            return 2
        key = _clean(subject).upper()
        short_u = _normalize_short_candidate(short).upper()
        if short_u in {"SS", "AR", "SY", "AWS"}:
            return 2
        if "SOFT SKILL" in key or "APTITUDE" in key or "SPORTS" in key:
            return 2
        if "PROJECT" in key or "SEMINAR" in key:
            return 2
        return 5

    def _parse_subject_row(row_text: str) -> dict[str, Any] | None:
        line = _clean(row_text).replace("|", " ")
        if not line:
            return None

        code_match = re.match(r"^(VAC|[A-Z]{2,}\s*-?\s*\d{2,}[A-Z]*)\b\s*(.*)$", line, flags=re.I)
        if code_match:
            line = _clean(code_match.group(2))
        else:
            line = _clean(
                re.sub(r"\b(VAC|[A-Z]{2,}\s*-?\s*\d{2,}[A-Z]*)\b", "", line, count=1, flags=re.I)
            )
        line = re.sub(r"^-\s*", "", line)
        if not line:
            return None

        nums, body = _parse_ltp_prefix(line)
        if not body:
            return None

        head, teacher = _extract_teacher_and_head(body)
        if teacher == "Not Mentioned":
            words = head.split()
            for idx in range(1, len(words) - 1):
                candidate = _normalize_short_candidate(words[idx])
                if not _is_short_piece(candidate):
                    continue
                left = _normalize_subject_name(" ".join(words[:idx]))
                right = _clean(" ".join(words[idx + 1 :]))
                if not left or not right:
                    continue
                if "COMMON LECTURE" in right.upper() or "NOT MENTIONED" in right.upper():
                    head = left
                    teacher = right
                    break
        short, subject = _extract_short_and_subject(head)
        if not short:
            short = _derive_short(subject)
        short = _normalize_short_candidate(short)
        subject = _normalize_subject_name(subject)
        if re.fullmatch(r"\d{1,4}", subject):
            # OCR sometimes leaks lab row identifiers (e.g., "002") as subject names.
            # Keep the row only for labs and replace with a stable subject label.
            if "LAB" in short.upper():
                subject = short
            else:
                return None
        if not short or not subject:
            return None

        is_lab = "LAB" in short.upper() or "LAB" in subject.upper()
        if is_lab and not short.endswith("LAB") and short != "AWS":
            short = _normalize_short_candidate(f"{short} LAB")

        credit = nums[0] if nums else _default_credit(short, subject, is_lab)
        ltp = _compose_ltp(nums, is_lab, credit)
        teacher = _clean(re.sub(r"\((?:lab|roll)[^)]+\)", "", teacher, flags=re.I))
        teacher = teacher or "Not Mentioned"

        return {
            "short": short,
            "subject": subject,
            "teacher": teacher,
            "credit": credit,
            "is_lab": is_lab,
            "ltp": ltp,
            "line": f"{short} - {subject} - {teacher}",
        }

    def _parse_vertical_rows(table_lines: list[str]) -> list[dict[str, Any]]:
        parsed: list[dict[str, Any]] = []
        cleaned = [_clean(line) for line in table_lines if _clean(line) and not _is_table_noise(line)]
        i = 0
        while i + 3 < len(cleaned):
            full_name = _normalize_subject_name(cleaned[i])
            short = _normalize_short_candidate(cleaned[i + 1])
            teacher = _clean(cleaned[i + 2])
            credit_txt = _clean(cleaned[i + 3])
            if (
                full_name
                and _is_short_phrase(short)
                and teacher
                and re.fullmatch(r"\d{1,2}", credit_txt)
            ):
                credit = int(credit_txt)
                is_lab = "LAB" in short.upper() or "LAB" in full_name.upper()
                teacher_out = teacher if re.search(r"[A-Za-z]", teacher) else "Not Mentioned"
                parsed.append(
                    {
                        "short": short,
                        "subject": full_name,
                        "teacher": teacher_out,
                        "credit": credit,
                        "is_lab": is_lab,
                        "ltp": _compose_ltp([credit], is_lab, credit),
                        "line": f"{short} - {full_name} - {teacher_out}",
                    }
                )
                i += 4
                continue
            i += 1
        return parsed

    pages = _to_pages(lines)
    classes: list[dict[str, Any]] = []

    for page_lines in pages:
        label = _build_class_label(page_lines)
        table_lines = _extract_subject_table_lines(page_lines)
        if not table_lines:
            continue

        row_blocks = _collect_row_blocks(table_lines)
        parsed_rows = [_parse_subject_row(row) for row in row_blocks]
        parsed_rows = [row for row in parsed_rows if row]
        if len(parsed_rows) < 3:
            vertical_rows = _parse_vertical_rows(table_lines)
            if len(vertical_rows) > len(parsed_rows):
                parsed_rows = vertical_rows

        unique_rows: list[dict[str, Any]] = []
        seen = set()
        for row in parsed_rows:
            key = (row["short"], row["subject"].lower(), row["teacher"].lower())
            if key in seen:
                continue
            seen.add(key)
            unique_rows.append(row)

        if not unique_rows:
            continue

        mains_rows = [r for r in unique_rows if not r["is_lab"] and r["credit"] > 2]
        labs_rows = [r for r in unique_rows if r["is_lab"]]
        fillers_rows = [r for r in unique_rows if not r["is_lab"] and r["credit"] <= 2]
        ordered_rows = mains_rows + labs_rows + fillers_rows

        mains: list[str] = []
        fillers: list[str] = []
        mains_seen: set[str] = set()
        fillers_seen: set[str] = set()
        ltp_map: dict[str, Any] = {}
        for row in ordered_rows:
            short = row["short"]
            if row["ltp"] and short not in ltp_map:
                ltp_map[short] = {
                    "ltp": row["ltp"],
                    "subjectKey": row["subject"].lower(),
                }
            if not row["is_lab"] and row["credit"] > 2 and short not in mains_seen:
                mains_seen.add(short)
                mains.append(short)
            if not row["is_lab"] and row["credit"] <= 2 and short not in fillers_seen:
                fillers_seen.add(short)
                fillers.append(short)

        classes.append(
            {
                "label": label,
                "subjects": [r["line"] for r in ordered_rows],
                "mains": mains,
                "fillers": fillers,
                "ltpByShort": ltp_map,
            }
        )

    return classes


def _extract_process_settings(lines: list[str] | list[list[str]]) -> dict[str, Any]:
    def _clean(text: str) -> str:
        return " ".join(str(text or "").replace("\x0c", " ").split()).strip()

    def _to_pages(payload: list[str] | list[list[str]]) -> list[list[str]]:
        if not payload:
            return []
        if isinstance(payload[0], list):
            return [[_clean(line) for line in page if _clean(line)] for page in payload]
        return [[_clean(line) for line in payload if _clean(line)]]

    def _to_minutes(hhmm: str) -> int | None:
        m = re.match(r"^(\d{1,2}):(\d{2})$", hhmm)
        if not m:
            return None
        hh = int(m.group(1))
        mm = int(m.group(2))
        if hh < 0 or hh > 23 or mm < 0 or mm > 59:
            return None
        return hh * 60 + mm

    def _format_hhmm(hhmm: str) -> str:
        m = re.match(r"^(\d{1,2}):(\d{2})$", _clean(hhmm))
        if not m:
            return "09:00"
        hh = int(m.group(1))
        mm = int(m.group(2))
        if hh < 0 or hh > 23 or mm < 0 or mm > 59:
            return "09:00"
        return f"{hh:02d}:{mm:02d}"

    pages = _to_pages(lines)
    all_day_codes = set()
    first_ranges: list[tuple[str, str]] = []
    slots_guess = 0
    lab_markers: set[int] = set()

    for page_lines in pages:
        for line in page_lines:
            m = re.match(r"^\s*(MON|TUE|WED|THU|FRI|SAT|SUN)\b", line, flags=re.I)
            if m:
                all_day_codes.add(m.group(1).upper())
            for m_lab in re.finditer(r"\bLAB[\s\-]*([0-9]+(?:\s*,\s*[0-9]+)*)\b", line, flags=re.I):
                raw = m_lab.group(1)
                for piece in re.split(r"\s*,\s*", raw):
                    if piece.isdigit():
                        val = int(piece)
                        if 1 <= val <= 50:
                            lab_markers.add(val)
        for line in page_lines[:30]:
            if slots_guess == 0 and re.search(r"\bday\b", line, flags=re.I):
                nums = [int(n) for n in re.findall(r"\b\d{1,2}\b", line)]
                if nums:
                    slots_guess = max(slots_guess, max(nums))
            ranges = re.findall(r"\b(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\b", line)
            if ranges and not first_ranges:
                first_ranges = ranges
        if first_ranges:
            break

    start_time = _format_hhmm(first_ranges[0][0] if first_ranges else "09:00")
    duration = 50
    if first_ranges:
        first_start = _to_minutes(first_ranges[0][0])
        first_end = _to_minutes(first_ranges[0][1])
        if first_start is not None and first_end is not None and first_end > first_start:
            duration = max(30, min(90, first_end - first_start))

    lunch_period = 4
    lunch_duration = 40
    if slots_guess > 0 and len(first_ranges) == slots_guess + 1:
        range_durations: list[int] = []
        for st, en in first_ranges:
            start_m = _to_minutes(st)
            end_m = _to_minutes(en)
            if start_m is None or end_m is None:
                range_durations.append(-1)
                continue
            if end_m <= start_m:
                end_m += 12 * 60
            range_durations.append(end_m - start_m)
        candidate_idx = -1
        candidate_duration = -1
        for idx, dur in enumerate(range_durations):
            if not (20 <= dur <= 120):
                continue
            if candidate_idx == -1 or dur < candidate_duration:
                candidate_idx = idx
                candidate_duration = dur
        if 0 < candidate_idx < len(first_ranges) - 1:
            lunch_period = candidate_idx
            lunch_duration = candidate_duration
    if len(first_ranges) >= 2:
        max_gap = -1
        max_gap_index = -1
        for i in range(len(first_ranges) - 1):
            end_cur = _to_minutes(first_ranges[i][1])
            start_next = _to_minutes(first_ranges[i + 1][0])
            if end_cur is None or start_next is None:
                continue
            if start_next <= end_cur:
                start_next += 12 * 60
            gap = start_next - end_cur
            if gap > max_gap:
                max_gap = gap
                max_gap_index = i
        if 20 <= max_gap <= 120 and max_gap_index >= 0 and lunch_period == 4 and lunch_duration == 40:
            lunch_duration = max_gap
            lunch_period = max_gap_index + 1

    slots = slots_guess if slots_guess > 0 else 8
    days = 6 if "SAT" in all_day_codes else 5
    lab_count = max(lab_markers) if lab_markers else None
    return {
        "startTime": start_time,
        "slots": slots,
        "days": days,
        "duration": duration,
        "lunchPeriod": lunch_period,
        "lunchDuration": lunch_duration,
        "labCount": lab_count,
    }


def _extract_process_settings_from_pdf_tables(pdf_bytes: bytes) -> dict[str, Any]:
    if pdfplumber is None:
        return {}

    def _clean(text: str) -> str:
        return " ".join(str(text or "").replace("\n", " ").replace("\x0c", " ").split()).strip()

    def _to_minutes(hhmm: str) -> int | None:
        m = re.match(r"^(\d{1,2}):(\d{2})$", hhmm)
        if not m:
            return None
        hh = int(m.group(1))
        mm = int(m.group(2))
        if hh < 0 or hh > 23 or mm < 0 or mm > 59:
            return None
        return hh * 60 + mm

    def _extract_range(cell_text: str) -> tuple[str, str] | None:
        text = _clean(cell_text)
        m = re.search(r"(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})", text)
        if not m:
            return None
        return m.group(1), m.group(2)

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables() or []
            for table in tables:
                rows = [[_clean(cell) for cell in row] for row in table if isinstance(row, list)]
                if not rows:
                    continue

                time_idx = -1
                day_idx = -1
                for idx, row in enumerate(rows):
                    first = _clean(row[0] if len(row) > 0 else "").lower()
                    if time_idx < 0 and first == "time":
                        time_idx = idx
                    if day_idx < 0 and first == "day":
                        day_idx = idx
                    if time_idx >= 0 and day_idx >= 0:
                        break
                if time_idx < 0 or day_idx < 0:
                    continue
                if day_idx <= time_idx:
                    continue

                time_row = rows[time_idx]
                day_row = rows[day_idx]
                width = max(len(time_row), len(day_row))
                if width <= 2:
                    continue

                ranges: dict[int, tuple[str, str]] = {}
                for col in range(1, width):
                    cell = time_row[col] if col < len(time_row) else ""
                    rng = _extract_range(cell)
                    if rng:
                        ranges[col] = rng
                if len(ranges) < 4:
                    continue

                class_cols: list[int] = []
                lunch_col = None
                for col in range(1, width):
                    marker = _clean(day_row[col] if col < len(day_row) else "")
                    if marker and re.fullmatch(r"\d{1,2}", marker):
                        class_cols.append(col)
                        continue
                    if marker and re.search(r"lunch|break", marker, flags=re.I):
                        lunch_col = col
                        continue
                    if marker == "" and col in ranges:
                        if lunch_col is None:
                            lunch_col = col
                if len(class_cols) < 4:
                    continue

                first_col = class_cols[0]
                first_range = ranges.get(first_col)
                if not first_range:
                    continue
                start_m = _to_minutes(first_range[0])
                end_m = _to_minutes(first_range[1])
                if start_m is None or end_m is None:
                    continue
                if end_m <= start_m:
                    end_m += 12 * 60
                duration = max(30, min(90, end_m - start_m))
                start_time = f"{(start_m // 60) % 24:02d}:{start_m % 60:02d}"

                lunch_period = 4
                lunch_duration = 40
                if lunch_col is not None and lunch_col in ranges:
                    lunch_start, lunch_end = ranges[lunch_col]
                    ls = _to_minutes(lunch_start)
                    le = _to_minutes(lunch_end)
                    if ls is not None and le is not None:
                        if le <= ls:
                            le += 12 * 60
                        lunch_duration = max(20, min(180, le - ls))
                    lunch_period = sum(1 for c in class_cols if c < lunch_col)
                    if lunch_period <= 0:
                        lunch_period = 4
                slots = len(class_cols)

                day_tokens = {"MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"}
                days_seen = set()
                for row in rows[day_idx + 1 :]:
                    first = _clean(row[0] if len(row) > 0 else "")
                    if not first:
                        continue
                    code = first[:3].upper()
                    if code in day_tokens:
                        days_seen.add(code)
                days = len(days_seen) if days_seen else 5

                return {
                    "startTime": start_time,
                    "slots": slots,
                    "days": max(1, min(7, days)),
                    "duration": duration,
                    "lunchPeriod": max(1, min(max(1, slots - 1), lunch_period)),
                    "lunchDuration": lunch_duration,
                }
    return {}


def _build_settings_diagnostics(
    line_settings: dict[str, Any], table_settings: dict[str, Any]
) -> dict[str, Any]:
    line_settings = line_settings or {}
    table_settings = table_settings or {}
    fields = [
        "startTime",
        "slots",
        "days",
        "duration",
        "lunchPeriod",
        "lunchDuration",
        "labCount",
    ]
    numeric_fields = {
        "slots",
        "days",
        "duration",
        "lunchPeriod",
        "lunchDuration",
        "labCount",
    }

    def _norm_value(field: str, value: Any) -> Any:
        if value is None or value == "":
            return None
        if field in numeric_fields:
            try:
                return int(float(value))
            except Exception:
                return None
        if field == "startTime":
            m = re.match(r"^(\d{1,2}):(\d{2})$", str(value).strip())
            if not m:
                return None
            hh = int(m.group(1))
            mm = int(m.group(2))
            if hh < 0 or hh > 23 or mm < 0 or mm > 59:
                return None
            return f"{hh:02d}:{mm:02d}"
        return str(value).strip()

    conflicts: list[dict[str, Any]] = []
    compared = 0
    for field in fields:
        lv = _norm_value(field, line_settings.get(field))
        tv = _norm_value(field, table_settings.get(field))
        if lv is None or tv is None:
            continue
        compared += 1
        if lv != tv:
            conflicts.append({"field": field, "line": lv, "table": tv})

    confidence = "high"
    if conflicts:
        confidence = "low" if len(conflicts) >= 2 else "medium"
    elif compared <= 2:
        confidence = "medium"

    return {
        "source": "table" if table_settings else "lines",
        "lineSettings": line_settings,
        "tableSettings": table_settings,
        "conflicts": conflicts,
        "comparedCount": compared,
        "needsReview": bool(conflicts),
        "confidence": confidence,
    }


def _estimate_min_expected_classes(page_count: int) -> int:
    """
    Heuristic threshold for OCR-only imports:
    scanned timetable PDFs usually carry at least one class on most pages.
    """
    if page_count <= 0:
        return 0
    if page_count >= 16:
        return max(8, round(page_count * 0.65))
    if page_count >= 10:
        return max(6, round(page_count * 0.60))
    return max(3, round(page_count * 0.50))


def _should_retry_ocr_for_class_recovery(class_count: int, page_count: int) -> bool:
    if class_count <= 0:
        return True
    min_expected = _estimate_min_expected_classes(page_count)
    if min_expected <= 0:
        return False
    return class_count < min_expected
