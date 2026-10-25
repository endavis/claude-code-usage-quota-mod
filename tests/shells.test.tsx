import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { endMissing, endShell, endWithAgents, notificationsOf, outputFileOf, outputTail, pruneShells, shellEnd, shellLabel } from '../hooks/register'
import type { Shell } from '../types'

const NOW = Date.parse('2026-10-04T06:00:00Z')
const MIN = 60_000
const HOUR = 60 * MIN

const PANE = { component: 'Pane', requestId: 'usage-quota' } as const
const SHELL_PANE = { component: 'Pane', requestId: 'usage-quota-shell' } as const
const PROPS = {
  title: 'Usage',
  isFocused: false,
  bodyColumns: 60,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
} as const
const OUTPUT = '/tmp/claude-1000/-work-app/s1/tasks/b1.output'
const STARTED = `Command running in background with ID: b1. Output is being written to: ${OUTPUT}. You will be notified when it completes.`
const BY_USER = `Command was manually backgrounded by user with ID: b1. Output is being written to: ${OUTPUT}. You will be notified when it completes.`

function notification(id: string, status: string, summary: string): string {
  return `<task-notification>\n<task-id>${id}</task-id>\n<tool-use-id>toolu_1</tool-use-id>\n<output-file>${OUTPUT}</output-file>\n<status>${status}</status>\n<summary>${summary}</summary>\n</task-notification>`
}

function shell(id: string, extra: Partial<Shell> = {}): Shell {
  return {
    id, command: 'npm run dev', description: null, toolUseId: `toolu_${id}`, agentId: null, agent: null, endsWithAgent: false,
    outputFile: null, startedAt: NOW, status: 'running', exitCode: null, endedAt: null, ...extra,
  }
}

test('the output file is read from the Bash result, whichever words open it', async () => {
  expect(outputFileOf(STARTED)).toBe(OUTPUT)
  expect(outputFileOf(BY_USER)).toBe(OUTPUT)
  expect(outputFileOf('done')).toBeNull()
  expect(outputFileOf(undefined)).toBeNull()
})

test('a notification gives the task, how it ended and its exit code', async () => {
  expect(notificationsOf(notification('b1', 'completed', 'Background command "Wait" completed (exit code 0)'))).toEqual([{ id: 'b1', status: 'completed', exitCode: 0 }])
  expect(notificationsOf(notification('b2', 'failed', 'Background command "Build" failed with exit code 2'))).toEqual([{ id: 'b2', status: 'failed', exitCode: 2 }])
  expect(notificationsOf(notification('b3', 'killed', 'Background command "x" was stopped'))).toEqual([{ id: 'b3', status: 'killed', exitCode: null }])
  // two in one prompt; and a word of its own is an end all the same
  expect(notificationsOf(`${notification('b1', 'completed', '(exit code 0)')}\n${notification('b4', 'gone', '')}`).map(n => n.status)).toEqual(['completed', 'ended'])
  expect(notificationsOf('hello')).toEqual([])
})

test('a shell ends once; the engine list ends the ones it leaves out; old ones go', async () => {
  const list = [shell('b1'), shell('b2')]
  const ended = endShell(list, { id: 'b1', status: 'completed', exitCode: 0 }, NOW + MIN)
  expect(ended[0]).toMatchObject({ status: 'completed', exitCode: 0, endedAt: NOW + MIN })
  // a later word changes nothing
  expect(endShell(ended, { id: 'b1', status: 'killed', exitCode: null }, NOW + 2 * MIN)[0]!.status).toBe('completed')
  // b2 is not in the list any more; one just started is given a moment
  expect(endMissing([...list, shell('b3', { startedAt: NOW + MIN - 500 })], ['b1'], NOW + MIN).map(s => s.status)).toEqual(['running', 'ended', 'running'])
  // 10 minutes after their end, and past the newest 5, ended shells go; running ones stay
  const many = [shell('r', { startedAt: NOW - HOUR }), ...[1, 2, 3, 4, 5, 6].map(i => shell(`e${i}`, { status: 'completed', endedAt: NOW }))]
  expect(pruneShells(many, NOW + MIN).map(s => s.id)).toEqual(['r', 'e2', 'e3', 'e4', 'e5', 'e6'])
  expect(pruneShells(many, NOW + 11 * MIN).map(s => s.id)).toEqual(['r'])
})

test('a shell goes by its description, else its command cut short; its end in a word or two', async () => {
  expect(shellLabel(shell('b1', { description: 'Start the dev server' }))).toBe('Start the dev server')
  expect(shellLabel(shell('b1', { command: 'pytest -x\n  tests/' }))).toBe('pytest -x tests/')
  expect(shellLabel(shell('b1', { command: 'x'.repeat(60) }))).toBe(`${'x'.repeat(39)}…`)
  expect(shellEnd(shell('b1', { status: 'completed', exitCode: 0 }))).toBe('exit 0')
  expect(shellEnd(shell('b1', { status: 'failed', exitCode: 1 }))).toBe('failed (exit 1)')
  expect(shellEnd(shell('b1', { status: 'killed' }))).toBe('killed')
})

test("the output's tail: escapes out, a redrawn line as last drawn, the last lines only", async () => {
  expect(outputTail('\x1b[32mok\x1b[0m\nstep 1\rstep 2\r\n\n')).toBe('ok\nstep 2')
  expect(outputTail(['a', 'b', 'c', 'd'].join('\n'), 2)).toBe('c\nd')
})

