export type Category = { name: string; tokens: number; kind: 'used' | 'free' | 'buffer' }
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type PaceOf = { typical: number; skip: number }
export type Snapshot = {
  window: number
  tokens: number
  percent: number
  total: number
  categories: Category[]
  limits: Limit[]
  /** when the limit figures were read */
  limitsAt?: number
  /** why the usage service last refused, while it is backed off */
  limitsError?: string
  /** per window kind: the usual final % and the one-off % left out of the pace */
  pace?: Record<string, PaceOf>
  /** the minute it was taken in: redraws countdowns at least once a minute */
  minute?: number
}

/** auto compact: on or off, and the context % that sets it off (kept for every chat) */
export type AutoCompact = { isOn: boolean; at: number | null }

/** what holds auto compact back in a chat: an ask (or "after my next compact"), or a compaction that left it past the % */
export type Hold = { chat: string; waits: boolean; stuck: boolean }

/**
 * the prompt cache: when the main thread's last request ended, the lifetime its
 * entries were written with (as the transcript records it), and where the
 * transcript is, so a reload can look again
 */
export type PromptCache = { lastAt: number | null; ttlMs: number | null; transcript: string | null }

/** the last main-thread turn: how long it took, what it wrote, which model, and the share of its input the cache served */
export type LastTurn = { durationMs: number; outputTokens: number; model: string; hitPct: number | null }

/** the session beyond the context: its cost, its prompts, its last turn, the agents running, and the context at each turn's end */
export type SessionInfo = {
  costUsd: number | null
  turns: number | null
  last: LastTurn | null
  agents: string[]
  /** context tokens at the end of the newest main-thread turns, oldest first, since the last compaction */
  growth: number[]
}

/**
 * a background shell of this session, from the Bash call that came back with it
 * (run in the background, or moved there by ctrl+b or a timeout) to its end:
 * `ended` when it went without a notification saying how (a subagent's shell)
 */
export type Shell = {
  id: string
  command: string
  description: string | null
  toolUseId: string
  /** the subagent that started it, and its name; null on the main thread */
  agentId: string | null
  agent: string | null
  /** killed with the subagent that started it when that agent answers */
  endsWithAgent: boolean
  outputFile: string | null
  startedAt: number
  status: 'running' | 'completed' | 'failed' | 'killed' | 'ended'
  exitCode: number | null
  endedAt: number | null
}

/**
 * the shell pane: which shell it shows, its output (the last lines, or as much of
 * the whole as it holds), how many bytes at the start were left out, when the
 * output last changed
 */
export type ShellView = { id: string | null; isFull: boolean; output: string | null; skipped: number; outputAt: number | null; error: string | null }

/** one of this mod's own /config rows, as the settings pane shows it */
export type SettingRow = { key: string; label: string; value: boolean | string | number | readonly string[]; options?: readonly string[] }

/**
 * the settings pane: the mod's /config rows, and why the last change was refused;
 * read only where /config has none of them (the desktop app), the values this load
 * was given in their place
 */
export type QuotaSettings = { rows: SettingRow[]; error: string | null; isReadOnly: boolean }

declare module 'claude-code' {
  interface PluginState {
    'usage-quota': {
      snapshot: Snapshot | null
      isOn: boolean
      isCollapsed: boolean
      autoCompact: AutoCompact
      /** the choice the band is asking for: the context was already past a new % */
      autoAsk: { at: number; percent: number } | null
      hold: Hold
      /** bumped on every % set: draws the field afresh even when the value is unchanged */
      fieldTick: number
      fieldText: string | null
      /** the desktop app's theme, as its settings (or the OS) have it */
      theme: 'dark' | 'light'
      promptCache: PromptCache
      /** bumped every second while the cache countdown shows: redraws it */
      cacheTick: number
      sessionInfo: SessionInfo
      settings: QuotaSettings
      /** the running background shells, and the ones that ended lately */
      shells: Shell[]
      shellView: ShellView
      /** the Shells row as its count alone (kept for every chat, as isCollapsed is) */
      shellsCollapsed: boolean
    }
  }
}
