import bcrypt from "bcryptjs";

export const BCRYPT_COST = 12;

export function hashPassword(plain: string, cost: number = BCRYPT_COST): Promise<string> {
  return bcrypt.hash(plain, cost);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
