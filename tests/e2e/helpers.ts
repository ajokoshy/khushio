import path from "node:path";
import { expect, type Page } from "@playwright/test";

export const AUTH_DIR = path.join(__dirname, ".auth");
export const ADMIN_STATE = path.join(AUTH_DIR, "admin.json");
export const SIGNED_OUT = { cookies: [], origins: [] };

export const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? "", password: process.env.E2E_ADMIN_PASSWORD ?? "" };
export const hasAdmin = !!ADMIN.email && !!ADMIN.password;

export async function signIn(page: Page, creds: { email: string; password: string }, callbackUrl?: string) {
  await page.goto(callbackUrl ? `/admin-login?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/admin-login");
  await page.getByLabel("Email").fill(creds.email);
  await page.getByLabel("Password").fill(creds.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/);
}
