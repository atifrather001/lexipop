/* LexiPop - persistent PowerShell helper for synthesizing input (Windows only).
   Keeps one powershell.exe alive so each command costs milliseconds, not a process spawn. */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

const BOOTSTRAP = `
$ErrorActionPreference = 'Stop'
Add-Type -Namespace LexiPop -Name Native -MemberDefinition @'
[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
[DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
'@
# Low-level mouse hook: swallows Ctrl+Right-click system-wide and reports TRIGGER on stdout
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Threading;
namespace LexiPop {
  public static class Hook {
    delegate IntPtr LowLevelMouseProc(int nCode, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int idHook, LowLevelMouseProc lpfn, IntPtr hMod, uint dwThreadId);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vKey);
    [DllImport("user32.dll")] static extern bool GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);
    [DllImport("user32.dll")] static extern bool TranslateMessage(ref MSG lpMsg);
    [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref MSG lpMsg);
    [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int x; public int y; }
    const int WH_MOUSE_LL = 14, WM_RBUTTONDOWN = 0x0204, WM_RBUTTONUP = 0x0205, VK_CONTROL = 0x11;
    static LowLevelMouseProc proc = Callback;
    static IntPtr hook = IntPtr.Zero;
    static bool armed = false;
    public static void Start() { var t = new Thread(Run); t.IsBackground = true; t.Start(); }
    static void Run() {
      hook = SetWindowsHookEx(WH_MOUSE_LL, proc, IntPtr.Zero, 0);
      MSG m;
      while (GetMessage(out m, IntPtr.Zero, 0, 0)) { TranslateMessage(ref m); DispatchMessage(ref m); }
    }
    static IntPtr Callback(int nCode, IntPtr wParam, IntPtr lParam) {
      if (nCode >= 0) {
        int msg = (int)wParam;
        bool ctrl = (GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0;
        if (msg == WM_RBUTTONDOWN && ctrl) { armed = true; return (IntPtr)1; }
        if (msg == WM_RBUTTONUP && armed) {
          armed = false;
          lock (Console.Out) { Console.Out.WriteLine("TRIGGER"); Console.Out.Flush(); }
          return (IntPtr)1;
        }
        if (msg == WM_RBUTTONUP) armed = false;
      }
      return CallNextHookEx(hook, nCode, wParam, lParam);
    }
  }
}
'@
[LexiPop.Hook]::Start()

function Key([byte]$vk, [bool]$up) { [LexiPop.Native]::keybd_event($vk, 0, ($(if ($up) { 2 } else { 0 })), [UIntPtr]::Zero) }
function Press([byte]$vk) { Key $vk $false; Start-Sleep -Milliseconds 15; Key $vk $true }
function Copy-Sel { Key 0x11 $false; Start-Sleep -Milliseconds 20; Press 0x43; Start-Sleep -Milliseconds 20; Key 0x11 $true }
function DblClick { [LexiPop.Native]::mouse_event(2,0,0,0,[UIntPtr]::Zero); [LexiPop.Native]::mouse_event(4,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 40; [LexiPop.Native]::mouse_event(2,0,0,0,[UIntPtr]::Zero); [LexiPop.Native]::mouse_event(4,0,0,0,[UIntPtr]::Zero) }
[Console]::Out.WriteLine('READY')
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  try {
    switch ($line.Trim()) {
      'esc'      { Press 0x1B }
      'ctrlup'   { Key 0x11 $true; Key 0x10 $true; Key 0x12 $true }
      'copy'     { Copy-Sel }
      'dblclick' { DblClick }
      'ping'     { }
    }
    [Console]::Out.WriteLine('OK')
  } catch { [Console]::Out.WriteLine('ERR ' + $_.Exception.Message) }
}
`;

export class InputHelper {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private queue: Array<(line: string) => void> = [];
  private ready: Promise<void> | null = null;
  /** Called when the user Ctrl+Right-clicks anywhere (the click itself is swallowed). */
  onTrigger: (() => void) | null = null;

  start(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise<void>((resolve, reject) => {
      if (process.platform !== "win32") return reject(new Error("InputHelper is Windows-only"));
      const encoded = Buffer.from(BOOTSTRAP, "utf16le").toString("base64");
      const p = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.proc = p;
      let buf = "";
      let readyFired = false;
      p.stdout.setEncoding("utf8");
      p.stdout.on("data", (chunk: string) => {
        buf += chunk;
        let i: number;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).replace(/\r$/, "");
          buf = buf.slice(i + 1);
          if (!readyFired && line === "READY") { readyFired = true; resolve(); continue; }
          if (line === "TRIGGER") { this.onTrigger?.(); continue; }
          const cb = this.queue.shift();
          cb?.(line);
        }
      });
      p.stderr.on("data", (d) => {
        const msg = String(d).trim();
        if (!msg || msg.startsWith("#< CLIXML") || msg.includes("<Objs")) return; // PowerShell stream noise
        console.error("[LexiPop] input helper:", msg);
      });
      p.on("exit", (code) => {
        console.warn("[LexiPop] input helper exited", code);
        this.proc = null;
        this.ready = null;
        if (!readyFired) reject(new Error(`input helper exited with ${code}`));
      });
    });
    return this.ready;
  }

  async run(cmd: "esc" | "ctrlup" | "copy" | "dblclick" | "ping"): Promise<void> {
    await this.start();
    const p = this.proc;
    if (!p) throw new Error("input helper not running");
    return new Promise<void>((resolve, reject) => {
      this.queue.push((line) => (line.startsWith("OK") ? resolve() : reject(new Error(line))));
      p.stdin.write(cmd + "\n");
    });
  }

  stop(): void {
    this.proc?.kill();
    this.proc = null;
    this.ready = null;
  }
}
