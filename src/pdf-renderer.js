import { PDFDocument, StandardFonts, rgb } from 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm';
import fontkit from 'https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/+esm';

const A4 = [595.28, 841.89];
const PX_TO_PT = 0.75;
const BLOCK_TAGS = new Set(['div', 'p', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th']);
const SKIP_TAGS = new Set(['meta', 'title', 'style', 'head']);

export async function renderPdfFromFragment(fragment, options = {}) {
  const renderer = new PdfRenderer(options);
  await renderer.init(fragment);
  await renderer.renderFragment(fragment);
  return renderer.finish();
}

class PdfRenderer {
  constructor(options = {}) {
    this.options = {
      pageSize: options.pageSize || A4,
      margin: options.margin ?? 42,
      fontSize: options.fontSize ?? 11,
      lineHeight: options.lineHeight ?? 1.35,
      imageFetch: options.imageFetch ?? true,
      externalResources: options.externalResources ?? true,
      defaultFontFamily: options.defaultFontFamily || 'Helvetica',
      ...options
    };
    this.pdfDoc = null;
    this.page = null;
    this.fonts = {};
    this.embeddedFonts = new Map();
    this.images = new Map();
    this.warnings = [];
  }

  async init(fragment) {
    this.pdfDoc = await PDFDocument.create();
    try {
      this.pdfDoc.registerFontkit(fontkit);
    } catch (error) {
      this.warnings.push(`Could not register fontkit: ${error.message}`);
    }

    this.fonts.regular = await this.pdfDoc.embedFont(StandardFonts.Helvetica);
    this.fonts.bold = await this.pdfDoc.embedFont(StandardFonts.HelveticaBold);
    this.fonts.italic = await this.pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    this.fonts.boldItalic = await this.pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);

    if (this.options.externalResources) {
      await this.loadFontsFromStyleImports(fragment);
    }

    this.addPage();
  }

  addPage() {
    this.page = this.pdfDoc.addPage(this.options.pageSize);
    this.width = this.page.getWidth();
    this.height = this.page.getHeight();
    this.x = this.options.margin;
    this.y = this.height - this.options.margin;
    this.contentWidth = this.width - this.options.margin * 2;
  }

  async finish() {
    const bytes = await this.pdfDoc.save();
    return { bytes, warnings: this.warnings };
  }

  ensureSpace(height = 20) {
    if (this.y - height < this.options.margin) {
      this.addPage();
    }
  }

  moveDown(amount) {
    this.y -= amount;
    this.ensureSpace(amount);
  }

  async renderFragment(fragment, context = {}) {
    const children = Array.from(fragment.childNodes);
    for (const child of children) {
      await this.renderNode(child, this.baseStyle(), { ...context, width: context.width || this.contentWidth, x: context.x || this.options.margin, indent: context.indent || 0 });
    }
  }

  baseStyle() {
    return {
      fontSize: this.options.fontSize,
      lineHeight: this.options.lineHeight,
      bold: false,
      italic: false,
      underline: false,
      color: rgb(0.18, 0.18, 0.18),
      align: 'left',
      fontFamily: this.options.defaultFontFamily
    };
  }

  async renderNode(node, style, context) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = normalizeText(node.textContent);
      if (text.trim()) {
        this.renderRuns([{ text, style }], context);
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tagName = node.localName.toLowerCase();
    if (SKIP_TAGS.has(tagName)) return;

    const nodeStyle = mergeStyle(style, getElementStyle(node));

    if (tagName === 'br') {
      this.moveDown(lineHeight(nodeStyle));
      return;
    }

    if (tagName === 'img') {
      await this.renderImage(node, nodeStyle, context);
      return;
    }

    if (tagName === 'table') {
      await this.renderTable(node, nodeStyle, context);
      return;
    }

    if (tagName === 'ul' || tagName === 'ol') {
      await this.renderList(node, nodeStyle, context, tagName === 'ol');
      return;
    }

    if (tagName === 'h1' || tagName === 'h2' || tagName === 'h3') {
      const headingStyle = {
        ...nodeStyle,
        bold: true,
        fontSize: tagName === 'h1' ? 21 : tagName === 'h2' ? 16 : 13,
        lineHeight: 1.2
      };
      const runs = this.collectInlineRuns(node, headingStyle);
      if (runs.length) this.renderRuns(runs, { ...context, paragraphSpacing: tagName === 'h1' ? 12 : 9 });
      return;
    }

    if (tagName === 'p') {
      const marginTop = cssLength(nodeStyle.css.marginTop, 0);
      const marginBottom = cssLength(nodeStyle.css.marginBottom, 7);
      if (marginTop) this.moveDown(marginTop);
      const runs = this.collectInlineRuns(node, nodeStyle);
      if (runs.length) this.renderRuns(runs, { ...context, paragraphSpacing: marginBottom });
      return;
    }

    if (tagName === 'li') {
      await this.renderListItem(node, nodeStyle, context, '•');
      return;
    }

    if (hasBlockChildren(node)) {
      await this.renderChildren(node, nodeStyle, context);
    } else {
      const runs = this.collectInlineRuns(node, nodeStyle);
      if (runs.length) this.renderRuns(runs, context);
    }
  }

  async renderChildren(node, style, context) {
    for (const child of Array.from(node.childNodes)) {
      await this.renderNode(child, style, context);
    }
  }

  collectInlineRuns(node, inheritedStyle) {
    const runs = [];
    const visit = (child, style) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = normalizeText(child.textContent, style.css?.whiteSpace === 'pre');
        if (text) runs.push({ text, style });
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;

      const tagName = child.localName.toLowerCase();
      if (tagName === 'br') {
        runs.push({ br: true, style });
        return;
      }
      if (BLOCK_TAGS.has(tagName) && tagName !== 'span' && tagName !== 'strong' && tagName !== 'em' && tagName !== 'u' && tagName !== 'a') {
        runs.push({ br: true, style });
      }
      const nextStyle = mergeStyle(style, getElementStyle(child));
      for (const grandChild of Array.from(child.childNodes)) visit(grandChild, nextStyle);
    };
    for (const child of Array.from(node.childNodes)) visit(child, inheritedStyle);
    return coalesceRuns(runs);
  }

  renderRuns(runs, context = {}) {
    const xStart = (context.x || this.options.margin) + (context.indent || 0);
    const maxWidth = (context.width || this.contentWidth) - (context.indent || 0);
    const lines = wrapRuns(runs, maxWidth, this.fontForStyle.bind(this));

    for (const line of lines) {
      const maxFontSize = Math.max(...line.map(part => part.style.fontSize || this.options.fontSize), this.options.fontSize);
      const maxLineHeight = Math.max(...line.map(part => lineHeight(part.style)), maxFontSize * this.options.lineHeight);
      this.ensureSpace(maxLineHeight);

      const lineWidth = line.reduce((sum, part) => sum + textWidth(part.text, this.fontForStyle(part.style), part.style.fontSize), 0);
      const align = line.find(part => part.style.align)?.style.align || 'left';
      let x = xStart;
      if (align === 'center') x = xStart + Math.max(0, (maxWidth - lineWidth) / 2);
      if (align === 'right') x = xStart + Math.max(0, maxWidth - lineWidth);

      const baseline = this.y - maxFontSize;
      for (const part of line) {
        const font = this.fontForStyle(part.style);
        const fontSize = part.style.fontSize;
        const width = textWidth(part.text, font, fontSize);
        this.page.drawText(part.text, { x, y: baseline, size: fontSize, font, color: part.style.color });
        if (part.style.underline) {
          this.page.drawLine({
            start: { x, y: baseline - 2 },
            end: { x: x + width, y: baseline - 2 },
            thickness: 0.5,
            color: part.style.color
          });
        }
        x += width;
      }
      this.y -= maxLineHeight;
    }

    if (context.paragraphSpacing) this.moveDown(context.paragraphSpacing);
  }

  async renderImage(node, style, context) {
    const src = node.getAttribute('src');
    const alt = node.getAttribute('alt') || src || 'image';
    const width = imageCssWidth(node, style, context.width || this.contentWidth);
    const align = (node.getAttribute('align') || style.align || 'left').toLowerCase();

    const image = await this.loadImage(src);
    if (!image) {
      this.renderRuns([{ text: `[${alt}]`, style: { ...style, italic: true } }], context);
      return;
    }

    const dims = image.scale(width / image.width);
    this.ensureSpace(dims.height + 8);
    let x = context.x || this.options.margin;
    if (align === 'right') x += Math.max(0, (context.width || this.contentWidth) - dims.width);
    if (align === 'center') x += Math.max(0, ((context.width || this.contentWidth) - dims.width) / 2);

    this.page.drawImage(image, {
      x,
      y: this.y - dims.height,
      width: dims.width,
      height: dims.height
    });
    this.y -= dims.height + 8;
  }

  async loadImage(src) {
    if (!src || !this.options.imageFetch) return null;
    if (this.images.has(src)) return this.images.get(src);

    try {
      const response = await fetch(src, { mode: 'cors' });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const bytes = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || '';
      const embedded = contentType.includes('png') || /\.png(?:\?|$)/i.test(src)
        ? await this.pdfDoc.embedPng(bytes)
        : await this.pdfDoc.embedJpg(bytes);
      this.images.set(src, embedded);
      return embedded;
    } catch (error) {
      this.warnings.push(`Could not embed image ${src}: ${error.message}`);
      this.images.set(src, null);
      return null;
    }
  }

  async renderList(node, style, context, ordered = false) {
    let index = 1;
    for (const child of Array.from(node.children)) {
      if (child.localName.toLowerCase() !== 'li') continue;
      await this.renderListItem(child, style, context, ordered ? `${index}.` : '•');
      index += 1;
    }
    this.moveDown(2);
  }

  async renderListItem(node, style, context, marker) {
    const itemIndent = (context.indent || 0) + 16;
    const markerStyle = { ...style, bold: false };
    const markerWidth = 13;

    const inlineRuns = [];
    const nestedLists = [];
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE && ['ul', 'ol'].includes(child.localName.toLowerCase())) {
        nestedLists.push(child);
      } else {
        const temp = document.createElement('span');
        temp.append(child.cloneNode(true));
        inlineRuns.push(...this.collectInlineRuns(temp, style));
      }
    }

    if (inlineRuns.length) {
      const x = (context.x || this.options.margin) + (context.indent || 0);
      this.renderRuns([{ text: marker, style: markerStyle }], { ...context, x, width: markerWidth });
      this.y += lineHeight(style); // render marker and text on the same baseline
      this.renderRuns(inlineRuns, { ...context, indent: itemIndent, width: (context.width || this.contentWidth) - markerWidth });
    }

    for (const list of nestedLists) {
      await this.renderList(list, style, { ...context, indent: itemIndent + 6 }, list.localName.toLowerCase() === 'ol');
    }
  }

  async renderTable(node, style, context) {
    const attrWidth = tableWidth(node, context.width || this.contentWidth);
    const tableAlign = (node.getAttribute('align') || style.align || 'left').toLowerCase();
    let tableX = context.x || this.options.margin;
    if (tableAlign === 'center') tableX += Math.max(0, ((context.width || this.contentWidth) - attrWidth) / 2);
    if (tableAlign === 'right') tableX += Math.max(0, (context.width || this.contentWidth) - attrWidth);

    const tableStyle = mergeStyle(style, getElementStyle(node));
    const padding = cssLength(node.getAttribute('cellpadding'), 0);

    const rowElements = Array.from(node.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tfoot > tr, :scope > tr'));
    for (const row of rowElements) {
      const cells = Array.from(row.children).filter(child => ['td', 'th'].includes(child.localName.toLowerCase()));
      if (!cells.length) continue;

      const cellWidth = attrWidth / cells.length;
      const startY = this.y;
      let rowBottom = this.y;
      let cellX = tableX;

      for (const cell of cells) {
        const cellStyle = mergeStyle(tableStyle, getElementStyle(cell));
        const cellPadding = cssBox(cellStyle.css.padding, padding);
        const savedY = this.y;
        this.y = startY - cellPadding.top;

        const background = cellBackground(cellStyle, cell);
        if (background) {
          // Draw a generous initial background. It is corrected visually by later content and is good enough
          // for the simple one-column email-table layout used by the POC templates.
          this.page.drawRectangle({
            x: cellX,
            y: Math.max(this.options.margin, this.y - 140),
            width: cellWidth,
            height: Math.min(140, this.y - this.options.margin),
            color: background
          });
        }

        await this.renderChildren(cell, cellStyle, {
          x: cellX + cellPadding.left,
          width: cellWidth - cellPadding.left - cellPadding.right,
          indent: 0
        });
        rowBottom = Math.min(rowBottom, this.y - cellPadding.bottom);
        this.y = savedY;
        cellX += cellWidth;
      }

      this.y = rowBottom;
      this.moveDown(cssLength(node.getAttribute('cellspacing'), 0));
    }
  }

  fontForStyle(style) {
    const key = `${style.fontFamily || ''}:${style.bold ? 700 : 400}:${style.italic ? 'italic' : 'normal'}`;
    if (this.embeddedFonts.has(key)) return this.embeddedFonts.get(key);
    if (style.bold && style.italic) return this.fonts.boldItalic;
    if (style.bold) return this.fonts.bold;
    if (style.italic) return this.fonts.italic;
    return this.fonts.regular;
  }

  async loadFontsFromStyleImports(fragment) {
    const styleTexts = Array.from(fragment.querySelectorAll?.('style') || []).map(node => node.textContent || '');
    for (const styleText of styleTexts) {
      for (const match of styleText.matchAll(/@import\s+url\(['"]?([^'")]+)['"]?\)/gi)) {
        await this.loadFontCss(match[1]);
      }
      await this.loadFontCssText(styleText);
    }
  }

  async loadFontCss(url) {
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      await this.loadFontCssText(await response.text());
    } catch (error) {
      this.warnings.push(`Could not load font CSS ${url}: ${error.message}`);
    }
  }

  async loadFontCssText(cssText) {
    const blocks = cssText.match(/@font-face\s*{[^}]+}/gi) || [];
    for (const block of blocks) {
      const family = /font-family\s*:\s*['"]?([^;'"}]+)['"]?/i.exec(block)?.[1]?.trim();
      const weight = /font-weight\s*:\s*([^;}]+)/i.exec(block)?.[1]?.trim() || '400';
      const style = /font-style\s*:\s*([^;}]+)/i.exec(block)?.[1]?.trim() || 'normal';
      const url = /url\(['"]?([^'")]+)['"]?\)/i.exec(block)?.[1];
      if (!family || !url) continue;
      try {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const bytes = await response.arrayBuffer();
        const font = await this.pdfDoc.embedFont(bytes, { subset: true });
        this.embeddedFonts.set(`${family}:${Number.parseInt(weight, 10) || 400}:${style}`, font);
      } catch (error) {
        this.warnings.push(`Could not embed font ${family} from ${url}: ${error.message}`);
      }
    }
  }
}

