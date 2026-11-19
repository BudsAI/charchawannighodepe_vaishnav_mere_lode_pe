const themeSwitch = document.querySelector('.theme-switch');

if (themeSwitch) {
  const root = document.documentElement;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const storageKey = 'vaishnav-theme';
  let preference;

  try { preference = localStorage.getItem(storageKey); } catch {}

  function updateTheme() {
    const theme = preference === 'light' ? 'light' : 'dark';
    const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

    root.dataset.theme = theme;
    themeColor.content = theme === 'dark' ? '#101116' : '#f3f1e8';
    themeSwitch.setAttribute('aria-label', label);
    themeSwitch.title = label;
  }

  themeSwitch.addEventListener('click', () => {
    preference = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(storageKey, preference); } catch {}
    updateTheme();
  });

  window.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    preference = event.newValue;
    updateTheme();
  });
  updateTheme();
  themeSwitch.hidden = false;
}

const figureDialog = document.querySelector('.figure-dialog');

if (typeof figureDialog?.showModal === 'function') {
  const dialogImage = figureDialog.querySelector('img');
  const dialogCaption = figureDialog.querySelector('.figure-dialog-caption');
  const dialogTitle = figureDialog.querySelector('h2');

  for (const link of document.querySelectorAll('.figure-link')) {
    link.setAttribute('aria-haspopup', 'dialog');
    link.addEventListener('click', event => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

      const preview = link.querySelector('img');
      const figure = link.closest('figure');
      const title = link.closest('article')?.querySelector('h3');

      event.preventDefault();
      dialogImage.src = link.href;
      dialogImage.alt = preview.alt;
      dialogCaption.textContent = figure.querySelector('figcaption')?.textContent ?? '';
      dialogTitle.textContent = title?.textContent ?? 'Research figure';
      figureDialog.showModal();
      figureDialog.scrollTop = 0;
    });
  }

  figureDialog.addEventListener('click', event => {
    if (event.target !== figureDialog) return;
    const { left, right, top, bottom } = figureDialog.getBoundingClientRect();
    if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) {
      figureDialog.close();
    }
  });
}

const navigation = document.querySelector('.site-nav');
const header = document.querySelector('.site-header');
const progress = document.querySelector('.reading-progress');

if (navigation && header && progress) {
  const links = [...navigation.querySelectorAll('a')];
  const sections = links.map(link => document.querySelector(link.hash));
  let requested = false;
  let currentIndex = -1;

  function updatePosition() {
    requested = false;
    const readingLine = header.offsetHeight + window.innerHeight * 0.16;
    const total = document.documentElement.scrollHeight - window.innerHeight;
    const fraction = total > 0 ? Math.max(0, Math.min(1, window.scrollY / total)) : 0;
    let index = -1;

    if (fraction >= 0.999) {
      index = links.length - 1;
    } else {
      for (const [position, section] of sections.entries()) {
        if (section.getBoundingClientRect().top <= readingLine) index = position;
      }
    }

    progress.style.transform = `scaleX(${fraction})`;
    if (index === currentIndex) return;

    links[currentIndex]?.removeAttribute('aria-current');
    links[index]?.setAttribute('aria-current', 'location');
    currentIndex = index;
  }

  function requestPositionUpdate() {
    if (requested) return;
    requested = true;
    requestAnimationFrame(updatePosition);
  }

  window.addEventListener('scroll', requestPositionUpdate, { passive: true });
  window.addEventListener('resize', requestPositionUpdate);
  window.addEventListener('hashchange', requestPositionUpdate);
  window.addEventListener('load', requestPositionUpdate, { once: true });
  if ('ResizeObserver' in window) new ResizeObserver(requestPositionUpdate).observe(document.querySelector('main'));
  updatePosition();
}
