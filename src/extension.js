const vscode = require('vscode');
const { exec } = require('child_process');
const path = require('path');
const { promisify } = require('util');

const execAsync = promisify(exec);

function activate(context) {
  const openCommand = 'extension.openInSystemTerminal';
  const outputChannel = vscode.window.createOutputChannel('Open in Terminal');
  outputChannel.appendLine(`Extension activated on platform: ${process.platform}`);

  let openCommandHandler = vscode.commands.registerCommand(
    openCommand,
    async (uris) => {
      try {
        if (!uris) {
          vscode.window.showWarningMessage(
            'Please use this command from the explorer context menu.'
          );
          return;
        }

        // Convert single uri to array
        if (!Array.isArray(uris)) {
          uris = [uris];
        }

        const config = vscode.workspace.getConfiguration('open-in-system-terminal');
        const preferredTerminal = config.get('preferredTerminal', '');
        const additionalArgs = config.get('additionalArgs', []);
        const showNotification = config.get('showNotification', true);
        const logLevel = config.get('logLevel', 'info'); // 'debug', 'info', 'error'

        const platform = process.platform;

        if (!['darwin', 'win32', 'linux'].includes(platform)) {
          vscode.window.showErrorMessage(`Unsupported platform: ${platform}`);
          log(outputChannel, `Unsupported platform detected: ${platform}`, 'error', logLevel);
          return;
        }

        // Process each selected URI
        for (const uri of uris) {
          const terminalCommand = await buildTerminalCommand(uri, platform, preferredTerminal, additionalArgs);

          if (terminalCommand) {
            if (showNotification) {
              vscode.window.showInformationMessage(
                `Opening ${uri.fsPath} in system terminal...`
              );
            }

            log(outputChannel, `Executing command: ${terminalCommand}`, 'debug', logLevel);

            try {
              await execAsync(terminalCommand);
              log(outputChannel, `Successfully executed command`, 'info', logLevel);
            } catch (error) {
              log(outputChannel, `Error executing command: ${error.message}`, 'error', logLevel);
              vscode.window.showErrorMessage(
                `Failed to open terminal. Please check if the terminal path is correct and you have the necessary permissions.`
              );
            }
          }
        }
      } catch (error) {
        log(outputChannel, `Unhandled error: ${error.message}`, 'error', 'error');
        vscode.window.showErrorMessage(
          'An unexpected error occurred: ' + error.message
        );
      }
    }
  );

  context.subscriptions.push(openCommandHandler);
}

async function buildTerminalCommand(uri, platform, preferredTerminal, additionalArgs) {
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    const isDirectory = stat.type === vscode.FileType.Directory;
    const pathToOpen = isDirectory ? uri.fsPath : path.dirname(uri.fsPath);

    const args = additionalArgs.map(arg => quoteArgument(arg));

    switch (platform) {
      case 'darwin':
        return constructMacCommand(pathToOpen, args, preferredTerminal);
      case 'win32':
        return constructWindowsCommand(pathToOpen, args, preferredTerminal);
      case 'linux':
        return constructLinuxCommand(pathToOpen, args, preferredTerminal);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  } catch (error) {
    throw new Error(`Error determining file type for ${uri.fsPath}: ${error.message}`);
  }
}

function constructMacCommand(pathToOpen, args, preferredTerminal) {
  const escapedPath = quoteArgument(pathToOpen);
  const additionalArgs = args.join(' ');
  const terminal = preferredTerminal ? quoteArgument(preferredTerminal) : quoteArgument(
    vscode.workspace.getConfiguration('terminal.external').get('osxExec', 'Terminal.app')
  );
  return `open -a ${terminal} ${escapedPath} ${additionalArgs}`;
}

function constructWindowsCommand(pathToOpen, args, preferredTerminal) {
  const escapedPath = quoteArgument(pathToOpen);
  const additionalArgs = args.join(' ');
  const terminal = preferredTerminal ? quoteArgument(preferredTerminal) : quoteArgument(
    vscode.workspace.getConfiguration('terminal.external').get('windowsExec', 'cmd.exe')
  );
  return `start "" ${terminal} ${additionalArgs} /k cd /d ${escapedPath}`;
}

function constructLinuxCommand(pathToOpen, args, preferredTerminal) {
  const escapedPath = quoteArgument(pathToOpen);
  const additionalArgs = args.join(' ');
  const terminal = preferredTerminal ? quoteArgument(preferredTerminal) : quoteArgument(
    vscode.workspace.getConfiguration('terminal.external').get('linuxExec', 'xterm')
  );
  return `${terminal} ${additionalArgs} -e 'cd ${escapedPath} && exec $SHELL'`;
}

function quoteArgument(arg) {
  if (process.platform === 'win32') {
    // Escape characters and wrap with double quotes
    arg = arg.replace(/(["^&|<>%])/g, '^$1');
    return `"${arg}"`;
  } else {
    // Escape single quotes
    arg = arg.replace(/'/g, `'\\''`);
    return `'${arg}'`;
  }
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
