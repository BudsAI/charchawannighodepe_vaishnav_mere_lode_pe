(() => {
  const root = document.documentElement;
  const screen = document.querySelector('.launch-screen');
  const hero = document.querySelector('.hero');
  const portrait = hero?.querySelector('.portrait img');
  const replay = document.querySelector('button[data-replay-intro]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const minimum = 660;
  const loadingLimit = 1240;
  const exitLimit = 550;
  let activeLaunch;

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

  function endLaunch(launch) {
    if (activeLaunch !== launch || root.classList.contains('launch-leaving')) return;

    root.classList.add('launch-leaving');
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
      window.addEventListener(event, clearLaunch, dismissOnInput);
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
    if (reducedMotion.matches || !screen) clearLaunch();
    if (replay) replay.hidden = reducedMotion.matches || !screen;
  }

  if (root.classList.contains('has-launch')) {
    const startedAt = Number(root.dataset.launchStart);
    playLaunch(Number.isFinite(startedAt) ? startedAt : performance.now(), true);
  }

  syncMotionPreference();
  reducedMotion.addEventListener?.('change', syncMotionPreference);
  window.addEventListener('pagehide', clearLaunch);
  replay?.addEventListener('click', () => {
    if (activeLaunch) return;

    hero?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
    playLaunch(performance.now(), false);
  });
})();
