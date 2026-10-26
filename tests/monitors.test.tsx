import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { endMissing, endShell, notificationsOf, pruneShells, tasksDirOf } from '../hooks/register'
import type { Shell } from '../types'

const NOW = Date.parse('2026-10-04T06:00:00Z')
const MIN = 60_000
const HOUR = 60 * MIN

const PANE = { component: 'Pane', requestId: 'usage-quota' } as const
const MONITOR_PANE = { component: 'Pane', requestId: 'usage-quota-monitor' } as const
const PROPS = {
  title: 'Usage',
  isFocused: false,
  bodyColumns: 60,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
} as const
const TASKS = '/tmp/claude-1000/-work-app/s1/tasks'
const STARTED = 'Monitor started (task m1, expires in 5m unless the source ends first; you get one notice at expiry — re-arm if you still need the watch).'

// as the engine sends them (2.1.310): an event has no <status>; the end of the script has
function event(id: string, text: string): string {
  return `<task-notification>\n<task-id>${id}</task-id>\n<summary>Monitor event: "errors in deploy.log"</summary>\n<event>${text}</event>\n</task-notification>`
}
function ended(id: string, status: string, summary: string): string {
  return `<task-notification>\n<task-id>${id}</task-id>\n<tool-use-id>toolu_1</tool-use-id>\n<output-file>${TASKS}/${id}.output</output-file>\n<status>${status}</status>\n<summary>${summary}</summary>\n</task-notification>`
}

function monitor(id: string, extra: Partial<Shell> = {}): Shell {
  return {
    id, command: 'tail -f deploy.log | grep --line-buffered ERROR', description: 'errors in deploy.log', toolUseId: `toolu_${id}`, agentId: null, agent: null,
    endsWithAgent: false, outputFile: null, isForeground: false, output: null, isMonitor: true, timeoutMs: 5 * MIN, startedAt: NOW, status: 'running', exitCode: null, endedAt: null, ...extra,
  }
}

test("a monitor's event is no end; the end of its script is, and so is the notice that it expired", async () => {
  expect(notificationsOf(event('m1', 'ERROR: disk full'))).toEqual([])
  expect(notificationsOf(event('m1', '[Monitor expired after 5m with 2 events delivered. Re-arm it if you still need the watch.]'))).toEqual([{ id: 'm1', status: 'expired', exitCode: null }])
  expect(notificationsOf(ended('m1', 'failed', 'Monitor "errors in deploy.log" script failed (exit 3)'))).toEqual([{ id: 'm1', status: 'failed', exitCode: 3 }])
  expect(notificationsOf(ended('m1', 'completed', 'Monitor "x" script completed (exit 0)'))).toEqual([{ id: 'm1', status: 'completed', exitCode: 0 }])
})

test('the tasks folder: the temp folder, the uid, the directory as a name and the session', async () => {
  expect(tasksDirOf('/tmp', '1000', '/work/my app', 's1')).toBe('/tmp/claude-1000/-work-my-app/s1/tasks')
  expect(tasksDirOf('/var/tmp/', '501', '/w', 's2')).toBe('/var/tmp/claude-501/-w/s2/tasks')
})

test('a monitor killed once its time is up expired; one stopped before is killed', async () => {
  const list = [monitor('m1'), monitor('m2')]
  expect(endShell(list, { id: 'm1', status: 'killed', exitCode: null }, NOW + 5 * MIN)[0]!.status).toBe('expired')
  expect(endShell(list, { id: 'm2', status: 'killed', exitCode: null }, NOW + MIN)[1]!.status).toBe('killed')
  // a shell has no timeout: killed is killed
  expect(endShell([monitor('b1', { isMonitor: false, timeoutMs: null })], { id: 'b1', status: 'killed', exitCode: null }, NOW + HOUR)[0]!.status).toBe('killed')
  // the Stop hook's list names monitors among its shells: one it leaves out has ended
  const missing = endMissing(list, ['m2'], NOW + MIN)
  expect(missing.map(m => m.status)).toEqual(['ended', 'running'])
  // its output file, read after, says how, from when it ended; a word after that changes nothing
  const told = endShell(missing, { id: 'm1', status: 'completed', exitCode: 0 }, NOW + 2 * MIN)
  expect(told[0]).toMatchObject({ status: 'completed', exitCode: 0, endedAt: NOW + MIN })
  expect(endShell(told, { id: 'm1', status: 'killed', exitCode: null }, NOW + 3 * MIN)[0]!.status).toBe('completed')
})

