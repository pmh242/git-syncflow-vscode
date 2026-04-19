# git-syncflow-vscode

VS Code extension that adds Git Syncflow commands to the command palette.

## Commands

| Command | Description |
|---|---|
| **Git Syncflow: Check** | Fetch and show ahead/behind count vs upstream |
| **Git Syncflow: Update** | Fetch then `git pull --ff-only` |
| **Git Syncflow: Sync** | ⚠ Reset to upstream + clean untracked files |
| **Git Syncflow: Full Sync** | ⚠ Reset to upstream + clean all untracked and ignored files |
| **Git Syncflow: Help** | Show command reference in a quick pick |

Sync and Full Sync ask for confirmation. Output goes to the **Git Syncflow** output channel.

Commands are available via the **Command Palette** (`Ctrl+Shift+P` / `Cmd+Shift+P`) or the **`$(git-branch) Syncflow` button** in the status bar, which opens a Quick Pick menu of all actions.

## Development

```bash
npm install
npm run compile
# Press F5 to launch Extension Development Host
```

Watch mode: `npm run watch`
