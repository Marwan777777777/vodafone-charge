import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env.js";
import { query } from "./db.js";

const secret = new TextEncoder().encode(env.jwtSecret);

export type AuthedUser = {
  id: string;
  name: string;
  username: string;
  role: "admin" | "employee";
  department: string;
  phone: string;
};

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function signToken(user: AuthedUser) {
  return new SignJWT({
    sub: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret);
}

export async function readToken(token: string): Promise<AuthedUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    const rows = await query<AuthedUser>(
      "select id, name, username, role, department, phone from users where id = $1",
      [payload.sub],
    );
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export function bearer(header: string | undefined) {
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim();
}

export function apiKeyOk(header: string | undefined) {
  const key = header?.trim() ?? "";
  if (!key || !env.garageApiKey) return false;
  const a = Buffer.from(key);
  const b = Buffer.from(env.garageApiKey);
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a[i] ^ b[i];
  return out === 0;
}
