# Security policy

## Supported versions

Security fixes are intended for the latest release on the default branch. This project is an early-stage desktop browser; do not use it as a substitute for a fully maintained browser for high-risk activity.

## Reporting a vulnerability

Please do not disclose an unpatched vulnerability in a public issue. Use GitHub's **Report a vulnerability** action in the repository's Security tab. Include the affected version, operating system, reproduction steps, and impact. Do not include passwords, tokens, or private browsing data in a report.

## Current safeguards

- Remote pages run in sandboxed Electron `WebContentsView`s with context isolation and Node integration disabled.
- Browser UI and remote pages are kept in separate web contents; only a narrow, validated IPC bridge is exposed to the local UI.
- Navigation is restricted to HTTP and HTTPS. Non-web schemes are not loaded as pages.
- Site permission requests are denied by default.
- The three cores use separate persistent storage partitions.
