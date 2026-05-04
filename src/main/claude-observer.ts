/**
 * Claude Code terminal output observer.
 * Parses PTY data streams for Claude Code patterns (agents, skills, tools, tokens)
 * and emits structured events to the renderer for sidebar display.
 */

import { BrowserWindow } from 'electron';
import { IPC_CHANNELS, SurfaceId } from '../shared/types';

// Strip ANSI escape codes from terminal output
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
}

export interface AgentActivity {
  name: string;
  toolUses: number;
  tokens: string;
  done: boolean;
}

export interface ClaudeActivity {
  agents: AgentActivity[];
  activeSkill: string | null;
  lastTool: string | null;
  lastUpdate: number;
  isDone: boolean; // true after "Baked for" / "Cost:" — Claude finished responding
}

const activities = new Map<SurfaceId, ClaudeActivity>();

// Patterns to match in Claude Code terminal output
const PATTERNS = {
  // "Running 3 agents…" or "● 3 Explore agents finished"
  agentBatchStart: /Running (\d+) agents/,
  agentBatchDone: /(\d+)\s+\w+\s+agents?\s+finished/,

  // "├─ Research · 2 tool uses · 13.4k tokens" or "└─ Name · N tool uses · Xk tokens"
  agentDetail: /[├└]─\s*(.+?)\s*·\s*(\d+)\s*tool\s*uses?\s*·\s*([\d.]+k?)\s*tokens/,

  // "⎿  Done" after an agent entry
  agentDone: /⎿\s+Done/,

  // "Skill(name)" or "Skill(ns:name)"
  skillLoad: /Skill\(([^)]+)\)/,

  // "● Bash(...)" / "⏩ Bash(...)" — various bullet styles Claude Code uses
  toolUse: /[●⏩▸◆]\s*(Bash|Read|Write|Edit|Grep|Glob|Agent|WebSearch|WebFetch|LSP|Task)\s*\(/i,
  mcpTool: /[●⏩▸◆]\s*plugin:([^:]+):([^\s]+)/,
  // "⎿  …" tool result lines mean a tool is actively running
  toolResult: /^[⎿⎾]/,

  // "✻ Baked for 3m 10s" / "✻ Cost: $0.05" / alt chars — Claude finished responding
  responseDone: /[✻✦⏎]\s*(Baked for|Cost:|Tokens:)/,
};

function getOrCreate(surfaceId: SurfaceId): ClaudeActivity {
  let activity = activities.get(surfaceId);
  if (!activity) {
    activity = { agents: [], activeSkill: null, lastTool: null, lastUpdate: Date.now(), isDone: false };
    activities.set(surfaceId, activity);
  }
  return activity;
}

/**
 * Process a chunk of PTY data for Claude Code patterns.
 * Called from the main process whenever PTY data flows through.
 */
export function observePtyData(surfaceId: SurfaceId, data: string): void {
  const clean = stripAnsi(data);
  const lines = clean.split('\n');

  let changed = false;
  const activity = getOrCreate(surfaceId);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Response done ("✻ Baked for …" / "✻ Cost: …")
    if (PATTERNS.responseDone.test(trimmed)) {
      activity.isDone = true;
      activity.lastTool = null;
      activity.activeSkill = null;
      changed = true;
      continue;
    }

    // Agent batch start
    const batchMatch = trimmed.match(PATTERNS.agentBatchStart);
    if (batchMatch) {
      activity.agents = [];
      activity.isDone = false;
      changed = true;
      continue;
    }

    // Agent detail line
    const detailMatch = trimmed.match(PATTERNS.agentDetail);
    if (detailMatch) {
      const name = detailMatch[1].trim();
      const toolUses = parseInt(detailMatch[2]);
      const tokens = detailMatch[3];

      // Update or add agent
      const existing = activity.agents.find(a => a.name === name);
      if (existing) {
        existing.toolUses = toolUses;
        existing.tokens = tokens;
      } else {
        activity.agents.push({ name, toolUses, tokens, done: false });
      }
      changed = true;
      continue;
    }

    // Agent done
    if (PATTERNS.agentDone.test(trimmed)) {
      // Mark the last agent as done
      const lastAgent = activity.agents[activity.agents.length - 1];
      if (lastAgent && !lastAgent.done) {
        lastAgent.done = true;
        changed = true;
      }
      continue;
    }

    // Agent batch done
    const batchDoneMatch = trimmed.match(PATTERNS.agentBatchDone);
    if (batchDoneMatch) {
      activity.agents.forEach(a => a.done = true);
      changed = true;
      continue;
    }

    // Skill loaded
    const skillMatch = trimmed.match(PATTERNS.skillLoad);
    if (skillMatch) {
      activity.activeSkill = skillMatch[1];
      changed = true;
      continue;
    }

    // Tool use
    const toolMatch = trimmed.match(PATTERNS.toolUse);
    if (toolMatch) {
      activity.lastTool = toolMatch[1];
      activity.isDone = false;
      changed = true;
      continue;
    }

    // MCP tool
    const mcpMatch = trimmed.match(PATTERNS.mcpTool);
    if (mcpMatch) {
      activity.lastTool = `${mcpMatch[1]}:${mcpMatch[2]}`;
      activity.isDone = false;
      changed = true;
      continue;
    }

    // Tool result line (⎿) — means a tool is actively running, clear done state
    if (PATTERNS.toolResult.test(trimmed) && activity.isDone) {
      activity.isDone = false;
      changed = true;
      continue;
    }
  }

  if (changed) {
    activity.lastUpdate = Date.now();
    broadcast(surfaceId, activity);
  }
}

/**
 * Get activity for a surface.
 */
export function getActivity(surfaceId: SurfaceId): ClaudeActivity | undefined {
  return activities.get(surfaceId);
}

/**
 * Clear activity for a surface (when terminal is closed).
 */
export function clearActivity(surfaceId: SurfaceId): void {
  activities.delete(surfaceId);
}

/**
 * Broadcast activity update to all renderer windows.
 */
function broadcast(surfaceId: SurfaceId, activity: ClaudeActivity): void {
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.CLAUDE_ACTIVITY, { surfaceId, activity });
    }
  });
}
