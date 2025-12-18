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
        
        // 1. Native Executables (OS runs these directly)
        const configExts = config.get('executableExtensions', ['.bat', '.cmd', '.exe', '.ps1', '.sh', '.command']);
        const executableExtensions = configExts.map(e => e.toLowerCase());

        // 2. Interpreter Mappings (We prefix these with a binary)
        // Default: { ".py": "python", ".js": "node", ".rb": "ruby" }
        const interpreterMappings = config.get('interpreterMappings', {
            '.py': 'python',
            '.js': 'node',
            '.ts': 'ts-node' 
        });

        const platform = process.platform;
        if (!['darwin', 'win32', 'linux'].includes(platform)) {
          vscode.window.showErrorMessage(`Unsupported platform: ${platform}`);
          return;
        }

        for (const uri of uris) {
          const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
          const relativePath = vscode.workspace.asRelativePath(uri, false);
          const displayPath = wsFolder ? path.join(wsFolder.name, relativePath) : relativePath;

          if (showNotification) {
            vscode.window.showInformationMessage(`Opening ${displayPath} in terminal...`);
          }

          const stat = await vscode.workspace.fs.stat(uri);
          const isFile = stat.type === vscode.FileType.File;
          
          const targetDir = isFile ? path.dirname(uri.fsPath) : uri.fsPath;
          const fileName = isFile ? path.basename(uri.fsPath) : null;

          // --- Build Command ---
          const commandObj = buildPlatformCommand(
            platform, 
            targetDir, 
            fileName, 
            preferredTerminal, 
            additionalArgs,
            executableExtensions,
            interpreterMappings // PASS NEW CONFIG
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

  context.subscriptions.push(openCommandHandler);
}

function buildPlatformCommand(platform, targetDir, fileName, preferredTerminal, additionalArgs, executableExtensions, interpreterMappings) {
  const argsStr = additionalArgs.map(quote).join(' ');

  let shouldExecute = false;
  let finalExecutionString = '';

  if (fileName) {
    const ext = path.extname(fileName).toLowerCase();
    
    // Check 1: Is it a mapped interpreter file? (e.g. .py)
    if (interpreterMappings[ext]) {
        shouldExecute = true;
        // Result: "python filename.py"
        finalExecutionString = `${interpreterMappings[ext]} "${fileName}"`;
    }
    // Check 2: Is it a native executable? (e.g. .bat)
    else if (executableExtensions.includes(ext) || executableExtensions.includes(fileName.toLowerCase())) {
        shouldExecute = true;
        // Result: "filename.bat"
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

  // --- WINDOWS TERMINAL ---
  if (isWT) {
    let cmd = `"${terminal}" ${argsStr} -d "${targetDir}"`;
    if (shouldExecute) {
      // Windows Terminal accepts the command after the profile/args
      // Note: We use cmd /k to keep window open if the command finishes instantly
      cmd += ` cmd /k "${executionString}"`;
    }
    return { cmd };
  }

  // --- STANDARD CMD or POWERSHELL ---
  const safeDir = `"${targetDir}"`;
  let shellCommand = '';

  if (shouldExecute) {
    if (isPowerShell) {
        // PowerShell cannot use -File for things like "python script.py". 
        // We must use -NoExit "command"
        shellCommand = `"${terminal}" ${argsStr} -NoExit "${executionString}"`;
    } else {
        // CMD: /k "python script.py" or /k "script.bat"
        shellCommand = `"${terminal}" ${argsStr} /k "${executionString}"`;
    }
  } else {
    // Just opening directory
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

  // macOS 'open' is tricky with arguments like "python file.py".
  // It prefers opening files via association.
  
  if (shouldExecute) {
      // If we have an interpreter mapping, we can't easily use "open" to run "python file.py"
      // inside Terminal.app without AppleScript.
      // However, if the user provided a CUSTOM terminal (like iTerm executable), 
      // we might treat it like Linux.
      
      const isCustomTerminal = !terminal.endsWith('.app');

      if (isCustomTerminal) {
           // Treat like Linux/Generic
           // We need to reconstruct the execution string here as Mac logic separates it
           const ext = path.extname(fileName).toLowerCase();
           const prefix = interpreterMappings[ext] ? interpreterMappings[ext] + ' ' : '';
           return { cmd: `"${terminal}" ${argsStr} "${prefix}./${fileName}"` };
      } 
      
      // Fallback for Standard Terminal.app with interpreter:
      // We rely on file associations or executable bit.
      // NOTE: "open -a Terminal file.py" opens it in text editor usually, unless associated.
      // This is a limitation on Mac without using 'osascript'.
      return { cmd: `open "${fileName}"` };
  }

  return { cmd: `open -a "${terminal}" "${targetDir}" ${argsStr}` };
}

function buildLinuxCommand(targetDir, executionString, preferredTerminal, argsStr, shouldExecute) {
  const terminal = preferredTerminal || 
    vscode.workspace.getConfiguration('terminal.external').get('linuxExec', 'xterm');
    
  if (shouldExecute) {
      // Standard Linux terminals use -e to execute a command string
      // executionString is "python file.py" or "./script.sh"
      
      // If it's a raw file (script.sh), ensure ./ prefix if needed, 
      // but executionString coming in usually has command prefix or is just name
      
      // Safety check: if executionString is JUST a filename, add ./
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