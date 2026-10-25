# Claude Code Usage Quota Mod with Auto Compact

[![Version: v0.2.6](docs/badges/version-v0.2.6.svg)](https://github.com/endavis/claude-code-usage-quota-mod/releases/latest) ![Auto compact: 30% default](docs/badges/auto-compact-v2.svg) ![Compact: one click](docs/badges/compact-v2.svg) ![5 Hour + Weekly: whole account](docs/badges/limits-v2.svg) ![Forecast: before reset](docs/badges/forecast-v2.svg) ![Works in: Desktop + Terminal](docs/badges/works-in-v2.svg) ![License: MIT](docs/badges/license-v2.svg)

**Know your Claude limits before they hit you.** A live pane docked on the right of Claude Code that shows your plan limits, forecasts whether you'll run out before they reset, shows how full your context window is, and counts down until your prompt cache expires. **Compact in one click, or let it compact automatically.**

The 5 Hour and Weekly limits are **your whole Claude account's**, including what you use in Claude chat and Cowork. The pane itself shows in **Claude Code**: the desktop app and the terminal. It docks beside the transcript in a wide fullscreen terminal (from 110 columns once you've opened it with `/quota`, 144 before that) or a wide desktop panel, and sits above the prompt otherwise.

**Live from the moment a session opens.** Many usage mods stay blank until Claude replies, because they only read the figures each reply carries. This one asks Anthropic's usage service straight away, for free (it uses no tokens and doesn't count toward your limits), so your limits are there as soon as the band appears, and it keeps them current every few seconds while you work.

Type **`/quota`** to turn the pane off and on. Closing the pane turns it off too.

**Right or bottom.** The *Placement* setting in `/config` picks where it draws: **right** (the default), the pane described above, or **bottom**, the band above the prompt. Both show the same parts. A mod can't draw on the left or at the top: Claude Code docks panes only on the right, and has no site above the transcript.

**Cache countdown.** Each reply keeps Claude's prompt cache warm for a while: 5 minutes or 1 hour, depending on what Claude Code asked for. The **Cache** line shows how long until it expires (`expires in 54m 12s`), turns amber in the last fifth, and says when it has expired, meaning your next message will send the whole context again uncached. The lifetime is read from the session's transcript. Until it has been read, the line assumes 5 minutes and says so.

**Session details.** Under the bars:

- **Cache**: the countdown, and how much of the last turn's input the cache served (`96% hit last turn`). A low hit rate after a `/model` switch or an edited CLAUDE.md means the cache had to be written again.
- **Compact**: about how many more turns until the context is compacted, from how fast it has grown since the last compaction: to your Auto compact % when that is on, else to where Claude Code compacts by itself.
- **Session**: what the session has cost so far, as `/cost` totals it, and how many prompts it has had.
- **Last turn**: how long it took, its output tokens and its model.
- **Agents**: the subagents and teammates running right now.
- **Shells**: the background shells running right now, and, dimmed, the ones that ended in the last 10 minutes with how they ended (`exit 0`, `killed`). Press one for its own pane: the command, how long it has run, the agent that started it, its output file and the last 40 lines of its output, read again every 3 seconds. **Full output** (`f`) shows the whole file instead (its last 2000 lines, from its last 256 KB). **Open** (`o`) opens the file in your system's viewer, where it has one to show you: not over SSH, nor on Linux without a display. **Stop** (`x`) stops it, as Claude's TaskStop would. **Clear**, at the front of the row, takes the ended ones off it, and the arrow at its start collapses it to the count alone (`2 running`), in every chat. A shell's end is shown when Claude Code reports it, which waits for a tool call in progress, so one can show as running a little after it ends.

**Choose what shows.** Press the **⚙** at the top right (beside `[-]` in the band; under the close mark in the pane), or `s` while it has the keys: a second pane opens with each setting as a button (`[x] Show cache countdown`, `Placement: right`), its number pressing it. A press saves the change as `/config` would, and Claude Code reloads the mod with it; Esc closes the settings pane. Or open `/config` (or `/plugin configure usage-quota@claude-code-usage-quota-mod`) and turn off any of *Show plan limits*, *Show context window*, *Show turns until compact*, *Show cache countdown*, *Show cache hit rate*, *Show session cost*, *Show last turn*, *Show running agents* and *Show background shells*. Claude Code reloads the mod with the change.

## EXPANDED

![The band, expanded, above the prompt in the Claude desktop app](docs/expanded-desktop.png)

## COLLAPSED

One row that still shows the time left until each limit resets:

![The band, collapsed, above the prompt in the Claude desktop app](docs/collapsed-desktop.png)

