import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { cacheLeft, lastTurnOf, modelName, nextValue, pushGrowth, readShow, seconds, transcriptPath, ttlFromTranscript, turnsUntilCompact } from '../hooks/register'

const NOW = Date.parse('2026-10-04T06:00:00Z')
const MIN = 60_000
const HOUR = 60 * MIN

const PANE = { component: 'Pane', requestId: 'usage-quota' } as const
const PROPS = {
  title: 'Usage',
  isFocused: false,
  bodyColumns: 60,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
} as const
const TURN = { answer: 'done', durationMs: 1_000, isAborted: false, turnId: 't1', reason: 'answer' } as never
const QUOTA = { command: 'quota', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } } as const
const TRANSCRIPT = '/home/me/.claude/projects/-work-app/s1.jsonl'

// one transcript row: an assistant reply whose request wrote to the cache
function row(made: { ephemeral_5m_input_tokens: number; ephemeral_1h_input_tokens: number }, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ type: 'assistant', ...extra, message: { usage: { cache_creation_input_tokens: 10, cache_creation: made } } })
}
const ONE_HOUR = row({ ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 500 })
const FIVE_MIN = row({ ephemeral_5m_input_tokens: 500, ephemeral_1h_input_tokens: 0 })

// what the session reports; a test changes it between turns
type Live = { tokens: number; costUsd?: number; turns: number; agents: { name?: string; type: string; description: string; status: string }[] }

// what the engine answers beneath the plugin; `transcript` is the session's file
function world(on: On, transcript: string | null, calls: string[] = [], logs: string[] = [], live: Live = { tokens: 40_000, turns: 0, agents: [] }) {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  on('session.usage', () => ({
    value: {
      startedAt: NOW - HOUR,
      context: { window: 200_000, tokens: live.tokens, percent: (live.tokens / 200_000) * 100 },
      rateLimits: [{ kind: 'seven_day', percentUsed: 10, resetsAt: new Date(NOW + 3 * 24 * HOUR).toISOString() }],
      ...(live.costUsd === undefined ? {} : { cost: { usd: live.costUsd } }),
    },
  }) as never)
  on('session.turns', () => ({ value: live.turns }) as never)
  on('agent.list', () => ({ value: live.agents.map((a, i) => ({ id: `a${i}`, ...a })) }) as never)
  on('session.authorize', () => ({ value: null }))
  on('session.measure', () => ({ changed: [] }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 's1' }) as never)
  on('session.cwd', () => ({ value: '/work/app' }) as never)
  on('session.root', () => ({ value: '/work/app' }) as never)
  on('env.get', (_$, e) => ({ value: (e as unknown as { name: string }).name === 'HOME' ? '/home/me' : undefined }) as never)
  on('fs.exists', (_$, e) => ({ value: transcript !== null && (e as unknown as { path: string }).path === TRANSCRIPT }) as never)
  on('fs.stat', () => ({ value: { kind: 'file', size: transcript?.length ?? 0, mtimeMs: 1, isLink: false } }) as never)
  on('fs.read', () => ({ value: transcript ?? '' }) as never)
  on('command.register', () => ({ value: { command: 'quota' } }))
  on('ui.open', (_$, e) => (calls.push(`open ${e.id}`), { value: { isPlaced: true } }) as never)
  on('ui.close', (_$, e) => (calls.push(`close ${e.id}`), { value: undefined }) as never)
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', (_$, e) => (logs.push((e as unknown as { text: string }).text), { value: undefined }) as never)
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('turn.complete', () => ({ text: '' }))
  on('turn.start', () => ({ turnId: 't1' }))
  return clock
}

test('the cache lifetime is the newest main-thread row that wrote to the cache', async () => {
  expect(ttlFromTranscript([FIVE_MIN, ONE_HOUR].join('\n'))).toBe(HOUR)
  expect(ttlFromTranscript([ONE_HOUR, FIVE_MIN].join('\n'))).toBe(5 * MIN)
  // a subagent's row is its own cache, not the main thread's
  expect(ttlFromTranscript([ONE_HOUR, row({ ephemeral_5m_input_tokens: 9, ephemeral_1h_input_tokens: 0 }, { isSidechain: true })].join('\n'))).toBe(HOUR)
  // a row that only read the cache says nothing; nor does a tail cut mid-row
  expect(ttlFromTranscript([FIVE_MIN, row({ ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 })].join('\n'))).toBe(5 * MIN)
  expect(ttlFromTranscript(`"cache_creation":{"ephemeral_1h_input_tokens":5}}}\n${FIVE_MIN}\n`)).toBe(5 * MIN)
  expect(ttlFromTranscript('{"type":"user"}\n')).toBeNull()
})

