# Security policy

## Supported versions

Only the latest release receives security fixes.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report them privately via GitHub: open the repository's **Security** tab and click **Report a vulnerability**
(or use [this link](https://github.com/Sined1010/kandleos/security/advisories/new)).

Please include:

- the KandleOS version and operating system
- what an attacker could do and the steps to reproduce it

KandleOS is maintained by one person in their spare time. I will try to answer within two weeks and will credit you
in the release notes unless you prefer otherwise.

## Release signatures

From 1.0.0 on, each release has `SHA256SUMS.txt` with the checksums of all files and `SHA256SUMS.txt.sig`, an SSH
signature made with this key (the Android APK is also signed with its own certificate, `CN=Sined1010`):

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFfp3oz6lfFxdn+S7RaZyecYIJ7oBQCL8YEcbpQiOtum KandleOS release signing
```

Fingerprint: `SHA256:jpMWiSkLnGGeK9sC0BPzUlenuArDxiP9iYapk0r3O7w`

To check a download (OpenSSH 8.1 or newer; Windows 10/11 has it built in), save the key line as a file
`allowed_signers` in the download folder, prefixed with the signer name:

```
kandleos-release ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFfp3oz6lfFxdn+S7RaZyecYIJ7oBQCL8YEcbpQiOtum
```

Then check the signature and the checksums:

```bash
ssh-keygen -Y verify -f allowed_signers -I kandleos-release -n file -s SHA256SUMS.txt.sig < SHA256SUMS.txt
sha256sum -c SHA256SUMS.txt --ignore-missing
```

On Windows, run the first line through `cmd` so the file reaches `ssh-keygen` unchanged (piping it in PowerShell
changes the line endings and the check fails), then compare a file's checksum by eye:

```powershell
cmd /c "ssh-keygen -Y verify -f allowed_signers -I kandleos-release -n file -s SHA256SUMS.txt.sig < SHA256SUMS.txt"
Get-FileHash .\KandleOS-Setup-<version>.exe
```

The first command must print `Good "file" signature for kandleos-release`. If the key here ever changes, the change
is announced in the release notes of a version signed with the old key.

## Scope

In scope: the KandleOS app, its installers and the bundled TradingAgents bridge (`resources/agents/`).

Out of scope: vulnerabilities in third-party services (Binance, Alpaca, Yahoo Finance, Finnhub, BaFin, Deutsche Börse,
Wikidata, Coin Metrics, Hugging Face, AI providers) and in TradingAgents itself; please report those to the respective projects.
