'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

function runNpm(args) {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  return result;
}

const audit = runNpm(['audit', '--json']);
const auditText = audit.stdout || audit.stderr || '{}';
fs.writeFileSync('dependency-audit.json', auditText, 'utf8');
let report;
try {
  report = JSON.parse(auditText);
} catch (error) {
  throw new Error(`npm audit did not return valid JSON (exit ${audit.status}): ${error.message}`);
}

const vulnerabilities = report.metadata?.vulnerabilities;
if (!vulnerabilities) throw new Error('npm audit returned no vulnerability summary.');
console.log(`Dependency audit: ${vulnerabilities.info || 0} informational, ${vulnerabilities.low || 0} low, ${vulnerabilities.moderate || 0} moderate, ${vulnerabilities.high || 0} high, ${vulnerabilities.critical || 0} critical.`);
if (vulnerabilities.moderate) {
  console.warn('Moderate findings are retained in dependency-audit.json for review; this check fails only for high or critical findings.');
}
if (vulnerabilities.high || vulnerabilities.critical) process.exitCode = 1;

const tree = runNpm(['ls', '--all', '--json']);
const treeText = tree.stdout || tree.stderr || '{}';
fs.writeFileSync('dependency-tree.json', treeText, 'utf8');
if (tree.status !== 0) {
  console.error('npm ls exited nonzero; inspect dependency-tree.json.');
  process.exitCode = 1;
}
