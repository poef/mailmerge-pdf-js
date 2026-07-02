import { generateMailmergePdf } from "./mailmerge-pdf.js";

const demoPeople = [
  {
    id: "p1",
    name: "Sanne de Vries",
    parentName: "mevrouw De Vries",
    childName: "Mila",
    address: "Stationsstraat 12\n3511 AB Utrecht",
    schoolName: "Demo School",
    eventName: "kennismakingsmiddag",
    eventDate: "12 september 2026",
    senderName: "Team Demo School"
  },
  {
    id: "p2",
    name: "Jeroen Bakker",
    parentName: "meneer Bakker",
    childName: "Noah",
    address: "Lindelaan 44\n9721 CX Groningen",
    schoolName: "Demo School",
    eventName: "kennismakingsmiddag",
    eventDate: "12 september 2026",
    senderName: "Team Demo School"
  },
  {
    id: "p3",
    name: "Chloë van den Berg",
    parentName: "mevrouw Van den Berg",
    childName: "Eline",
    address: "Kerkplein 3\n6211 LE Maastricht",
    schoolName: "Demo School",
    eventName: "kennismakingsmiddag",
    eventDate: "12 september 2026",
    senderName: "Team Demo School"
  }
];

const defaultTemplate = String.raw`<img src="school-logo" class="logo">

<h1>Uitnodiging voor {{childName}}</h1>

<p>{{address}}</p>

<p>Beste {{parentName}},</p>

<p>
  Hierbij nodigen wij {{childName}} van harte uit voor onze <strong>{{eventName}}</strong>
  op <strong>{{eventDate}}</strong>.
</p>

<p>
  Tijdens deze middag maken de kinderen kennis met de school, de klas en de leerkrachten.
  Ouders krijgen tegelijk praktische informatie over de start van het schooljaar.
</p>

<p>
  Wilt u deze brief meenemen op de dag zelf? Dan kunnen wij de aanmelding snel controleren.
</p>

<p>
  Met vriendelijke groet,<br>
  <strong>{{senderName}}</strong><br>
  {{schoolName}}
</p>`;

const demoLogoBase64 = "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";

const peopleList = document.querySelector("#peopleList");
const templateInput = document.querySelector("#templateInput");
const logoInput = document.querySelector("#logoInput");
const generateButton = document.querySelector("#generateButton");
const status = document.querySelector("#status");

templateInput.value = defaultTemplate;
renderPeopleList();

generateButton.addEventListener("click", async () => {
  generateButton.disabled = true;
  status.textContent = "Generating PDF...";

  try {
    const selectedPeople = getSelectedPeople();
    const logoAsset = await getLogoAsset();
    const pdfBytes = await generateMailmergePdf({
      templateHtml: templateInput.value,
      people: selectedPeople,
      assets: {
        "school-logo": logoAsset
      }
    });

    downloadBytes(pdfBytes, "mailmerge-demo.pdf", "application/pdf");
    status.textContent = `Downloaded PDF for ${selectedPeople.length} person(s).`;
  } catch (error) {
    console.error(error);
    status.textContent = error.message;
  } finally {
    generateButton.disabled = false;
  }
});

function renderPeopleList() {
  peopleList.innerHTML = "";
  for (const person of demoPeople) {
    const label = document.createElement("label");
    label.className = "person-option";
    label.innerHTML = `
      <input type="checkbox" name="person" value="${person.id}" checked>
      <span><strong>${person.name}</strong> - ${person.childName}, ${person.address.replace("\n", ", ")}</span>
    `;
    peopleList.append(label);
  }
}

function getSelectedPeople() {
  const ids = [...document.querySelectorAll('input[name="person"]:checked')]
    .map((input) => input.value);
  return demoPeople.filter((person) => ids.includes(person.id));
}

async function getLogoAsset() {
  const file = logoInput.files[0];
  if (file) {
    return {
      bytes: new Uint8Array(await file.arrayBuffer()),
      mimeType: file.type
    };
  }

  return {
    bytes: base64ToBytes(demoLogoBase64),
    mimeType: "image/png"
  };
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function downloadBytes(bytes, filename, mimeType) {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
