import { PDFDocument } from 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm';
import { parseTemplate, TemplateValidationError } from './html-template.js';
import { renderPdfFromFragment } from './pdf-renderer.js';

export { parseTemplate, TemplateValidationError } from './html-template.js';
export { renderPdfFromFragment } from './pdf-renderer.js';

export async function renderTemplatePdf(source, data, options = {}) {
  const template = parseTemplate(source, options);
  const fragment = template.renderFragment(data);
  const result = await renderPdfFromFragment(fragment, options.pdf || options);
  return { ...result, fields: template.fields() };
}

export async function renderMailMergePdf(source, rows, options = {}) {
  const template = parseTemplate(source, options);
  const merged = await PDFDocument.create();
  const warnings = [];

  for (const row of rows) {
    const fragment = template.renderFragment(row);
    const { bytes, warnings: pageWarnings } = await renderPdfFromFragment(fragment, options.pdf || options);
    warnings.push(...pageWarnings);
    const part = await PDFDocument.load(bytes);
    const copiedPages = await merged.copyPages(part, part.getPageIndices());
    for (const page of copiedPages) merged.addPage(page);
  }

  return { bytes: await merged.save(), fields: template.fields(), warnings };
}

export function downloadPdf(bytes, filename = 'mailmerge.pdf') {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
