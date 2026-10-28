import { randomBytes, scryptSync } from "node:crypto";
const pw = process.argv[2]; if (!pw || pw.length < 12) { console.error('Usage: npm run hash -- "a password of 12+ characters"'); process.exit(1); }
const salt = randomBytes(16).toString("hex"); console.log(`${salt}:${scryptSync(pw, salt, 64).toString("hex")}`);
