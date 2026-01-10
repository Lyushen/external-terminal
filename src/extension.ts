import * as vscode from 'vscode'
import { type default as chproc, exec } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

// --- Types ---

interface ICommandObject {
  cmd: string
}

interface ICmdBuldArgs {
  platform: string,
  targetDir: string,
  fileName: string | null,
  preferredTerminal: string,
  additionalArgs: string[],
  executableExtensions: string[],
  interpreterMappings: Record<string, string>
}

type ExecAsync = (
  command: string,
  options: chproc.ExecOptionsWithStringEncoding
) => chproc.PromiseWithChild<{stdout: string; stderr: string;}>;

// --- Extension ---

const EXEC_ASYNC: ExecAsync = promisify(exec);

function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('Open in Terminal');
  outputChannel.appendLine(`Extension activated on platform: ${process.platform}`);

  // --- Main Command ---
  const openCommandHandler = vscode.commands.registerCommand(
    'extension.openInExternalTerminal',
    async (uri, multipleUris) => {
      try {
        let urisToProcess = [];

        // 1. Handle Multi-select from Explorer (2nd arg contains all selected)
        if (multipleUris && Array.isArray(multipleUris) && multipleUris.length > 0) {
            urisToProcess = multipleUris;
        }
        // 2. Handle Single-select from Explorer (1st arg is the clicked item)
        else if (uri instanceof vscode.Uri) {
            urisToProcess = [uri];
        }
        // 3. Handle Hotkey / Command Palette (Args are undefined -> Use Active Tab)
        else {
            const editor = vscode.window.activeTextEditor;
            if (editor?.document.uri) {
                // Ensure we only open files, not "Untitled" or output windows
                if (editor.document.uri.scheme === 'file') {
                    urisToProcess = [editor.document.uri];
                }
            }
        }

        // If still empty, we can't do anything
        if (urisToProcess.length === 0) {
          vscode.window.showWarningMessage('No file selected or active editor found to open.');
          return;
        }

        // --- Configuration Loading ---
        const config = vscode.workspace.getConfiguration('open-in-external-terminal');
        const logLevel = config.get('logLevel', 'info');
        const showNotification = config.get('showNotification', true);
        const preferredTerminal = config.get('preferredTerminal', '');
        const additionalArgs = config.get('additionalArgs', []);

        // Load Settings
        const configExts = config.get('executableExtensions', ['.bat', '.cmd', '.exe', '.ps1', '.sh', '.command']);
        const executableExtensions = configExts.map(e => e.toLowerCase());

        const interpreterMappings = config.get('interpreterMappings', {
            '.py': 'python',
            '.js': 'node',
            '.rb': 'ruby'
        });

        const platform = process.platform;
        if (!['darwin', 'win32', 'linux'].includes(platform)) {
          vscode.window.showErrorMessage(`Unsupported platform: ${platform}`);
          return;
        }

        // --- Execution Loop ---
        for (const targetUri of urisToProcess) {
          const wsFolder = vscode.workspace.getWorkspaceFolder(targetUri);
          const relativePath = vscode.workspace.asRelativePath(targetUri, false);
          const displayPath = wsFolder ? path.join(wsFolder.name, relativePath) : relativePath;

          if (showNotification) {
            vscode.window.showInformationMessage(`Opening ${displayPath} in terminal...`);
          }

          const stat = await vscode.workspace.fs.stat(targetUri);
          const isFile = stat.type === vscode.FileType.File;

          const targetDir = isFile ? path.dirname(targetUri.fsPath) : targetUri.fsPath;
          const fileName = isFile ? path.basename(targetUri.fsPath) : null;

          const commandObj = buildPlatformCommand({
            platform,
            targetDir,
            fileName,
            preferredTerminal,
            additionalArgs,
            executableExtensions,
            interpreterMappings
          });

          log(outputChannel, `Working Dir: ${targetDir}`, 'debug', logLevel);
          log(outputChannel, `Command: ${commandObj.cmd}`, 'debug', logLevel);

          try {
            await EXEC_ASYNC(commandObj.cmd, { cwd: targetDir });
            log(outputChannel, `Success`, 'info', logLevel);
          } catch (error) {
            const msg = (error as chproc.ExecException).message
            log(outputChannel, `Execution failed: ${msg}`, 'error', logLevel);
            vscode.window.showErrorMessage(`Failed to open terminal: ${msg}`);
          }
        }
      } catch (error) {
        const msg = (error as chproc.ExecException).message
        log(outputChannel, `Critical error: ${msg}`, 'error', 'error');
        vscode.window.showErrorMessage(`An unexpected error occurred: ${msg}`);
      }
    }
  );

  // --- Helper Command: Open Keybinding Settings ---
  // You can call this command from a "Welcome" notification or a button in the UI
  const configureKeybindingHandler = vscode.commands.registerCommand(
    'extension.openInExternalTerminal.configureKeybinding',
    () => {
        vscode.commands.executeCommand(
            'workbench.action.openGlobalKeybindings',
            'extension.openInExternalTerminal'
        );
    }
  );

  context.subscriptions.push(openCommandHandler);
  context.subscriptions.push(configureKeybindingHandler);
}

