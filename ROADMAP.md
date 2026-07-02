# Production readiness roadmap

This roadmap keeps the proof of concept deliberately small. The goal is not to convert arbitrary HTML/CSS to PDF. The goal is a reliable browser-only mailmerge renderer for Dutch school/customer letters, using `pdf-lib` as the PDF backend.

## Product promise

Generate Dutch customer letters from:

- a restricted HTML-like template,
- a known field schema,
- fixed school logo assets,
- selected customer/person data,
- and a configurable embedded font,

then download one combined PDF in the browser.

The renderer should stay a small document renderer whose input syntax is simple HTML. It should not become a browser layout engine.

## Minimal production-ready checklist

A version can be considered production-ready when it has:

1. Template validation with useful errors.
2. Explicit field schema and missing-field handling.
3. Custom embedded font support.
4. Character normalization and validation against the selected font.
5. Fixed asset validation for school logos.
6. Configurable page and style map.
7. Hardened wrapping and pagination.
8. Header/footer support.
9. Local bundled dependencies instead of CDN imports.
10. Unit tests for template parsing, interpolation, layout, images, fonts, and PDF generation.

## Phase 1: Template compiler and validation

Turn template parsing into a separate compile step:

```js
const compiledTemplate = compileTemplate(templateHtml, {
  fields: fieldSchema,
  assets: ["school-logo"],
  styles,
  fonts
});
```

The compiler should report all template problems before PDF generation starts:

- unsupported elements, such as `<table>` before table support exists,
- unsupported attributes, such as arbitrary inline `style`,
- unknown fields, such as `{{chlidName}}`,
- unknown assets, such as `<img src="schoolLogo">`,
- unsupported nesting if a tag is only valid in specific contexts.

The compiler should collect multiple errors at once, so a user can fix the template in one pass.

## Phase 2: Field schema and data validation

Add an explicit schema for merge fields:

```js
const fieldSchema = {
  childName: { required: true },
  parentName: { required: true },
  address: { required: true, multiline: true },
  schoolName: { required: true },
  eventDate: { required: true },
  optionalNote: { required: false }
};
```

Recommended policy:

- missing required field: stop generation with a clear error,
- missing optional field: render as empty string,
- unknown template field: template validation error,
- multiline fields: preserve explicit line breaks, but still escape HTML.

This prevents generating a large batch of letters with blank names, addresses, or dates.

## Phase 3: Custom embedded fonts

Schools will often want to use their own house style font. Production support should therefore include custom embedded fonts early.

Use `pdf-lib` with `@pdf-lib/fontkit` to embed TrueType/OpenType fonts from local bundled assets or user-provided files.

Suggested font configuration:

```js
const fonts = {
  regular: {
    src: "assets/fonts/SchoolSans-Regular.ttf",
    family: "SchoolSans",
    weight: "normal",
    style: "normal"
  },
  bold: {
    src: "assets/fonts/SchoolSans-Bold.ttf",
    family: "SchoolSans",
    weight: "bold",
    style: "normal"
  },
  italic: {
    src: "assets/fonts/SchoolSans-Italic.ttf",
    family: "SchoolSans",
    weight: "normal",
    style: "italic"
  }
};
```

Smallest useful implementation:

- support one regular font,
- support optional bold and italic variants,
- fall back from missing bold/italic variants to regular with a warning,
- use the same embedded font for measurement and drawing,
- validate that all rendered characters are available or safely normalized.

Do not include font files in this repository unless their license allows redistribution. Prefer documenting where to place school-provided font files locally.

## Phase 4: Character normalization and validation

Even with Dutch-only content, pasted text may contain typographic characters from Word or email:

- curly quotes,
- non-breaking spaces,
- en/em dashes,
- soft hyphens,
- bullets,
- euro signs,
- smart apostrophes.

Production should use a predictable text pipeline:

```text
input text
→ Unicode normalization
→ replace common typographic variants where appropriate
→ preserve explicit line breaks for multiline fields and <br>
→ validate characters against selected font
→ draw text
```

Unsupported characters should produce a clear error that names the field/template location and the character.

## Phase 5: Image asset validation

Keep image support small and fixed-template-based:

```html
<img src="school-logo" class="logo">
```

The template should only reference known assets. It should not load arbitrary remote URLs.

Production validation should include:

- PNG and JPEG only,
- maximum byte size,
- maximum pixel dimensions,
- corrupt-image detection,
- predictable scaling by `maxWidth`, `maxHeight`, or explicit dimensions,
- alignment through the style map,
- transparent PNG support for logos.

## Phase 6: Configurable page and style map

Move hard-coded page and style defaults into configuration:

```js
const templateConfig = {
  page: {
    size: "A4",
    unit: "mm",
    margins: {
      top: 24,
      right: 22,
      bottom: 24,
      left: 22
    }
  },
  styles: {
    h1: { fontSize: 18, bold: true, marginBottom: 14 },
    p: { fontSize: 11, lineHeight: 1.35, marginBottom: 10 },
    ".logo": { maxWidth: 118, align: "right", marginBottom: 24 },
    ".address": { marginTop: 20, marginBottom: 20 }
  }
};
```

This should remain a small style map, not a general CSS implementation. Avoid cascade complexity, selectors beyond element and single-class selectors, and layout features such as flex/grid/floats.

## Phase 7: Layout hardening

Harden the parts most likely to fail in real templates:

- very long words,
- empty paragraphs,
- multiple `<br>` elements,
- paragraphs at page boundaries,
- manual page breaks,
- image at page boundary,
- first block on a page,
- last block on a page,
- multiline address blocks.

Recommended long-word policy: break long words at character boundary rather than clipping them.

## Phase 8: Header and footer support

Many school letters need repeated page structure:

- logo,
- school address,
- footer text,
- page number.

Add small reserved header/footer regions instead of general absolute positioning:

```js
const pageTemplate = {
  header: `<img src="school-logo" class="logo">`,
  footer: `<p class="footer">Pagina {{pageNumber}}</p>`
};
```

Header/footer templates should use the same restricted template language as the body.

## Phase 9: Bundle dependencies locally

The demo currently imports `pdf-lib` from a CDN. A production version should bundle dependencies locally to get:

- predictable versions,
- offline/local deployment,
- no runtime CDN dependency,
- better privacy and reliability,
- easier review of dependency changes.

The production package should expose the renderer separately from the demo UI.

Suggested structure:

```text
packages/mailmerge-pdf/
  src/
    compile-template.js
    interpolate.js
    parse-template.js
    layout.js
    draw-pdf.js
    fonts.js
    assets.js
    generate.js
  test/
  README.md

demo/
  index.html
  demo.js
```

For this small PoC repository, the same separation can be introduced gradually without immediately creating a full monorepo.

## Phase 10: Tests

Minimum test coverage:

- field interpolation escapes HTML,
- multiline field creates line breaks,
- unknown fields are reported,
- missing required fields stop generation,
- unsupported HTML is rejected,
- text wraps correctly,
- long words do not clip silently,
- paragraphs continue on the next page,
- manual page break works,
- logo scales correctly,
- unknown image asset fails,
- corrupt image asset fails,
- custom font loads and is used for measurement/drawing,
- unsupported character fails clearly,
- many recipients generate one combined PDF.

## Explicit non-goals for the small version

Avoid these until the simple renderer is stable:

- arbitrary CSS,
- flexbox,
- grid,
- floats,
- browser-like image flow,
- canvas screenshots,
- WYSIWYG template editing,
- PDF preview,
- SVG logos,
- variable per-recipient images,
- complex typography,
- hyphenation.

Tables are tempting, but they should wait. If added later, start with simple fixed-width tables only.
