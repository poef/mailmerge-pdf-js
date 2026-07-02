# Mail merge HTML to PDF POC

This is a standalone browser proof of concept for rendering school-account activation HTML templates to mail-merge PDFs with `pdf-lib`.

It extends the earlier simplified POC to cover the currently used templates:

- `templates/demeerscholen.html`
- `templates/simant.fixed.html`
- `templates/demeerwaarde.fixed.html`

The original Simant and De Meerwaarde uploads are included as `*.original.html` fixtures. The Simant original is expected to fail validation because it contains a comment inside a `<td>` opening tag. The De Meerwaarde original is expected to fail validation because it contains nested `<ul>` elements directly under another `<ul>` instead of inside the preceding `<li>`. The De Meerwaarde fixed fixture corrects that nested-list markup while preserving the visible content.

## Run

Serve the folder over HTTP. ES modules and browser fetches do not work reliably from `file://` URLs.

```sh
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080/
```

Select a template and click **Render mail merge PDF**.

## What is supported now

### HTML elements

The policy accepts:

- `html`, `head`, `body`, `meta`, `title`, `style`
- `div`, `p`, `span`, `strong`, `b`, `em`, `i`, `u`, `br`, `a`, `img`
- `h1`, `h2`, `h3`, `ul`, `ol`, `li`
- `table`, `thead`, `tbody`, `tfoot`, `tr`, `td`, `th`

### Attributes

The renderer supports the attributes used by the fixtures:

- Global: `class`, `style`, `title`, `align`, `data-*`
- Links: `href`, `target`
- Images: `src`, `alt`, `width`, `height`, `align`
- Tables/cells: `width`, `cellpadding`, `cellspacing`, `border`, `align`, `valign`, `bgcolor`, `colspan`, `rowspan`
- Metadata: `charset`, `name`, `content`

Attributes matching `ar:*` are ignored and stripped before rendering.

### Placeholders

Placeholders use the current simple form:

```text
{datum}
{voornaam}
{loginAlias}
```

They are replaced as text, not parsed as HTML. That keeps replacement safe by default.

## Validation behavior

The POC fails fast on malformed HTML syntax and on the list content-model problem found in the current fixtures. For example:

```html
<td <!--="" logo="" --="">
```

fails with:

```text
Comments are not allowed inside an opening tag.
```

This is intentionally stricter than browser parsing. The goal is to catch invalid templates before PDF generation instead of letting the browser silently repair them.

## Fidelity notes

This POC intentionally stays in the `pdf-lib` path and does not use `html2pdf.js`. It is not a full browser layout engine. The added renderer covers the practical subset used by the three fixtures: logos, banners, headings, paragraphs, inline formatting, lists, simple nested lists, one-column email tables, colored button cells, and footer/info blocks.

For validation against the previous solution, compare the generated PDFs at the level of visible content, ordering, typography similarity, major spacing, images, headings, lists, and button/table structure. Pixel-perfect browser-CSS fidelity is out of scope for this small POC.
