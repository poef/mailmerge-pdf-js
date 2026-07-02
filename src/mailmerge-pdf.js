import {
  PDFDocument,
  StandardFonts,
  rgb
} from "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";

const A4 = { width: 595.28, height: 841.89 };
const MM = 72 / 25.4;

const PAGE_STYLE = {
  width: A4.width,
  height: A4.height,
  marginTop: 24 * MM,
  marginRight: 22 * MM,
  marginBottom: 24 * MM,
  marginLeft: 22 * MM
};

const DEFAULT_STYLES = {
  body: {
    fontSize: 11,
    lineHeight: 1.35,
    marginBottom: 0,
    color: rgb(0.12, 0.12, 0.12)
  },
  h1: {
    fontSize: 18,
    lineHeight: 1.2,
    bold: true,
    marginTop: 8,
    marginBottom: 14
  },
  h2: {
    fontSize: 14,
    lineHeight: 1.25,
    bold: true,
    marginTop: 6,
    marginBottom: 10
  },
  p: {
    fontSize: 11,
    lineHeight: 1.35,
    marginTop: 0,
    marginBottom: 10
  },
  img: {
    maxWidth: 130,
    align: "left",
    marginTop: 0,
    marginBottom: 18
  },
  ".logo": {
    maxWidth: 118,
    align: "right",
    marginBottom: 24
  }
};

const SUPPORTED_BLOCKS = new Set(["h1", "h2", "p", "img", "div"]);
const SUPPORTED_INLINE = new Set(["strong", "b", "em", "i", "span", "br"]);

export async function generateMailmergePdf({ templateHtml, people, assets = {} }) {
  if (!people.length) {
    throw new Error("Select at least one person.");
  }

  const pdfDoc = await PDFDocument.create();
  const fonts = await loadStandardFonts(pdfDoc);
  const embeddedAssets = await embedAssets(pdfDoc, assets);
  const context = createRenderContext(pdfDoc, fonts, embeddedAssets);

  people.forEach((person, index) => {
    if (index > 0) {
      context.newPage();
    }
    renderTemplateForPerson(context, templateHtml, person);
  });

  return pdfDoc.save();
}

function renderTemplateForPerson(context, templateHtml, person) {
  const filledHtml = interpolate(templateHtml, person);
  const tree = parseTemplate(filledHtml);

  for (const block of tree) {
    renderBlock(context, block);
  }
}

function interpolate(templateHtml, data) {
  return templateHtml.replace(/{{\s*([\w.-]+)\s*}}/g, (_match, key) => {
    const value = getPath(data, key);
    return formatFieldValue(value == null ? "" : String(value));
  });
}

function getPath(data, path) {
  return path.split(".").reduce((current, key) => current?.[key], data);
}

function formatFieldValue(value) {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseTemplate(html) {
  const doc = new DOMParser().parseFromString(`<main>${html}</main>`, "text/html");
  const main = doc.querySelector("main");
  const blocks = [];

  for (const child of main.childNodes) {
    const block = parseBlockNode(child);
    if (block) {
      blocks.push(block);
    }
  }

  return blocks;
}

function parseBlockNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (!node.textContent.trim()) {
      return null;
    }
    return {
      type: "p",
      classes: [],
      attrs: {},
      children: [{ type: "text", text: node.textContent.trim() }]
    };
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const tag = node.tagName.toLowerCase();
  if (!SUPPORTED_BLOCKS.has(tag)) {
    throw new Error(`Unsupported block element: <${tag}>`);
  }

  const classes = [...node.classList];
  if (classes.includes("page-break")) {
    return { type: "page-break" };
  }

  if (tag === "img") {
    return {
      type: "img",
      classes,
      attrs: allowedAttrs(node, ["src", "width", "height", "alt"]),
      children: []
    };
  }

  return {
    type: tag === "div" ? "p" : tag,
    classes,
    attrs: allowedAttrs(node, []),
    children: parseInlineChildren(node)
  };
}