function normalizeText(text, preserveWhitespace = false) {
  if (!text) return '';
  const value = text.replace(/\u00a0/g, ' ');
  if (preserveWhitespace) return value.replace(/\t/g, '    ');
  return value.replace(/[ \t\r\n]+/g, ' ');
}

function coalesceRuns(runs) {
  const out = [];
  for (const run of runs) {
    const prev = out[out.length - 1];
    if (!run.br && prev && !prev.br && sameRunStyle(prev.style, run.style)) {
      prev.text += run.text;
    } else if (run.br || run.text) {
      out.push(run);
    }
  }
  return out;
}

function sameRunStyle(a, b) {
  return a.fontSize === b.fontSize && a.bold === b.bold && a.italic === b.italic && a.underline === b.underline && a.color === b.color && a.align === b.align;
}

function wrapRuns(runs, maxWidth, fontForStyle) {
  const lines = [];
  let line = [];
  let lineWidth = 0;

  const pushLine = () => {
    if (line.length) lines.push(line);
    line = [];
    lineWidth = 0;
  };

  for (const run of runs) {
    if (run.br) {
      pushLine();
      continue;
    }

    const tokens = splitTextForWrapping(run.text);
    for (const token of tokens) {
      const text = token;
      if (!text) continue;
      const font = fontForStyle(run.style);
      const width = textWidth(text, font, run.style.fontSize);

      if (text.trim() && line.length && lineWidth + width > maxWidth) {
        pushLine();
      }

      if (!line.length && !text.trim()) continue;
      line.push({ text, style: run.style });
      lineWidth += width;
    }
  }
  pushLine();
  return lines;
}

