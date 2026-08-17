const CACHE = 'cc-gm-v31';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './assets/fonts/fraunces-variable.woff2',
  './assets/fonts/manrope-variable.woff2',
  './js/app.js',
  './js/dice.js',
  './js/name-gen.js',
  './js/npc-gen.js',
  './js/npc-character-gen.js',
  './js/npc-storage.js',
  './js/tooltip.js',
  './js/character-card.js',
  './js/pc-gen.js',
  './js/pc-storage.js',
  './js/encounter.js',
  './js/npc-pdf-export.js',
  './js/lib/pdf-lib.esm.min.js',
  './js/initiative.js',
  './js/initiative-state.js',
  './js/dice-roller.js',
  './js/rules.js',
  './js/lib/md.js',
  './js/lib/load-marked.js',
  './js/lib/dicebear/core.js',
  './js/lib/dicebear/adventurer.js',
  './data/names.json',
  './data/npc-components.json',
  './data/motivations.json',
  './data/paths.json',
  './data/gifts-burdens.json',
  './data/skills.json',
  './data/abilities.json',
  './data/archetypes.json',
  './data/quirks.json',
  './data/stat-skill-glossary.json',
  './CoyoteCrowCharacterSheet-v1.01.pdf',
  './data/rules/quick-ref.md',
  './data/rules/full-digest.md',
  './icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
