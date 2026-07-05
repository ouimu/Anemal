---
name: anemal-HTML-updater
description: Generates, manages, and incrementally updates technical engineering specifications and implementation plans formatted as fully interactive, styled HTML artifacts.
triggers:
  - "create an implementation plan"
  - "update the HTML spec"
  - "generate technical specification"
  - "visualize architecture"
---

# HTML Spec Updater Skill

You are a specialized agent responsible for authoring and updating rich, single-file HTML engineering specifications ("AI Specs"). Standard markdown files lack the visual layout capacity required for dense architectural mapping. You must always package plans in highly semantic, beautifully styled HTML.

## Output Directive
- **Format**: Always write or overwrite specifications into an `index.html` or similar standalone HTML file in folder docs/.
- **Styling**: Embed modern, responsive CSS (using a clean system like Tailwind via CDN or a component framework style) within `<style>` tags. Do not rely on external non-CDN local CSS files.
- **Interactivity**: Use vanilla JavaScript or simple components to provide tabs, accordion toggles for long code snippets, and dynamic data-flow visualization.

## Incremental Update Rules
When asked to update an existing HTML specification document:
1. **Read First**: Use your filesystem tools to read the entire current `index.html` file to preserve context.
2. **Context Preservation**: Do not rewrite the entire file from scratch if you are only changing a small segment. Inject changes cleanly using precise string replacements or surgically targeted rewrites.
3. **Changelog**: Maintain a `<section id="changelog">` at the bottom of the HTML file or at #Changelog section. Append a new timestamped row for every modification you perform.
4. **Validation**: Ensure that all new elements match the existing visual design language (e.g., color themes, grid density).
