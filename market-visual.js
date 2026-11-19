(() => {
  const canvas = document.querySelector('.portrait-field');
  const stage = canvas?.closest('.portrait-stage');
  const ink = canvas?.getContext('2d');
  if (!stage || !ink) return;

  const root = document.documentElement;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const columns = 37;
  const rows = 30;
  const positions = new Float32Array(columns * rows * 2);
  const colors = {
    dark: {
      horizontal: ['#456c7920', '#60b8cd45', '#98dacc92', '#b6dec55a'],
      vertical: ['#6d99b311', '#659ab549', '#80ced661', '#90d0ca55'],
      halo: '#d4f7ad58',
      haloClear: '#9ae9ca00',
      accents: '#daf8bd',
      trace: '#9be0d48c',
      ticks: '#afdedb45',
      orbit: '#8fb8d129',
    },
    light: {
      horizontal: ['#49746622', '#4e8c8354', '#24746f86', '#3f777367'],
      vertical: ['#547b6a13', '#5a7d9259', '#407c876a', '#40776d5c'],
      halo: '#87ae694e',
      haloClear: '#6eab8500',
      accents: '#247057',
      trace: '#48857299',
      ticks: '#487b7155',
      orbit: '#4d786b3d',
    },
  };

  let width = 0;
  let height = 0;
  let scale = 1;
  let frame = 0;
  let last = 0;
  let time = 0;
  let inView = !('IntersectionObserver' in window);
  const pointer = { x: 0, y: 0, towardX: 0, towardY: 0, strength: 0, towardStrength: 0 };

  function shape(x, depth) {
    const ridgeX = .55 + pointer.x * .17 + Math.sin(time * .39) * .045;
    const ridgeDepth = .74 + pointer.y * .095;
    const crest = Math.exp(-((x - ridgeX) ** 2 * 9.5 + (depth - ridgeDepth) ** 2 * 20));
    const shoulder = Math.exp(-((x + .37) ** 2 * 8 + (depth - .44) ** 2 * 19));
    const wave = Math.sin(x * 7.1 - depth * 8.7 + time * .61) * .038;
    const ripple = Math.sin(x * 12 + depth * 12 - time * .79) * .018;
    const wing = .18 * (x + .16) ** 2;
    return crest * (.87 + pointer.strength * .075) + shoulder * .22 + wing + wave + ripple;
  }

  function project() {
    for (let row = 0; row < rows; row++) {
      const depth = row / (rows - 1);
      const perspective = 1.06 - depth * .29;
      for (let column = 0; column < columns; column++) {
        const x = 2 * column / (columns - 1) - 1;
        const offset = (row * columns + column) * 2;
        positions[offset] = width * (.55 + depth * .15 + x * .49 * perspective);
        positions[offset + 1] = height * (.97 - .53 * depth + .084 * x - shape(x, depth) * .51 * perspective);
      }
    }
  }

  function gridStroke(start, lineCount, pointCount, betweenLines, betweenPoints) {
    ink.beginPath();
    for (let line = 0; line < lineCount; line++) {
      const offset = start + line * betweenLines;
      ink.moveTo(positions[offset], positions[offset + 1]);
      for (let point = 1; point < pointCount; point++) {
        const index = offset + point * betweenPoints;
        ink.lineTo(positions[index], positions[index + 1]);
      }
    }
    ink.stroke();
  }

  function linearPalette(stops) {
    const gradient = ink.createLinearGradient(width * .08, height * .9, width * .96, height * .19);
    const steps = [0, .33, .8, 1];
    stops.forEach((value, index) => gradient.addColorStop(steps[index], value));
    return gradient;
  }

  function rings(palette) {
    const unit = Math.min(width, height);
    const x = width * .81;
    const y = height * .28;
    ink.strokeStyle = palette.orbit;
    ink.lineWidth = .6;
    ink.beginPath();
    ink.ellipse(x, y, unit * .25, unit * .23, -.44, Math.PI * .7, Math.PI * 2.27);
    ink.stroke();
    ink.beginPath();
    ink.ellipse(x, y, unit * .31, unit * .285, -.44, Math.PI * .7, Math.PI * 2.27);
    ink.stroke();

    ink.strokeStyle = palette.ticks;
    ink.beginPath();
    for (let tick = 0; tick < 12; tick++) {
      const tickX = width * (.46 + tick * .044);
      const tickY = height - 17;
      ink.moveTo(tickX, tickY);
      ink.lineTo(tickX, tickY + (tick % 3 === 0 ? 6 : 3));
    }
    ink.stroke();
  }

  function glow(x, y, radius, center, clear) {
    const gradient = ink.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, center);
    gradient.addColorStop(1, clear);
    ink.fillStyle = gradient;
    ink.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function render() {
    if (!width || !height) return;
    const palette = colors[root.dataset.theme === 'light' ? 'light' : 'dark'];
    ink.setTransform(scale, 0, 0, scale, 0, 0);
    ink.clearRect(0, 0, width, height);

    const unit = Math.min(width, height);
    const crestColumn = Math.round((.55 + pointer.x * .17 + 1) * (columns - 1) / 2);
    const crestRow = Math.round((.74 + pointer.y * .095) * (rows - 1));
    const crest = (crestRow * columns + crestColumn) * 2;

    project();
    const crestX = positions[crest];
    const crestY = positions[crest + 1];

    glow(crestX, crestY, unit * .26, palette.halo, palette.haloClear);
    glow(width * .84, height * .92, unit * .35, palette.halo, palette.haloClear);
    rings(palette);

    ink.lineJoin = 'round';
    ink.lineWidth = .7;
    ink.strokeStyle = linearPalette(palette.horizontal);
    gridStroke(0, rows, columns, columns * 2, 2);
    ink.lineWidth = .53;
    ink.strokeStyle = linearPalette(palette.vertical);
    gridStroke(0, columns, rows, 2, columns * 2);

    ink.strokeStyle = palette.trace;
    ink.lineWidth = 1;
    gridStroke(Math.round((rows - 1) * .38) * columns * 2, 1, columns, 0, 2);
    gridStroke(crestColumn * 2, 1, rows, 0, columns * 2);

    ink.fillStyle = palette.accents;
    ink.beginPath();
    ink.arc(crestX, crestY, 2.2 + pointer.strength * .75, 0, Math.PI * 2);
    ink.fill();
    ink.strokeStyle = palette.trace;
    ink.beginPath();
    ink.arc(crestX, crestY, 6.8 + pointer.strength * 2, 0, Math.PI * 2);
    ink.stroke();
  }

  function canAnimate() {
    return inView && !motion.matches && !document.hidden && width > 0 && height > 0;
  }

  function animate(now) {
    frame = 0;
    if (!canAnimate()) return;

    if (now - last >= 31) {
      const delta = last ? Math.min((now - last) / 1000, .055) : .032;
      const easing = 1 - Math.exp(-delta * 5.5);
      time += delta;
      pointer.x += (pointer.towardX - pointer.x) * easing;
      pointer.y += (pointer.towardY - pointer.y) * easing;
      pointer.strength += (pointer.towardStrength - pointer.strength) * easing;
      render();
      last = now;
    }

    frame = requestAnimationFrame(animate);
  }

  function updatePlayback() {
    if (canAnimate()) {
      if (!frame) frame = requestAnimationFrame(animate);
    } else {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    }
  }

  function resize() {
    const box = stage.getBoundingClientRect();
    const nextWidth = Math.round(box.width);
    const nextHeight = Math.round(box.height);
    const ratio = window.devicePixelRatio || 1;
    const nextScale = Math.min(ratio, 2);
    if (width === nextWidth && height === nextHeight && scale === nextScale) return;

    width = nextWidth;
    height = nextHeight;
    scale = nextScale;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    render();
    updatePlayback();
  }

  function track(event) {
    if (motion.matches) return;
    const bounds = stage.getBoundingClientRect();
    const horizontal = (event.clientX - bounds.left) / bounds.width;
    const vertical = (event.clientY - bounds.top) / bounds.height;
    pointer.towardX = Math.max(-1, Math.min(1, horizontal * 2 - 1));
    pointer.towardY = Math.max(-1, Math.min(1, .5 - vertical));
    pointer.towardStrength = event.buttons ? 1 : .57;
  }

  function release() {
    pointer.towardX = 0;
    pointer.towardY = 0;
    pointer.towardStrength = 0;
  }

  stage.addEventListener('pointermove', track, { passive: true });
  stage.addEventListener('pointerdown', track, { passive: true });
  stage.addEventListener('pointerleave', release);
  stage.addEventListener('pointercancel', release);
  stage.addEventListener('pointerup', event => {
    if (event.pointerType === 'touch') release();
    else track(event);
  }, { passive: true });

  function updateMotion() {
    if (motion.matches) {
      release();
      pointer.x = pointer.y = pointer.strength = time = 0;
      render();
    }
    updatePlayback();
  }

  motion.addEventListener?.('change', updateMotion);
  document.addEventListener('visibilitychange', updatePlayback);
  window.addEventListener('resize', resize, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
  if ('MutationObserver' in window) {
    new MutationObserver(render).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  }
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      inView = entries.some(entry => entry.isIntersecting);
      updatePlayback();
    }, { threshold: .02 });
    observer.observe(stage);
  }

  resize();
})();
