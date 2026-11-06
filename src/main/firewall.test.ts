import test from 'node:test'
import assert from 'node:assert/strict'
import { knownFirewalls, RULE, ruleCommand } from './firewall.ts'

test('known security suites are found among process names, each once', () => {
  assert.deepEqual(knownFirewalls(['System', 'portmaster-core.exe', 'explorer.exe', 'AVP.EXE', 'bdagent.exe', 'vsserv.exe']), ['Portmaster', 'Kaspersky', 'Bitdefender'])
  assert.deepEqual(knownFirewalls(['portmaster-core', 'bash']), ['Portmaster'])
  assert.deepEqual(knownFirewalls(['', 'chrome.exe']), [])
})

test('the rule allows only this program, TCP 47321 and the local network, in every profile', () => {
  const cmd = ruleCommand('C:\\Users\\Jörg Müller\\AppData\\Local\\Programs\\KandleOS (neu)\\KandleOS.exe')!
  assert.ok(cmd.startsWith(`netsh advfirewall firewall delete rule name=${RULE} >nul & `))
  const add = cmd.split(' & ')[1]
  for (const part of ['dir=in', 'action=allow', 'program="C:\\Users\\Jörg Müller\\AppData\\Local\\Programs\\KandleOS (neu)\\KandleOS.exe"', 'protocol=TCP', 'localport=47321', 'remoteip=localsubnet', 'profile=any'])
    assert.ok(add.includes(part), part)
})

test('paths that could break out of the quoting are refused', () => {
  for (const exe of ['C:\\a"b\\x.exe', "C:\\it's\\x.exe", 'C:\\a&b\\x.exe', 'C:\\%TEMP%\\x.exe', 'C:\\a|b\\x.exe', 'C:\\a^b\\x.exe', ''])
    assert.equal(ruleCommand(exe), null, exe)
})