test("the transcript is found where Claude Code keeps it: the directory's path with each other character as -", async () => {
  expect(transcriptPath('/home/me/.claude', '/home/me/src/my.app', 'abc')).toBe('/home/me/.claude/projects/-home-me-src-my-app/abc.jsonl')
})

test('the countdown reads to the second', async () => {
  expect(cacheLeft(59 * MIN + 30_000)).toBe('59m 30s')
  expect(cacheLeft(4 * MIN + 1)).toBe('4m 1s')
  expect(cacheLeft(12_000)).toBe('12s')
  expect(cacheLeft(HOUR)).toBe('1h 0m')
})

test('the session opens the pane, and /quota closes and reopens it', async ($, on) => {
  const calls: string[] = []
  world(on, null, calls)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  expect(calls).toEqual(['open usage-quota'])
  await $.command.run(QUOTA)
  expect(calls).toEqual(['open usage-quota', 'close usage-quota'])
  await $.command.run(QUOTA)
  expect(calls).toEqual(['open usage-quota', 'close usage-quota', 'open usage-quota'])
})

test('the cache line counts down from the last reply, with the 1 hour lifetime the transcript records', async ($, on) => {
  const clock = world(on, `${ONE_HOUR}\n`)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...PANE, props: PROPS })
  expect(await ui.find({ text: 'starts with your next message' })).toBeDefined()

  await $.turn.complete(TURN)
  await clock.advance(MIN)
  expect(await ui.find({ text: 'expires in 59m 0s' })).toBeDefined()
  await ui.unmount()
})

test('a 5 minute cache turns amber in its last minute, then says it expired, and a reply warms it again', async ($, on) => {
  const clock = world(on, `${FIVE_MIN}\n`)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...PANE, props: PROPS })
  await $.turn.complete(TURN)
  await clock.advance(MIN)
  expect((await ui.find({ type: 'Text', text: 'expires in 4m 0s' }))?.props.color).toBe('#4ade80')
  await clock.advance(3 * MIN + 30_000)
  expect((await ui.find({ type: 'Text', text: 'expires in 30s' }))?.props.color).toBe('#fbbf24')
  await clock.advance(2 * MIN + 30_000)
  expect(await ui.find({ text: 'expired 2m ago – the next message re-sends the context' })).toBeDefined()
  await $.turn.complete(TURN)
  await clock.advance(1_000)
  expect(await ui.find({ text: 'expires in 4m 59s' })).toBeDefined()
  await ui.unmount()
})

test('with no transcript to read, 5 minutes is assumed and the line says so', async ($, on) => {
  const clock = world(on, null)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...PANE, props: PROPS })
  await $.turn.complete(TURN)
  await clock.advance(MIN)
  expect(await ui.find({ text: 'expires in 4m 0s (5m assumed)' })).toBeDefined()
  await ui.unmount()
})

test('collapsed, the cache line still shows', async ($, on) => {
  const clock = world(on, `${FIVE_MIN}\n`)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...PANE, props: PROPS })
  await ui.press({ key: 'collapse' })
  await $.turn.complete(TURN)
  await clock.advance(30_000)
  expect(await ui.find({ text: 'expires in 4m 30s' })).toBeDefined()
  // a blank line between the Context row and the Cache line
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts[texts.indexOf('Cache') - 1]).toBe(' ')
  await ui.unmount()
})

const USAGE = { input_tokens: 100, cache_read_input_tokens: 9_600, cache_creation_input_tokens: 300, output_tokens: 1_400, model: 'claude-opus-5-5' }
const TURN_WITH_USAGE = { answer: 'done', durationMs: 42_000, isAborted: false, turnId: 't1', reason: 'answer', usage: USAGE } as never

