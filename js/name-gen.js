let cachedData = null;

function buildModel(corpus) {
  const order = 2;
  const ngrams = {};
  const beginnings = [];

  for (let j = 0; j < corpus.length; j++) {
    const txt = corpus[j];
    for (let i = 0; i <= txt.length - order; i++) {
      const gram = txt.substring(i, i + order);
      if (i === 0) {
        beginnings.push(gram);
      }
      if (!ngrams[gram]) {
        ngrams[gram] = [];
      }
      ngrams[gram].push(txt.charAt(i + order));
    }
  }

  return { ngrams, beginnings };
}

export async function loadNameData() {
  if (cachedData) return cachedData;
  const res = await fetch('data/names.json');
  if (!res.ok) throw new Error('offline');
  const json = await res.json();
  const { ngrams, beginnings } = buildModel(json.corpus);
  cachedData = { corpus: json.corpus, ngrams, beginnings };
  return cachedData;
}

function capitalizeWords(str) {
  return str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

function randomInRange(min, max) {
  return Math.floor((Math.random() * (max - min)) + min);
}

export function generateName(data) {
  const order = 2;
  const randomBeginning = Math.floor(Math.random() * data.beginnings.length);
  let currentGram = data.beginnings[randomBeginning];
  let newName = currentGram;
  const randomNumberInRange = randomInRange(4, 12);

  for (let i = 0; i < randomNumberInRange; i++) {
    const possibilities = data.ngrams[currentGram];
    const randPossibility = Math.floor(Math.random() * possibilities.length);
    const next = possibilities[randPossibility];
    newName += next;
    const len = newName.length;
    currentGram = newName.substring(len - order, len);
  }

  return capitalizeWords(newName);
}

const history = [];

export async function init(container) {
  container.innerHTML = `
    <h2 style="margin-bottom:1rem;">Name Generator</h2>
    <button id="gen-name-btn">Generate Name</button>
    <div id="name-result" style="margin:1rem 0;font-size:1.4rem;"></div>
    <div id="name-history" style="color:var(--muted);"></div>
  `;

  let data;
  try {
    data = await loadNameData();
  } catch {
    container.querySelector('#name-result').className = 'error';
    container.querySelector('#name-result').textContent = 'Data unavailable — please reload while online once to enable offline use.';
    return;
  }

  container.querySelector('#gen-name-btn').addEventListener('click', () => {
    const name = generateName(data);
    const resultEl = container.querySelector('#name-result');
    resultEl.innerHTML = '';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = name + ' ';
    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy';
    copyBtn.className = 'secondary';
    copyBtn.style.fontSize = '0.75rem';
    copyBtn.addEventListener('click', () => navigator.clipboard.writeText(name));
    resultEl.appendChild(nameSpan);
    resultEl.appendChild(copyBtn);

    history.unshift(name);
    if (history.length > 5) history.pop();
    const histEl = container.querySelector('#name-history');
    histEl.innerHTML = '<p style="font-size:0.8rem;margin-bottom:0.25rem;">Recent:</p>' +
      history.map(n => `<div>${n}</div>`).join('');
  });
}
