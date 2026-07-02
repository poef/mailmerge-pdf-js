import { parseTemplate, renderMailMergePdf, downloadPdf, TemplateValidationError } from './mailmerge-pdf.js';

const templates = [
  {
    id: 'demeerscholen',
    label: 'Farel / De Meer Scholen',
    url: './templates/demeerscholen.html',
    output: 'farel-account.pdf'
  },
  {
    id: 'simant-fixed',
    label: 'Simant account activeren — fixed HTML',
    url: './templates/simant.fixed.html',
    output: 'simant-account.pdf'
  },
  {
    id: 'simant-original',
    label: 'Simant original — expected validation failure',
    url: './templates/simant.original.html',
    output: 'simant-original.pdf',
    expectFailure: true
  },
  {
    id: 'demeerwaarde-original',
    label: 'De Meerwaarde original — expected validation failure',
    url: './templates/demeerwaarde.original.html',
    output: 'demeerwaarde-original.pdf',
    expectFailure: true
  },
  {
    id: 'demeerwaarde-fixed',
    label: 'De Meerwaarde — fixed nested lists',
    url: './templates/demeerwaarde.fixed.html',
    output: 'demeerwaarde-account.pdf'
  }
];

const sampleRows = [
  {
    datum: new Intl.DateTimeFormat('nl-NL', { dateStyle: 'long' }).format(new Date()),
    roepnaam: 'Sam',
    voornaam: 'Sam',
    naam: 'Sam Voorbeeld',
    loginAlias: 's.voorbeeld',
    pincode: '123456',
    schoolnaam: 'Voorbeeldschool',
    primaryEmail: 's.voorbeeld@school.example',
    generatedPassword: 'Welkom#2026'
  },
  {
    datum: new Intl.DateTimeFormat('nl-NL', { dateStyle: 'long' }).format(new Date()),
    roepnaam: 'Nora',
    voornaam: 'Nora',
    naam: 'Nora Demo',
    loginAlias: 'n.demo',
    pincode: '987654',
    schoolnaam: 'Voorbeeldschool',
    primaryEmail: 'n.demo@school.example',
    generatedPassword: 'Start#2026'
  }
];

const state = {
  template: templates[0],
  source: ''
};

const $ = selector => document.querySelector(selector);

function showMessage(message, type = 'info') {
  const box = $('#message');
  box.className = `message ${type}`;
  box.textContent = message;
}

function showValidation(error) {
  const box = $('#validation');
  if (!(error instanceof TemplateValidationError)) {
    box.textContent = error.stack || error.message;
    return;
  }
  box.innerHTML = '';
  for (const item of error.errors) {
    const li = document.createElement('li');
    li.textContent = [
      item.message,
      item.location ? `line ${item.location.line}, column ${item.location.column}` : '',
      item.suggestion ? `Suggestion: ${item.suggestion}` : ''
    ].filter(Boolean).join(' — ');
    box.append(li);
  }
}

async function loadTemplate(template) {
  state.template = template;
  const response = await fetch(template.url);
  state.source = await response.text();
  $('#source').value = state.source;
  $('#validation').textContent = '';

  try {
    const parsed = parseTemplate(state.source);
    showMessage(`Template accepted. Fields: ${parsed.fields().join(', ') || 'none'}`, 'success');
  } catch (error) {
    showMessage(template.expectFailure ? 'Template failed validation as expected.' : 'Template failed validation.', template.expectFailure ? 'warning' : 'error');
    showValidation(error);
  }
}

async function renderSelected() {
  const source = $('#source').value;
  $('#validation').textContent = '';
  showMessage('Rendering PDF…', 'info');

  try {
    const result = await renderMailMergePdf(source, sampleRows, {
      externalResources: $('#externalResources').checked,
      imageFetch: $('#imageFetch').checked
    });
    downloadPdf(result.bytes, state.template.output);
    const warningText = result.warnings.length ? ` Warnings: ${result.warnings.join(' | ')}` : '';
    showMessage(`PDF created. Fields: ${result.fields.join(', ')}.${warningText}`, result.warnings.length ? 'warning' : 'success');
  } catch (error) {
    showMessage('Could not render PDF.', 'error');
    showValidation(error);
  }
}

function initTemplateSelect() {
  const select = $('#templateSelect');
  for (const template of templates) {
    const option = document.createElement('option');
    option.value = template.id;
    option.textContent = template.label;
    select.append(option);
  }
  select.addEventListener('change', () => {
    const template = templates.find(item => item.id === select.value);
    loadTemplate(template);
  });
}

$('#render').addEventListener('click', renderSelected);
$('#validate').addEventListener('click', () => {
  try {
    const parsed = parseTemplate($('#source').value);
    $('#validation').textContent = '';
    showMessage(`Template accepted. Fields: ${parsed.fields().join(', ') || 'none'}`, 'success');
  } catch (error) {
    showMessage('Template failed validation.', 'error');
    showValidation(error);
  }
});

initTemplateSelect();
loadTemplate(templates[0]);