function parseInlineChildren(parent) {
  const children = [];
  for (const child of parent.childNodes) {
    appendInlineNode(children, child, { bold: false, italic: false });
  }
  return children;
}

function appendInlineNode(children, node, marks) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (node.textContent) {
      children.push({ type: "text", text: node.textContent, ...marks });
    }
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const tag = node.tagName.toLowerCase();
  if (!SUPPORTED_INLINE.has(tag)) {
    throw new Error(`Unsupported inline element: <${tag}>`);
  }

  if (tag === "br") {
    children.push({ type: "br" });
    return;
  }

  const nextMarks = {
    bold: marks.bold || tag === "strong" || tag === "b",
    italic: marks.italic || tag === "em" || tag === "i"
  };

  for (const child of node.childNodes) {
    appendInlineNode(children, child, nextMarks);
  }
}

function allowedAttrs(node, names) {
  return Object.fromEntries(
    names
      .filter((name) => node.hasAttribute(name))
      .map((name) => [name, node.getAttribute(name)])
  );
}

async function loadStandardFonts(pdfDoc) {
  return {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    italic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique)
  };
}

async function embedAssets(pdfDoc, assets) {
  const embedded = {};

  for (const [name, asset] of Object.entries(assets)) {
    const bytes = asset.bytes instanceof Uint8Array ? asset.bytes : new Uint8Array(asset.bytes);
    const mimeType = asset.mimeType || detectMimeType(bytes);
    const image = mimeType === "image/jpeg"
      ? await pdfDoc.embedJpg(bytes)
      : await pdfDoc.embedPng(bytes);
    embedded[name] = { ...asset, image, mimeType };
  }

  return embedded;
}

function detectMimeType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "image/jpeg";
  }
  return "image/png";
}

function createRenderContext(pdfDoc, fonts, assets) {
  const context = {
    pdfDoc,
    fonts,
    assets,
    page: null,
    y: 0,
    contentWidth: PAGE_STYLE.width - PAGE_STYLE.marginLeft - PAGE_STYLE.marginRight,
    newPage() {
      this.page = pdfDoc.addPage([PAGE_STYLE.width, PAGE_STYLE.height]);
      this.y = PAGE_STYLE.height - PAGE_STYLE.marginTop;
    },
    ensureSpace(height) {
      if (!this.page || this.y - height < PAGE_STYLE.marginBottom) {
        this.newPage();
      }
    }
  };

  context.newPage();
  return context;
}

function renderBlock(context, block) {
  if (block.type === "page-break") {
    context.newPage();
    return;
  }

  if (block.type === "img") {
    renderImage(context, block);
    return;
  }

  renderTextBlock(context, block);
}

function renderTextBlock(context, block) {
  const style = resolveStyle(block.type, block.classes);
  const fontSize = style.fontSize;
  const lineHeight = fontSize * style.lineHeight;

  context.ensureSpace(style.marginTop + lineHeight);
  context.y -= style.marginTop;

  const lines = wrapInlineChildren(context, block.children, style, context.contentWidth);

  for (const line of lines) {
    context.ensureSpace(lineHeight);
    drawLine(context, line, PAGE_STYLE.marginLeft, context.y, style);
    context.y -= lineHeight;
  }

  context.y -= style.marginBottom;
}

function wrapInlineChildren(context, children, baseStyle, maxWidth) {
  const lines = [];
  let current = [];
  let currentWidth = 0;

  const pushLine = () => {
    lines.push(trimLine(current));
    current = [];
    currentWidth = 0;
  };

  for (const child of children) {
    if (child.type === "br") {
      pushLine();
      continue;
    }

    const runs = tokenizeRun(child);
    for (const run of runs) {
      const normalizedText = normalizePdfText(run.text);
      const runWithText = { ...run, text: normalizedText };
      const width = measureRun(context, runWithText, baseStyle.fontSize);

      if (/^\s+$/.test(normalizedText) && current.length === 0) {
        continue;
      }

      if (currentWidth > 0 && currentWidth + width > maxWidth && !/^\s+$/.test(normalizedText)) {
        pushLine();
      }

      current.push(runWithText);
      currentWidth += width;
    }
  }

  if (current.length || lines.length === 0) {
    pushLine();
  }

  return lines;
}

