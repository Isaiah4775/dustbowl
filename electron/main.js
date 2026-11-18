import { app, BrowserWindow, Menu, shell, dialog, ipcMain } from 'electron';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import QRCode from 'qrcode';
import { createGameServer } from '../lib/server.js';

// In development this is the project folder; when packaged it is the asar root.
const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const LIVE_PORT = 8787;

let windowServer = null;
let liveServer = null;
let liveInfo = { live: false };
let win = null;

function addressScore(address) {
  if (address.startsWith('192.168.')) return 0;
  if (address.startsWith('10.')) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 2;
  if (address.startsWith('169.254.')) return 9;
  return 5;
}

/** Real LAN interfaces first, with Docker/VPN/link-local adapters kept out of the way. */
function lanAddresses() {
  const found = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (/^(lo|docker|br-|veth|virbr|vmnet|utun|tailscale|zt)/i.test(name)) continue;
    for (const net of list || []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      found.push({ name, address: net.address, score: addressScore(net.address) });
    }
  }
  found.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  return found;
}

function mdnsUrl(port) {
  const host = os.hostname().replace(/\.local$/i, '').replace(/[^a-zA-Z0-9-]/g, '-');
  return `http://${host}.local:${port}`;
}

async function startLive() {
  if (liveServer) return liveInfo;

  let handle;
  try {
    handle = await createGameServer({ root: appRoot, host: '0.0.0.0', port: LIVE_PORT });
  } catch {
    // Port taken? Fall back to any free port so the button still works.
    handle = await createGameServer({ root: appRoot, host: '0.0.0.0', port: 0 });
  }
  liveServer = handle;

  const addresses = lanAddresses();
  const urls = addresses.map((entry) => `http://${entry.address}:${handle.port}`);
  const mdns = mdnsUrl(handle.port);
  const url = addresses.length > 0 && addresses[0].score < 9 ? urls[0] : mdns;

  let qr = null;
  try {
    qr = await QRCode.toDataURL(url, {
      margin: 1,
      width: 240,
      color: { dark: '#10140d', light: '#ece7d8' },
    });
  } catch {
    qr = null;
  }

  liveInfo = { live: true, port: handle.port, url, urls, mdns, qr };
  return liveInfo;
}

async function stopLive() {
  if (!liveServer) {
    liveInfo = { live: false };
    return liveInfo;
  }
  const handle = liveServer;
  liveServer = null;
  liveInfo = { live: false };
  await handle.close().catch(() => {});
  return liveInfo;
}

function buildMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    {
      label: 'Game',
      submenu: [
        {
          label: 'Redeploy',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (win) win.webContents.reload();
          },
        },
        {
          label: 'Go Live on LAN…',
          accelerator: 'CmdOrCtrl+L',
          click: () => {
            if (win) win.webContents.send('live:panel');
          },
        },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'resetzoom' },
        { role: 'zoomin' },
        { role: 'zoomout' },
        ...(app.isPackaged ? [] : [{ type: 'separator' }, { role: 'toggleDevTools' }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  windowServer = await createGameServer({ root: appRoot, host: '127.0.0.1', port: 0 });

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'DUSTBOWL',
    backgroundColor: '#0b0d09',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: resolve(appRoot, 'electron/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    win = null;
    void stopLive();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('did-fail-load', (_event, code, description) => {
    dialog.showErrorBox('DUSTBOWL failed to start', `${description} (${code})`);
  });

  await win.loadURL(windowServer.url);
}

ipcMain.handle('live:start', async () => {
  try {
    return await startLive();
  } catch (error) {
    return { live: false, error: error && error.message ? error.message : String(error) };
  }
});
ipcMain.handle('live:stop', async () => stopLive());
ipcMain.handle('live:status', async () => liveInfo);

app.whenReady().then(async () => {
  buildMenu();
  try {
    await createWindow();
  } catch (error) {
    dialog.showErrorBox('DUSTBOWL failed to start', String(error));
    app.quit();
    return;
  }
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  await stopLive().catch(() => {});
  if (!windowServer) return;
  const handle = windowServer;
  windowServer = null;
  await handle.close().catch(() => {});
});
