import { app, BrowserWindow, net } from 'electron';
import { IPC_CHANNELS } from '../shared/types';

// Polls GitHub /releases/latest and broadcasts when a newer version is published.
// We can't use electron-updater for the actual install because the release flow
// ships a portable zip (no latest.yml, no NSIS), so this is a notify-only path:
// renderer shows a badge, click opens the GitHub release page in the OS browser.

const REPO_OWNER = 'amirlehmam';
const REPO_NAME = 'wmux';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 5_000;

export interface UpdateAvailableInfo {
  version: string;
  url: string;
  body?: string;
  publishedAt?: string;
}

let latest: UpdateAvailableInfo | null = null;

export function getLatestUpdate(): UpdateAvailableInfo | null {
  return latest;
}

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

function fetchLatestRelease(): Promise<{ tag_name: string; html_url: string; body?: string; published_at?: string; draft?: boolean; prerelease?: boolean } | null> {
  return new Promise((resolve) => {
    const req = net.request({
      method: 'GET',
      url: `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
      redirect: 'follow',
    });
    req.setHeader('Accept', 'application/vnd.github+json');
    req.setHeader('User-Agent', `wmux/${app.getVersion()}`);
    let body = '';
    req.on('response', (res) => {
      if (res.statusCode !== 200) {
        res.on('data', () => {});
        res.on('end', () => resolve(null));
        return;
      }
      res.on('data', (chunk) => { body += chunk.toString('utf8'); });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function checkOnce(): Promise<void> {
  const release = await fetchLatestRelease();
  if (!release || release.draft || release.prerelease) return;
  const current = app.getVersion();
  if (compareVersions(release.tag_name, current) <= 0) return;

  latest = {
    version: release.tag_name.replace(/^v/, ''),
    url: release.html_url,
    body: release.body,
    publishedAt: release.published_at,
  };

  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.UPDATE_AVAILABLE, latest);
    }
  }
}

export function initUpdateChecker(): void {
  setTimeout(() => { checkOnce().catch(() => {}); }, FIRST_CHECK_DELAY_MS);
  setInterval(() => { checkOnce().catch(() => {}); }, CHECK_INTERVAL_MS);
}
