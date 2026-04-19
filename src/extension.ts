import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const PREFIX = 'Git Syncflow';

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext): void {
    outputChannel = vscode.window.createOutputChannel(PREFIX);

    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '$(git-branch) Syncflow';
    statusBarItem.tooltip = 'Git Syncflow — click to open actions';
    statusBarItem.command = 'git-syncflow.openMenu';
    statusBarItem.show();

    context.subscriptions.push(
        outputChannel,
        statusBarItem,
        vscode.commands.registerCommand('git-syncflow.openMenu', cmdOpenMenu),
        vscode.commands.registerCommand('git-syncflow.check', cmdCheck),
        vscode.commands.registerCommand('git-syncflow.update', cmdUpdate),
        vscode.commands.registerCommand('git-syncflow.sync', cmdSync),
        vscode.commands.registerCommand('git-syncflow.fullSync', cmdFullSync),
        vscode.commands.registerCommand('git-syncflow.help', cmdHelp),
    );
}

export function deactivate(): void {}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function runGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
    try {
        return await execFileAsync('git', args, { cwd });
    } catch (err: unknown) {
        const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
        if (e.code === 'ENOENT') {
            throw new Error('git not found — make sure Git is installed and in your PATH.');
        }
        throw Object.assign(new Error(e.stderr?.trim() || e.message), {
            stderr: e.stderr ?? '',
            stdout: e.stdout ?? '',
        });
    }
}

function log(message: string): void {
    outputChannel.appendLine(message);
}

function requireWorkspace(): string | null {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!cwd) {
        vscode.window.showErrorMessage(`${PREFIX}: No workspace folder is open.`);
        return null;
    }
    return cwd;
}

async function confirm(message: string): Promise<boolean> {
    const answer = await vscode.window.showWarningMessage(message, { modal: true }, 'Confirm');
    return answer === 'Confirm';
}

async function runSyncFlow(
    cwd: string,
    label: string,
    confirmMsg: string,
    cleanFlags: string,
    successMsg: string,
): Promise<void> {
    if (!await confirm(confirmMsg)) return;

    outputChannel.show(true);

    log(`[${label}] git fetch -q`);
    try {
        await runGit(['fetch', '-q'], cwd);
    } catch (e: unknown) {
        const msg = (e as Error).message;
        log(`[${label}] fetch failed: ${msg}`);
        vscode.window.showErrorMessage(`${PREFIX}: fetch failed — ${msg}`);
        return;
    }

    log(`[${label}] git reset --hard @{upstream}`);
    try {
        const { stdout } = await runGit(['reset', '--hard', '@{upstream}'], cwd);
        log(stdout.trim());
    } catch (e: unknown) {
        const msg = (e as Error).message;
        log(`[${label}] reset failed: ${msg}`);
        vscode.window.showErrorMessage(`${PREFIX}: Reset failed — ${msg}`);
        return;
    }

    log(`[${label}] git clean ${cleanFlags}`);
    try {
        const { stdout } = await runGit(['clean', cleanFlags], cwd);
        log(stdout.trim() || '(nothing to clean)');
        vscode.window.showInformationMessage(`${PREFIX}: ${successMsg}`);
    } catch (e: unknown) {
        const msg = (e as Error).message;
        log(`[${label}] clean failed: ${msg}`);
        vscode.window.showErrorMessage(`${PREFIX}: Clean failed — ${msg}`);
    }
}

// ── Commands ──────────────────────────────────────────────────────────────────

type MenuEntry = vscode.QuickPickItem & { handler: () => Promise<void> };

async function cmdOpenMenu(): Promise<void> {
    const items: MenuEntry[] = [
        { label: 'Check',     description: 'Fetch and show ahead/behind status vs upstream', handler: cmdCheck },
        { label: 'Update',    description: 'Fetch then fast-forward pull from upstream',      handler: cmdUpdate },
        { label: 'Sync',      description: '⚠ Reset to upstream + clean untracked files',     handler: cmdSync },
        { label: 'Full Sync', description: '⚠ Reset + clean all untracked & ignored files',   handler: cmdFullSync },
        { label: 'Help',      description: 'Show command reference',                          handler: cmdHelp },
    ];

    const picked = await vscode.window.showQuickPick<MenuEntry>(items, {
        title: `${PREFIX} — Actions`,
        placeHolder: 'Select an action',
    });
    if (picked) await picked.handler();
}

