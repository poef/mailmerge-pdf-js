const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

const RAW_TEXT_ELEMENTS = new Set(['script', 'style']);

export class TemplateValidationError extends Error {
  constructor(errors) {
    super(errors.map(error => `${error.message}${error.location ? ` (${formatLocation(error.location)})` : ''}`).join('\n'));
    this.name = 'TemplateValidationError';
    this.errors = errors;
  }
}

function formatLocation(location) {
  return `line ${location.line}, column ${location.column}`;
}

function lineColumn(source, index) {
  const before = source.slice(0, index);
  const lines = before.split(/\r\n|\n|\r/);
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

function findTagEnd(source, start) {
  let quote = null;
  for (let i = start + 1; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '>') return i;
  }
  return -1;
}

function findRawTextEnd(source, tagName, from) {
  const close = `</${tagName}`;
  return source.toLowerCase().indexOf(close, from);
}

export function validateHtmlSyntax(source) {
  const errors = [];
  const stack = [];
  let index = 0;

  while (index < source.length) {
    const open = source.indexOf('<', index);
    if (open === -1) break;

    if (source.startsWith('<!--', open)) {
      const end = source.indexOf('-->', open + 4);
      if (end === -1) {
        errors.push({
          type: 'invalid-html',
          message: 'Unclosed HTML comment.',
          location: lineColumn(source, open),
          suggestion: 'Close the comment with -->.'
        });
        break;
      }
      index = end + 3;
      continue;
    }

    if (/^<!doctype\s/i.test(source.slice(open, open + 10))) {
      const end = findTagEnd(source, open);
      if (end === -1) {
        errors.push({
          type: 'invalid-html',
          message: 'Unclosed doctype declaration.',
          location: lineColumn(source, open)
        });
        break;
      }
      index = end + 1;
      continue;
    }

    const end = findTagEnd(source, open);
    if (end === -1) {
      errors.push({
        type: 'invalid-html',
        message: 'Unclosed HTML tag.',
        location: lineColumn(source, open),
        suggestion: 'Add the missing > for this tag.'
      });
      break;
    }

    const rawTag = source.slice(open, end + 1);
    if (rawTag.includes('<!--')) {
      errors.push({
        type: 'invalid-html',
        message: 'Comments are not allowed inside an opening tag.',
        location: lineColumn(source, open),
        excerpt: rawTag,
        suggestion: 'Move the comment before or after the element.'
      });
    }

    const closing = /^<\s*\//.test(rawTag);
    const match = rawTag.match(/^<\s*\/?\s*([a-zA-Z][a-zA-Z0-9:-]*)\b/);
    if (!match) {
      errors.push({
        type: 'invalid-html',
        message: `Invalid tag syntax: ${rawTag.slice(0, 40)}${rawTag.length > 40 ? '…' : ''}`,
        location: lineColumn(source, open)
      });
      index = end + 1;
      continue;
    }

    const tagName = match[1].toLowerCase();
    const selfClosing = /\/\s*>$/.test(rawTag) || VOID_ELEMENTS.has(tagName);

    if (closing) {
      const expected = stack.pop();
      if (!expected) {
        errors.push({
          type: 'invalid-html',
          message: `Unexpected closing tag </${tagName}>.`,
          location: lineColumn(source, open)
        });
      } else if (expected.tagName !== tagName) {
        errors.push({
          type: 'invalid-html',
          message: `Expected closing tag </${expected.tagName}> but found </${tagName}>.`,
          location: lineColumn(source, open),
          suggestion: `Close <${expected.tagName}> before closing <${tagName}>.`
        });
      }
      index = end + 1;
      continue;
    }

    const parent = stack[stack.length - 1]?.tagName;
    if ((parent === 'ul' || parent === 'ol') && tagName !== 'li') {
      errors.push({
        type: 'invalid-html',
        message: `<${parent}> may only contain <li> elements directly; found <${tagName}>.`,
        location: lineColumn(source, open),
        suggestion: `Move <${tagName}> inside the preceding <li> or close the list before it.`
      });
    }

    if (!selfClosing) {
      stack.push({ tagName, location: lineColumn(source, open) });
      if (RAW_TEXT_ELEMENTS.has(tagName)) {
        const rawEnd = findRawTextEnd(source, tagName, end + 1);
        if (rawEnd === -1) {
          errors.push({
            type: 'invalid-html',
            message: `Missing closing tag </${tagName}>.`,
            location: lineColumn(source, open)
          });
          break;
        }
        index = rawEnd;
        continue;
      }
    }

    index = end + 1;
  }

  while (stack.length) {
    const { tagName, location } = stack.pop();
    errors.push({
      type: 'invalid-html',
      message: `Missing closing tag </${tagName}>.`,
      location
    });
  }

  return errors;
}