// --- Platform Builders ---

function buildPlatformCommand(args: ICmdBuldArgs): {cmd: string} {
  const argsStr = args.additionalArgs.map(substitute({cwd: args.targetDir})).map(quote).join(' ');

  let shouldExecute = false;
  let finalExecutionString = '';

  if (args.fileName) {
    const ext = path.extname(args.fileName).toLowerCase();

    // Check 1: Mapped Interpreters (Higher Priority)
    if (args.interpreterMappings[ext]) {
        shouldExecute = true;
        finalExecutionString = `${args.interpreterMappings[ext]} "${args.fileName}"`;
    }
    // Check 2: Native Executables
    else if (args.executableExtensions.includes(ext) || args.executableExtensions.includes(args.fileName.toLowerCase())) {
        shouldExecute = true;
        finalExecutionString = `"${args.fileName}"`;
    }
  }

  switch (args.platform) {
    case 'win32':
      return buildWindowsCommand(args, finalExecutionString, argsStr, shouldExecute);
    case 'darwin':
      return buildMacCommand(args, argsStr, shouldExecute);
    case 'linux':
      return buildLinuxCommand(args, finalExecutionString , argsStr, shouldExecute);
    default:
      throw new Error(`Unsupported platform: ${args.platform}`);
  }
}

function buildWindowsCommand(
  args: ICmdBuldArgs,
  executionString: string,
  argsStr: string,
  shouldExecute: boolean
): ICommandObject {
  const terminal = args.preferredTerminal ||
    vscode.workspace.getConfiguration('terminal.external').get('windowsExec', 'cmd.exe');

  const isWt = terminal.toLowerCase().includes('wt.exe') || terminal.toLowerCase().includes('windows terminal');
  const isPowerShell = terminal.toLowerCase().includes('powershell') || terminal.toLowerCase().includes('pwsh');

  if (isWt) {
    let cmd = `"${terminal}" ${argsStr} -d "${args.targetDir}"`;
    if (shouldExecute) {
      cmd += ` cmd /k "${executionString}"`;
    }
    return { cmd };
  }

  const safeDir = `"${args.targetDir}"`;
  let shellCommand = '';

  if (shouldExecute) {
    if (isPowerShell) {
        shellCommand = `"${terminal}" ${argsStr} -NoExit "${executionString}"`;
    } else {
        shellCommand = `"${terminal}" ${argsStr} /k "${executionString}"`;
    }
  } else {
    if (isPowerShell) {
       shellCommand = `"${terminal}" ${argsStr}`;
    } else {
       shellCommand = `"${terminal}" ${argsStr} /k`;
    }
  }

  return { cmd: `start "" /D ${safeDir} ${shellCommand}` };
}

function buildMacCommand(
  args: ICmdBuldArgs,
  argsStr: string,
  shouldExecute: boolean,
): ICommandObject {
  const terminal = args.preferredTerminal ||
    vscode.workspace.getConfiguration('terminal.external').get('osxExec', 'Terminal.app');

  const isCustomTerminal = !terminal.endsWith('.app');

  if (shouldExecute && args.fileName) {
      if (isCustomTerminal) {
           const ext = path.extname(args.fileName).toLowerCase();
           const prefix = args.interpreterMappings[ext] ? `${args.interpreterMappings[ext]} ` : '';
           return { cmd: `"${terminal}" ${argsStr} "${prefix}./${args.fileName}"` };
      }
      // Fallback for Terminal.app: try to run file directly
      return { cmd: `open "${args.fileName}"` };
  }

  return { cmd: `open -a "${terminal}" "${args.targetDir}" ${argsStr}` };
}

function buildLinuxCommand(
  args: ICmdBuldArgs,
  executionString: string,
  argsStr: string,
  shouldExecute: boolean
): ICommandObject {
  const terminal = args.preferredTerminal ||
    vscode.workspace.getConfiguration('terminal.external').get('linuxExec', 'xterm');

  if (shouldExecute) {
      if (!executionString.includes(' ')) {
          executionString = `./${executionString}`;
      }
      return { cmd: `"${terminal}" ${argsStr} -e "${executionString}"` };
  }

  return { cmd: `"${terminal}" ${argsStr}` };
}

function quote(s: string): string {
  if (!s) return '';
  return `"${s}"`;
}

function substitute(o: Record<string, string>) {
  return (s: string): string => {
    for (const [k, v] of Object.entries(o)) {
      s = s.replace(`\${${k}}`, v);
    }
    return s
  }
}

function log(
  channel: vscode.OutputChannel,
  message: string,
  level: string,
  configuredLevel: string
): void {
  const levels = ['debug', 'info', 'error'];
  if (levels.indexOf(level) >= levels.indexOf(configuredLevel)) {
    channel.appendLine(`[${level.toUpperCase()}] ${message}`);
  }
}

function deactivate(): void {}

export {
  activate,
  deactivate,
};
