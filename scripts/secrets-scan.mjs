#!/usr/bin/env node
/**
 * Release 7B: a small secrets scan. Reads every file git tracks (or every file under the project when git is not there)
 * and fails when one looks like it contains a real key, token, password hash or database address.
 * Run:  npm run check:secrets      (also part of CI)
 * A reviewed false positive is allowed by writing "secrets-scan:allow" in a comment on the same line.
 * It is not a replacement for GitHub secret scanning (turn that on too: Settings > Code security), it is a cheap first net.
 */
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "playwright-report", "test-results", "coverage"]);
const SKIP_EXT = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|zip|pdf|docx|lock)$/i;

function listFiles() {
  try {
    return execSync("git ls-files", { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n").filter(Boolean);
  } catch {
    const out = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        if (SKIP_DIRS.has(name)) continue;
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else out.push(path.relative(root, full));
      }
    };
    walk(root);
    return out;
  }
}

const RULES = [
  ["private key block", /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ["Stripe live key", /\b[sr]k_live_[A-Za-z0-9]{20,}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["Vercel token", /\bvercel_[A-Za-z0-9]{24,}\b/i],
  ["bcrypt hash", /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/],
  ["database address with a password", /postgres(?:ql)?:\/\/[^:\s/@'"`]+:(?!password|pass|xxxx|\*+|<|\$|%|\{|\.\.\.|YOUR|secret|test|user)[^@\s'"`]{6,}@[^\s'"`]+/i],
  ["Cloudinary URL with a secret", /cloudinary:\/\/\d+:[A-Za-z0-9_-]{10,}@/],
  ["long secret assigned to a secret-looking name", /\b(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)\w*\s*[:=]\s*['"][A-Za-z0-9+/_=-]{24,}['"]/i],
];

// Places where fake-looking values are expected: tests, docs showing the shape, and this scanner itself.
const ALLOW = [/^tests\//, /^docs\//, /^scripts\/secrets-scan\.mjs$/, /\.md$/, /^\.env\.example$/, /^drizzle\/migrations\/set-admin\.sql$/, /^scripts\/(seed-dev|hash-password)\.ts$/, /^\.github\//];

const findings = [];
for (const file of listFiles()) {
  if (SKIP_EXT.test(file) || file.split("/").some((p) => SKIP_DIRS.has(p))) continue;
  if (file === ".env.local" || /^\.env\.(?!example)/.test(file)) findings.push([file, 0, "an environment file is tracked by git"]);
  if (ALLOW.some((re) => re.test(file))) continue;
  let text;
  try { text = readFileSync(path.join(root, file), "utf8"); } catch { continue; }
  text.split("\n").forEach((line, i) => {
    if (line.includes("secrets-scan:allow")) return; // a reviewed false positive, marked on its own line
    for (const [name, re] of RULES) if (re.test(line)) findings.push([file, i + 1, name]);
  });
}

if (findings.length > 0) {
  console.error(`Secrets scan: ${findings.length} possible secret${findings.length === 1 ? "" : "s"} found`);
  for (const [file, line, name] of findings) console.error(`  ${file}${line ? `:${line}` : ""}  ${name}`);
  process.exit(1);
}
console.log("Secrets scan: nothing found");
