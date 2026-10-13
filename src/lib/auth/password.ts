import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

/** Hash a password with bcrypt. Plaintext passwords are never stored or logged. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  problems: string[];
};

/**
 * Password policy: at least 8 characters with a mix of character classes.
 * Deliberately not overly strict (long passphrases are allowed) but blocks the
 * obvious weak choices.
 */
export function checkPasswordStrength(password: string): PasswordStrength {
  const problems: string[] = [];
  if (password.length < 8) problems.push("Kamida 8 belgidan iborat bo‘lishi kerak");
  if (password.length > 128) problems.push("128 belgidan oshmasligi kerak");
  if (!/[a-zA-Z]/.test(password)) problems.push("Kamida bitta harf bo‘lishi kerak");
  if (!/\d/.test(password)) problems.push("Kamida bitta raqam bo‘lishi kerak");

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^a-zA-Z0-9]/.test(password)) score++;

  const labels = ["Juda zaif", "Zaif", "O‘rtacha", "Yaxshi", "Kuchli"];
  return {
    score: Math.min(score, 4) as PasswordStrength["score"],
    label: labels[Math.min(score, 4)],
    problems,
  };
}

/** Generate a readable temporary password for admin-created accounts. */
export function generateTemporaryPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%";
  const pick = (set: string, n: number) =>
    Array.from({ length: n }, () => set[Math.floor(Math.random() * set.length)]).join("");
  return `${pick(upper, 2)}${pick(lower, 4)}${pick(digits, 3)}${pick(symbols, 1)}`;
}
