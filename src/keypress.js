'use strict';
// Server-side keypress executor (Windows PowerShell + WScript.Shell SendKeys).
const { spawn } = require('child_process');

function sanitizeKeys(keys) {
  // allow letters, digits and SendKeys specials like {ENTER} {F5} ^c %{F4} +a
  return String(keys || '').replace(/[^A-Za-z0-9{}^%+~ _-]/g, '').slice(0, 40);
}

function send(keys, holdMs = 0) {
  const k = sanitizeKeys(keys);
  if (!k) return false;
  if (process.platform !== 'win32') {
    console.warn('[keypress] Windows only');
    return false;
  }
  const hold = Math.max(0, Math.min(Number(holdMs) || 0, 5000));
  const script =
    `$s = New-Object -ComObject WScript.Shell; $s.SendKeys('${k.replace(/'/g, "''")}'); ` +
    (hold ? `Start-Sleep -Milliseconds ${hold};` : '');
  const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true,
    stdio: 'ignore',
  });
  ps.on('error', (e) => console.error('[keypress] error:', e.message));
  return true;
}

module.exports = { send, sanitizeKeys };
