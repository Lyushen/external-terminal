# Open in External Terminal

Open files or directories in your system's default terminal directly from the Visual Studio Code File Explorer.

## Features

- **Context Menu Integration**: Right-click on any file or folder in the Explorer and select **Open in External Terminal**.
- **Smart Execution (Windows)**: 
  - If you open a folder, the terminal opens in that folder.
  - If you open a non-executable file (e.g., `.js`, `.txt`), the terminal opens in the file's directory.
  - If you open a script or binary (e.g., `.bat`, `.cmd`, `.ps1`, `.exe`), the terminal opens and **automatically executes** the file. (was not tested on Linux)
- **Windows Terminal Support**: seamless integration with `wt.exe`.
- **Multi-Platform**: Works on Windows, macOS, and Linux.
- **Customizable**: Configure your preferred terminal application and arguments.

## Usage

1. Right-click on a file or folder in the VS Code Explorer sidebar.
2. Select **Open in External Terminal**.

## Extension Settings

This extension contributes the following settings:

* `open-in-external-terminal.preferredTerminal`: The executable path or command for your terminal. 
    * **Windows Default**: `cmd.exe` (or attempts to find Windows Terminal)
    * **Mac Default**: `Terminal.app`
    * **Linux Default**: `xterm`
* `open-in-external-terminal.additionalArgs`: An array of arguments to pass to the terminal executable (e.g., `["-p", "Ubuntu"]` for Windows Terminal profiles).
* `open-in-external-terminal.showNotification`: Enable or disable the notification popup when opening a terminal (Default: `true`).
* `open-in-external-terminal.logLevel`: Level of logging in the Output channel (Default: `info`).


## Usage
Right-click on a file or folder in the Explorer and choose Open in External Terminal.

## Bugs report

Please submit an issue request on a [GitHub Issues Page](https://github.com/Lyushen/external-terminal/issues/new/choose)

```{include=CHANGELOG.md}