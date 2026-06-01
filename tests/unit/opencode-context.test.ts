import { describe, it, expect } from 'vitest';
import { injectWmuxBlock } from '../../src/main/opencode-context';

const START = '<!-- wmux:start';
const END = '<!-- wmux:end -->';
const BLOCK = `${START} v1 -->\nUse the wmux CLI.\n${END}`;

describe('injectWmuxBlock', () => {
  it('returns the block alone when existing is empty', () => {
    expect(injectWmuxBlock('', BLOCK)).toBe(BLOCK);
  });
  it('appends the block when no markers present', () => {
    const out = injectWmuxBlock('# My rules\n', BLOCK);
    expect(out.startsWith('# My rules')).toBe(true);
    expect(out.includes(BLOCK)).toBe(true);
  });
  it('replaces an existing block, preserving surrounding content', () => {
    const old = `top\n${START} v0 -->\nOLD\n${END}\nbottom`;
    const out = injectWmuxBlock(old, BLOCK);
    expect(out.includes('OLD')).toBe(false);
    expect(out.includes('top')).toBe(true);
    expect(out.includes('bottom')).toBe(true);
    expect(out.includes(BLOCK)).toBe(true);
  });
});
