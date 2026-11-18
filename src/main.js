import { Game } from './game.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const game = new Game(canvas, ctx);

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  game.resize(window.innerWidth, window.innerHeight, dpr);
}
window.addEventListener('resize', resize);
resize();

document.getElementById('deployBtn').addEventListener('click', () => game.deploy());
document.getElementById('restartBtn').addEventListener('click', () => game.deploy());
document.getElementById('resumeBtn').addEventListener('click', () => game.resume());

// LAN broadcasting exists only inside the desktop app; a browser visitor never
// gets the preload bridge, so the button is removed for them.
const liveApi = window.dustbowlLive;
const livePanel = document.getElementById('livePanel');
const liveBtn = document.getElementById('liveBtn');

if (liveApi && livePanel) {
  const liveStatus = document.getElementById('liveStatus');
  const liveUrl = document.getElementById('liveUrl');
  const liveAlt = document.getElementById('liveAlt');
  const liveQr = document.getElementById('liveQr');
  const liveCopy = document.getElementById('liveCopy');
  const liveStart = document.getElementById('liveStart');
  const liveStop = document.getElementById('liveStop');
  const liveClose = document.getElementById('liveClose');
  const liveMeta = document.getElementById('liveMeta');
  let liveState = { live: false };

  const renderLive = (state) => {
    liveState = state || { live: false };
    const on = Boolean(liveState.live);
    livePanel.classList.toggle('live-on', on);
    if (on && liveState.qr) {
      liveQr.src = liveState.qr;
      liveQr.style.display = 'block';
    } else {
      liveQr.style.display = 'none';
    }
    liveUrl.textContent = on ? liveState.url : '—';
    liveCopy.style.display = on ? 'inline-flex' : 'none';
    liveStart.style.display = on ? 'none' : 'inline-flex';
    liveStop.style.display = on ? 'inline-flex' : 'none';

    if (liveState.error) {
      liveStatus.textContent = `Could not start broadcasting: ${liveState.error}`;
    } else if (on) {
      liveStatus.textContent = `Live on port ${liveState.port}. Open the link on any device on this network — or scan the code.`;
    } else {
      liveStatus.textContent =
        'Not broadcasting. Start a session and anyone on your network can open the field in a browser.';
    }

    const alts = [];
    if (on && liveState.mdns) alts.push(liveState.mdns);
    if (on && liveState.urls) alts.push(...liveState.urls);
    const alternates = [...new Set(alts)].filter((url) => url !== liveState.url);
    liveAlt.innerHTML = alternates.map((url) => `<span>${url}</span>`).join('');
    liveMeta.textContent = on
      ? 'Each visitor plays their own match'
      : 'LAN only — nothing leaves your network';
  };

  const openLivePanel = async () => {
    if (game.state === 'playing') game.pause();
    livePanel.classList.remove('hidden');
    renderLive(await liveApi.status());
  };

  liveBtn.addEventListener('click', openLivePanel);
  liveApi.onOpenPanel(openLivePanel);

  liveStart.addEventListener('click', async () => {
    liveStart.disabled = true;
    liveStart.textContent = 'STARTING…';
    try {
      renderLive(await liveApi.start());
    } finally {
      liveStart.disabled = false;
      liveStart.textContent = 'START BROADCAST';
    }
  });

  liveStop.addEventListener('click', async () => {
    renderLive(await liveApi.stop());
  });

  liveClose.addEventListener('click', () => {
    livePanel.classList.add('hidden');
  });

  liveCopy.addEventListener('click', async () => {
    if (!liveState.live) return;
    try {
      await navigator.clipboard.writeText(liveState.url);
      liveCopy.textContent = 'COPIED';
      setTimeout(() => {
        liveCopy.textContent = 'COPY LINK';
      }, 1400);
    } catch {
      liveCopy.textContent = 'SELECT & COPY';
    }
  });
} else if (liveBtn) {
  liveBtn.remove();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  game.update(dt);
  game.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