function splitTextForWrapping(text) {
  return text.split(/(\s+)/).filter(Boolean);
}

function textWidth(text, font, size) {
  return font.widthOfTextAtSize(text, size);
}

function lineHeight(style) {
  return (style.fontSize || 11) * (style.lineHeight || 1.35);
}

function hasBlockChildren(node) {
  return Array.from(node.children || []).some(child => BLOCK_TAGS.has(child.localName.toLowerCase()) || child.localName.toLowerCase() === 'img');
}

function getElementStyle(node) {
  const tagName = node.localName.toLowerCase();
  const css = parseStyle(node.getAttribute('style') || '');
  const style = { css };

  if (tagName === 'strong' || tagName === 'b' || css.fontWeight === 'bold' || Number(css.fontWeight) >= 600) style.bold = true;
  if (tagName === 'em' || tagName === 'i' || css.fontStyle === 'italic') style.italic = true;
  if (tagName === 'u' || css.textDecoration?.includes('underline')) style.underline = true;
  if (css.color) style.color = parseColor(css.color);
  if (css.fontSize) style.fontSize = cssLength(css.fontSize, null) || undefined;
  if (css.lineHeight) style.lineHeight = parseLineHeight(css.lineHeight);
  if (css.textAlign || node.getAttribute('align')) style.align = (css.textAlign || node.getAttribute('align')).toLowerCase();
  if (css.fontFamily) style.fontFamily = css.fontFamily.split(',')[0].replace(/["']/g, '').trim();

  return style;
}

function mergeStyle(parent, child) {
  return {
    ...parent,
    ...child,
    css: { ...(parent.css || {}), ...(child.css || {}) }
  };
}

function parseStyle(styleText) {
  const css = {};
  for (const decl of styleText.split(';')) {
    const index = decl.indexOf(':');
    if (index === -1) continue;
    const key = decl.slice(0, index).trim().replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const value = decl.slice(index + 1).trim();
    if (key) css[key] = value;
  }
  return css;
}

function cssLength(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'number') return value * PX_TO_PT;
  const trimmed = String(value).trim();
  if (trimmed.endsWith('px')) return Number.parseFloat(trimmed) * PX_TO_PT;
  if (trimmed.endsWith('pt')) return Number.parseFloat(trimmed);
  if (trimmed.endsWith('%')) return fallback;
  const number = Number.parseFloat(trimmed);
  return Number.isFinite(number) ? number * PX_TO_PT : fallback;
}

function parseLineHeight(value) {
  const trimmed = String(value).trim();
  if (/^[0-9.]+$/.test(trimmed)) return Number.parseFloat(trimmed);
  const length = cssLength(trimmed, null);
  return length ? length / 11 : undefined;
}

function parseColor(value) {
  const color = String(value).trim();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const r = Number.parseInt(color[1] + color[1], 16) / 255;
    const g = Number.parseInt(color[2] + color[2], 16) / 255;
    const b = Number.parseInt(color[3] + color[3], 16) / 255;
    return rgb(r, g, b);
  }
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    const r = Number.parseInt(color.slice(1, 3), 16) / 255;
    const g = Number.parseInt(color.slice(3, 5), 16) / 255;
    const b = Number.parseInt(color.slice(5, 7), 16) / 255;
    return rgb(r, g, b);
  }
  const rgbMatch = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i.exec(color);
  if (rgbMatch) return rgb(Number(rgbMatch[1]) / 255, Number(rgbMatch[2]) / 255, Number(rgbMatch[3]) / 255);
  return rgb(0.18, 0.18, 0.18);
}

