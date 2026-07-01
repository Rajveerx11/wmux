import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { killSurfacePty, killTreeTerminalPtys } from '../../src/renderer/store/pty-teardown';
import { SplitNode, SurfaceRef, SurfaceId, PaneId } from '../../src/shared/types';

// Regression coverage for issue #65: PTY teardown must run on every destructive
// close transition. These helpers are the shared reaping primitives the store
// actions call. They read window.wmux.pty.kill, which we mock here.

const term = (id: string): SurfaceRef => ({ id: id as SurfaceId, type: 'terminal' });
const browser = (id: string): SurfaceRef => ({ id: id as SurfaceId, type: 'browser' });
const leaf = (paneId: string, surfaces: SurfaceRef[]): SplitNode => ({
  type: 'leaf',
  paneId: paneId as PaneId,
  surfaces,
  activeSurfaceIndex: 0,
});

describe('pty-teardown', () => {
  let kill: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    kill = vi.fn();
    (globalThis as any).window = { wmux: { pty: { kill } } };
  });

  afterEach(() => {
    delete (globalThis as any).window;
  });

  it('kills the PTY of a terminal surface', () => {
    killSurfacePty(term('surf-1'));
    expect(kill).toHaveBeenCalledTimes(1);
    expect(kill).toHaveBeenCalledWith('surf-1');
  });

  it('does NOT kill non-terminal surfaces (no PTY to reap)', () => {
    killSurfacePty(browser('surf-b'));
    killSurfacePty({ id: 'surf-d' as SurfaceId, type: 'diff' });
    killSurfacePty({ id: 'surf-m' as SurfaceId, type: 'markdown' });
    expect(kill).not.toHaveBeenCalled();
  });

  it('walks a split tree and kills every terminal, skipping non-terminals', () => {
    const tree: SplitNode = {
      type: 'branch',
      direction: 'horizontal',
      ratio: 0.5,
      children: [
        leaf('pane-1', [term('surf-1'), browser('surf-b'), term('surf-2')]),
        {
          type: 'branch',
          direction: 'vertical',
          ratio: 0.5,
          children: [
            leaf('pane-2', [term('surf-3')]),
            leaf('pane-3', [{ id: 'surf-md' as SurfaceId, type: 'markdown' }]),
          ],
        },
      ],
    };

    killTreeTerminalPtys(tree);

    expect(kill).toHaveBeenCalledTimes(3);
    expect(kill).toHaveBeenCalledWith('surf-1');
    expect(kill).toHaveBeenCalledWith('surf-2');
    expect(kill).toHaveBeenCalledWith('surf-3');
    expect(kill).not.toHaveBeenCalledWith('surf-b');
    expect(kill).not.toHaveBeenCalledWith('surf-md');
  });

  it('is a safe no-op when window/preload is unavailable (Node context)', () => {
    delete (globalThis as any).window;
    expect(() => killSurfacePty(term('surf-1'))).not.toThrow();
    expect(() => killTreeTerminalPtys(leaf('pane-1', [term('surf-1')]))).not.toThrow();
  });
});
