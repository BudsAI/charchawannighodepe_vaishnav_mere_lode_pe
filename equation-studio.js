(() => {
  const studio = document.querySelector('[data-equation-studio]');
  if (!studio || !window.PortfolioPlot || !window.PortfolioEquations) return;

  const canvas = studio.querySelector('.portrait-field');
  const viewport = studio.querySelector('[data-equation-viewport]');
  const interests = studio.querySelector('[data-fourier-interests]');
  const controls = studio.querySelector('.equation-controls');
  const scene = studio.querySelector('[data-equation-scene]');
  const input = studio.querySelector('#curve-expression');
  const message = studio.querySelector('#equation-message');
  const viewReset = studio.querySelector('[data-equation-reset]');
  const dragLabel = studio.querySelector('[data-equation-drag-label]');
  const presets = [...studio.querySelectorAll('[data-equation-preset]')];
  if (!canvas.getContext('2d')) return;

  const plot = window.PortfolioPlot.create(canvas, {
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)')
  });

  function selectPreset(value) {
    for (const button of presets) {
      button.setAttribute('aria-pressed', String(button.dataset.equationPreset === value));
    }
  }

  function setMessage(text, error = false) {
    message.classList.toggle('is-quiet', !error);
    message.textContent = text;
    input.setAttribute('aria-invalid', String(error));
  }

  function setView(view, title) {
    const showPlot = view === 'plot';
    viewport.dataset.equationView = view;
    scene.textContent = title;
    canvas.tabIndex = showPlot ? 0 : -1;
    canvas.setAttribute('aria-hidden', String(!showPlot));
    interests.setAttribute('aria-hidden', String(showPlot));
    dragLabel.hidden = !showPlot;
    viewReset.hidden = !showPlot;
    interests.dispatchEvent(new Event(showPlot ? 'fourier:pause' : 'fourier:play'));
  }

  function showInterests() {
    input.value = '';
    setView('interests', 'Research interests');
    selectPreset('interests');
    setMessage('Research interests displayed.');
  }

  function drawEquation(source) {
    try {
      const { paths, kind } = window.PortfolioEquations.plot(source);
      const title = kind === 'surface' ? '3D surface' : 'Equation curve';
      plot.show(paths, { kind });
      setView('plot', title);
      selectPreset(source);
      setMessage(`${title} plotted.`);
    } catch (error) {
      setMessage(error.message || 'Check the equation and try again.', true);
    }
  }

  studio.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    drawEquation(input.value.trim());
  });
  input.addEventListener('input', () => {
    if (input.getAttribute('aria-invalid') === 'true') setMessage('');
  });
  viewReset.addEventListener('click', () => plot.resetView());
  for (const button of presets) {
    button.addEventListener('click', () => {
      const value = button.dataset.equationPreset;
      if (value === 'interests') {
        showInterests();
      } else {
        input.value = value;
        drawEquation(value);
      }
    });
  }
  controls.hidden = false;
})();
