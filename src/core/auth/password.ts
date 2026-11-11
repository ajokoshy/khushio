import bcrypt from "bcryptjs";

/**
 * bcryptjs is pure JavaScript, so it behaves the same locally and on Vercel (no native binary).
 * If you later want Argon2, swap these two functions; nothing else depends on the algorithm.
 */
export const BCRYPT_COST = 12;

export function hashPassword(plain: string, cost: number = BCRYPT_COST): Promise<string> {
  return bcrypt.hash(plain, cost);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

let dummyHash: Promise<string> | undefined;
/** A throwaway hash used to keep response time similar when the email does not exist. */
export function getDummyHash(): Promise<string> {
  return (dummyHash ??= hashPassword("khushio-timing-equaliser"));
}
