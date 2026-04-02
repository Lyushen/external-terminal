const assert = require('assert');
const Module = require('module');
const originalRequire = Module.prototype.require;

// Mock the vscode module for standalone unit testing
Module.prototype.require = function(name) {
    if (name === 'vscode') {
        return {
            window: { createOutputChannel: () => ({ appendLine: () => {}, show: () => {} }) },
            workspace: { getConfiguration: () => ({ get: (k, def) => def }) },
            commands: { registerCommand: () => ({}) },
            FileType: { File: 1 }
        };
    }
    return originalRequire.apply(this, arguments);
};

const { _testExports } = require('../src/extension.js');

const { buildLinuxCommand, buildWindowsCommand, buildPlatformCommand } = _testExports;

console.log("Running Terminal Command Builder Tests...\n");

try {
    // 1. Linux Execution Logic test
    const linuxExecution = buildLinuxCommand("/home/usr/test", "script.sh", "gnome-terminal", "", true);
    assert(linuxExecution.cmd.includes("gnome-terminal"), "Should use gnome-terminal");
    assert(linuxExecution.cmd.includes('--working-directory "/home/usr/test"'), "Should include Gnome working dir flag");
    assert(linuxExecution.cmd.includes("; exec"), "Should include fallback exec keep-alive for Linux");
    
    // 2. Linux Just Open Directory test
    const linuxOpen = buildLinuxCommand("/home/usr/test", null, "xterm", "", false);
    assert(!linuxOpen.cmd.includes("exec "), "Should not execute keep-alive if just opening dir");
    assert(linuxOpen.cmd.startsWith('"xterm" '), "Should map to xterm without bash wrapper if no file execution");
    
    console.log("✅ Linux command generation tests passed");

    // 3. Windows PowerShell Execution test
    const winPs = buildWindowsCommand("C:\\code", "script.ps1", "powershell.exe", "", true);
    assert(winPs.cmd.includes("start \"\" /D"), "Windows should use start to background process");
    assert(winPs.cmd.includes("-NoExit"), "Powershell should use -NoExit flag when executing");

    // 4. Windows CMD Execution test
    const winCmd = buildWindowsCommand("C:\\code", "script.bat", "cmd.exe", "", true);
    assert(winCmd.cmd.includes("/k"), "CMD should use /k flag when executing");
    
    console.log("✅ Windows command generation tests passed");

    // 5. Platform Builder Mappings test
    const platformCmd = buildPlatformCommand(
        "win32", 
        "C:\\code", 
        "main.py", 
        "", 
        ["-arg1"], 
        [".bat"], 
        { ".py": "python3" }
    );
    assert(platformCmd.cmd.includes("python3 \"main.py\""), "Interpreter mapping should wrap execution string");

    console.log("✅ Platform routing & interpreter mapping tests passed");

    console.log("\n🎉 All tests passed successfully!");
} catch (error) {
    console.error("\n❌ Test Failed:", error.message);
    process.exit(1);
}
