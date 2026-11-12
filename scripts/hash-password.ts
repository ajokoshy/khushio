/**
 * Prints a bcrypt hash (cost 12) of a password typed at a hidden prompt. Nothing is written to a
 * file and no database is touched. Paste the hash into `v_password_hash` in
 * drizzle/migrations/set-admin.sql so the plain password never reaches the Neon query history.
 *   npm run auth:hash-password
 */
import { hashPassword } from "@/core/auth/password";

const MIN_LENGTH = 12;
const MAX_BYTES = 72; // bcrypt ignores everything after byte 72

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) {
      // Piped input (tests, CI): read one line without echo handling.
      let data = "";
      stdin.setEncoding("utf8");
      stdin.on("data", (chunk) => (data += chunk));
      stdin.on("end", () => resolve(data.split(/\r?\n/)[0] ?? ""));
      stdin.on("error", reject);
      return;
    }
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (char: string) => {
      for (const c of char) {
        if (c === "\u0003") { stdout.write("\n"); process.exit(130); } // Ctrl+C
        if (c === "\r" || c === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (c === "\u007f" || c === "\b") value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const password = await readHidden("New admin password (hidden): ");
  if (password.length < MIN_LENGTH) throw new Error(`Use at least ${MIN_LENGTH} characters.`);
  if (Buffer.byteLength(password, "utf8") > MAX_BYTES) throw new Error(`Use at most ${MAX_BYTES} bytes.`);
  if (process.stdin.isTTY) {
    const again = await readHidden("Type it again: ");
    if (again !== password) throw new Error("The two entries do not match.");
  }
  console.log(await hashPassword(password));
  console.error("\nPaste the hash above into v_password_hash in drizzle/migrations/set-admin.sql (leave v_password empty).");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
