# Roadmap

## Immediate validation targets

- Keep the renderer small and targeted to the currently used activation templates.
- Reject malformed HTML with clear messages.
- Keep `{field}` placeholders escaped as text.
- Ignore legacy `ar:*` attributes.
- Support the practical PDF-visible HTML subset: headings, paragraphs, inline formatting, links, images, lists, nested lists, and simple email tables.

## Fidelity improvements after validation

1. Replace the current generous table-background drawing with a measuring pass so colored cells exactly wrap their rendered content.
2. Add more complete CSS support only when a real template needs it.
3. Improve external font handling by caching resolved font files and mapping CSS `font-family` to embedded fonts more explicitly.
4. Add screenshot/PDF comparison fixtures once the previous solution’s expected PDFs are available.
5. Add a small CLI or Playwright test harness for automated fixture validation.
