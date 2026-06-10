import type { Terminal } from '@xterm/xterm';
import { CanvasAddon } from '@xterm/addon-canvas';
import { WebglAddon } from '@xterm/addon-webgl';
import { forceSyncCursorRendering } from './force-sync-cursor';

export type RendererKind = 'dom' | 'webgl' | 'canvas';

export interface RendererHandle {
  kind: RendererKind;
  dispose(): void;
}

/**
 * Chromium hard-caps WebGL contexts (~16 per renderer process) and force-loses
 * the oldest one past the cap, which used to freeze whole sessions when every
 * keep-alive tab held a context. Only VISIBLE panes need a GPU renderer, so we
 * attach WebGL on show / release on hide and budget well under the cap (the
 * browser webview and devtools also consume contexts).
 */
export const MAX_WEBGL_TERMINALS = 12;

let activeWebglCount = 0;

export function getActiveWebglCount(): number {
  return activeWebglCount;
}

/**
 * Attach the best available renderer to a terminal that just became visible.
 * Preference order: WebGL (maintained upstream, correct wide-char/CJK and
 * cursor rendering — the deprecated Canvas addon mispaints rows under load,
 * issues #23/#30) → Canvas with the sync-cursor patch → xterm's default DOM
 * renderer.
 */
export function attachVisibleRenderer(terminal: Terminal): RendererHandle {
  if (activeWebglCount >= MAX_WEBGL_TERMINALS) return attachCanvasRenderer(terminal);

  let webgl: WebglAddon;
  try {
    webgl = new WebglAddon();
    terminal.loadAddon(webgl);
  } catch (err) {
    console.warn('[wmux] WebGL renderer unavailable, falling back to Canvas:', err);
    return attachCanvasRenderer(terminal);
  }
  activeWebglCount++;

  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    activeWebglCount--;
  };

  const handle: RendererHandle = {
    kind: 'webgl',
    dispose: () => {
      release();
      try { webgl.dispose(); } catch { /* already disposed with terminal */ }
    },
  };

  webgl.onContextLoss(() => {
    // GPU evicted this context (driver reset, context pressure elsewhere…).
    // Downgrade this terminal to Canvas instead of leaving it frozen.
    console.warn('[wmux] WebGL context lost, downgrading terminal to Canvas renderer');
    release();
    try { webgl.dispose(); } catch { /* no-op */ }
    const fallback = attachCanvasRenderer(terminal);
    handle.kind = fallback.kind;
    handle.dispose = fallback.dispose;
  });

  return handle;
}

export function attachCanvasRenderer(terminal: Terminal): RendererHandle {
  const canvas = new CanvasAddon();
  try {
    terminal.loadAddon(canvas);
    forceSyncCursorRendering(terminal);
    return {
      kind: 'canvas',
      dispose: () => {
        try { canvas.dispose(); } catch { /* already disposed with terminal */ }
      },
    };
  } catch (err) {
    console.warn('[wmux] Canvas renderer unavailable, staying on DOM renderer:', err);
    try { canvas.dispose(); } catch { /* never activated */ }
    return { kind: 'dom', dispose: () => { /* default renderer, nothing to release */ } };
  }
}
