---
name: anemal-dev-lanes
description: >
  Lane selector for Anemal work that is not a full feature — Lane B (bug fix), Lane C (hotfix),
  Lane D (refactor). Use when the request is to fix a bug, debug a failure, patch a production
  incident, get main green again, restructure or clean up code, remove duplication, or make code
  easier to read — anything that is not "build a new feature". Also use when it is unclear which lane
  a request belongs to. Thai triggers included — แก้บั๊ก, พัง, ใช้ไม่ได้, error, prod ล่ม, ข้อมูลเสีย,
  รีแฟคเตอร์, จัดโครงสร้างโค้ด, ทำให้อ่านง่ายขึ้น, ลดโค้ดซ้ำ.
triggers:
  - "fix this bug"
  - "แก้บั๊ก"
  - "it's broken"
  - "พัง"
  - "hotfix"
  - "prod ล่ม"
  - "main is red"
  - "refactor"
  - "รีแฟคเตอร์"
  - "จัดโครงสร้างโค้ด"
  - "clean up this code"
  - "ลดโค้ดซ้ำ"
---

# Anemal Dev Lanes — B, C, D

The full feature pipeline (Lane A, 8 steps / 5 gates) is right for new behaviour and wrong for a
one-line bug. These three lanes are the alternatives. Each has fewer gates — and each has an
escalation rule that stops it from becoming a way around Lane A.

---

## 1. Pick the lane

| The request | Lane | Read |
|-------------|------|------|
| new or changed behaviour, a feature, a new screen | **A** — full pipeline, see `CLAUDE.md` | — |
| something is broken and should not be | **B** | `references/bugfix.md` |
| production is down, data is corrupting, a security hole, or `main` is red | **C** | `references/hotfix.md` |
| behaviour must stay identical; the structure improves | **D** | `references/refactor.md` |
| "review the code" with no change requested | none — run `/code-review` | — |

**Ambiguous → ask, do not guess.** Two signals that look like different lanes, or none that fit, is a
question for the human. Common trap: "make it faster" is Lane D if behaviour is unchanged and Lane A
if it is not.

**Scope guard:** the words *all / entire / whole repo / ทั้งหมด / ทั้งระบบ* mean **stop**. Do not start
editing. Produce a prioritised backlog first (`@arch-agent` for D, `@qa-agent` for B), then run one
item per branch.

---

## 2. Shared rules — every lane

- **One lane per branch.** Never mix a refactor into a feature branch, or a hotfix into either. If
  review cannot tell which change caused a failure, the branch was wrong.
- **Escalate rather than stretch a lane** — the matrix in §3 is not optional.
- **`@scribe-agent` ships every lane** at the end: reference-integrity scan, commit and PR compliance,
  the red-suite ship gate, then the tracking documents.
- **Isolation and RBAC are never relaxed** for speed. A cross-tenant fix keeps its test permanently.
- **Tests are never deleted to make a lane pass.** Removing one requires a recorded deleted-coverage
  justification in the PR (precedent: ADR-0019 and the 2026-08-20 deleted-coverage plan).

---

## 3. Escalation matrix

| In lane | On discovering | Go to |
|---------|----------------|-------|
| B | schema change needed · API contract change · more than 3 files · root cause is a design flaw | **A**, entering at Step 3.4 (`@arch-agent`) |
| C | the patch would need a schema change or a migration | **A or B** — stop the hotfix; a rushed schema change is worse than the original bug |
| D | behaviour actually changes (a test goes red and *should* be red) | **A** |
| A | production breaks while the feature is in flight | open a **separate C branch** — never inside the feature branch |

---

## 4. Ship gate interaction

`main` red blocks every merge (`CLAUDE.md`, red-suite ship gate 2026-08-20).
The single exemption: a branch whose own suite is green and which turns those exact failing tests
green — or deletes them with a recorded justification. That branch may merge while `main` is red, and
its PR body must say so. Lane C is normally how `main` gets back to green.

---

## 5. Hotfix debt ledger

Every Lane C merge writes an entry under **Open hotfix debt** in `.claude/roadmap/index.md`:

```
- <date> · <branch> · symptom · the exemption used · follow-up: <Lane + link>
```

`@scribe-agent` blocks the merge if the entry is missing, and removes it when the follow-up ships.
