// src/frontend/src/i18n/speciesLabel.ts
//
// One shared pet-species display-label lookup for every clinic screen that
// renders `pet.species` (BA sign-off I18N-16 §9.4 item 5 / §9.5 T3). Colocated
// with `i18n/index.ts`, mirroring the existing `i18n/dateFormat.ts` pattern:
// a small, pure, colocated helper rather than a new folder.
//
// R-1 (ADR-0030): the stored `species` value is never rewritten by this
// helper — not in speciesChip color lookups, not in form submit payloads.
// Only the *display* label goes through `speciesLabel()`. A value with no
// entry in the table (X-1: e.g. a future species) renders raw, with no crash.
const SPECIES_LABEL_KEYS: Record<string, string> = {
  canine: 'clinic.pets.speciesCanine',
  feline: 'clinic.pets.speciesFeline',
  avian: 'clinic.pets.speciesAvian',
  other: 'common.other',
  // Display-only aliases for non-canonical stored values (§9.4 item 6):
  // `prisma/seed.ts` writes `Dog`/`Cat`, and `pet.service.ts` accepts any
  // string, so production rows created outside the Pets form can carry these.
  // Canonicalising the stored vocabulary itself is tracked as a backlog item
  // (§9.6.2, @db-agent) — this table only maps them to the existing labels.
  dog: 'clinic.pets.speciesCanine',
  cat: 'clinic.pets.speciesFeline',
}

/**
 * Resolves a stored `species` value to its translated display label.
 * Lookup is case-insensitive; an unmapped value is returned unchanged (X-1).
 */
export function speciesLabel(t: (key: string) => string, species: string): string {
  const key = SPECIES_LABEL_KEYS[species.toLowerCase()]
  return key ? t(key) : species
}
