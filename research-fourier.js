(() => {
  const letterforms = window.ResearchLetterforms;
  if (!letterforms?.glyphs || !(letterforms.unitsPerEm > 0)) return;

  const { unitsPerEm, glyphs } = letterforms;
  const root = document.documentElement;
  const twoPi = Math.PI * 2;
  const duration = 2680;
  const rowDuration = 1340;
  const traceDuration = 510;
  const fillDuration = 300;
  const glyphCache = new Map();

  function clamp01(value) {
    return Math.max(0, Math.min(value, 1));
  }

  function reconstruct(contour) {
    const first = contour[0];
    const last = contour[contour.length - 1];
    const closed = first[0] === last[0] && first[1] === last[1];
    const count = contour.length - Number(closed);
    if (count < 3) return null;

    // Treat each outline as samples of z(t) = x(t) + iy(t).
    const coefficients = [];
    for (let bin = 0; bin < count; bin++) {
      const frequency = bin <= count / 2 ? bin : bin - count;
      let real = 0;
      let imaginary = 0;

      for (let index = 0; index < count; index++) {
        const phase = -twoPi * frequency * index / count;
        const [x, y] = contour[index];
        const cosine = Math.cos(phase);
        const sine = Math.sin(phase);
        real += x * cosine - y * sine;
        imaginary += x * sine + y * cosine;
      }
      coefficients.push({ frequency, real: real / count, imaginary: imaginary / count });
    }

    const resolution = Math.max(36, count * 2);
    const points = new Float32Array((resolution + 1) * 2);
    for (let index = 0; index < resolution; index++) {
      let x = 0;
      let y = 0;
      for (const { frequency, real, imaginary } of coefficients) {
        const phase = twoPi * frequency * index / resolution;
        const cosine = Math.cos(phase);
        const sine = Math.sin(phase);
        x += real * cosine - imaginary * sine;
        y += real * sine + imaginary * cosine;
      }
      points[2 * index] = x;
      points[2 * index + 1] = y;
    }
    points[2 * resolution] = points[0];
    points[2 * resolution + 1] = points[1];
    return points;
  }

  function glyph(character) {
    if (glyphCache.has(character)) return glyphCache.get(character);

    let definition = glyphs[character];
    if (!definition && character === ' ') definition = { advance: .27 * unitsPerEm, contours: [] };
    if (!definition) return null;

    const prepared = {
      advance: definition.advance,
      contours: definition.contours.filter(contour => contour.length >= 3).map(reconstruct).filter(Boolean),
    };
    glyphCache.set(character, prepared);
    return prepared;
  }

  function measure(text, scale) {
    let width = 0;
    for (const character of text) width += (glyph(character).advance + .004 * unitsPerEm) * scale;
    return width;
  }

  function wrap(phrase, width, scale) {
    const lines = [];
    let line = '';
    let lineWidth = 0;
    const spaceWidth = measure(' ', scale);

    for (const word of phrase.split(/\s+/)) {
      const wordWidth = measure(word, scale);
      if (line && lineWidth + spaceWidth + wordWidth > width) {
        lines.push(line);
        line = word;
        lineWidth = wordWidth;
      } else {
        lineWidth += (line ? spaceWidth : 0) + wordWidth;
        line += line ? ` ${word}` : word;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function transform(contours, x, baseline, scale) {
    return contours.map(points => {
      const scaled = new Float32Array(points.length);
      for (let index = 0; index < points.length; index += 2) {
        scaled[index] = x + points[index] * scale;
        scaled[index + 1] = baseline - points[index + 1] * scale;
      }
      return scaled;
    });
  }

  function appendContour(context, points, progress) {
    const end = progress * (points.length / 2 - 1);
    const steps = Math.floor(end);
    context.moveTo(points[0], points[1]);
    for (let step = 1; step <= steps; step++) context.lineTo(points[2 * step], points[2 * step + 1]);

    const remainder = end - steps;
    if (remainder > 0) {
      const x = points[2 * steps];
      const y = points[2 * steps + 1];
      context.lineTo(x + (points[2 * steps + 2] - x) * remainder, y + (points[2 * steps + 3] - y) * remainder);
    }
    if (progress === 1) context.closePath();
  }

  function fillLetter(context, letter) {
    context.beginPath();
    for (const outline of letter.contours) appendContour(context, outline, 1);
    context.fill('evenodd');
  }

  function mount(panel) {
    const canvas = panel.querySelector('[data-fourier-words]');
    const phrases = Array.from(panel.querySelectorAll('[data-fourier-fallback] li'), item => item.textContent.trim())
      .filter(Boolean);
    if (!canvas || !phrases.length) return;

    const context = canvas.getContext('2d');
    const completedCanvas = document.createElement('canvas');
    const completedContext = completedCanvas.getContext('2d');
    if (!context || !completedContext) return;

    if (![...new Set(phrases.join(' '))].every(glyph)) return;

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const targets = document.createElement('div');
    targets.className = 'fourier-row-targets';
    targets.hidden = true;
    const buttons = phrases.map((phrase, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'fourier-row-target';
      button.setAttribute('aria-label', `Replay lettering for ${phrase}`);
      button.addEventListener('pointerenter', event => {
        if (event.pointerType !== 'touch' && !event.buttons) replayRow(index);
      });
      button.addEventListener('click', () => replayRow(index));
      targets.append(button);
      return button;
    });
    canvas.after(targets);
    let accent = '#d6f983';
    let ink = '#f3f1e7';
    let board = '#0c151c';
    let border = '#a8bec755';
    let width = 0;
    let height = 0;
    let density = 1;
    let letters = [];
    let rows = [];
    let animating = [];
    let activeRow = null;
    let elapsed = 0;
    let filled = 0;
    let frame = 0;
    let previousFrame = null;
    let visible = false;
    let started = false;
    let playing = false;
    let enabled = true;

    function updateColors() {
      const style = getComputedStyle(panel);
      accent = style.getPropertyValue('--accent').trim() || accent;
      ink = style.getPropertyValue('--ink').trim() || ink;
      board = style.getPropertyValue('--plot-board').trim() || board;
      border = style.getPropertyValue('--plot-line').trim() || border;
    }

    function clearCompleted() {
      const layer = completedContext;
      layer.clearRect(0, 0, width, height);
      filled = 0;
      layer.textAlign = 'center';
      layer.textBaseline = 'middle';
      layer.lineWidth = 1;

      for (const row of rows) {
        layer.beginPath();
        if (typeof layer.roundRect === 'function') layer.roundRect(1.5, row.top + .5, width - 3, row.height - 1, 4);
        else layer.rect(1.5, row.top + .5, width - 3, row.height - 1);
        layer.globalAlpha = .86;
        layer.fillStyle = board;
        layer.fill();
        layer.globalAlpha = .24;
        layer.fillStyle = border;
        layer.fill();
        layer.globalAlpha = 1;
        layer.strokeStyle = border;
        layer.stroke();

        const gutter = row.gutter + .5;
        layer.beginPath();
        layer.moveTo(gutter, row.top + 6);
        layer.lineTo(gutter, row.top + row.height - 6);
        layer.stroke();
        layer.fillStyle = accent;
        layer.font = `600 ${row.numberSize}px ui-monospace, monospace`;
        layer.fillText(row.number, (row.gutter + 2) / 2, row.numberY);
      }
      if (activeRow !== null) {
        layer.fillStyle = ink;
        for (const [index, row] of rows.entries()) {
          if (index === activeRow) continue;
          for (const letter of row.letters) fillLetter(layer, letter);
        }
      }
    }

    function endTime() {
      return activeRow === null ? duration : rowDuration;
    }

    function setTimeline() {
      animating = activeRow === null ? letters : rows[activeRow]?.letters ?? [];
      const stagger = (endTime() - traceDuration - fillDuration) / Math.max(1, animating.length - 1);
      animating.forEach((letter, index) => { letter.delay = index * stagger; });
    }

    function render(now) {
      const displayed = playing || !started ? now : endTime();
      const settled = displayed === endTime();
      completedContext.fillStyle = ink;
      while (filled < animating.length && (settled || displayed >= animating[filled].delay + traceDuration + fillDuration)) {
        fillLetter(completedContext, animating[filled]);
        filled++;
      }

      context.clearRect(0, 0, width, height);
      context.drawImage(completedCanvas, 0, 0, width, height);
      context.lineJoin = 'round';
      context.lineCap = 'round';

      for (let index = filled; index < animating.length; index++) {
        const letter = animating[index];
        const age = displayed - letter.delay;
        if (age <= 0) break;

        const phase = clamp01(age / traceDuration);
        const drawing = phase * phase * (3 - 2 * phase);
        const opacity = clamp01((age - traceDuration) / fillDuration);
        if (opacity > 0) {
          context.fillStyle = ink;
          context.globalAlpha = opacity;
          fillLetter(context, letter);
        }

        context.beginPath();
        for (const outline of letter.contours) appendContour(context, outline, drawing);
        context.strokeStyle = accent;
        context.globalAlpha = .15 * (1 - opacity);
        context.lineWidth = 2.9;
        context.stroke();
        context.globalAlpha = .94 * (1 - opacity);
        context.lineWidth = .82;
        context.stroke();
      }
      context.globalAlpha = 1;
    }

    function canPlay() {
      return enabled && playing && visible && !document.hidden && animating.length > 0;
    }

    function requestFrame() {
      if (!frame && canPlay()) frame = requestAnimationFrame(advance);
    }

    function pause() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      previousFrame = null;
    }

    function advance(now) {
      frame = 0;
      if (!canPlay()) return;
      const end = endTime();
      elapsed = Math.min(end, elapsed + (previousFrame === null ? 1000 / 60 : Math.min(42, now - previousFrame)));
      previousFrame = now;
      playing = elapsed < end;
      render(elapsed);
      if (playing) requestFrame();
      else previousFrame = null;
    }

    function start(row) {
      pause();
      enabled = true;
      started = true;
      activeRow = row;
      const end = endTime();
      elapsed = motion.matches ? end : 0;
      playing = elapsed < end;
      setTimeline();
      resize();
      clearCompleted();
      if (width) render(elapsed);
      requestFrame();
    }

    function play() { start(null); }

    function replayRow(row) {
      if (!enabled || !rows[row] || (playing && activeRow === row)) return;
      start(row);
    }

    function syncTargets() {
      if (!width || !height) return;
      const canvasBounds = canvas.getBoundingClientRect();
      const panelBounds = panel.getBoundingClientRect();
      targets.style.left = `${canvasBounds.left - panelBounds.left - panel.clientLeft}px`;
      targets.style.top = `${canvasBounds.top - panelBounds.top - panel.clientTop}px`;
      targets.style.width = `${canvasBounds.width}px`;
      targets.style.height = `${height}px`;
      targets.hidden = false;
    }

    function resize() {
      const nextWidth = Math.round(canvas.getBoundingClientRect().width || canvas.parentElement.clientWidth);
      const nextDensity = Math.min(2, window.devicePixelRatio || 1);
      if (nextWidth < 52) return;
      if (nextWidth === width && nextDensity === density) {
        syncTargets();
        return;
      }

      width = nextWidth;
      density = nextDensity;
      const size = Math.round(Math.max(16, Math.min(25, width * .043 + 5.25)));
      const scale = size / unitsPerEm;
      const lineHeight = size * 1.16;
      const gap = Math.round(Math.max(5, Math.min(8, width * .018)));
      const gutter = Math.round(Math.max(28, Math.min(40, width * .089)));
      const textStart = gutter + 8;
      const innerWidth = width - textStart - 9;
      const pad = size < 20 ? 6 : 7;
      letters = [];
      rows = [];

      let top = 1;
      for (const [index, phrase] of phrases.entries()) {
        const lines = wrap(phrase, innerWidth, scale);
        const rowHeight = Math.ceil(pad * 2 + lines.length * lineHeight);
        const rowLetters = [];
        rows.push({
          top,
          height: rowHeight,
          gutter,
          number: String(index + 1).padStart(2, '0'),
          numberSize: Math.max(11, Math.round(size * .57)),
          numberY: top + pad + lineHeight * .5,
          letters: rowLetters,
        });
        const button = buttons[index];
        button.style.left = '1.5px';
        button.style.right = '1.5px';
        button.style.top = `${top + .5}px`;
        button.style.height = `${rowHeight - 1}px`;
        let baseline = top + pad + size * .88;
        for (const line of lines) {
          let x = textStart;
          for (const character of line) {
            const item = glyph(character);
            if (item.contours.length) rowLetters.push({ contours: transform(item.contours, x, baseline, scale), delay: 0 });
            x += (item.advance + .004 * unitsPerEm) * scale;
          }
          baseline += lineHeight;
        }
        letters.push(...rowLetters);
        top += rowHeight + gap;
      }
      setTimeline();

      height = top - gap + 1;
      canvas.style.height = `${height}px`;
      canvas.width = completedCanvas.width = Math.round(width * density);
      canvas.height = completedCanvas.height = Math.round(height * density);
      context.setTransform(density, 0, 0, density, 0, 0);
      completedContext.setTransform(density, 0, 0, density, 0, 0);
      clearCompleted();
      render(elapsed);
      panel.classList.add('has-fourier-words');
      syncTargets();
      requestFrame();
    }

    updateColors();
    canvas.hidden = false;
    canvas.setAttribute('aria-hidden', 'true');
    panel.addEventListener('fourier:play', play);
    panel.addEventListener('fourier:pause', () => {
      enabled = false;
      pause();
    });
    resize();
    if (typeof IntersectionObserver === 'function') {
      const observer = new IntersectionObserver(entries => {
        visible = entries[0]?.isIntersecting ?? false;
        if (!visible) pause();
        else if (enabled && !started) play();
        else requestFrame();
      }, { threshold: .12 });
      observer.observe(canvas);
    } else {
      visible = true;
      play();
    }
    if (motion.matches && !started) play();

    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(resize);
      observer.observe(canvas);
      observer.observe(panel);
    }
    window.addEventListener('resize', resize, { passive: true });
    if (typeof MutationObserver === 'function') {
      new MutationObserver(() => {
        updateColors();
        clearCompleted();
        if (width) render(elapsed);
      }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pause();
      else requestFrame();
    });
    motion.addEventListener?.('change', () => {
      if (motion.matches && enabled) start(activeRow);
    });
  }

  document.querySelectorAll('[data-fourier-interests]').forEach(mount);
})();
