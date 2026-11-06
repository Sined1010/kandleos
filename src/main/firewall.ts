// Windows only: a firewall rule just for phone pairing – this program, TCP port 47321, devices of the local
// network – so pairing works while Windows treats the home network as "public". Switching the whole network to
// "private" instead would open more than KandleOS needs (discovery, file sharing).
import { execFile } from 'node:child_process'
import { LINK_PORT } from '../shared/link.ts'
import { t } from '../shared/i18n.ts'

export const RULE = 'KandleOS-Handy-Kopplung'
// The cmd and PowerShell quoting below holds for plain paths only; anything else is refused, not escaped.
const SAFE_PATH = /^[\p{L}\p{N} _\-.\\:()]+$/u

/** cmd.exe line that replaces our rule with a fresh one for `exe`; null for a path with unusual characters. */
export function ruleCommand(exe: string): string | null {
  if (!SAFE_PATH.test(exe)) return null
  const fw = 'netsh advfirewall firewall'
  return (
    `${fw} delete rule name=${RULE} >nul & ` +
    `${fw} add rule name=${RULE} dir=in action=allow program="${exe}" protocol=TCP localport=${LINK_PORT} remoteip=localsubnet profile=any`
  )
}

const run = (file: string, args: string[]): Promise<boolean> =>
  new Promise((resolve) => execFile(file, args, { windowsHide: true }, (err) => resolve(!err)))

/** Whether our rule exists (reading rules needs no admin rights); null off Windows. */
export async function hasFirewallRule(): Promise<boolean | null> {
  if (process.platform !== 'win32') return null
  return run('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${RULE}`])
}

// Security suites that often block incoming connections without asking, by process name (lower case, no .exe).
const OTHER: Record<string, string> = {
  'portmaster-core': 'Portmaster',
  avp: 'Kaspersky',
  ekrn: 'ESET',
  vsserv: 'Bitdefender',
  bdagent: 'Bitdefender',
  nortonsecurity: 'Norton'
}

/** Names of known security suites among running process names, each once. */
export function knownFirewalls(processes: string[]): string[] {
  const names = processes.map((p) => OTHER[p.trim().toLowerCase().replace(/\.exe$/, '')]).filter(Boolean)
  return [...new Set(names)]
}

/** Security suites running on this PC that may block the phone (for the pairing help). */
export function otherFirewalls(): Promise<string[]> {
  const [file, args] = process.platform === 'win32' ? ['tasklist', ['/FO', 'CSV', '/NH']] : ['ps', ['-eo', 'comm=']]
  return new Promise((resolve) =>
    execFile(file, args, { windowsHide: true }, (err, out) =>
      resolve(err ? [] : knownFirewalls(String(out).split(/\r?\n/).map((l) => l.split('","')[0].replace(/^"/, ''))))
    )
  )
}

/** Asks Windows once for admin rights (UAC) and sets up the rule; true if it exists afterwards. */
export async function addFirewallRule(): Promise<boolean> {
  if (process.platform !== 'win32') return false
  const cmd = ruleCommand(process.execPath)
  if (!cmd) throw new Error(t('Der Programmpfad enthält ungewöhnliche Zeichen; bitte die Regel von Hand anlegen.'))
  // Encoded, so no quoting layer between Node, PowerShell and cmd can break it; cancelling the UAC prompt
  // makes Start-Process fail, and the check below tells.
  const ps = `Start-Process -FilePath cmd.exe -ArgumentList '/c ${cmd}' -Verb RunAs -Wait -WindowStyle Hidden`
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')])
  return (await hasFirewallRule()) === true
}
