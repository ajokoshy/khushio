import fs from "node:fs";
import { test as setup } from "@playwright/test";
import { ADMIN, ADMIN_STATE, AUTH_DIR, SIGNED_OUT, hasAdmin, signIn } from "./helpers";

// Signs in once and saves the cookies for the other specs. Without admin credentials an empty
// state is written so DB-free specs still run and signed-in specs skip themselves.
setup("sign in as admin", async ({ page }) => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  if (!hasAdmin) {
    fs.writeFileSync(ADMIN_STATE, JSON.stringify(SIGNED_OUT));
    return;
  }
  await signIn(page, ADMIN);
  await page.context().storageState({ path: ADMIN_STATE });
});
