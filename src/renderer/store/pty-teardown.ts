/**
 * pty-teardown.ts — Central PTY reaping for destructive close transitions (issue #65).
 *
 * PTY lifetime is deliberately decoupled from React unmount so terminal tabs stay
 * alive across workspace/tab switches and split-tree restructures (see the note in
 * `useTerminal` and `App.tsx`). The cost of that design was that shell teardown had
 * been bolted onto only two `PaneWrapper` buttons, so every OTHER close route —
 * Ctrl+W, the CLI (`close-surface`/`close-pane`/`close-workspace`), and closing a
 * workspace from the sidebar — dropped the layout node without killing the shell,
 * leaking a wrapper PowerShell (plus anything it spawned) for the life of the app.
 *
 * The fix routes teardown through the store STATE TRANSITIONS (the single chokepoint
 * every close funnels through) instead of the UI. These helpers are those hooks.
 *
 * No-op for non-terminal surfaces (browser/markdown/diff have no PTY) and in
 * non-Electron contexts (unit tests, where `window` is undefined) so the store
 * stays testable in Node.
 */
import { SplitNode, SurfaceRef } from '../../shared/types';

/** Kill the PTY backing a single terminal surface. Idempotent — the main-process
 *  `PtyManager.kill` no-ops on an unknown/already-dead id, so double-calls (e.g.
 *  a legacy UI kill + the store kill) are harmless. */
export function killSurfacePty(surface: Pick<SurfaceRef, 'id' | 'type'>): void {
  if (surface.type !== 'terminal') return;
  try {
    (globalThis as { window?: { wmux?: { pty?: { kill?: (id: string) => void } } } }).window
      ?.wmux?.pty?.kill?.(surface.id);
  } catch {
    /* preload/window unavailable (tests) — nothing to reap */
  }
}

/** Walk a split (sub)tree and kill every terminal surface's PTY. Used when a whole
 *  pane or workspace is torn down and all its shells must die at once. */
export function killTreeTerminalPtys(tree: SplitNode): void {
  if (tree.type === 'leaf') {
    for (const surface of tree.surfaces) killSurfacePty(surface);
    return;
  }
  killTreeTerminalPtys(tree.children[0]);
  killTreeTerminalPtys(tree.children[1]);
}
