; Included by electron-builder (electron-builder.yml: nsis.include).

; Uninstall: remove the phone-pairing firewall rule that KandleOS created for this copy (src/main/firewall.ts).
!macro customUnInstall
  ; Setup runs the old uninstaller with --updated when it installs a new version: the rule stays then.
  ${ifNot} ${isUpdated}
    ; Reading rules needs no admin rights, deleting does: Windows only asks (UAC) when this copy has a rule.
    ; Matched by program path, so a rule of another KandleOS (e.g. one run from source) is left alone.
    ; shortcut: an apostrophe in the install path breaks the quoted path and the rule stays, quote it if a user reports it.
    nsExec::Exec `powershell.exe -NoProfile -NonInteractive -Command "if (Get-NetFirewallApplicationFilter -Program '$INSTDIR\${APP_EXECUTABLE_FILENAME}' -ErrorAction SilentlyContinue | Get-NetFirewallRule | Where-Object DisplayName -eq 'KandleOS-Handy-Kopplung') { exit 0 } exit 1"`
    Pop $0
    ${if} $0 == 0
      ; Declining the prompt leaves the rule (it only admits this program, which is gone) and uninstalling goes on.
      ExecShellWait "runas" "netsh.exe" `advfirewall firewall delete rule name=KandleOS-Handy-Kopplung program="$INSTDIR\${APP_EXECUTABLE_FILENAME}"` SW_HIDE
    ${endIf}
  ${endIf}
!macroend
