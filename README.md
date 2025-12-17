# Open in External Terminal

VS Code extension to open the current file or folder in your OS's default External (system) terminal (Command Prompt, Terminal.app, iTerm, etc.).

## Features

- **Context Aware**: Right-click files or folders in the Explorer.
- **Smart Detection**: Detects your OS (Windows, macOS, Linux).
- **Windows Terminal Support**: Explicit support for `wt.exe`.

## Usage

1. Right-click a folder or file in the VS Code Explorer.
2. Select **Open in External Terminal**.

Alternatively, open a file and run the command `Open in External Terminal` from the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`).

## Configuration

You can customize the behavior in **Settings** (`Cmd+,` or `Ctrl+,`):

*   `open-in-external-terminal.preferredTerminal`: Override the default terminal executable (e.g., `wt.exe`, `iterm`, `bash`).
*   `open-in-external-terminal.additionalArgs`: Array of arguments to pass to the terminal executable.
*   `open-in-external-terminal.logLevel`: Debugging level (`info`, `debug`, `error`).

## Requirements

*   **macOS**: Requires `open` command (built-in).
*   **Linux**: Requires a terminal emulator installed (defaults to `xterm`, configurable to `gnome-terminal`, etc.).
*   **Windows**: Uses `cmd`, `powershell`, or `wt.exe` (Windows Terminal).

## Usage
Right-click on a file or folder in the Explorer and choose Open in External Terminal.

## Bugs report

Please submit an issue request on a [GitHub Issues Page](https://github.com/Lyushen/external-terminal/issues/new/choose)

```{include=CHANGELOG.md}