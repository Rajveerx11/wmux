/**
 * wmux instance identity.
 *
 * Set WMUX_INSTANCE=<name> to run wmux as a separate, side-by-side instance:
 * the named pipe and APPDATA directory get a "-<name>" suffix, so a dev build
 * can run alongside an installed production wmux without colliding on the
 * pipe (Windows pipes are exclusive) or overwriting session.json.
 */
import path from 'path';
import os from 'os';

function suffix(): string {
  const name = process.env.WMUX_INSTANCE?.trim();
  return name ? `-${name}` : '';
}

export function getPipePath(): string {
  return `\\\\.\\pipe\\wmux${suffix()}`;
}

export function getAppDataDir(): string {
  const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(base, `wmux${suffix()}`);
}
