// src/frontend/src/i18n/dateFormat.ts
//
// One shared language -> locale mapping for every date/time rendered on the
// clinic screens (ADR-0029, BA sign-off R-2). Colocated with `i18n/index.ts`,
// mirroring the existing `utils/errorMessage.ts` pattern: a small, pure,
// colocated helper rather than a new folder.
//
// No screen may call `toLocaleDateString` / `toLocaleString` with a hardcoded
// or absent locale after this lands — every date goes through one of the
// three exports below instead.
import type { Language } from '../store/uiStore'

/**
 * Language -> BCP 47 locale. `th` explicitly requests the Gregorian calendar
 * (`-u-ca-gregory`): a bare `'th-TH'` locale defaults to ICU's Buddhist
 * calendar, which would render a Buddhist-Era year (e.g. พ.ศ. 2569) next to
 * native `<input type="date">` pickers on the same screens that show the
 * Gregorian year — a 543-year misreading hazard this ADR exists to prevent.
 * `en` maps to `en-GB` so every language is day-first (ADR-0029 decision 3).
 */
const LOCALE: Record<Language, string> = {
  en: 'en-GB',
  th: 'th-TH-u-ca-gregory',
}

/**
 * Thai weekday abbreviations for `formatShortDate`, per BA glossary §5.2
 * (e.g. Grooming nav strip: `จ. 21 ก.ย.`). Hardcoded rather than sourced from
 * `Intl`'s `weekday: 'short'` option: that option renders the full Thai
 * weekday name (e.g. `จันทร์`) in this runtime's ICU data, not the short
 * form the glossary specifies, and ICU weekday data for `th` varies across
 * browser/Node builds. Indexed by `Date#getDay()` (0 = Sunday .. 6 = Saturday).
 */
const TH_WEEKDAY_ABBR = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'] as const

/** Date only, e.g. `21 Sept 2026` (en) / `21 ก.ย. 2026` (th). Byte-identical
 *  in English to the pre-existing Inpatient `formatDate` literal call. */
export function formatDate(iso: string, lang: Language): string {
  return new Date(iso).toLocaleDateString(LOCALE[lang], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Date + time, e.g. `21 Sept 2026, 14:30` (en) / `21 ก.ย. 2026 14:30` (th).
 *  Byte-identical in English to the pre-existing Inpatient `formatDateTime`
 *  literal call. Thai is explicit 24-hour (R-2); English keeps its existing
 *  option set unchanged (it was already day-first/24-hour under `en-GB`). */
export function formatDateTime(iso: string, lang: Language): string {
  const base = {
    day: '2-digit' as const,
    month: 'short' as const,
    year: 'numeric' as const,
    hour: '2-digit' as const,
    minute: '2-digit' as const,
  }
  if (lang === 'th') {
    return new Date(iso).toLocaleString(LOCALE.th, { ...base, hour12: false })
  }
  return new Date(iso).toLocaleString(LOCALE.en, base)
}

/** Weekday + day + month, no year — the Grooming date-nav-strip case, e.g.
 *  `Mon 21 Sept` (en) / `จ. 21 ก.ย.` (th). Byte-identical in English to the
 *  pre-existing Grooming `formatDateLabel` literal call. */
export function formatShortDate(iso: string, lang: Language): string {
  const date = new Date(iso)
  if (lang === 'th') {
    const weekday = TH_WEEKDAY_ABBR[date.getDay()]
    const rest = date.toLocaleDateString(LOCALE.th, { day: '2-digit', month: 'short' })
    return `${weekday} ${rest}`
  }
  return date.toLocaleDateString(LOCALE.en, { weekday: 'short', day: '2-digit', month: 'short' })
}
