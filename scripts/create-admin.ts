/**
 * Creates the first super admin. There is no public registration.
 *   npm run auth:create-admin                      (email from ADMIN_EMAIL or a prompt)
 *   npm run auth:create-admin -- --reset-password  (recover access for an existing admin)
 * Against production, from your machine only (never put the password in Vercel):
 *   DATABASE_URL="<production pooled string>" AUTH_SECRET="<production secret>" npm run auth:create-admin
 */
import { createInterface } from "node:readline/promises";
import { createAdminUser, resetAdminPassword } from "@/core/auth/service";
import { adminEmailSchema } from "@/core/auth/validation";

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) return reject(new Error("The password prompt needs an interactive terminal."));
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          cleanup();
          process.stdout.write("\n");
          return resolve(value);
        }
        if (ch === "\u0003") {
          cleanup();
          return reject(new Error("Cancelled"));
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const reset = process.argv.includes("--reset-password");
  const email = adminEmailSchema.parse(process.env.ADMIN_EMAIL?.trim() || (await ask("Admin email: ")));
  const name = reset ? null : process.env.ADMIN_NAME?.trim() || (await ask("Display name (optional): "));

  const password = await askHidden("Password (min 12 characters): ");
  const confirm = await askHidden("Confirm password: ");
  if (password !== confirm) throw new Error("Passwords do not match.");

  if (reset) {
    const user = await resetAdminPassword(email, password);
    console.log(`Password updated for ${user.email}.`);
    return;
  }
  const user = await createAdminUser({ email, name, password });
  console.log(`Created ${user.role} ${user.email}. You can now sign in at /admin-login.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