export const pdfTemplatePolicy = {
  elements: new Set([
    'html', 'head', 'body', 'meta', 'title', 'style',
    'div', 'p', 'span', 'strong', 'b', 'em', 'i', 'u', 'br', 'a', 'img',
    'h1', 'h2', 'h3', 'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th'
  ]),
  globalAttributes: new Set(['class', 'style', 'title', 'align']),
  attributes: {
    meta: new Set(['charset', 'name', 'content']),
    a: new Set(['href', 'target', 'class', 'style', 'title']),
    img: new Set(['src', 'alt', 'width', 'height', 'style', 'align', 'class', 'title']),
    table: new Set(['width', 'cellpadding', 'cellspacing', 'border', 'align', 'style', 'class']),
    td: new Set(['align', 'valign', 'bgcolor', 'colspan', 'rowspan', 'width', 'style', 'class']),
    th: new Set(['align', 'valign', 'bgcolor', 'colspan', 'rowspan', 'width', 'style', 'class']),
    p: new Set(['style', 'class', 'align']),
    span: new Set(['style', 'class', 'data-teams'])
  },
  ignoredAttributes: [/^ar:/i],
  placeholderPattern: /\{[a-zA-Z_][a-zA-Z0-9_]*\}/g
};

function isIgnoredAttribute(name, policy) {
  return policy.ignoredAttributes.some(pattern => pattern.test(name));
}

function isAllowedAttribute(elementName, attributeName, policy) {
  if (attributeName.startsWith('data-')) return true;
  if (/^on/i.test(attributeName)) return false;
  if (policy.globalAttributes.has(attributeName)) return true;
  return policy.attributes[elementName]?.has(attributeName) || false;
}

function isDangerousUrl(value) {
  return /^\s*javascript:/i.test(value || '');
}

function sanitizeAndValidateNode(node, errors, policy) {
  if (node.nodeType === Node.COMMENT_NODE) {
    node.remove();
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const elementName = node.localName.toLowerCase();
  if (!policy.elements.has(elementName)) {
    errors.push({
      type: 'unsupported-element',
      message: `Unsupported element <${elementName}>.`,
      location: null,
      suggestion: 'Add this element to the PDF-template policy or remove it from the template.'
    });
    return;
  }

  for (const attribute of Array.from(node.attributes)) {
    const name = attribute.name.toLowerCase();
    const value = attribute.value;

    if (isIgnoredAttribute(name, policy)) {
      node.removeAttribute(attribute.name);
      continue;
    }

    if (!isAllowedAttribute(elementName, name, policy)) {
      errors.push({
        type: 'unsupported-attribute',
        message: `Unsupported attribute ${attribute.name} on <${elementName}>.`,
        suggestion: name.startsWith('on') ? 'Event-handler attributes are not allowed in PDF templates.' : 'Add this attribute to the PDF-template policy if it is safe and needed.'
      });
      continue;
    }

    if ((name === 'href' || name === 'src') && isDangerousUrl(value)) {
      errors.push({
        type: 'unsafe-url',
        message: `Unsafe ${name} URL on <${elementName}>.`,
        suggestion: 'Only http(s), relative, data:image, and mailto URLs should be used.'
      });
    }
  }

  for (const child of Array.from(node.childNodes)) {
    sanitizeAndValidateNode(child, errors, policy);
  }
}

function collectPlaceholdersFromNode(node, fields, pattern) {
  if (node.nodeType === Node.TEXT_NODE) {
    for (const match of node.textContent.matchAll(pattern)) {
      fields.add(match[0].slice(1, -1));
    }
    return;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    for (const attribute of Array.from(node.attributes)) {
      for (const match of attribute.value.matchAll(pattern)) {
        fields.add(match[0].slice(1, -1));
      }
    }
  }

  for (const child of Array.from(node.childNodes)) {
    collectPlaceholdersFromNode(child, fields, pattern);
  }
}

function fillPlaceholdersInNode(node, data, pattern) {
  const replace = value => value.replace(pattern, token => {
    const key = token.slice(1, -1);
    if (Object.prototype.hasOwnProperty.call(data, key)) return String(data[key]);
    return token;
  });

  if (node.nodeType === Node.TEXT_NODE) {
    node.textContent = replace(node.textContent);
    return;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    for (const attribute of Array.from(node.attributes)) {
      node.setAttribute(attribute.name, replace(attribute.value));
    }
  }

  for (const child of Array.from(node.childNodes)) {
    fillPlaceholdersInNode(child, data, pattern);
  }
}

export function parseTemplate(source, options = {}) {
  const policy = { ...pdfTemplatePolicy, ...options.policy };
  const syntaxErrors = validateHtmlSyntax(source);
  if (syntaxErrors.length) throw new TemplateValidationError(syntaxErrors);

  const template = document.createElement('template');
  template.innerHTML = source;

  const validationErrors = [];
  for (const child of Array.from(template.content.childNodes)) {
    sanitizeAndValidateNode(child, validationErrors, policy);
  }
  if (validationErrors.length) throw new TemplateValidationError(validationErrors);

  const fields = new Set();
  collectPlaceholdersFromNode(template.content, fields, policy.placeholderPattern);

  return {
    fields: () => Array.from(fields).sort(),
    fragment: () => template.content.cloneNode(true),
    renderFragment(data = {}) {
      const fragment = template.content.cloneNode(true);
      fillPlaceholdersInNode(fragment, data, policy.placeholderPattern);
      return fragment;
    }
  };
}
