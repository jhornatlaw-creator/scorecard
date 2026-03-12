window.App = window.App || {};

App.Drawing = (() => {
  let canvas, ctx;
  let drawing = false;
  let strokes = [];       // Array of { points:[], color, width }
  let currentStroke = null;
  let penColor = '#1a1a1a';
  let penWidth = 2.5;
  let enabled = false;
  let currentBasePath = null;  // { basesReached, diamondSize }

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    resize();

    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onEnd);
    canvas.addEventListener('touchcancel', onEnd);
    // Mouse fallback for testing
    canvas.addEventListener('mousedown', onStart);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onEnd);
    canvas.addEventListener('mouseleave', onEnd);
  }

  function resize() {
    if (!canvas) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }

  function onStart(e) {
    if (!enabled) return;
    e.preventDefault();
    drawing = true;
    const p = getPos(e);
    currentStroke = { points: [p], color: penColor, width: penWidth };
  }

  function onMove(e) {
    if (!drawing || !currentStroke) return;
    e.preventDefault();
    const p = getPos(e);
    currentStroke.points.push(p);
    redraw();
    drawStroke(currentStroke);
  }

  function onEnd() {
    if (!drawing || !currentStroke) return;
    drawing = false;
    if (currentStroke.points.length > 1) {
      strokes.push(currentStroke);
    }
    currentStroke = null;
    redraw();
  }

  function drawStroke(s) {
    if (s.points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i++) {
      ctx.lineTo(s.points[i].x, s.points[i].y);
    }
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  function redraw() {
    if (!ctx) return;
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, w, h);
    // Re-render base path first (below strokes)
    if (currentBasePath) {
      drawBasePath(currentBasePath.basesReached, currentBasePath.diamondSize, true);
    }
    strokes.forEach(drawStroke);
  }

  function clear() {
    strokes = [];
    currentStroke = null;
    currentBasePath = null;
    redraw();
  }

  function undo() {
    strokes.pop();
    redraw();
  }

  function setEnabled(val) { enabled = val; }
  function isEnabled() { return enabled; }
  function setColor(c) { penColor = c; }
  function setWidth(w) { penWidth = w; }

  function getStrokes() { return JSON.parse(JSON.stringify(strokes)); }
  function setStrokes(s) { strokes = s || []; redraw(); }

  function toDataURL() {
    if (!canvas) return null;
    if (!strokes.length) return null;
    return canvas.toDataURL('image/png');
  }

  function clearBasePath() { currentBasePath = null; }

  // Draw baserunning path on the diamond
  function drawBasePath(basesReached, diamondSize, _internal) {
    // Store for redraw unless called internally from redraw
    if (!_internal) currentBasePath = { basesReached, diamondSize };
    const s = diamondSize || 200;
    const scale = (canvas.width / (window.devicePixelRatio || 1)) / s;
    const bases = {
      home: { x: 100 * scale, y: 185 * scale },
      '1B': { x: 175 * scale, y: 100 * scale },
      '2B': { x: 100 * scale, y: 15 * scale },
      '3B': { x: 25 * scale, y: 100 * scale },
    };

    const path = ['home', ...basesReached];
    if (path.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(bases[path[0]].x, bases[path[0]].y);
    for (let i = 1; i < path.length; i++) {
      const b = bases[path[i]];
      if (b) ctx.lineTo(b.x, b.y);
    }
    ctx.strokeStyle = '#2D5016';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Draw dots at reached bases
    path.forEach(key => {
      const b = bases[key];
      if (!b) return;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#2D5016';
      ctx.fill();
    });
  }

  return { init, resize, clear, undo, setEnabled, isEnabled, setColor, setWidth, getStrokes, setStrokes, toDataURL, drawBasePath, clearBasePath, redraw };
})();
