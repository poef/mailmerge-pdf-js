# Mailmerge PDF proof of concept

This is a deliberately small browser-only proof of concept for generating a merged PDF from a simplified HTML template.

It uses `pdf-lib` directly. It does **not** use `html2pdf.js`, browser screenshots, or canvas-based page rendering.

## What this proves

- A selected list of people can be merged into one PDF download.
- Template fields like `{{childName}}` are safely escaped before rendering.
- Simple HTML can be parsed with `DOMParser` and rendered through a tiny layout layer.
- PNG/JPEG logos can be used as fixed template assets with `<img src="school-logo" class="logo">`.
- Each selected person starts on a new page in the same final PDF.

## Run it

Because the demo imports `pdf-lib` from a CDN as an ES module, run it through a local web server:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080/
```

When using the zip directly, first `cd` into the unzipped `mailmerge-pdf-poc` directory.

## Supported template subset

This proof of concept intentionally supports only:

- `h1`
- `h2`
- `p`
- `br`
- `strong` / `b`
- `em` / `i`
- `span`
- `img`
- `<div class="page-break"></div>`

Unsupported elements throw an error. This is intentional: the goal is a small mailmerge print renderer, not a general HTML/CSS-to-PDF engine.

## Supported image model

Images are fixed template assets, not arbitrary browser layout.

The demo supports this pattern:

```html
<img src="school-logo" class="logo">
```

The JavaScript passes an asset map to the renderer:

```js
assets: {
  "school-logo": {
    bytes: logoBytes,
    mimeType: "image/png"
  }
}
```

PNG and JPEG are supported because `pdf-lib` supports both through `embedPng()` and `embedJpg()`.

## Font simplification

The proof of concept uses standard PDF Helvetica fonts to keep the first version small and avoid `fontkit`.

For normal Dutch text this is acceptable for a first prototype. The renderer normalizes common typographic characters such as curly quotes and en/em dashes to simpler equivalents. A production version should probably embed an open font with `@pdf-lib/fontkit`, especially if templates are pasted from Word or contain less common symbols.

## Where to extend next

See [`ROADMAP.md`](ROADMAP.md) for the production-readiness roadmap.

Good next steps, in order:

1. Move `DEFAULT_STYLES` to a public template configuration object.
2. Add fixed header/footer support.
3. Add custom embedded font support with `@pdf-lib/fontkit`, because schools often need their own house style font.
4. Add a very small table renderer, but only for simple fixed-width tables.
5. Add tests for wrapping, pagination, escaping, and unsupported tags.

Avoid adding general CSS, flexbox, grid, floats, or browser-like image layout. Those would turn this into a much larger rendering engine.
