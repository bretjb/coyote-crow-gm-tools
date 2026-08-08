let loadPromise = null;

export function loadMarked() {
  if (window.marked) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'js/lib/md.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return loadPromise;
}
