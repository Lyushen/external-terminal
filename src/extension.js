const vscode = require('vscode');
const { exec } = require('child_process');
const path = require('path');
const { promisify } = require('util');

const execAsync = promisify(exec);

function activate(context) {
  const outputChannel = vscode.window.createOutputChannel('Open in Terminal');
  outputChannel.appendLine(`Extension activated on platform: ${process.platform}`);

  // --- Main Command ---
  let openCommandHandler = vscode.commands.registerCommand(
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
            if (editor && editor.document.uri) {
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

          const commandObj = buildPlatformCommand(
            platform, 
            targetDir, 
            fileName, 
            preferredTerminal, 
            additionalArgs,
            executableExtensions,
            interpreterMappings
          );

          log(outputChannel, `Working Dir: ${targetDir}`, 'debug', logLevel);
          log(outputChannel, `Command: ${commandObj.cmd}`, 'debug', logLevel);

          try {
            await execAsync(commandObj.cmd, { cwd: targetDir });
            log(outputChannel, `Success`, 'info', logLevel);
          } catch (error) {
            log(outputChannel, `Execution failed: ${error.message}`, 'error', logLevel);
            vscode.window.showErrorMessage(`Failed to open terminal: ${error.message}`);
          }
        }
      } catch (error) {
        log(outputChannel, `Critical error: ${error.message}`, 'error', 'error');
        vscode.window.showErrorMessage('An unexpected error occurred: ' + error.message);
      }
    }
  );

  // --- Helper Command: Open Keybinding Settings ---
  // You can call this command from a "Welcome" notification or a button in the UI
  let configureKeybindingHandler = vscode.commands.registerCommand(
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

function buildPlatformCommand(platform, targetDir, fileName, preferredTerminal, additionalArgs, executableExtensions, interpreterMappings) {
  const argsStr = additionalArgs.map(quote).join(' ');

  let shouldExecute = false;
  let finalExecutionString = '';

  if (fileName) {
    const ext = path.extname(fileName).toLowerCase();
    
    // Check 1: Mapped Interpreters (Higher Priority)
    if (interpreterMappings[ext]) {
        shouldExecute = true;
        finalExecutionString = `${interpreterMappings[ext]} "${fileName}"`;
    }
    // Check 2: Native Executables
    else if (executableExtensions.includes(ext) || executableExtensions.includes(fileName.toLowerCase())) {
        shouldExecute = true;
        finalExecutionString = `"${fileName}"`;
    }
  }

  switch (platform) {
    case 'win32':
      return buildWindowsCommand(targetDir, finalExecutionString, preferredTerminal, argsStr, shouldExecute);
    case 'darwin': 
      return buildMacCommand(targetDir, fileName, preferredTerminal, argsStr, shouldExecute, interpreterMappings);
    case 'linux':
      return buildLinuxCommand(targetDir, finalExecutionString, preferredTerminal, argsStr, shouldExecute);
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

function buildWindowsCommand(targetDir, executionString, preferredTerminal, argsStr, shouldExecute) {
  let terminal = preferredTerminal || 
    vscode.workspace.getConfiguration('terminal.external').get('windowsExec', 'cmd.exe');

  const isWT = terminal.toLowerCase().includes('wt.exe') || terminal.toLowerCase().includes('windows terminal');
  const isPowerShell = terminal.toLowerCase().includes('powershell') || terminal.toLowerCase().includes('pwsh');

  if (isWT) {
    let cmd = `"${terminal}" ${argsStr} -d "${targetDir}"`;
    if (shouldExecute) {
      cmd += ` cmd /k "${executionString}"`;
    }
    return { cmd };
  }

  const safeDir = `"${targetDir}"`;
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

function buildMacCommand(targetDir, fileName, preferredTerminal, argsStr, shouldExecute, interpreterMappings) {
  const terminal = preferredTerminal || 
    vscode.workspace.getConfiguration('terminal.external').get('osxExec', 'Terminal.app');
  
  const isCustomTerminal = !terminal.endsWith('.app');

  if (shouldExecute) {
      if (isCustomTerminal) {
           const ext = path.extname(fileName).toLowerCase();
           const prefix = interpreterMappings[ext] ? interpreterMappings[ext] + ' ' : '';
           return { cmd: `"${terminal}" ${argsStr} "${prefix}./${fileName}"` };
      } 
      // Fallback for Terminal.app: try to run file directly
      return { cmd: `open "${fileName}"` };
  }

  return { cmd: `open -a "${terminal}" "${targetDir}" ${argsStr}` };
}

function buildLinuxCommand(targetDir, executionString, preferredTerminal, argsStr, shouldExecute) {
  const terminal = preferredTerminal || 
    vscode.workspace.getConfiguration('terminal.external').get('linuxExec', 'xterm');
    
  if (shouldExecute) {
      if (!executionString.includes(' ')) {
          executionString = `./${executionString}`;
      }
      return { cmd: `"${terminal}" ${argsStr} -e "${executionString}"` };
  }

  return { cmd: `"${terminal}" ${argsStr}` };
}

function quote(s) {
  if (!s) return '';
  return `"${s}"`;
}

function log(channel, message, level, configuredLevel) {
  const levels = ['debug', 'info', 'error'];
  if (levels.indexOf(level) >= levels.indexOf(configuredLevel)) {
    channel.appendLine(`[${level.toUpperCase()}] ${message}`);
  }
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};