function imageCssWidth(node, style, containerWidth) {
  const css = style.css || {};
  if (css.width?.endsWith('%')) return containerWidth * Number.parseFloat(css.width) / 100;
  const width = cssLength(css.width, null) || cssLength(node.getAttribute('width'), null) || Math.min(160, containerWidth);
  const maxWidth = css.maxWidth?.endsWith('%') ? containerWidth * Number.parseFloat(css.maxWidth) / 100 : cssLength(css.maxWidth, null);
  return Math.min(width, maxWidth || containerWidth, containerWidth);
}

function tableWidth(node, containerWidth) {
  const css = parseStyle(node.getAttribute('style') || '');
  const widthValue = css.width || node.getAttribute('width');
  if (String(widthValue || '').trim().endsWith('%')) return containerWidth * Number.parseFloat(widthValue) / 100;
  return Math.min(cssLength(widthValue, containerWidth), containerWidth);
}

function cssBox(value, fallback = 0) {
  if (!value) return { top: fallback, right: fallback, bottom: fallback, left: fallback };
  const parts = String(value).trim().split(/\s+/).map(part => cssLength(part, fallback));
  if (parts.length === 1) return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
  if (parts.length === 2) return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
  if (parts.length === 3) return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
  return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
}

function cellBackground(style, cell) {
  const css = style.css || {};
  if (css.backgroundColor) return parseColor(css.backgroundColor);
  if (cell.getAttribute('bgcolor')) return parseColor(cell.getAttribute('bgcolor'));
  return null;
}
