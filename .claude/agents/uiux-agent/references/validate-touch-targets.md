# Validate Touch Targets

**Skill Description:** Analyzes UI code to ensure it meets tablet touch-target requirements.

## Instructions
1. Scan the React/HTML code for interactive elements (`button`, `a`, `input`, custom toggles, etc.).
2. Ensure every interactive element has a minimum size of 44x44px.
3. Look for Tailwind classes like `min-h-[44px]` and `min-w-[44px]` or equivalent padding/sizing.
4. If an element is smaller than 44x44px, modify the code to enforce the minimum touch target.