test('the figures behind the detail rows', async () => {
  expect(lastTurnOf(42_000, USAGE)).toEqual({ durationMs: 42_000, outputTokens: 1_400, model: 'claude-opus-5-5', hitPct: 96 })
  expect(lastTurnOf(1_000, { ...USAGE, input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }).hitPct).toBeNull()
  expect(modelName('claude-opus-5-5')).toBe('opus-5-5')
  expect(modelName('claude-sonnet-4-5-20250929')).toBe('sonnet-4-5')
  expect(seconds(42_000)).toBe('42s')
  expect(seconds(125_000)).toBe('2m 5s')
  // 10k a turn, 25k to go: 3 turns; one turn alone forecasts nothing
  expect(turnsUntilCompact([40_000, 50_000, 60_000], 25_000)).toBe(3)
  expect(turnsUntilCompact([40_000], 25_000)).toBeNull()
  // a compaction (a drop) starts the count again; at most the newest 8 are kept
  expect(pushGrowth([40_000, 90_000], 20_000)).toEqual([20_000])
  expect(pushGrowth([1, 2, 3, 4, 5, 6, 7, 8], 9)).toEqual([2, 3, 4, 5, 6, 7, 8, 9])
})

test('every part shows unless its option is off', async () => {
  expect(Object.values(readShow({})).every(Boolean)).toBe(true)
  expect(readShow({ show_agents: false, show_cache: true })).toMatchObject({ agents: false, cache: true, session: true })
})

test('the detail rows: cache hits, compact forecast, session, last turn and running agents', async ($, on) => {
  const live: Live = { tokens: 40_000, costUsd: 4.123, turns: 3, agents: [{ name: 'Explore', type: 'Explore', description: 'find it', status: 'running' }, { type: 'Plan', description: 'plan it', status: 'completed' }] }
  const clock = world(on, `${FIVE_MIN}\n`, [], [], live)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...PANE, props: PROPS })
  await $.turn.complete(TURN_WITH_USAGE)
  live.tokens = 60_000
  await $.turn.complete(TURN_WITH_USAGE)
  await clock.advance(3_000)

  expect(await ui.find({ type: 'Text', text: '96% hit last turn' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '$4.12 · 3 prompts' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '42s · 1k out · opus-5-5' })).toBeDefined()
  // only the running agent
  expect(await ui.find({ type: 'Text', text: '1 running: Explore' })).toBeDefined()
  // 20k a turn, and 200k less 60k used left before Claude Code compacts: 7 turns
  expect(await ui.find({ type: 'Text', text: 'in about 7 turns' })).toBeDefined()
  await ui.unmount()
})

test('a part set off in /config is not drawn', { options: { show_limits: false, show_session: false, show_last_turn: false, show_agents: false, show_cache_hits: false, show_compact_forecast: false } }, async ($, on) => {
  const live: Live = { tokens: 40_000, costUsd: 4, turns: 3, agents: [{ name: 'Explore', type: 'Explore', description: 'find it', status: 'running' }] }
  const clock = world(on, `${FIVE_MIN}\n`, [], [], live)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...PANE, props: PROPS })
  await $.turn.complete(TURN_WITH_USAGE)
  live.tokens = 60_000
  await $.turn.complete(TURN_WITH_USAGE)
  await clock.advance(3_000)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  for (const gone of ['Weekly', 'Session', 'Last turn', 'Agents', 'Compact', '96% hit last turn']) expect(texts).not.toContain(gone)
  expect(texts).toContain('Context')
  expect(texts).toContain('Cache')
  await ui.unmount()
})

test('with the context and the limits both off, the pane is the controls and the details', { options: { show_limits: false, show_context: false } }, async ($, on) => {
  const clock = world(on, `${FIVE_MIN}\n`)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...PANE, props: PROPS })
  await $.turn.complete(TURN_WITH_USAGE)
  await clock.advance(1_000)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts).not.toContain('Context')
  expect(texts).toContain('Cache')
  await ui.press({ key: 'collapse' })
  expect(await ui.find({ type: 'Text', text: 'Cache' })).toBeDefined()
  await ui.unmount()
})

