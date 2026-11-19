(() => {
  const root = document.documentElement;
  const screen = document.querySelector('.launch-screen');
  const hero = document.querySelector('.hero');
  const mast = hero?.querySelector('.hero-mast');
  const portrait = hero?.querySelector('.portrait img');
  const replay = document.querySelector('button[data-replay-intro]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const minimum = 660;
  const loadingLimit = 1240;
  const exitLimit = 550;
  let activeLaunch;
  let typingLayer;
  let typingTimer;

  function clearTyping() {
    clearTimeout(typingTimer);
    typingLayer?.remove();
    typingLayer = undefined;
  }

  function typeLine(line, timeline, delay, pace) {
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const node of nodes) {
      const letters = document.createElement('span');
      letters.className = 'hero-type-run';
      for (const character of node.data) {
        if (/\s/u.test(character)) {
          letters.append(character);
          delay += pace / 2;
          continue;
        }
        const glyph = document.createElement('span');
        glyph.className = 'hero-type-glyph';
        glyph.textContent = character;
        letters.append(glyph);
        timeline.push({ glyph, at: delay });
        delay += character === '/' ? pace + 52 : pace;
      }
      node.replaceWith(letters);
    }
    return delay;
  }

  function typeMasthead() {
    if (!mast || reducedMotion.matches) return;

    clearTyping();
    typingLayer = document.createElement('div');
    typingLayer.className = 'hero-typing';
    typingLayer.hidden = true;
    typingLayer.setAttribute('aria-hidden', 'true');
    const kicker = mast.querySelector('.hero-kicker').cloneNode(true);
    const name = mast.querySelector('h1').cloneNode(true);
    name.removeAttribute('id');
    const timeline = [];
    const nameStart = typeLine(kicker, timeline, 370, 22) + 100;
    const finish = typeLine(name, timeline, nameStart, 63) + 220;
    typingLayer.append(kicker, name);
    mast.append(typingLayer);

    const startedAt = performance.now();
    let next = 0;
    let cursor;
    function tick() {
      const elapsed = performance.now() - startedAt;
      while (timeline[next]?.at <= elapsed) {
        cursor?.classList.remove('has-type-caret');
        cursor = timeline[next++].glyph;
        cursor.classList.add('is-typed', 'has-type-caret');
      }
      if (elapsed >= finish) clearTyping();
      else typingTimer = setTimeout(tick, Math.ceil((timeline[next]?.at ?? finish) - elapsed));
    }
    tick();
  }

  function clearLaunch() {
    if (activeLaunch) {
      clearTimeout(activeLaunch.minimumTimer);
      clearTimeout(activeLaunch.loadingTimer);
      clearTimeout(activeLaunch.exitTimer);
      activeLaunch.events.abort();
      activeLaunch = undefined;
    }
    root.classList.remove('has-launch', 'launch-leaving');
    delete root.dataset.launchStart;
  }

  function skipIntro() {
    clearLaunch();
    clearTyping();
  }

  function endLaunch(launch) {
    if (activeLaunch !== launch || root.classList.contains('launch-leaving')) return;

    root.classList.add('launch-leaving');
    typeMasthead();
    launch.exitTimer = setTimeout(clearLaunch, exitLimit);
  }

  function playLaunch(startedAt, waitForAssets) {
    if (!screen || reducedMotion.matches || activeLaunch) return;

    const launch = { events: new AbortController() };
    activeLaunch = launch;
    root.classList.add('has-launch');

    const remaining = duration => Math.max(0, startedAt + duration - performance.now());
    const listening = { signal: launch.events.signal };
    const dismissOnInput = { ...listening, capture: true, passive: true };

    for (const event of ['keydown', 'pointerdown', 'wheel', 'hashchange']) {
      window.addEventListener(event, skipIntro, dismissOnInput);
    }

    screen.addEventListener('transitionend', event => {
      if (event.target === screen && event.propertyName === 'clip-path') clearLaunch();
    }, listening);

    launch.loadingTimer = setTimeout(() => endLaunch(launch), remaining(loadingLimit));

    const portraitReady = waitForAssets && portrait?.decode?.().catch(() => {});
    const fontsReady = waitForAssets && document.fonts?.ready;
    Promise.allSettled([portraitReady, fontsReady]).then(() => {
      if (activeLaunch !== launch || root.classList.contains('launch-leaving')) return;

      launch.minimumTimer = setTimeout(() => endLaunch(launch), remaining(minimum));
    });
  }

  function syncMotionPreference() {
    if (reducedMotion.matches || !screen) skipIntro();
    if (replay) replay.hidden = reducedMotion.matches || !screen;
  }

  if (root.classList.contains('has-launch')) {
    const startedAt = Number(root.dataset.launchStart);
    playLaunch(Number.isFinite(startedAt) ? startedAt : performance.now(), true);
  }

  syncMotionPreference();
  reducedMotion.addEventListener?.('change', syncMotionPreference);
  window.addEventListener('pagehide', skipIntro);
  replay?.addEventListener('click', () => {
    if (activeLaunch) return;

    clearTyping();
    hero?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
    playLaunch(performance.now(), false);
  });
})();
