(() => {
  const pathCount = 40;
  const pointsPerPath = 108;
  const pointCount = pathCount * pointsPerPath;
  const morphDuration = 960;
  const drawDuration = 1450;
  const pitchLimit = 1.38;
  const palettes = {
    dark: { dots: '#a6ddd926', axis: '#9fc1ca46', label: '#a6bebc', glow: '#acf9cf33', primary: ['#78bad0', '#ecfbac'], secondary: ['#5d929f', '#b4ead1'] },
    light: { dots: '#4b716a32', axis: '#50796f67', label: '#42665e', glow: '#84a3792e', primary: ['#236475', '#47621c'], secondary: ['#447781', '#5d8062'] },
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function model() {
    return {
      vertices: new Float32Array(pointCount * 3),
      edges: new Float32Array(pointCount),
    };
  }

  function finitePoint(point) {
    return point && Number.isFinite(point[0]) && Number.isFinite(point[1]) && Number.isFinite(point[2]);
  }

  function segments(path) {
    const runs = [];
    let points = [];
    let distances = [];
    let length = 0;

    function finish() {
      if (points.length > 1 && length > .00001) runs.push({ points, distances, length });
      points = [];
      distances = [];
      length = 0;
    }

    for (const point of path) {
      if (!finitePoint(point)) {
        finish();
        if (runs.length >= pointsPerPath / 2) break;
        continue;
      }

      const previous = points[points.length - 1];
      if (previous) length += Math.hypot(point[0] - previous[0], point[1] - previous[1], point[2] - previous[2]);
      points.push(point);
      distances.push(length);
    }
    finish();
    return runs;
  }

  function fitPath(output, path, pathIndex) {
    if (!Array.isArray(path)) return;

    const runs = segments(path);
    if (!runs.length) return;

    // Give every continuous run two endpoints before sharing the remaining samples by arc length.
    const total = runs.reduce((sum, run) => sum + run.length, 0);
    const extra = pointsPerPath - runs.length * 2;
    let outputIndex = pathIndex * pointsPerPath;
    let traveled = 0;
    let previousExtra = 0;

    for (const run of runs) {
      traveled += run.length;
      const nextExtra = Math.round(extra * traveled / total);
      const samples = 2 + nextExtra - previousExtra;
      previousExtra = nextExtra;
      let right = 1;

      for (let sample = 0; sample < samples; sample++) {
        const distance = run.length * sample / (samples - 1);
        while (right < run.points.length - 1 && run.distances[right] < distance) right++;
        const start = right - 1;
        const span = run.distances[right] - run.distances[start];
        const fraction = span > 0 ? (distance - run.distances[start]) / span : 0;
        const from = run.points[start];
        const to = run.points[right];
        const index = outputIndex * 3;
        output.vertices[index] = from[0] + (to[0] - from[0]) * fraction;
        output.vertices[index + 1] = from[1] + (to[1] - from[1]) * fraction;
        output.vertices[index + 2] = from[2] + (to[2] - from[2]) * fraction;
        output.edges[outputIndex] = Number(sample > 0);
        outputIndex++;
      }
    }
  }

  function copy(from, into) {
    into.vertices.set(from.vertices);
    into.edges.set(from.edges);
  }

  function collapseHidden(hidden, visible) {
    for (let line = 0; line < pathCount; line++) {
      const start = line * pointsPerPath;
      const end = start + pointsPerPath;
      let count = 0;
      let x = 0;
      let y = 0;
      let z = 0;
      let hiddenAlreadyHasStroke = false;

      for (let point = start + 1; point < end; point++) {
        if (hidden.edges[point] > .001) {
          hiddenAlreadyHasStroke = true;
          break;
        }
        if (visible.edges[point] > .001) {
          const vertex = point * 3;
          x += visible.vertices[vertex];
          y += visible.vertices[vertex + 1];
          z += visible.vertices[vertex + 2];
          count++;
        }
      }
      if (hiddenAlreadyHasStroke || !count) continue;

      for (let point = start; point < end; point++) {
        const vertex = point * 3;
        hidden.vertices[vertex] = x / count;
        hidden.vertices[vertex + 1] = y / count;
        hidden.vertices[vertex + 2] = z / count;
      }
    }
  }

  function strokeProgress(drawing, line, sequentialPaths) {
    if (drawing >= 1) return 1;
    if (sequentialPaths) return clamp(drawing * sequentialPaths - line, 0, 1);
    return clamp((drawing - line / pathCount * .31) / .71, 0, 1);
  }

  function limitDrawing(geometry, drawing, sequentialPaths) {
    for (let line = 0; line < pathCount; line++) {
      const start = line * pointsPerPath;
      const end = start + pointsPerPath;
      let last = start;
      for (let point = start + 1; point < end; point++) {
        if (geometry.edges[point]) last = point;
      }

      const limit = start + (last - start) * strokeProgress(drawing, line, sequentialPaths);
      const next = Math.ceil(limit);
      if (next > limit && geometry.edges[next]) {
        const startOfEdge = (next - 1) * 3;
        const endOfEdge = next * 3;
        const fraction = limit - next + 1;
        for (let axis = 0; axis < 3; axis++) {
          const from = geometry.vertices[startOfEdge + axis];
          geometry.vertices[endOfEdge + axis] = from + (geometry.vertices[endOfEdge + axis] - from) * fraction;
        }
      }
      geometry.edges.fill(0, next + 1, end);
    }
  }

  function defaultView(kind) {
    if (kind === 'portrait') return { yaw: -.035, pitch: .025 };
    if (kind === 'surface') return { yaw: -.40, pitch: -.57 };
    return { yaw: -.43, pitch: .25 };
  }

  function defaultStyle(kind) {
    if (kind === 'portrait') return { width: 1.31, glow: .93, axes: 0, secondary: .87 };
    if (kind === 'surface') return { width: .93, glow: 0, axes: 1, secondary: .69 };
    return { width: 1.55, glow: .9, axes: 1, secondary: .78 };
  }

  function create(canvas, { reducedMotion } = {}) {
    let ink;
    try {
      ink = canvas?.getContext('2d');
    } catch {
      ink = null;
    }
    if (!ink) return { show() {}, resetView() {}, destroy() {} };

    const motion = typeof reducedMotion === 'boolean' ? null
      : reducedMotion || window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const root = document.documentElement;
    const events = new AbortController();
    const listen = { signal: events.signal };
    const current = model();
    const from = model();
    const to = model();
    const projected = new Float32Array(pointCount * 2);
    const ends = new Uint16Array(pathCount);
    const limits = new Float32Array(pathCount);
    let width = 0;
    let height = 0;
    let scale = 1;
    let colors = null;
    let frame = 0;
    let lastTime = null;
    let visible = true;
    let kind = 'portrait';
    const style = defaultStyle(kind);
    let fromStyle = style;
    let toStyle = style;
    let hasShape = false;
    let morph = null;
    let draw = null;
    let sequentialPaths = 0;
    let drag = null;
    let hoverYaw = 0;
    let hoverPitch = 0;
    const camera = defaultView(kind);
    const target = defaultView(kind);
    let cosineYaw = 1;
    let sineYaw = 0;
    let cosinePitch = 1;
    let sinePitch = 0;
    let projectionScale = 0;
    let centerX = 0;
    let centerY = 0;

    function reduce() {
      return Boolean(reducedMotion === true || motion?.matches);
    }

    function renderable() {
      return visible && !document.hidden && width > 0 && height > 0;
    }

    function schedule() {
      if (!frame && renderable()) frame = requestAnimationFrame(update);
    }

    function stopFrame() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      lastTime = null;
    }

    function resize() {
      const box = canvas.getBoundingClientRect();
      const nextWidth = Math.round(box.width);
      const nextHeight = Math.round(box.height);
      const density = clamp(window.devicePixelRatio || 1, 1, 2);
      if (width === nextWidth && height === nextHeight && density === scale) return;

      width = nextWidth;
      height = nextHeight;
      scale = density;
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      colors = null;
      schedule();
    }

    function updateColors() {
      const palette = palettes[root.dataset.theme === 'light' ? 'light' : 'dark'];
      const gradients = [palette.primary, palette.secondary].map(stops => {
        const gradient = ink.createLinearGradient(width * .12, height * .89, width * .84, height * .14);
        gradient.addColorStop(0, stops[0]);
        gradient.addColorStop(1, stops[1]);
        return gradient;
      });
      colors = { ...palette, gradients };
    }

    function cameraBasis() {
      cosineYaw = Math.cos(camera.yaw);
      sineYaw = Math.sin(camera.yaw);
      cosinePitch = Math.cos(camera.pitch);
      sinePitch = Math.sin(camera.pitch);
      projectionScale = Math.min(width, height) * .425;
      centerX = width * .5;
      centerY = height * .49;
    }

    function project(x, y, z, into, offset) {
      const px = x * cosineYaw + z * sineYaw;
      const depth = z * cosineYaw - x * sineYaw;
      const py = y * cosinePitch - depth * sinePitch;
      const pz = y * sinePitch + depth * cosinePitch;
      const zoom = 5 / Math.max(2.1, 5 - pz);
      into[offset] = centerX + px * projectionScale * zoom;
      into[offset + 1] = centerY - py * projectionScale * zoom;
    }

    function renderGuide() {
      ink.fillStyle = colors.dots;
      const spacing = Math.max(15, Math.round(Math.min(width, height) / 15));
      const radius = width > 420 ? 1.25 : 1;
      for (let x = width % spacing / 2; x < width; x += spacing) {
        for (let y = height % spacing / 2; y < height; y += spacing) ink.fillRect(x, y, radius, radius);
      }
      if (style.axes < .006) return;

      const end = [0, 0];
      ink.globalAlpha = style.axes;
      ink.font = '10px system-ui, sans-serif';
      ink.lineWidth = .7;
      ink.strokeStyle = colors.axis;
      ink.fillStyle = colors.label;

      const axes = [[1.16, 0, 0, 'x'], [0, 1.16, 0, 'y'], [0, 0, 1.16, 'z']];
      for (const [x, y, z, label] of axes) {
        project(-x, -y, -z, end, 0);
        ink.beginPath();
        ink.moveTo(end[0], end[1]);
        project(x, y, z, end, 0);
        ink.lineTo(end[0], end[1]);
        ink.stroke();
        ink.fillText(label, clamp(end[0] + 4, 3, width - 12), clamp(end[1] - 3, 11, height - 4));
      }
      ink.globalAlpha = 1;
    }

    function projectModel() {
      for (let line = 0; line < pathCount; line++) {
        const start = line * pointsPerPath;
        const end = start + pointsPerPath;
        let last = start;
        for (let point = start + 1; point < end; point++) {
          if (current.edges[point] > .003) last = point;
        }
        ends[line] = last;
        if (last === start) continue;

        for (let point = start; point <= last; point++) {
          const vertex = point * 3;
          project(current.vertices[vertex], current.vertices[vertex + 1],
            current.vertices[vertex + 2], projected, point * 2);
        }
      }
    }

    function trace(start, last, limit, min, max) {
      let continuing = false;
      for (let point = start + 1; point <= last && point - 1 < limit; point++) {
        const opacity = current.edges[point];
        if (opacity < min || opacity >= max) {
          continuing = false;
          continue;
        }
        const offset = point * 2;
        const previous = offset - 2;
        if (!continuing) ink.moveTo(projected[previous], projected[previous + 1]);
        const fraction = Math.min(1, limit - point + 1);
        ink.lineTo(projected[previous] + (projected[offset] - projected[previous]) * fraction,
          projected[previous + 1] + (projected[offset + 1] - projected[previous + 1]) * fraction);
        continuing = fraction === 1;
      }
    }

    function paintLine(start, last, limit, opacity) {
      let previousWeight = 0;
      for (let point = start + 1; point <= last && point - 1 < limit; point++) {
        const weight = Math.round(current.edges[point] * 64) / 64;
        const offset = point * 2;
        const previous = offset - 2;

        if (weight !== previousWeight) {
          if (previousWeight) ink.stroke();
          if (weight) {
            ink.globalAlpha = weight * opacity;
            ink.beginPath();
            ink.moveTo(projected[previous], projected[previous + 1]);
          }
          previousWeight = weight;
        }
        if (!weight) continue;

        const fraction = Math.min(1, limit - point + 1);
        ink.lineTo(projected[previous] + (projected[offset] - projected[previous]) * fraction,
          projected[previous + 1] + (projected[offset + 1] - projected[previous + 1]) * fraction);
      }
      if (previousWeight) ink.stroke();
    }

    function render() {
      if (!colors) updateColors();
      ink.setTransform(scale, 0, 0, scale, 0, 0);
      ink.clearRect(0, 0, width, height);
      ink.lineCap = 'round';
      ink.lineJoin = 'round';
      cameraBasis();
      renderGuide();
      if (!hasShape) return;

      projectModel();
      const drawing = draw === null ? 1 : clamp(draw / drawDuration, 0, 1);
      for (let line = 0; line < pathCount; line++) {
        const start = line * pointsPerPath;
        limits[line] = start + (ends[line] - start) * strokeProgress(drawing, line, sequentialPaths);
      }
      if (style.glow > .006) {
        ink.strokeStyle = colors.glow;
        ink.lineWidth = 3.2;
        ink.globalAlpha = style.glow;
        ink.beginPath();
        for (let line = 0; line < pathCount; line++) {
          const start = line * pointsPerPath;
          if (ends[line] > start) trace(start, ends[line], limits[line], .012, 2);
        }
        ink.stroke();
      }

      ink.lineWidth = style.width;
      for (let group = 0; group < 2; group++) {
        ink.strokeStyle = colors.gradients[group];
        const opacity = group === 0 ? .98 : style.secondary;
        for (let line = group; line < pathCount; line += 2) {
          const start = line * pointsPerPath;
          if (ends[line] > start) paintLine(start, ends[line], limits[line], opacity);
        }
      }
      ink.globalAlpha = 1;
    }

    function advance(delta) {
      if (draw !== null) {
        draw += delta;
        if (draw >= drawDuration) draw = null;
      }
      if (morph !== null) {
        morph += delta;
        if (morph >= morphDuration) {
          copy(to, current);
          Object.assign(style, toStyle);
          morph = null;
        } else {
          const progress = morph / morphDuration;
          const eased = progress * progress * (3 - 2 * progress);
          style.width = fromStyle.width + (toStyle.width - fromStyle.width) * eased;
          style.glow = fromStyle.glow + (toStyle.glow - fromStyle.glow) * eased;
          style.axes = fromStyle.axes + (toStyle.axes - fromStyle.axes) * eased;
          style.secondary = fromStyle.secondary + (toStyle.secondary - fromStyle.secondary) * eased;
          for (let index = 0; index < current.vertices.length; index++) {
            current.vertices[index] = from.vertices[index] + (to.vertices[index] - from.vertices[index]) * eased;
          }
          for (let index = 0; index < current.edges.length; index++) {
            current.edges[index] = from.edges[index] + (to.edges[index] - from.edges[index]) * eased;
          }
        }
      }

      const desiredYaw = target.yaw + hoverYaw;
      const desiredPitch = clamp(target.pitch + hoverPitch, -pitchLimit, pitchLimit);
      const moving = Math.abs(desiredYaw - camera.yaw) + Math.abs(desiredPitch - camera.pitch) > .0008;
      if (reduce() || !moving) {
        camera.yaw = desiredYaw;
        camera.pitch = desiredPitch;
        return false;
      }
      const easing = 1 - Math.exp(-delta / (drag ? 37 : 105));
      camera.yaw += (desiredYaw - camera.yaw) * easing;
      camera.pitch += (desiredPitch - camera.pitch) * easing;
      return true;
    }

    function update(now) {
      frame = 0;
      if (!renderable()) {
        lastTime = null;
        return;
      }
      const delta = lastTime === null ? 1000 / 60 : clamp(now - lastTime, 0, 50);
      lastTime = now;
      const moving = advance(delta);
      render();
      if (moving || morph !== null || draw !== null) schedule();
      else lastTime = null;
    }

    function clearHover() {
      hoverYaw = 0;
      hoverPitch = 0;
      schedule();
    }

    function resetView() {
      Object.assign(target, defaultView(kind));
      clearHover();
    }

    function show(paths, { intro = false, kind: nextKind = 'curve' } = {}) {
      to.vertices.fill(0);
      to.edges.fill(0);
      const visiblePaths = Math.min(paths?.length || 0, pathCount);
      for (let line = 0; line < visiblePaths; line++) fitPath(to, paths[line], line);
      const instant = reduce() || !hasShape || intro;

      kind = nextKind;
      fromStyle = { ...style };
      toStyle = defaultStyle(kind);
      resetView();
      if (instant) {
        copy(to, current);
        Object.assign(style, toStyle);
        Object.assign(camera, target);
        morph = null;
        draw = intro && !reduce() ? 0 : null;
        sequentialPaths = kind === 'curve' ? visiblePaths : 0;
      } else {
        copy(current, from);
        if (draw !== null) limitDrawing(from, clamp(draw / drawDuration, 0, 1), sequentialPaths);
        collapseHidden(from, to);
        collapseHidden(to, from);
        morph = 0;
        draw = null;
      }
      hasShape = true;
      schedule();
    }

    function resetMotion() {
      if (reduce()) {
        clearHover();
        if (morph !== null) {
          copy(to, current);
          Object.assign(style, toStyle);
        }
        morph = null;
        draw = null;
      }
      schedule();
    }

    canvas.addEventListener('pointerdown', event => {
      if (drag || event.button !== 0) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      clearHover();
      canvas.setPointerCapture?.(event.pointerId);
      canvas.dataset.orbiting = 'true';
    }, listen);
    canvas.addEventListener('pointermove', event => {
      if (drag?.id === event.pointerId) {
        const dragScale = 3.25 / Math.max(140, Math.min(width, height));
        target.yaw += (event.clientX - drag.x) * dragScale;
        target.pitch = clamp(target.pitch + (event.clientY - drag.y) * dragScale, -pitchLimit, pitchLimit);
        drag.x = event.clientX;
        drag.y = event.clientY;
      } else if (!drag && event.pointerType !== 'touch' && !reduce()) {
        const box = canvas.getBoundingClientRect();
        hoverYaw = clamp((event.clientX - box.left) / width - .5, -.5, .5) * .14;
        hoverPitch = clamp((event.clientY - box.top) / height - .5, -.5, .5) * .10;
      }
      schedule();
    }, listen);

    function endDrag(event) {
      if (drag?.id !== event.pointerId) return;
      drag = null;
      delete canvas.dataset.orbiting;
      schedule();
    }
    canvas.addEventListener('pointerup', endDrag, listen);
    canvas.addEventListener('pointercancel', endDrag, listen);
    canvas.addEventListener('lostpointercapture', endDrag, listen);
    canvas.addEventListener('pointerleave', clearHover, listen);
    canvas.addEventListener('keydown', event => {
      const moves = { ArrowLeft: [-.17, 0], ArrowRight: [.17, 0], ArrowUp: [0, -.15], ArrowDown: [0, .15] };
      if (event.key === 'Home') {
        event.preventDefault();
        resetView();
        return;
      }
      const move = moves[event.key];
      if (!move) return;
      event.preventDefault();
      target.yaw += move[0];
      target.pitch = clamp(target.pitch + move[1], -pitchLimit, pitchLimit);
      clearHover();
    }, listen);

    const resizer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    resizer?.observe(canvas);
    window.addEventListener('resize', resize, { ...listen, passive: true });
    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
      visible = entries[0]?.isIntersecting ?? true;
      if (visible) schedule();
      else stopFrame();
    }) : null;
    observer?.observe(canvas);
    const themeObserver = typeof MutationObserver === 'function' ? new MutationObserver(() => {
      colors = null;
      schedule();
    }) : null;
    themeObserver?.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopFrame();
      else schedule();
    }, listen);
    motion?.addEventListener?.('change', resetMotion, listen);
    resize();

    return {
      show,
      resetView,
      destroy() {
        stopFrame();
        events.abort();
        resizer?.disconnect();
        observer?.disconnect();
        themeObserver?.disconnect();
      },
    };
  }

  window.PortfolioPlot = { create };
})();
