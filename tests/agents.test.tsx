import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { agentLabel, agentTokens, mergeAgents, pruneAgents, recordSpawn, recordTool, recordTurn, toolDetail } from '../hooks/register'
import type { Agent } from '../types'

const NOW = Date.parse('2026-10-04T06:00:00Z')
const MIN = 60_000
const HOUR = 60 * MIN

const PANE = { component: 'Pane', requestId: 'usage-quota' } as const
const AGENT_PANE = { component: 'Pane', requestId: 'usage-quota-agent' } as const
const PROPS = {
  title: 'Usage',
  isFocused: false,
  bodyColumns: 60,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
} as const

type Listed = { id: string; name?: string; type: string; description: string; status: string; parentId?: string }

const EXPLORE: Listed = { id: 'a1', type: 'Explore', description: 'Find the config loader', status: 'running' }
const REVIEWER: Listed = { id: 'a2', name: 'reviewer', type: 'general-purpose', description: 'Review the diff', status: 'running', parentId: 'a1' }

function agent(id: string, extra: Partial<Agent> = {}): Agent {
  return {
    id, name: null, description: 'Do it', type: 'general-purpose', status: 'running', parentId: null, spawnedBy: null, startedAt: NOW, isStartSeen: false,
    endedAt: null, prompt: null, model: null, turns: 0, inputTokens: 0, cacheReadTokens: 0, outputTokens: 0, toolCalls: 0, recentTools: [], ...extra,
  }
}

test("the list's word is kept beside what the pane saw; one it stops naming has ended", async () => {
  const seen = mergeAgents([], [EXPLORE], NOW)
  expect(seen[0]).toMatchObject({ id: 'a1', type: 'Explore', status: 'running', startedAt: NOW, isStartSeen: false, endedAt: null })
  // its counts survive the next look; its end is when it was first seen ended
  const counted = recordTool(seen, 'a1', 'Grep', 'loadConfig', NOW + 1_000)
  const done = mergeAgents(counted, [{ ...EXPLORE, status: 'completed' }], NOW + MIN)
  expect(done[0]).toMatchObject({ status: 'completed', endedAt: NOW + MIN, toolCalls: 1 })
  expect(mergeAgents(done, [{ ...EXPLORE, status: 'completed' }], NOW + 2 * MIN)[0]!.endedAt).toBe(NOW + MIN)
  // no longer listed while running: ended, unless its spawn was only just seen
  expect(mergeAgents([agent('a3', { startedAt: NOW - MIN })], [], NOW)[0]).toMatchObject({ status: 'ended', endedAt: NOW })
  expect(mergeAgents([agent('a3', { startedAt: NOW - 1_000 })], [], NOW)[0]!.status).toBe('running')
})

test("a spawn gives the agent's real start, its prompt and model; turns and tool calls add up", async () => {
  const spawned = recordSpawn(mergeAgents([], [EXPLORE], NOW), { id: 'a1', at: NOW - 30_000, prompt: 'Find it.', model: 'claude-sonnet-5-5' })
  expect(spawned[0]).toMatchObject({ startedAt: NOW - 30_000, isStartSeen: true, prompt: 'Find it.', model: 'claude-sonnet-5-5', type: 'Explore' })
  // a spawn before the list names it makes the agent from the spawn's own words
  expect(recordSpawn([], { id: 'a9', at: NOW, description: 'Plan it', type: 'Plan' })[0]).toMatchObject({ description: 'Plan it', type: 'Plan', status: 'running' })

  const turn = { input_tokens: 1_000, cache_read_input_tokens: 9_000, cache_creation_input_tokens: 0, output_tokens: 1_200, model: 'claude-sonnet-5-5' }
  const worked = recordTurn(recordTurn(recordTool(spawned, 'a1', 'Bash', 'Run the tests', NOW), 'a1', turn), 'a1', { ...turn, output_tokens: 300, model: undefined })
  expect(worked[0]).toMatchObject({ turns: 2, inputTokens: 20_000, cacheReadTokens: 18_000, outputTokens: 1_500, model: 'claude-sonnet-5-5', toolCalls: 1, recentTools: [{ name: 'Bash', detail: 'Run the tests', at: NOW }] })
  expect(agentTokens(worked[0]!)).toBe('2 turns · 20k in, 90% cached · 2k out')
  // the last 5 calls are kept, all are counted
  const busy = [1, 2, 3, 4, 5, 6, 7].reduce((l, i) => recordTool(l, 'a1', 'Read', `f${i}`, NOW + i), worked)
  expect(busy[0]!.toolCalls).toBe(8)
  expect(busy[0]!.recentTools.map(t => t.detail)).toEqual(['f3', 'f4', 'f5', 'f6', 'f7'])
  // a loop the pane does not know is left out
  expect(recordTool(worked, 'fork', 'Read', null, NOW)).toEqual(worked)
})

test('a tool call is named by its description, command, file or pattern', async () => {
  expect(toolDetail({ command: 'npm test', description: 'Run the tests' })).toBe('Run the tests')
  expect(toolDetail({ file_path: '/work/app/a.ts' })).toBe('/work/app/a.ts')
  expect(toolDetail({ pattern: 'load\nConfig' })).toBe('load Config')
  expect(toolDetail({ command: 'x'.repeat(80) })).toBe(`${'x'.repeat(59)}…`)
  expect(toolDetail({ limit: 5 })).toBeNull()
})

