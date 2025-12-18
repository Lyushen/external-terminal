# Change Log

## [1.0.5]

### Added
- **Interpreter Mappings**: New setting `open-in-external-terminal.interpreterMappings` allows you to define specific interpreters for file extensions (e.g., run `.py` files with `python3` or `.js` with `node`).
- **Full Path Support**: Interpreter mappings support full binary paths (e.g., `/usr/bin/python3`).

### Changed
- **Improved Windows Execution**: Switched PowerShell execution logic to use `-NoExit` instead of `-File`, allowing arguments and interpreters to work correctly.
- **Priority Logic**: Interpreter mappings now take precedence over native executable extensions.
- **Smart Execution**: Logic is now platform-agnostic, supporting mapped execution on macOS and Linux, not just Windows.

## [1.0.4]

- **Relative Path Notifications**: Notifications now display the path relative to your repository/workspace (e.g., `RepoName/src/utils`) instead of the full absolute path.
- **Robust Path Handling**: Improved logic for spaces in directory names when launching terminals on Windows.

## [1.0.2]

- Windows Terminal execution fixes

## [1.0.1]

- Added Windows Terminal and prefer it by default for the Windows environment
- Ensured that binary files executed in the External Terminal

## [1.0.0]

- Initial release with support for opening files/folders in the system terminal.