> [!TIP]
> **Never hit a full context again: Auto compact, on by one click.**
> With Auto compact on, the band compacts your session once the context reaches **30%** (the default; set **15 to 99**). A long context costs more on every reply, so compacting early keeps replies **cheaper** and your limits **lasting longer**. Auto compact never interrupts a reply. Want to compact right now? The **Compact** button runs `/compact` in one click.
>
> **Each session keeps its own Auto compact setting**, even after a restart, so you can run them differently side by side:
> - **Building something big?** Set Auto compact higher (say 70%) or turn it off, so Claude keeps the whole picture. Press **Compact** yourself at a good stopping point. (With it off, Claude Code's built-in compaction still steps in when the context is nearly full.)
> - **Everyday sessions?** One click turns Auto compact on at 30%. They stay lean, and your 5 Hour and Weekly limits last longer.

## WHAT IT SHOWS

**5 Hour and Weekly limits**
- The **% used**, matching the app's own *Plan usage limits* panel.
- A **forecast** of where you'll be at reset: a grey tick on the bar and a note, e.g. *On pace for about 87% by reset – resets in 23m*.
- A **headline** at a glance: *On track. You should reach Wednesday's reset with room to spare.*
- The forecast starts from **your usual pace** (learned from your past windows) and shifts to your actual pace as the window goes on, so an early burst doesn't set it off.
- Bars turn **amber at 75%** and **red at 90%**, or sooner if you're on course to run out.

On course to run out, it warns you and says **when you'll hit the limit**:

![The band, expanded, on course to run out before the 5 hour reset](docs/run-out-expanded-v2.png)

![The band, collapsed, on course to run out](docs/run-out-collapsed-v2.png)

**Context window**
- The % used and space free, as `/context` counts it, split into Messages, Tools and Other.
- **Amber at 50%**, **red at 80%**: the point to compact.

**Compacting**
- **Compact** runs `/compact` in one click.
- **Auto compact** runs at your % (30% by default, 15 to 99), never mid-reply. Each session keeps its own setting; a new session starts with it off.

If the session is already past your % when you turn it on, it asks first:

![Auto compact asking what to do, with the context already at 72%](docs/auto-compact-ask-v2.png)

![The same question with the band collapsed](docs/auto-compact-ask-collapsed-v2.png)

- **Now** compacts straight away.
- **After my next compact** waits until the session is compacted some other way (Compact, `/compact`, or Claude Code's own), then takes over.

Works in **light and dark** themes and at **every width** down to the narrowest. Collapsed or expanded is shared across all sessions.

> [!NOTE]
> **MORE SCREENSHOTS**
>
> Early in a 5 hour window:
>
> ![The band, expanded, early in a 5 hour window](docs/expanded-dark-early.png)
>
> ![The band, collapsed, early in a 5 hour window](docs/collapsed-dark-early.png)
>
> Running out on the Weekly limit:
>
> ![The band, expanded, on course to run out before the weekly reset](docs/run-out-weekly-expanded.png)
>
> ![The band, collapsed, on course to run out before the weekly reset](docs/run-out-weekly-collapsed.png)
>
> | Light theme | Narrowest window |
> | --- | --- |
> | ![Light, expanded](docs/expanded-light.png) | ![Narrow, expanded](docs/narrow-expanded.png) |
> | ![Light, collapsed](docs/collapsed-light.png) | ![Narrow, collapsed](docs/narrow-collapsed.png) |

## WHERE IT WORKS

- **Claude desktop app**, Code tab
- **Claude Code in a terminal**

> [!NOTE]
> In the desktop app, the band appears once a session has started. The brand-new *Welcome back* screen has no session yet, so no mod can draw there. Send your first message and it appears.

In the terminal, **▲/▼** expands and collapses it. Claude Code's own close mark, or **ctrl+x x**, closes the pane; `/quota` brings it back.

![The band in the terminal, expanded](docs/terminal-expanded.png)

Collapsed:

![The band in the terminal, collapsed](docs/terminal-collapsed.png)

## INSTALL

Needs **Claude Code 2.1.287 or later**, signed in with a **Pro or Max** plan.

**Desktop app:** in the **Code** tab, send this as a message, allow the `claude plugin` commands if asked, then **quit and reopen** the app:

```text
Install the usage-quota plugin from the GitHub marketplace endavis/claude-code-usage-quota-mod
```

**Terminal:** inside `claude`, run these one at a time:

```text
/plugin marketplace add endavis/claude-code-usage-quota-mod
```

```text
/plugin install usage-quota@claude-code-usage-quota-mod
```

```text
/reload-plugins
```

The band appears once the plugins reload. If it doesn't, restart Claude Code.

Either way installs it for **both** the desktop app and the terminal.

> [!IMPORTANT]
> **Installed before v0.1.5?** The plugin was renamed from `claude-code-usage-quota` to **`usage-quota`**, because Claude Code reserves names starting with `claude-` for Anthropic's own plugins. Updating won't pick up the new name, so remove the old one and install again. This gets you the latest version, **v0.1.6**.
>
> **Desktop app:** in the **Code** tab, send this as a message:
>
> ```text
> Run these one at a time: claude plugin uninstall claude-code-usage-quota@claude-code-usage-quota-mod, then claude plugin marketplace update claude-code-usage-quota-mod, then claude plugin install usage-quota@claude-code-usage-quota-mod
> ```
>
> **Terminal:** run these in your shell:
>
> ```bash
> claude plugin uninstall claude-code-usage-quota@claude-code-usage-quota-mod
> ```
>
> ```bash
> claude plugin marketplace update claude-code-usage-quota-mod
> ```
>
> ```bash
> claude plugin install usage-quota@claude-code-usage-quota-mod
> ```
>
> Then restart. Your Auto compact settings and learned pace carry over.

**Update:** ask Claude, then restart:

```text
Update the usage-quota plugin from its marketplace
```

**Uninstall:** in the desktop app, ask Claude:

```text
Remove the claude-code-usage-quota-mod plugin marketplace
```

or in the terminal:

```text
/plugin marketplace remove claude-code-usage-quota-mod
```

then restart. This removes it from both. Just want it out of sight? **`/quota`** hides it without uninstalling.

<details>
<summary>From your own shell instead</summary>

```bash
claude plugin marketplace add endavis/claude-code-usage-quota-mod; claude plugin install usage-quota@claude-code-usage-quota-mod
```

To update:

```bash
claude plugin marketplace update claude-code-usage-quota-mod; claude plugin update usage-quota@claude-code-usage-quota-mod
```

To uninstall:

```bash
claude plugin marketplace remove claude-code-usage-quota-mod
```

</details>

## PRIVACY

**Everything runs on your machine**, with the same access Claude Code has, like any mod, so read the code before installing any mod you don't trust. It **never sees your credentials** and sends nothing anywhere except the one request below.

<details>
<summary>Exactly what it reads, sends and runs</summary>

- **Network:** about every 2 minutes, one request to `https://api.anthropic.com/api/oauth/usage`, Anthropic's usage service, for your 5 Hour and Weekly limits. It goes through your existing Claude login: Claude Code attaches the credential, and the mod never sees it. That is the only host it contacts. The `www.w3.org` address in the code is only the namespace of the drawn bars' SVG images; nothing is sent there.
- **Your session:** it reads the context size and the limits each reply carries, the session's cost and prompt count, each turn's duration, token counts and model, and the list of running agents, as Claude Code reports them. For the cache countdown it reads the end of this session's transcript file (`~/.claude/projects/…/<session>.jsonl`) and uses only each reply's `cache_creation` token counts; it doesn't keep or send anything else from it, or anything you or Claude write.
- **Commands:** it runs `/compact` when you press **Compact**, or when Auto compact reaches your %. It adds `/quota`, which turns the pane off and on.
- **Programs:** to match your system's light or dark mode, when the desktop app follows the system: `reg query` for `AppsUseLightTheme` on Windows, `defaults read -g AppleInterfaceStyle` on macOS. And `tail -c 262144` on the transcript when it is over 4 MB, for the cache countdown, and `tail -c` on a background shell's output file when it is over 16 KB (256 KB for Full output), while its pane is open. Once a session, `uname -s` and `command -v xdg-open` to find a viewer for **Open**, and on a press, `xdg-open`, `open` or `start` on the output file.
- **Files:** it reads the desktop app's `config.json` for its theme setting. Once, after the v0.1.5 rename, it copies the old plugin's saved settings from `~/.claude/plugins/store`. While a shell's pane is open, it reads that shell's output file.
- **Hooks:** the band's own clicks and focus (`ui.press`, `ui.focus`) and edits to the prompt (`prompt.edit`) only set a % you typed in the band, then pass on unchanged. Turns starting and ending tell it when a reply is running, so Auto compact never interrupts one. Bash, PowerShell and TaskStop calls (`tool.call`), task notifications (`prompt.submit` and their transcript rows) and the Stop hook's list of background work tell it which background shells run; each passes on unchanged.

</details>

## FEEDBACK AND CONTRIBUTING

[Open an issue](https://github.com/endavis/claude-code-usage-quota-mod/issues) for bugs or ideas. Pull requests welcome.

To work on it, clone the repo, then load it from the folder, or run its tests:

```bash
claude --plugin-dir ./claude-code-usage-quota-mod
```

```bash
claude plugin test ./claude-code-usage-quota-mod
```

**If you find it useful, a ⭐ helps others find it.**

## CREDITS

Built on [claude-code-usage-quota-mod](https://github.com/anantraghunath/claude-code-usage-quota-mod) by [Anant Raghunath](https://github.com/anantraghunath), who created the band, the plan limits and their forecast, the context bar and Auto compact. This repository started as a fork of it and is maintained separately.

Inspired by [I'm liking the new mods feature](https://www.reddit.com/r/ClaudeCode/comments/1wwjman/im_liking_the_new_mods_feature/) on r/ClaudeCode. Thanks to [u/itsxzy](https://www.reddit.com/user/itsxzy/) for sharing the original prompt that started this project.

## LICENSE

[MIT](LICENSE) © 2026 Anant Raghunath, © 2026 Eric Davis
