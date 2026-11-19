(() => {
  const explorer = document.querySelector('.credit-explorer');
  if (!explorer) return;

  const quarters = [
    '14Q1', '14Q2', '14Q3', '14Q4', '15Q1', '15Q2', '15Q3',
    '15Q4', '16Q1', '16Q2', '16Q3', '16Q4', '17Q1',
  ];
  // Estimate, lower 95% bound, upper 95% bound, digitized from the source figure.
  const outcomes = {
    live: [
      [-.006, -.027, .015], [.002, -.018, .022], [-.008, -.024, .007],
      [.016, -.001, .033], [-.008, -.016, 0], [0, null, null],
      [.027, .015, .039], [.038, .024, .052], [.071, .051, .090],
      [.067, .047, .087], [.075, .054, .096], [.083, .053, .113],
      [.083, .060, .107],
    ],
    sanctioned: [
      [.042, .015, .071], [.004, -.023, .032], [-.001, -.024, .021],
      [.020, -.005, .045], [-.002, -.017, .013], [0, null, null],
      [.014, .002, .027], [.019, .005, .032], [.039, .020, .059],
      [.038, .017, .059], [.062, .037, .087], [.034, -.003, .071],
      [.065, .038, .092],
    ],
  };
  const phaseLabels = {
    before: 'before the circular',
    from: 'from the circular',
    omitted: 'omitted period, at zero',
  };
  const yTicks = [-.025, 0, .025, .05, .075, .1];
  const plotMin = -.039;
  const plotMax = .122;
  const position = value => 100 * (plotMax - value) / (plotMax - plotMin);
  const format = value => value.toFixed(3).replace('-', '−');
  const phase = index => index < 5 ? 'before' : index === 5 ? 'omitted' : 'from';
  const describe = ([estimate, lower, upper]) => lower === null
    ? `${format(estimate)} · reference period`
    : `${format(estimate)} · 95% CI ${format(lower)} to ${format(upper)}`;

  const picker = explorer.querySelector('[data-credit-quarter]');
  const quarterLabel = explorer.querySelector('[data-credit-active-quarter]');
  const phaseLabel = explorer.querySelector('[data-credit-active-phase]');
  const live = explorer.querySelector('[data-credit-live]');
  const sanctioned = explorer.querySelector('[data-credit-sanctioned]');
  const status = explorer.querySelector('[data-credit-status]');
  let selected = 6;

  function span(className) {
    const element = document.createElement('span');
    element.className = className;
    element.setAttribute('aria-hidden', 'true');
    return element;
  }

  const panelButtons = Array.from(explorer.querySelectorAll('[data-credit-panel]')).map(plot => {
    const series = outcomes[plot.dataset.creditPanel];
    for (const tick of yTicks) {
      const rule = span(`credit-explorer__rule${tick === 0 ? ' is-zero' : ''}`);
      rule.style.top = `${position(tick)}%`;
      const label = span('credit-explorer__y-tick');
      label.textContent = format(tick);
      rule.append(label);
      plot.append(rule);
    }
    for (const boundary of [6, 7]) {
      const guide = span('credit-explorer__guide');
      guide.style.left = `${100 * boundary / quarters.length}%`;
      plot.append(guide);
    }

    const hits = document.createElement('div');
    hits.className = 'credit-explorer__hits';
    plot.append(hits);

    const buttons = series.map(([estimate, lower, upper], index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `credit-explorer__point is-${phase(index)}`;
      button.setAttribute('aria-label', `${quarters[index]}, ${phaseLabels[phase(index)]}. Elasticity ${describe(series[index])}.`);
      button.style.setProperty('--credit-point-position', `${position(estimate)}%`);
      if (lower !== null) {
        const bars = span('credit-explorer__interval');
        bars.style.top = `${position(upper)}%`;
        bars.style.bottom = `${100 - position(lower)}%`;
        button.append(bars);
      }
      button.append(span('credit-explorer__dot'));
      if (index % 4 === 0) {
        const tick = span('credit-explorer__x-tick');
        tick.textContent = quarters[index];
        button.append(tick);
      }
      hits.append(button);

      button.addEventListener('pointerenter', event => {
        if (event.pointerType !== 'touch') display(index);
      });
      button.addEventListener('focus', () => display(index));
      button.addEventListener('click', () => select(index, true));
      return button;
    });

    plot.addEventListener('pointerleave', () => display(selected));
    plot.addEventListener('focusout', event => {
      if (!plot.contains(event.relatedTarget)) display(selected);
    });

    buttons.forEach((button, index) => button.addEventListener('keydown', event => {
      let next;
      switch (event.key) {
        case 'ArrowLeft': next = (index + quarters.length - 1) % quarters.length; break;
        case 'ArrowRight': next = (index + 1) % quarters.length; break;
        case 'Home': next = 0; break;
        case 'End': next = quarters.length - 1; break;
        default: return;
      }
      event.preventDefault();
      select(next);
      buttons[next].focus();
    }));
    return buttons;
  });

  function display(index) {
    for (const buttons of panelButtons) {
      buttons.forEach((button, i) => button.classList.toggle('is-active', i === index));
    }
    quarterLabel.textContent = quarters[index];
    phaseLabel.textContent = phaseLabels[phase(index)];
    live.textContent = describe(outcomes.live[index]);
    sanctioned.textContent = describe(outcomes.sanctioned[index]);
  }

  function select(index, announce = false) {
    selected = index;
    picker.value = String(index);
    for (const buttons of panelButtons) {
      buttons.forEach((button, i) => {
        button.tabIndex = i === index ? 0 : -1;
        button.setAttribute('aria-pressed', String(i === index));
      });
    }
    display(index);
    if (announce) {
      status.textContent = `${quarters[index]}, ${phaseLabels[phase(index)]}. Live accounts ${live.textContent}. Sanctioned amount ${sanctioned.textContent}.`;
    }
  }

  for (const [index, quarter] of quarters.entries()) {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `${quarter}${index === 5 ? ' (omitted)' : ''}`;
    picker.append(option);
  }
  picker.addEventListener('change', () => select(Number(picker.value), true));
  select(selected);
  explorer.hidden = false;
})();