test('monitors and shells are kept apart: many ended monitors never push a shell out', async () => {
  const shell = monitor('b1', { isMonitor: false, status: 'completed', endedAt: NOW })
  const many = Array.from({ length: 8 }, (_, i) => monitor(`m${i}`, { status: 'expired', endedAt: NOW }))
  const kept = pruneShells([shell, ...many], NOW + MIN).map(s => s.id)
  expect(kept).toEqual(['b1', 'm3', 'm4', 'm5', 'm6', 'm7'])
})

// what the engine answers beneath the plugin; `output` is the monitor's file
function world(on: On, calls: string[], output = { text: '' }, env: Record<string, string> = {}) {
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
  on('agent.list', () => ({ value: [] }) as never)
  on('session.authorize', () => ({ value: null }))
  on('session.measure', () => ({ changed: [] }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 's1' }) as never)
  on('session.cwd', () => ({ value: '/work/app' }) as never)
  on('session.root', () => ({ value: '/work/app' }) as never)
  on('env.get', (_$, e) => ({ value: env[(e as unknown as { name: string }).name] }) as never)
  on('process.run', (_$, e) => {
    const argv = (e as unknown as { argv: string[] }).argv
    calls.push(`run ${argv.join(' ')}`)
    return { value: { exitCode: 0, stdout: argv[0] === 'id' ? '1000\n' : 'Linux\n', stderr: '' } } as never
  })
  on('fs.exists', (_$, e) => ({ value: (e as unknown as { path: string }).path === TASKS }) as never)
  on('fs.stat', () => ({ value: { kind: 'file', size: output.text.length, mtimeMs: NOW, isLink: false } }) as never)
  on('fs.read', () => ({ value: output.text }) as never)
  on('command.register', () => ({ value: { command: 'quota' } }))
  on('ui.open', (_$, e) => (calls.push(`open ${e.id}`), { value: { isPlaced: true } }) as never)
  on('ui.close', (_$, e) => (calls.push(`close ${e.id}`), { value: undefined }) as never)
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('turn.complete', () => ({ text: '' }))
  on('turn.start', () => ({ turnId: 't1' }))
  // Monitor: comes back at once with its task's id
  on('tool.call', { tool: 'Monitor' }, (_$, e) => ({ result: { taskId: 'm1', timeoutMs: (e as unknown as { timeout_ms: number }).timeout_ms, persistent: false }, text: STARTED }) as never)
  on('tool.call', { tool: 'TaskStop' }, (_$, e) => {
    const id = (e as unknown as { task_id: string }).task_id
    calls.push(`stop ${id}`)
    return { result: { message: `Successfully stopped task: ${id}`, task_id: id, task_type: 'local_bash' }, text: '' } as never
  })
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('classic.Stop', () => ({}) as never)
  return clock
}

const MONITOR = { tool: 'Monitor', command: 'tail -f deploy.log | grep --line-buffered ERROR', description: 'errors in deploy.log', timeout_ms: 5 * MIN } as never

