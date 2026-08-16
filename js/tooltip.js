let glossaryPromise = null;

export function loadGlossary() {
  if (!glossaryPromise) {
    glossaryPromise = fetch('data/stat-skill-glossary.json').then(res => {
      if (!res.ok) throw new Error('Failed to load stat-skill-glossary.json');
      return res.json();
    });
  }
  return glossaryPromise;
}

function esc(s) {
  const div = document.createElement('div');
  div.textContent = String(s);
  return div.innerHTML;
}

let openTrigger = null;
document.addEventListener('click', e => {
  if (openTrigger && !openTrigger.contains(e.target)) {
    openTrigger.classList.remove('tooltip-open');
    openTrigger = null;
  }
});

export function makeTooltip(labelText, description) {
  const trigger = document.createElement('span');
  trigger.className = 'tooltip-trigger';

  const labelSpan = document.createElement('span');
  labelSpan.textContent = labelText;
  trigger.appendChild(labelSpan);

  if (description) {
    trigger.tabIndex = 0;
    const bubble = document.createElement('span');
    bubble.className = 'tooltip-bubble';
    bubble.innerHTML = esc(description);
    trigger.appendChild(bubble);

    trigger.addEventListener('click', e => {
      e.stopPropagation();
      const wasOpen = trigger.classList.contains('tooltip-open');
      if (openTrigger && openTrigger !== trigger) {
        openTrigger.classList.remove('tooltip-open');
      }
      trigger.classList.toggle('tooltip-open', !wasOpen);
      openTrigger = trigger.classList.contains('tooltip-open') ? trigger : null;
    });
  }

  return trigger;
}