const BAND = { component: 'AbovePrompt' } as const
const BAND_PROPS = { hasSurvey: false, isWorking: false, maxRows: 40, bodyColumns: 60, scroll: { offset: 0, bodyRows: 40 }, view: {} } as const

test('placement right: the pane draws, the band is left to Claude Code', { options: { placement: 'right' } }, async ($, on) => {
  world(on, null)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const pane = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...PANE, props: PROPS })
  expect(await pane.find({ type: 'Text', text: 'Cache' })).toBeDefined()
  const band = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...BAND, props: BAND_PROPS })
  expect(await band.find({ type: 'Text', text: 'Cache' })).toBeUndefined()
  await pane.unmount()
  await band.unmount()
})

test('placement bottom: the band draws, no pane opens, and /quota turns the band off and on', { options: { placement: 'bottom' } }, async ($, on) => {
  const calls: string[] = []
  world(on, null, calls)
  on('ui.panes', () => ({ value: [] }) as never)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const band = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...BAND, props: BAND_PROPS })
  expect(await band.find({ type: 'Text', text: 'Cache' })).toBeDefined()
  const pane = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...PANE, props: PROPS })
  expect(await pane.find({ type: 'Text', text: 'Cache' })).toBeUndefined()

  await $.command.run(QUOTA)
  expect(await band.find({ type: 'Text', text: 'Cache' })).toBeUndefined()
  await $.command.run(QUOTA)
  expect(await band.find({ type: 'Text', text: 'Cache' })).toBeDefined()
  expect(calls.filter(c => c.startsWith('open') || c.startsWith('close'))).toEqual([])
  await band.unmount()
  await pane.unmount()
})

test('switched to bottom in /config, the pane left open by the load before is closed', { options: { placement: 'bottom' } }, async ($, on) => {
  const calls: string[] = []
  const clock = world(on, null, calls)
  on('ui.panes', () => ({ value: [{ id: 'usage-quota', title: 'Usage', isShown: true, isFocused: false, isPlaced: true }] }) as never)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  await clock.advance(1)
  expect(calls).toEqual(['close usage-quota'])
})

// this mod's /config rows as the engine lists them; config.set writes into them, or
// refuses with `deny` when one is given
type Row = { key: string; label: string; value: boolean | string; options?: string[] }
function configRows(on: On, rows: Row[], sets: string[], deny?: string) {
  on('config.list', () => ({
    value: rows.map(r => ({ ...r, kind: typeof r.value === 'boolean' ? 'boolean' : 'choice', provider: { plugin: 'usage-quota', tier: 'user' }, isLocked: false })),
  }) as never)
  on('config.set', (_$, e) => {
    const { key, value } = e as unknown as { key: string; value: boolean | string }
    sets.push(`${key}=${String(value)}`)
    if (deny) return { deny } as never
    rows.find(r => r.key === key)!.value = value
    return { value } as never
  })
}
const ROWS = (): Row[] => [
  { key: 'usage-quota.placement', label: 'Placement', value: 'right', options: ['right', 'bottom'] },
  { key: 'usage-quota.show_cache', label: 'Show cache countdown', value: true },
]
const SETTINGS_PANE = { component: 'Pane', requestId: 'usage-quota-settings' } as const

test('a toggle flips, a choice moves to its next option', async () => {
  expect(nextValue({ key: 'k', label: 'l', value: true })).toBe(false)
  expect(nextValue({ key: 'k', label: 'l', value: 'right', options: ['right', 'bottom'] })).toBe('bottom')
  expect(nextValue({ key: 'k', label: 'l', value: 'bottom', options: ['right', 'bottom'] })).toBe('right')
})

test('Settings in the pane opens the settings pane, with the keys', async ($, on) => {
  const calls: string[] = []
  world(on, null, calls)
  configRows(on, ROWS(), [])
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...PANE, props: PROPS })
  await ui.press({ key: 'settings' })
  expect(calls).toContain('open usage-quota-settings')
  await ui.unmount()
})

