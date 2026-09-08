# Apply Design Tokens

**Skill Description:** Verifies and enforces the use of the Compassionate Care System design tokens.

## Instructions
1. Review the Tailwind classes used in the component.
2. Check against `design_prototype/compassionate_care_system/DESIGN.md` or the allowed tokens in `tailwind.config.js`.
3. Reject any raw hex colors (e.g., `#FF0000`, `#000000`) and replace them with token names (e.g., `text-error`, `text-primary`).
4. Reject generic colors (e.g., `bg-red-500`) and replace them with semantic tokens.
5. Ensure Material Symbols Outlined are used exclusively for icons. No emojis allowed.
