/** Entity type reserved for login-throttling counters (planned). Hidden from the audit viewer unless asked for. */
export const LOGIN_ATTEMPT_ENTITY = "login_attempt";

/** Audit action names written by the sign-in flow. */
export const AUTH_AUDIT = {
  loginSuccess: "auth.login_success",
  logout: "auth.logout",
} as const;
