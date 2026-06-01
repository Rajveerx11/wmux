import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const START_MARKER = '<!-- wmux:start';
const END_MARKER = '<!-- wmux:end -->';

/** Pure: insert/replace the wmux block within existing content, preserving the rest. */
export function injectWmuxBlock(existing: string, wmuxBlock: string): string {
  if (existing.trim() === '') return wmuxBlock;
  const startIdx = existing.indexOf(START_MARKER);
  const endIdx = existing.indexOf(END_MARKER);
  if (startIdx === -1) {
    const separator = existing.endsWith('\n') ? '\n' : '\n\n';
    return existing + separator + wmuxBlock;
  }
  if (endIdx === -1) {
    return existing.substring(0, startIdx) + wmuxBlock;
  }
  const before = existing.substring(0, startIdx);
  const after = existing.substring(endIdx + END_MARKER.length);
  return before + wmuxBlock + after;
}

function getInstructionsPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron') as typeof import('electron');
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'claude-instructions', 'claude-instructions.md');
    }
  } catch {}
  return path.join(__dirname, '../../resources/claude-instructions.md');
}

function getAgentsMdPath(): string {
  return path.join(os.homedir(), '.config', 'opencode', 'AGENTS.md');
}

/** Ensures ~/.config/opencode/AGENTS.md contains the wmux block. */
export function ensureOpencodeContext(): void {
  try {
    const instructionsPath = getInstructionsPath();
    if (!fs.existsSync(instructionsPath)) {
      console.warn('[wmux] instructions source not found at', instructionsPath);
      return;
    }
    const wmuxBlock = fs.readFileSync(instructionsPath, 'utf-8');
    const agentsPath = getAgentsMdPath();
    const dir = path.dirname(agentsPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const existing = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, 'utf-8') : '';
    const next = injectWmuxBlock(existing, wmuxBlock);
    if (next !== existing) {
      fs.writeFileSync(agentsPath, next, 'utf-8');
      console.log('[wmux] Updated wmux context in ~/.config/opencode/AGENTS.md');
    }
  } catch (err) {
    console.warn('[wmux] Failed to update OpenCode context:', err);
  }
}