test('a monitor shows in the Monitors row, not the Shells row; its events leave it running; its end ends it', async ($, on) => {
  world(on, [])
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...PANE, props: PROPS })
  expect(await ui.find({ type: 'Text', text: 'Monitors' })).toBeUndefined()

  await $.tool.call(MONITOR)
  expect(await ui.find({ type: 'Text', text: 'Monitors' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Shells' })).toBeUndefined()
  expect((await ui.find({ type: 'Button', key: 'monitor:m1' }))?.props.label).toBe('errors in deploy.log')

  await $.prompt.submit({ text: event('m1', 'ERROR: disk full'), wait: false, origin: { kind: 'task-notification' } } as never)
  expect((await ui.find({ type: 'Button', key: 'monitor:m1' }))?.props.label).toBe('errors in deploy.log')

  await $.prompt.submit({ text: ended('m1', 'failed', 'Monitor "errors in deploy.log" script failed (exit 3)'), wait: false, origin: { kind: 'task-notification' } } as never)
  const done = await ui.find({ type: 'Button', key: 'monitor:m1' })
  expect(done?.props.label).toBe('errors in deploy.log (failed (exit 3))')
  expect(done?.props.dimColor).toBe(true)
  await ui.unmount()
})

test("a press opens the monitor's pane: its command, when it expires and its output, from the tasks folder; Stop stops it", async ($, on) => {
  const calls: string[] = []
  const output = { text: 'ERROR: disk full\n' }
  const clock = world(on, calls, output)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...PANE, props: PROPS })
  await $.tool.call(MONITOR)
  expect(calls).toContain('run id -u')
  await clock.advance(65_000)
  await ui.press({ key: 'monitor:m1' })
  expect(calls).toContain('open usage-quota-monitor')

  const pane = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...MONITOR_PANE, props: { ...PROPS, title: 'Monitor' } })
  expect(await pane.find({ type: 'Text', text: 'tail -f deploy.log | grep --line-buffered ERROR' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'running for 1m 5s · expires in 3m 55s' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: `${TASKS}/m1.output` })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'ERROR: disk full' })).toBeDefined()

  await pane.press({ key: 'stopShell' })
  expect(calls).toContain('stop m1')
  expect(await pane.find({ type: 'Text', text: /^killed · ran 1m 5s/ })).toBeDefined()
  await pane.unmount()
  await ui.unmount()
})

test("a monitor whose time is up expires, from its output file's last line", async ($, on) => {
  const output = { text: 'ERROR: disk full\n' }
  const clock = world(on, [], output)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...PANE, props: PROPS })
  await $.tool.call({ ...(MONITOR as object), timeout_ms: 10_000 } as never)
  await clock.advance(10_000)
  output.text += '\n[killed]\n'
  await clock.advance(3_000)
  expect((await ui.find({ type: 'Button', key: 'monitor:m1' }))?.props.label).toBe('errors in deploy.log (expired)')
  await ui.unmount()
})

test('Clear and the arrow act on the Monitors row alone', async ($, on) => {
  world(on, [])
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...PANE, props: PROPS })
  await $.tool.call(MONITOR)
  await $.tool.call({ tool: 'TaskStop', task_id: 'm1' } as never)
  expect(await ui.find({ type: 'Text', text: 'none running ·' })).toBeDefined()
  await ui.press({ key: 'monitorsCollapse' })
  expect((await ui.find({ type: 'Button', key: 'monitorsCollapse' }))?.props.label).toBe('▲')
  expect(await ui.find({ type: 'Button', key: 'monitor:m1' })).toBeUndefined()
  await ui.press({ key: 'monitorsCollapse' })
  await ui.press({ key: 'clearMonitors' })
  expect(await ui.find({ type: 'Text', text: 'Monitors' })).toBeUndefined()
  await ui.unmount()
})

test('Show monitors off: no Monitors row', { options: { show_monitors: false } }, async ($, on) => {
  world(on, [])
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...PANE, props: PROPS })
  await $.tool.call(MONITOR)
  expect(await ui.find({ type: 'Text', text: 'Monitors' })).toBeUndefined()
  await ui.unmount()
})
