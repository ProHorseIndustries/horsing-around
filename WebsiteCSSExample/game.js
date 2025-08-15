(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const overlay = document.getElementById('overlay');

  let dpr = 1;
  const GROUND_H = 56; // ground height in CSS pixels

  const horse = { x: 100, y: 0, vy: 0, w: 40, h: 30 };
  let pipes = [];
  let spawnT = 0;
  let spawnEvery = 1.4; // seconds
  let score = 0;
  let best = Number(localStorage.getItem('horseflappy_best') || 0);
  let lastTs = undefined;
  let running = false;
  let state = 'ready';

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset
    ctx.scale(dpr, dpr); // draw in CSS pixels
  }

  function placeHorseX() {
    horse.x = Math.round((canvas.width / dpr) * 0.22);
  }

  function setState(s) {
    state = s;
    overlay.classList.toggle('hidden', s === 'playing');
  }

  function updateHUD() {
    scoreEl.textContent = String(score);
    bestEl.textContent = `Best: ${best}`;
  }

  function reset() {
    const H = canvas.height / dpr;
    horse.y = H / 2;
    horse.vy = 0;
    pipes = [];
    spawnT = 0;
    score = 0;
    updateHUD();
    running = true;
    lastTs = undefined;
  }

  function start() {
    reset();
    setState('playing');
    requestAnimationFrame(loop);
  }

  function flap() {
    if (state !== 'playing') { start(); return; }
    // stronger flaps as score rises, but capped
    horse.vy = - (5.5 + Math.min(2.5, score * 0.02)) * 60; // convert to px/s
  }

  function spawnPipe() {
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    const gap = Math.max(120, Math.min(190, 170 - score * 1.5));
    const topMin = 40, bottomMin = 40;
    const maxGapY = H - GROUND_H - bottomMin - gap;
    const gapY = topMin + Math.random() * (maxGapY - topMin) + gap / 2; // center of the gap
    pipes.push({ x: W + 30, gapY, w: 70, gap, passed: false });
  }

  function gameOver() {
    if (state !== 'playing') return;
    setState('gameover');
    running = false;
    overlay.innerHTML = `<h2>Game Over</h2><p>Score: <strong>${score}</strong>${score >= best ? ' • New best!' : ''}</p><p>Press <b>R</b> to restart</p>`;
    overlay.classList.remove('hidden');
  }

  function loop(ts) {
    if (!running) return;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;

    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000; // seconds
    if (dt > 0.033) dt = 0.033; // clamp to avoid big jumps
    lastTs = ts;

    // Difficulty scales with score
    const speed = 140 + Math.min(220, score * 6); // px/s
    const gravity = 1200; // px/s^2

    if (state === 'playing') {
      spawnEvery = 1.3 - Math.min(0.7, score * 0.01);
      spawnT += dt;
      if (spawnT >= spawnEvery) { spawnT = 0; spawnPipe(); }

      // Move pipes
      for (let i = 0; i < pipes.length; i++) {
        pipes[i].x -= speed * dt;
      }
      // Remove off-screen pipes
      while (pipes.length && pipes[0].x + pipes[0].w < -20) pipes.shift();

      // Physics
      horse.vy += gravity * dt; // integrate acceleration (px/s^2) over dt
      horse.y += (horse.vy / 60) * 60 * dt; // simplify to px movement

      // Bounds
      if (horse.y < 0) { horse.y = 0; horse.vy = 0; gameOver(); }
      if (horse.y + horse.h > H - GROUND_H) { horse.y = H - GROUND_H - horse.h; gameOver(); }

      // Collisions + scoring
      for (const p of pipes) {
        if (!p.passed && p.x + p.w < horse.x) {
          p.passed = true; score++; if (score > best) { best = score; localStorage.setItem('horseflappy_best', String(best)); }
          updateHUD();
        }
        const inX = horse.x + horse.w > p.x && horse.x < p.x + p.w;
        const topH = p.gapY - p.gap / 2;
        const bottomY = p.gapY + p.gap / 2;
        const hitTop = horse.y < topH && inX;
        const hitBottom = (horse.y + horse.h) > bottomY && inX;
        if (hitTop || hitBottom) { gameOver(); break; }
      }
    }

    draw(W, H);
    requestAnimationFrame(loop);
  }

  function draw(W, H) {
    // Background
    ctx.clearRect(0, 0, W, H);
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0, '#9bd4ff');
    skyGrad.addColorStop(1, '#e3f6ff');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    drawClouds(W, H);

    // Ground
    ctx.fillStyle = '#6d4c41';
    ctx.fillRect(0, H - GROUND_H, W, GROUND_H);
    ctx.fillStyle = '#2e7d32';
    ctx.fillRect(0, H - GROUND_H, W, 14);

    // Pipes (fences)
    for (const p of pipes) {
      ctx.fillStyle = '#8d6e63';
      const topH = p.gapY - p.gap / 2;
      ctx.fillRect(p.x, 0, p.w, topH);
      const bottomY = p.gapY + p.gap / 2;
      ctx.fillRect(p.x, bottomY, p.w, H - GROUND_H - bottomY);

      // Caps
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(p.x - 4, topH - 12, p.w + 8, 12);
      ctx.fillRect(p.x - 4, bottomY, p.w + 8, 12);
    }

    // Horse
    drawHorse(W, H);

    // Score (subtle drop shadow handled via HUD text-shadow)
    ctx.font = 'bold 28px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillText(`${score}`, 12, 10);
  }

  function drawHorse(W, H) {
    const { x, y, w, h } = horse;
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, H - GROUND_H + 4, w * 0.55, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = '#795548';
    ctx.fillRect(x, y, w, h);
    // Head
    ctx.fillRect(x + w - 10, y + 4, 14, 12);
    // Ear
    ctx.beginPath();
    ctx.moveTo(x + w + 2, y + 4);
    ctx.lineTo(x + w + 6, y - 6);
    ctx.lineTo(x + w - 1, y + 4);
    ctx.closePath();
    ctx.fill();
    // Tail
    ctx.fillRect(x - 8, y + h / 2 - 2, 8, 4);

    // Eye
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + w + 4, y + 8, 3, 3);
    ctx.fillStyle = '#000';
    ctx.fillRect(x + w + 5, y + 9, 1, 1);
  }

  function drawClouds(W, H) {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#ffffff';
    const t = performance.now() / 10000; // slow drift
    const cloudCount = 6;
    for (let i = 0; i < cloudCount; i++) {
      const cw = 60 + (i % 3) * 20;
      const ch = 24 + (i % 2) * 10;
      const cx = (W + i * 120 - (t * 40 % (W + 200)));
      const cy = 40 + i * 30;
      roundedRect(cx, cy, cw, ch, 12);
    }
    ctx.restore();
  }

  function roundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  // Input
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); flap(); }
    if (e.code === 'KeyR') { e.preventDefault(); start(); }
    if (e.code === 'KeyP') {
      e.preventDefault();
      if (state === 'playing') {
        setState('paused');
        running = false;
        overlay.innerHTML = '<h2>Paused</h2><p>Press <b>P</b> to resume</p>';
        overlay.classList.remove('hidden');
      } else if (state === 'paused') {
        setState('playing');
        running = true;
        overlay.classList.add('hidden');
        requestAnimationFrame(loop);
      }
    }
  });

  canvas.addEventListener('pointerdown', flap);
  overlay.addEventListener('click', start);

  // Resize handling
  let resizeTO;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTO);
    resizeTO = setTimeout(() => { resize(); placeHorseX(); }, 50);
  });

  function init() {
    resize();
    placeHorseX();
    best = Number(localStorage.getItem('horseflappy_best') || 0);
    updateHUD();
    overlay.innerHTML = `<h2>Horse Flappy</h2><p>Tap / Click / Press <b>Space</b> to jump</p><p>Pass the fences. Don’t touch anything.</p>`;
    setState('ready');
  }

  init();
})();