function tokenizeRun(run) {
  // Browser HTML collapses whitespace in normal text flow. We do the same here so
  // indentation/newlines from the template are not passed to pdf-lib.drawText().
  const normalized = normalizeInlineWhitespace(run.text);
  const tokens = normalized.match(/ +|[^ ]+/g) || [];
  return tokens.map((token) => ({ ...run, text: token }));
}

function normalizeInlineWhitespace(text) {
  return text.replace(/\s+/g, " ");
}

function trimLine(line) {
  const trimmed = [...line];
  while (trimmed.length && /^\s+$/.test(trimmed[trimmed.length - 1].text)) {
    trimmed.pop();
  }
  return trimmed;
}

function measureRun(context, run, fontSize) {
  return getFont(context.fonts, run).widthOfTextAtSize(run.text, fontSize);
}

function drawLine(context, line, x, y, style) {
  let cursorX = x;

  for (const run of line) {
    if (!run.text) {
      continue;
    }

    const font = getFont(context.fonts, run);
    context.page.drawText(run.text, {
      x: cursorX,
      y,
      size: style.fontSize,
      font,
      color: style.color
    });
    cursorX += font.widthOfTextAtSize(run.text, style.fontSize);
  }
}

function getFont(fonts, run) {
  if (run.bold && run.italic) {
    return fonts.boldItalic;
  }
  if (run.bold) {
    return fonts.bold;
  }
  if (run.italic) {
    return fonts.italic;
  }
  return fonts.regular;
}

function renderImage(context, block) {
  const src = block.attrs.src;
  const asset = context.assets[src];
  if (!asset) {
    throw new Error(`Unknown image asset: ${src}`);
  }

  const style = resolveStyle("img", block.classes);
  const intrinsicWidth = asset.image.width;
  const intrinsicHeight = asset.image.height;
  const requestedWidth = parseNumber(block.attrs.width) || style.maxWidth || intrinsicWidth;
  const requestedHeight = parseNumber(block.attrs.height);
  const width = Math.min(requestedWidth, context.contentWidth);
  const height = requestedHeight || width * (intrinsicHeight / intrinsicWidth);

  context.ensureSpace(style.marginTop + height + style.marginBottom);
  context.y -= style.marginTop;

  let x = PAGE_STYLE.marginLeft;
  if (style.align === "right") {
    x = PAGE_STYLE.width - PAGE_STYLE.marginRight - width;
  } else if (style.align === "center") {
    x = PAGE_STYLE.marginLeft + (context.contentWidth - width) / 2;
  }

  context.page.drawImage(asset.image, {
    x,
    y: context.y - height,
    width,
    height
  });

  context.y -= height + style.marginBottom;
}

function resolveStyle(tag, classes = []) {
  const style = {
    ...DEFAULT_STYLES.body,
    ...(DEFAULT_STYLES[tag] || {})
  };

  for (const className of classes) {
    Object.assign(style, DEFAULT_STYLES[`.${className}`] || {});
  }

  return style;
}

function parseNumber(value) {
  if (!value) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePdfText(text) {
  // The proof of concept uses standard PDF Helvetica. That is enough for normal Dutch text,
  // but not for every typographic character copied from word processors.
  return text
    .replaceAll("\u2018", "'")
    .replaceAll("\u2019", "'")
    .replaceAll("\u201c", '"')
    .replaceAll("\u201d", '"')
    .replaceAll("\u2013", "-")
    .replaceAll("\u2014", "-")
    .replaceAll("\u2026", "...")
    .replaceAll("\u00a0", " ");
}