test('each setting is a button: a press saves it through /config and the pane shows the new value', async ($, on) => {
  const sets: string[] = []
  world(on, null)
  configRows(on, ROWS(), sets)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...SETTINGS_PANE, props: PROPS })
  expect((await ui.find({ type: 'Button', key: 'set:usage-quota.show_cache' }))?.props.label).toBe('[x] Show cache countdown')
  await ui.press({ key: 'set:usage-quota.show_cache' })
  expect(sets).toEqual(['usage-quota.show_cache=false'])
  expect((await ui.find({ type: 'Button', key: 'set:usage-quota.show_cache' }))?.props.label).toBe('[ ] Show cache countdown')

  expect((await ui.find({ type: 'Button', key: 'set:usage-quota.placement' }))?.props.label).toBe('Placement: right')
  expect(await ui.find({ type: 'Text', text: '(press for bottom)' })).toBeDefined()
  await ui.press({ key: 'set:usage-quota.placement' })
  expect(sets).toEqual(['usage-quota.show_cache=false', 'usage-quota.placement=bottom'])
  expect((await ui.find({ type: 'Button', key: 'set:usage-quota.placement' }))?.props.label).toBe('Placement: bottom')
  // the digits press them, in order
  expect((await ui.find({ type: 'Button', key: 'set:usage-quota.placement' }))?.props.hotkey).toBe('1')
  await ui.unmount()
})

test('a change /config refuses is left as it was, and the pane says why', async ($, on) => {
  const sets: string[] = []
  world(on, null)
  configRows(on, ROWS(), sets, 'set by your organization')
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...SETTINGS_PANE, props: PROPS })
  await ui.press({ key: 'set:usage-quota.show_cache' })
  expect(await ui.find({ type: 'Text', text: 'Show cache countdown: set by your organization' })).toBeDefined()
  expect((await ui.find({ type: 'Button', key: 'set:usage-quota.show_cache' }))?.props.label).toBe('[x] Show cache countdown')
  await ui.unmount()
})

test('in a wide band the details join the two columns: Session and Last turn under the limits, Cache and Compact under the context', { options: { placement: 'bottom' } }, async ($, on) => {
  const live: Live = { tokens: 40_000, costUsd: 1, turns: 2, agents: [{ name: 'Explore', type: 'Explore', description: 'find it', status: 'running' }] }
  const clock = world(on, `${FIVE_MIN}\n`, [], [], live)
  on('ui.panes', () => ({ value: [] }) as never)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const wide = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...BAND, props: { ...BAND_PROPS, bodyColumns: 100 } })
  await $.turn.complete(TURN_WITH_USAGE)
  live.tokens = 60_000
  await $.turn.complete(TURN_WITH_USAGE)
  await clock.advance(3_000)
  // the left column is drawn first, then the right; Agents spans both, below them
  const at = async (ui: typeof wide) => {
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    return (name: string) => texts.indexOf(name)
  }
  let pos = await at(wide)
  for (const name of ['Weekly', 'Session', 'Last turn', 'Context', 'Cache', 'Compact', 'Agents']) expect(pos(name)).toBeGreaterThan(-1)
  expect(pos('Weekly')).toBeLessThan(pos('Session'))
  expect(pos('Last turn')).toBeLessThan(pos('Context'))
  expect(pos('Context')).toBeLessThan(pos('Cache'))
  expect(pos('Compact')).toBeLessThan(pos('Agents'))
  await wide.unmount()

  // too narrow for two columns: one block of details under the context, as in the pane
  const narrow = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...BAND, props: BAND_PROPS })
  pos = await at(narrow)
  expect(pos('Context')).toBeLessThan(pos('Cache'))
  expect(pos('Cache')).toBeLessThan(pos('Session'))
  await narrow.unmount()
})

test('the right-side pane keeps its details in one block below, however wide', { options: { placement: 'right' } }, async ($, on) => {
  const live: Live = { tokens: 40_000, costUsd: 1, turns: 2, agents: [] }
  const clock = world(on, `${FIVE_MIN}\n`, [], [], live)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...PANE, props: { ...PROPS, bodyColumns: 100 } })
  await $.turn.complete(TURN_WITH_USAGE)
  await clock.advance(3_000)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts.indexOf('Context')).toBeLessThan(texts.indexOf('Cache'))
  expect(texts.indexOf('Cache')).toBeLessThan(texts.indexOf('Session'))
  await ui.unmount()
})
