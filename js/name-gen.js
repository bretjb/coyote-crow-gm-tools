let cachedData = null;

export async function loadNameData() {
  if (cachedData) return cachedData;
  const res = await fetch('data/names.json');
  if (!res.ok) throw new Error('offline');
  cachedData = await res.json();
  cachedData._used = {};
  return cachedData;
}

export function generateName(data) {
  const keys = Object.keys(data.lists);
  if (keys.length > 0) {
    const key = keys[Math.floor(Math.random() * keys.length)];
    const all = data.lists[key];
    if (!data._used[key]) data._used[key] = [];
    const unused = all.filter(n => !data._used[key].includes(n));
    if (unused.length > 0) {
      const name = unused[Math.floor(Math.random() * unused.length)];
      data._used[key].push(name);
      return name;
    }
  }
  return _procedural(data.syllables);
}

function _procedural(syl) {
  const pick = arr => arr.length ? arr[Math.floor(Math.random() * arr.length)] : '';
  return [pick(syl.prefix), pick(syl.middle), pick(syl.suffix)].join('');
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