async function cmdCheck(): Promise<void> {
    const cwd = requireWorkspace();
    if (!cwd) return;

    try {
        await runGit(['fetch', '-q'], cwd);
    } catch (e: unknown) {
        vscode.window.showWarningMessage(`${PREFIX}: fetch failed — ${(e as Error).message}`);
    }

    try {
        const { stdout } = await runGit(
            ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'],
            cwd,
        );
        const [rawAhead, rawBehind] = stdout.trim().split(/\s+/);
        const ahead = parseInt(rawAhead ?? '0', 10);
        const behind = parseInt(rawBehind ?? '0', 10);

        if (ahead === 0 && behind === 0) {
            vscode.window.showInformationMessage(`${PREFIX}: ✓ up to date (↑ 0 | ↓ 0)`);
        } else {
            vscode.window.showInformationMessage(`${PREFIX}: ↑ ahead: ${ahead} | ↓ behind: ${behind}`);
        }
    } catch (e: unknown) {
        const msg = (e as Error).message;
        if (msg.includes('no upstream') || msg.includes('@{upstream}')) {
            vscode.window.showWarningMessage(`${PREFIX}: No upstream branch configured for the current branch.`);
        } else {
            vscode.window.showErrorMessage(`${PREFIX}: Check failed — ${msg}`);
        }
    }
}

async function cmdUpdate(): Promise<void> {
    const cwd = requireWorkspace();
    if (!cwd) return;

    outputChannel.show(true);
    log('[update] git fetch -q');
    try {
        await runGit(['fetch', '-q'], cwd);
    } catch (e: unknown) {
        const msg = (e as Error).message;
        log(`[update] fetch failed: ${msg}`);
        vscode.window.showErrorMessage(`${PREFIX}: fetch failed — ${msg}`);
        return;
    }

    log('[update] git pull --ff-only');
    try {
        const { stdout, stderr } = await runGit(['pull', '--ff-only'], cwd);
        const output = (stdout || stderr).trim();
        log(output);
        const summary = output.split('\n')[0] || 'done';
        vscode.window.showInformationMessage(`${PREFIX}: Updated — ${summary}`);
    } catch (e: unknown) {
        const msg = (e as Error).message;
        log(`[update] pull failed: ${msg}`);
        vscode.window.showErrorMessage(`${PREFIX}: Update failed — ${msg}`);
    }
}

async function cmdSync(): Promise<void> {
    const cwd = requireWorkspace();
    if (!cwd) return;

    await runSyncFlow(
        cwd,
        'sync',
        `${PREFIX}: Sync will reset the current branch to upstream and delete untracked files. Proceed?`,
        '-fd',
        'Sync complete.',
    );
}

async function cmdFullSync(): Promise<void> {
    const cwd = requireWorkspace();
    if (!cwd) return;

    await runSyncFlow(
        cwd,
        'full-sync',
        `${PREFIX}: Full Sync will reset the current branch to upstream and remove ALL untracked files, including ignored ones. Proceed?`,
        '-fdx',
        'Full Sync complete.',
    );
}

async function cmdHelp(): Promise<void> {
    const items: vscode.QuickPickItem[] = [
        { label: `${PREFIX}: Check`, description: 'Fetch and show ahead/behind status vs upstream' },
        { label: `${PREFIX}: Update`, description: 'Fetch then fast-forward pull (fails if not fast-forwardable)' },
        { label: `${PREFIX}: Sync`, description: '⚠ Destructive — reset to upstream + delete untracked files' },
        { label: `${PREFIX}: Full Sync`, description: '⚠ Destructive — reset to upstream + delete all untracked & ignored files' },
        { label: `${PREFIX}: Help`, description: 'Show this command reference' },
    ];

    await vscode.window.showQuickPick(items, {
        title: `${PREFIX} — Command Reference`,
        placeHolder: 'Select a command to learn more (Esc to close)',
    });
}