// what the engine answers beneath the plugin; `output` is the shell's file
function world(on: On, calls: string[], output = { text: 'line 1\nline 2\n' }, agents: { id: string; name?: string; type: string; description: string; status: string }[] = []) {
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
  on('agent.list', () => ({ value: agents }) as never)
  on('session.authorize', () => ({ value: null }))
  on('session.measure', () => ({ changed: [] }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 's1' }) as never)
  on('session.cwd', () => ({ value: '/work/app' }) as never)
  on('session.root', () => ({ value: '/work/app' }) as never)
  on('env.get', () => ({ value: undefined }) as never)
  on('fs.exists', () => ({ value: false }) as never)
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
  // Bash: a command in the background comes back at once with its task's id
  on('tool.call', { tool: 'Bash' }, (_$, e) => {
    calls.push(`bash ${e.command}`)
    const id = e.command.includes('build') ? 'b2' : 'b1'
    return { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: id }, text: STARTED.replace(/b1/g, id) } as never
  })
  on('tool.call', { tool: 'TaskStop' }, (_$, e) => {
    const id = (e as unknown as { task_id: string }).task_id
    calls.push(`stop ${id}`)
    return { result: { message: `Successfully stopped task: ${id}`, task_id: id, task_type: 'local_bash' }, text: '' } as never
  })
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('classic.Stop', () => ({}) as never)
  return clock
}

const BASH = { tool: 'Bash', command: 'npm run dev', description: 'Start the dev server', run_in_background: true } as never
const BUILD = { tool: 'Bash', command: 'npm run build', run_in_background: true } as never

test('a background shell shows in the Shells row, then ends with its notification and its exit code', async ($, on) => {
  const calls: string[] = []
  world(on, calls)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...PANE, props: PROPS })
  expect(await ui.find({ type: 'Text', text: 'Shells' })).toBeUndefined()

  await $.tool.call(BASH)
  expect(await ui.find({ type: 'Text', text: '1 running:' })).toBeDefined()
  expect((await ui.find({ type: 'Button', key: 'shell:b1' }))?.props.label).toBe('Start the dev server')

  await $.prompt.submit({ text: notification('b1', 'completed', 'Background command "Start the dev server" completed (exit code 0)'), wait: false, origin: { kind: 'task-notification' } } as never)
  expect(await ui.find({ type: 'Text', text: 'none running ·' })).toBeDefined()
  const done = await ui.find({ type: 'Button', key: 'shell:b1' })
  expect(done?.props.label).toBe('Start the dev server (exit 0)')
  expect(done?.props.dimColor).toBe(true)
  await ui.unmount()
})

test("a press opens the shell's pane: its command, how long it has run and its output; Stop stops it", async ($, on) => {
  const calls: string[] = []
  const output = { text: '\x1b[1mready\x1b[0m on :3000\n' }
  const clock = world(on, calls, output)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...PANE, props: PROPS })
  await $.tool.call(BASH)
  await clock.advance(65_000)
  await ui.press({ key: 'shell:b1' })
  expect(calls).toContain('open usage-quota-shell')

  const pane = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...SHELL_PANE, props: { ...PROPS, title: 'Shell' } })
  expect(await pane.find({ type: 'Text', text: 'npm run dev' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'running for 1m 5s' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: OUTPUT })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'ready on :3000' })).toBeDefined()
  // the output is read again while the pane is open
  output.text += 'GET / 200\n'
  await clock.advance(3_000)
  expect(await pane.find({ type: 'Text', text: 'GET / 200' })).toBeDefined()

  await pane.press({ key: 'stopShell' })
  expect(calls).toContain('stop b1')
  expect(await pane.find({ type: 'Text', text: /^killed · ran 1m 8s/ })).toBeDefined()
  expect(await pane.find({ type: 'Button', key: 'stopShell' })).toBeUndefined()
  await pane.unmount()
  await ui.unmount()
})

test('TaskStop kills a shell, and the Stop hook ends one the engine no longer lists', async ($, on) => {
  const calls: string[] = []
  const clock = world(on, calls)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...PANE, props: PROPS })
  await $.tool.call(BASH)
  await $.tool.call(BUILD)
  expect(await ui.find({ type: 'Text', text: '2 running:' })).toBeDefined()

  await $.tool.call({ tool: 'TaskStop', task_id: 'b1' } as never)
  expect((await ui.find({ type: 'Button', key: 'shell:b1' }))?.props.label).toBe('Start the dev server (killed)')

  await clock.advance(5_000)
  await $.classic.Stop({ hook_event_name: 'Stop', session_id: 's1', transcript_path: '', cwd: '/work/app', stop_hook_active: false, background_tasks: [] } as never)
  expect((await ui.find({ type: 'Button', key: 'shell:b2' }))?.props.label).toBe('npm run build (ended)')
  await ui.unmount()
})

test("a subagent's shell that ends with its final answer ends once its agent has answered", async () => {
  const tied = shell('b9', { agentId: 'a1', agent: 'reviewer', endsWithAgent: true })
  const outlives = shell('b8', { agentId: 'a1', agent: 'reviewer' })
  expect(endWithAgents([tied, outlives], ['a1'], NOW + MIN).map(s => s.status)).toEqual(['ended', 'running'])
  expect(endWithAgents([tied], ['a2'], NOW + MIN)[0]!.status).toBe('running')
})

test('Show background shells off: no Shells row', { options: { show_shells: false } }, async ($, on) => {
  world(on, [])
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-quota', surface: 'terminal', ...PANE, props: PROPS })
  await $.tool.call(BASH)
  expect(await ui.find({ type: 'Text', text: 'Shells' })).toBeUndefined()
  await ui.unmount()
})
