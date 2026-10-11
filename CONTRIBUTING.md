# Contributing

Thanks for helping improve Tri-Core Browser.

1. Fork the repository and create a focused branch for your change.
2. Install dependencies with `npm ci` (Node.js 22 or newer).
3. Run `npm test` and `npm run build` before opening a pull request.
4. For renderer changes, check both `npm run dev` (UI preview) and `npm run desktop` (Electron app) where possible.
5. Describe the user-facing change and include screenshots for visible UI updates.

Please avoid committing `node_modules`, `dist`, or generated installers/executables. Security reports should follow [SECURITY.md](SECURITY.md), not be opened as public issues.
