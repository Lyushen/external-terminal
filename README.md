# Open in External Terminal

Open files or directories in the system's default terminal directly from the Visual Studio Code File Explorer. 

Unlike the built-in VS Code command, this extension supports **Smart Execution**—allowing you to run scripts and executables immediately upon opening.

## Features

- **Context Menu Integration**: Right-click on any file or folder in the Explorer and select **Open in External Terminal**.
- **Smart Directory Opening**: 
  - Right-click a folder: Terminal opens in that folder.
  - Right-click a non-executable file (e.g., `.txt`, `.json`): Terminal opens in that file's directory.
- **Smart Execution**: 
  - Right-click a configured script (e.g., `.py`, `.js`, `.bat`, `.sh`): The terminal opens and **automatically runs the file**.
- **Interpreter Support**: Map extensions to specific binaries (e.g., run `.ts` with `ts-node` or `.py` with `python3`).
- **Windows Terminal Support**: Seamless integration with `wt.exe`.
- **Cross-Platform**: Works on Windows, macOS, and Linux.

## Usage

1. Right-click on a file or folder in the VS Code Explorer sidebar.
2. Select **Open in External Terminal**.

> **Tip:** If you select a file defined in the settings (like `.py`), it will execute. If you want to just open the folder containing that file without running it, use the standard VS Code "Open in Integrated Terminal" or modify the extension settings.

## Extension Settings

This extension contributes the following settings to the `settings.json`:

### 1. Terminal Configuration
*   `open-in-external-terminal.preferredTerminal`: The executable path or command for the terminal.
    *   **Windows Default**: `cmd.exe` (Detects `wt.exe` automatically if path includes it).
    *   **Mac Default**: `Terminal.app`.
    *   **Linux Default**: `xterm`.
*   `open-in-external-terminal.additionalArgs`: An array of arguments to pass to the terminal executable (e.g., `["-p", "Ubuntu"]` for Windows Terminal profiles).

### 2. Execution Logic
*   `open-in-external-terminal.interpreterMappings`: **(New)** Map file extensions to specific interpreters. This is useful for scripts that cannot execute natively.
    *   **Format**: Key-Value pair `{ ".extension": "command" }`.
    *   **Example**:
        ```json
        {
          ".py": "python",
          ".js": "node",
          ".rb": "C:\\Ruby27\\bin\\ruby.exe"
        }
        ```
*   `open-in-external-terminal.executableExtensions`: A list of extensions that the OS should try to run directly without an interpreter.
    *   **Default**: `['.bat', '.cmd', '.exe', '.ps1', '.sh', '.command']`
    *   **Note**: `interpreterMappings` take priority over this list.

### 3. Misc
*   `open-in-external-terminal.showNotification`: Enable or disable the notification popup when opening a terminal (Default: `true`).
*   `open-in-external-terminal.logLevel`: Level of logging in the Output channel (Default: `info`).

## Configuration Examples

**Run Python files with Python 3 and Node files with Node.js:**
```json
"open-in-external-terminal.interpreterMappings": {
    ".py": "python3",
    ".js": "node"
}
```

## Usage
Right-click on a file or folder in the Explorer and choose Open in External Terminal.

## Bugs report

Please submit an issue request on a [GitHub Issues Page](https://github.com/Lyushen/external-terminal/issues/new/choose)

## Changelog
See [CHANGELOG.md](CHANGELOG.md)