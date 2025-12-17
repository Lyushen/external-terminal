const vscode = require('vscode');
const { exec } = require('child_process');
const path = require('path');
const { promisify } = require('util');

const execAsync = promisify(exec);

function activate(context) {
  const openCommand = 'extension.openInExternalTerminal';
  const outputChannel = vscode.window.createOutputChannel('Open in Terminal');
  outputChannel.appendLine(`Extension activated on platform: ${process.platform}`);

  let openCommandHandler = vscode.commands.registerCommand(
    openCommand,
    async (uris) => {
      try {
        if (!uris) {
          vscode.window.showWarningMessage('Please use this command from the explorer context menu.');
          return;
        }

        if (!Array.isArray(uris)) {
          uris = [uris];
        }

        const config = vscode.workspace.getConfiguration('open-in-external-terminal');
        const logLevel = config.get('logLevel', 'info');
        const showNotification = config.get('showNotification', true);

        // Configuration
        const preferredTerminal = config.get('preferredTerminal', '');
        const additionalArgs = config.get('additionalArgs', []);

        const platform = process.platform;
        if (!['darwin', 'win32', 'linux'].includes(platform)) {
          vscode.window.showErrorMessage(`Unsupported platform: ${platform}`);
          return;
        }

        for (const uri of uris) {
          // --- 1. Robust Path Resolution & Notification ---
          const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
          const relativePath = vscode.workspace.asRelativePath(uri, false);
          // Result: "MyRepo/src/script.bat"
          const displayPath = wsFolder ? path.join(wsFolder.name, relativePath) : relativePath;

          if (showNotification) {
            vscode.window.showInformationMessage(`Opening [${displayPath}] in terminal...`);
          }

          // --- 2. Determine File vs Directory Details ---
          const stat = await vscode.workspace.fs.stat(uri);
          const isFile = stat.type === vscode.FileType.File;
          
          // The folder where the terminal should start
          const targetDir = isFile ? path.dirname(uri.fsPath) : uri.fsPath;
          
          // The specific file to run (if it's a script), or null
          const fileToRun = isFile ? path.basename(uri.fsPath) : null;

          // --- 3. Build Command ---
          const commandObj = buildPlatformCommand(
            platform, 
            targetDir, 
            fileToRun, 
            preferredTerminal, 
            additionalArgs
          );

          log(outputChannel, `Working Dir: ${targetDir}`, 'debug', logLevel);
          log(outputChannel, `Command: ${commandObj.cmd}`, 'debug', logLevel);

          // --- 4. Execute ---
          try {
            // We set 'cwd' here for Linux/Mac so the shell spawns in the right place.
            // For Windows, we handle pathing inside the command string using /D.
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

  context.subscriptions.push(openCommandHandler);
}

/**
 * Returns an object { cmd: string }
 */
function buildPlatformCommand(platform, targetDir, fileToRun, preferredTerminal, additionalArgs) {
  const argsStr = additionalArgs.map(quote).join(' ');

  switch (platform) {
    case 'win32':
      return buildWindowsCommand(targetDir, fileToRun, preferredTerminal, argsStr);
    case 'darwin': // macOS
      return buildMacCommand(targetDir, fileToRun, preferredTerminal, argsStr);
    case 'linux':
      return buildLinuxCommand(targetDir, fileToRun, preferredTerminal, argsStr);
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

function buildWindowsCommand(targetDir, fileToRun, preferredTerminal, argsStr) {
  // Default to cmd.exe if not specified
  let terminal = preferredTerminal || 
    vscode.workspace.getConfiguration('terminal.external').get('windowsExec', 'cmd.exe');

  const isWT = terminal.toLowerCase().includes('wt.exe') || terminal.toLowerCase().includes('windows terminal');
  const isPowerShell = terminal.toLowerCase().includes('powershell') || terminal.toLowerCase().includes('pwsh');

  // Check if the file is actually executable by the shell
  const executableExts = ['.bat', '.cmd', '.exe', '.ps1', '.com'];
  const shouldExecute = fileToRun && executableExts.some(ext => fileToRun.toLowerCase().endsWith(ext));

  // --- WINDOWS TERMINAL (WT.EXE) ---
  if (isWT) {
    // WT uses -d for directory.
    // Syntax: wt -d "C:\Path" [args] [command]
    let cmd = `"${terminal}" ${argsStr} -d "${targetDir}"`;
    
    if (shouldExecute) {
      // If we need to run a file, we usually need to tell WT which shell to use to run it
      // Defaulting to cmd /k to keep window open
      cmd += ` cmd /k "${fileToRun}"`;
    }
    return { cmd };
  }

  // --- STANDARD CMD or POWERSHELL ---
  // We use `start` with the /D flag. This is the most robust way to set directory.
  // Syntax: start "" /D "C:\Target Dir" "cmd.exe" [arguments]
  
  const safeDir = `"${targetDir}"`; // Quote the path
  let shellCommand = '';

  if (shouldExecute) {
    if (isPowerShell) {
        // PowerShell: -NoExit -File "script.ps1"
        shellCommand = `"${terminal}" ${argsStr} -NoExit -File "${fileToRun}"`;
    } else {
        // CMD/Default: /k "script.bat"
        shellCommand = `"${terminal}" ${argsStr} /k "${fileToRun}"`;
    }
  } else {
    // Just open the terminal.
    // For CMD, /k ensures it stays open.
    if (isPowerShell) {
       shellCommand = `"${terminal}" ${argsStr}`;
    } else {
       shellCommand = `"${terminal}" ${argsStr} /k`;
    }
  }

  // Final Composite Command
  // start "" (Empty title) /D "Path" "Terminal" "Args"
  return { cmd: `start "" /D ${safeDir} ${shellCommand}` };
}

function buildMacCommand(targetDir, fileToRun, preferredTerminal, argsStr) {
  const terminal = preferredTerminal || 
    vscode.workspace.getConfiguration('terminal.external').get('osxExec', 'Terminal.app');

  // On Mac, `open -a Terminal path` opens a new window at that path.
  // If we want to execute a script, it's complex because 'open' doesn't accept execution args easily.
  // We fall back to opening the folder.
  
  return { cmd: `open -a "${terminal}" "${targetDir}" ${argsStr}` };
}

function buildLinuxCommand(targetDir, fileToRun, preferredTerminal, argsStr) {
  const terminal = preferredTerminal || 
    vscode.workspace.getConfiguration('terminal.external').get('linuxExec', 'xterm');
    
  // Linux terminals usually take working dir via the node process cwd,
  // but if we need to execute, we use the specific terminal's execute flag (usually -e).
  
  // Note: This varies wildly by distro (gnome-terminal, konsole, xterm).
  // This serves the most common denominator.
  return { cmd: `"${terminal}" ${argsStr}` };
}

function quote(s) {
  // Simple quoting to avoid breaking spaces
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