test('an agent goes by its name, else its description, else its type; ended ones go after 10 minutes', async () => {
  expect(agentLabel({ id: 'a1', name: 'reviewer', description: 'Review it', type: 'general-purpose' })).toBe('reviewer')
  expect(agentLabel({ id: 'a1', name: null, description: 'Review it', type: 'general-purpose' })).toBe('Review it')
  expect(agentLabel({ id: 'a1', name: null, description: '', type: 'Explore' })).toBe('Explore')
  const list = [agent('r'), agent('e', { status: 'completed', endedAt: NOW })]
  expect(pruneAgents(list, NOW + MIN).map(a => a.id)).toEqual(['r', 'e'])
  expect(pruneAgents(list, NOW + 11 * MIN).map(a => a.id)).toEqual(['r'])
})

// what the engine answers beneath the plugin; `listed` is what $.agent.list() says
function world(on: On, listed: Listed[], calls: string[] = []) {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  on('session.usage', () => ({
    value: {
      startedAt: NOW - HOUR,
      context: { window: 200_000, tokens: 40_000, percent: 20 },
      rateLimits: [{ kind: 'seven_day', percentUsed: 10, resetsAt: new Date(NOW + 3 * 24 * HOUR).toISOString() }],
    },
  }) as never)
  on('session.turns', () => ({ value: 1 }) as never)
  on('agent.list', () => ({ value: listed }) as never)
  on('agent.spawn', () => ({ agentId: 'a1', model: 'claude-sonnet-5-5' }) as never)
  on('session.authorize', () => ({ value: null }))
  on('session.measure', () => ({ changed: [] }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 's1' }) as never)
  on('session.cwd', () => ({ value: '/work/app' }) as never)
  on('session.root', () => ({ value: '/work/app' }) as never)
  on('env.get', () => ({ value: undefined }) as never)
  on('fs.exists', () => ({ value: false }) as never)
  on('command.register', () => ({ value: { command: 'quota' } }))
  on('ui.open', (_$, e) => (calls.push(`open ${e.id}`), { value: { isPlaced: true } }) as never)
  on('ui.close', (_$, e) => (calls.push(`close ${e.id}`), { value: undefined }) as never)
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('turn.complete', () => ({ text: '' }))
  on('turn.start', () => ({ turnId: 't1' }))
  on('tool.call', { tool: 'TaskStop' }, (_$, e) => {
    const id = (e as unknown as { task_id: string }).task_id
    calls.push(`stop ${id}`)
    return { result: { message: `Successfully stopped task: ${id}`, task_id: id, task_type: 'local_agent' }, text: '' } as never
  })
  return clock
}

test("each agent is a button; a press opens its pane: who it is, its start, model, turns and prompt", async ($, on) => {
  const calls: string[] = []
  const listed = [EXPLORE, REVIEWER]
  const clock = world(on, listed, calls)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...PANE, props: PROPS })
  await $.agent.spawn({ prompt: 'Find where the config is loaded.\nReport the file.', description: 'Find the config loader', subagentType: 'Explore' } as never)
  await clock.advance(3_000)
  expect(await ui.find({ type: 'Text', text: '2 running:' })).toBeDefined()
  expect((await ui.find({ type: 'Button', key: 'agent:a1' }))?.props.label).toBe('Find the config loader')
  expect((await ui.find({ type: 'Button', key: 'agent:a2' }))?.props.label).toBe('reviewer')

  await $.turn.complete({ answer: '', durationMs: 5_000, isAborted: false, turnId: 't2', reason: 'answer', agentId: 'a1', usage: { input_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1_400, model: 'claude-sonnet-5-5' } } as never)
  await clock.advance(62_000)
  await ui.press({ key: 'agent:a1' })
  expect(calls).toContain('open usage-quota-agent')

  const pane = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...AGENT_PANE, props: { ...PROPS, title: 'Agent' } })
  expect(await pane.find({ type: 'Text', text: 'Find the config loader' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'running for 1m 5s' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'Explore' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'sonnet-5-5' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: '1 turn · 10 in, 0% cached · 1k out' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'Report the file.' })).toBeDefined()
  await pane.unmount()

  // the reviewer names the agent that started it
  await ui.press({ key: 'agent:a2' })
  const second = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...AGENT_PANE, props: { ...PROPS, title: 'Agent' } })
  expect(await second.find({ type: 'Text', text: 'subagent Find the config loader' })).toBeDefined()
  expect(await second.find({ type: 'Text', text: /\(since the pane first saw it\)$/ })).toBeDefined()
  await second.unmount()
  await ui.unmount()
})

test('Stop stops a running agent; one that ended stays, dim, until Clear', async ($, on) => {
  const calls: string[] = []
  const listed = [{ ...EXPLORE }]
  const clock = world(on, listed, calls)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...PANE, props: PROPS })
  await clock.advance(3_000)
  await ui.press({ key: 'agent:a1' })
  const pane = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...AGENT_PANE, props: { ...PROPS, title: 'Agent' } })
  await pane.press({ key: 'stopAgent' })
  expect(calls).toContain('stop a1')
  expect(await pane.find({ type: 'Text', text: /^killed · ran/ })).toBeDefined()
  expect(await pane.find({ type: 'Button', key: 'stopAgent' })).toBeUndefined()
  await pane.unmount()

  const ended = await ui.find({ type: 'Button', key: 'agent:a1' })
  expect(ended?.props.label).toBe('Find the config loader (killed)')
  expect(ended?.props.dimColor).toBe(true)
  await ui.press({ key: 'clearAgents' })
  expect(await ui.find({ type: 'Text', text: 'Agents' })).toBeUndefined()
  await ui.unmount()
})

test('the arrow collapses the Agents row to its count', async ($, on) => {
  const clock = world(on, [EXPLORE, REVIEWER])
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...PANE, props: PROPS })
  await clock.advance(3_000)
  await ui.press({ key: 'agentsCollapse' })
  expect(await ui.find({ type: 'Text', text: '2 running' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'agent:a1' })).toBeUndefined()
  await ui.unmount()
})
