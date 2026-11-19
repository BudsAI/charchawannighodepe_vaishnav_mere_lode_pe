(() => {
  function selectFrom(buttons, initial, render) {
    let active = initial;
    const select = (index, focus = false) => {
      active = index;
      buttons.forEach((button, position) => {
        button.tabIndex = position === index ? 0 : -1;
        button.setAttribute('aria-pressed', String(position === index));
      });
      render(index);
      if (focus) buttons[index].focus();
    };
    buttons.forEach((button, index) => {
      button.addEventListener('click', () => select(index));
      button.addEventListener('pointerenter', event => {
        if (event.pointerType === 'mouse') select(index);
      });
      button.addEventListener('keydown', event => {
        const right = event.key === 'ArrowRight' || event.key === 'ArrowDown';
        const left = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
        let next;
        if (right || left) next = (active + (right ? 1 : buttons.length - 1)) % buttons.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = buttons.length - 1;
        else return;
        event.preventDefault();
        select(next, true);
      });
    });
    select(initial);
    return select;
  }

  const shrinkage = document.querySelector('.shrinkage-explorer');
  if (shrinkage) {
    // Values printed to one decimal in the source figure, in legend order.
    const estimates = [
      [76.7, 91.9, 73.2, 67.8],
      [65.9, 67.4, 65.0, 57.4],
      [72.0, 79.7, 71.5, 65.4],
      [78.2, 93.8, 76.3, 71.8],
      [83.2, 92.3, 85.6, 80.9],
      [64.9, 69.8, 68.6, 60.5],
    ];
    const picker = shrinkage.querySelector('#forecast-variable');
    const bars = [...shrinkage.querySelectorAll('.shrinkage-explorer__bar')];
    const labels = bars.map(button => button.querySelector('.shrinkage-explorer__method').textContent);
    const result = shrinkage.querySelector('[data-forecast-reading]');
    let variable = picker.selectedIndex;
    let selectedModel = 3;

    function updateGraph() {
      const values = estimates[variable];
      bars.forEach((button, index) => {
        const value = values[index].toFixed(1);
        button.style.setProperty('--bar-size', `${100 * values[index] / 110}%`);
        button.querySelector('.shrinkage-explorer__value').textContent = value;
        button.setAttribute('aria-label', `${labels[index]}, forecast error index ${value}`);
      });
    }

    updateGraph();
    const selectModel = selectFrom(bars, selectedModel, index => {
      selectedModel = index;
      const value = estimates[variable][index];
      const variableName = picker.options[variable].textContent;
      result.textContent = `${variableName} · ${labels[index]} · ${value.toFixed(1)} (${(100 - value).toFixed(1)} points below the benchmark).`;
    });
    picker.addEventListener('change', () => {
      variable = picker.selectedIndex;
      updateGraph();
      selectModel(selectedModel);
    });
    shrinkage.querySelector('.writing-explorer__interactive').hidden = false;
  }

  const trade = document.querySelector('.trade-explorer');
  if (trade) {
    // Rank four is printed in the figure. Other points are digitized from its axis.
    const fit = [35.0, 52.7, 63.0, 70.9, 76.4, 82.8, 84.5, 85.9, 87.3, 88.2];
    const reference = 3;
    const picker = trade.querySelector('#trade-pattern-count');
    const hits = trade.querySelector('.trade-explorer__hits');
    const graph = trade.querySelector('.trade-explorer__lines');
    const valueLabel = trade.querySelector('[data-trade-value]');
    const result = trade.querySelector('[data-trade-reading]');
    const namespace = 'http://www.w3.org/2000/svg';

    function addLine(name, attributes, className) {
      const element = document.createElementNS(namespace, name);
      for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
      element.setAttribute('class', className);
      graph.append(element);
    }

    for (let value = 0; value <= 100; value += 20) {
      const y = 100 - value;
      addLine('line', { x1: 0, y1: y, x2: 100, y2: y }, 'trade-explorer__grid');
    }
    addLine('line', { x1: 35, y1: 100 - fit[reference], x2: 35, y2: 100 }, 'trade-explorer__reference');
    addLine('polyline', { points: fit.map((value, index) => `${5 + 10 * index},${100 - value}`).join(' ') },
      'trade-explorer__trend');

    const buttons = fit.map((value, index) => {
      const count = index + 1;
      const label = count === 1 ? '1 pattern' : `${count} patterns`;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'trade-explorer__point';
      button.setAttribute('aria-label', `${label}, ${index === reference ? '' : 'approximately '}${value.toFixed(1)} percent reconstruction fit`);
      button.style.setProperty('--trade-fit', `${100 - value}%`);
      if (index === reference) button.classList.add('is-reference');
      const marker = document.createElement('span');
      marker.className = 'trade-explorer__dot';
      marker.setAttribute('aria-hidden', 'true');
      button.append(marker);
      hits.append(button);
      picker.append(new Option(label, count));
      return button;
    });

    const selectTrade = selectFrom(buttons, reference, index => {
      const displayedValue = `${index === reference ? '' : '≈'}${fit[index].toFixed(1)}%`;
      valueLabel.textContent = displayedValue;
      picker.selectedIndex = index;
      result.textContent = index === reference
        ? '4 trade patterns · 280 parameters · 70.9% reconstruction fit'
        : `${index + 1} trade ${index === 0 ? 'pattern' : 'patterns'} · approximately ${fit[index].toFixed(1)}% reconstruction fit`;
    });
    picker.addEventListener('change', () => selectTrade(picker.selectedIndex));
    trade.querySelector('.writing-explorer__interactive').hidden = false;
  }
})();
