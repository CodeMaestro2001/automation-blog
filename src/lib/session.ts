import "server-only";
import { cookies } from "next/headers";
import { seal, unseal } from "@/lib/crypto";

const ADMIN_COOKIE = "publisher_session";
const LINKEDIN_COOKIE = "linkedin_connection";

type AdminSession = { role: "admin"; expiresAt: number };
export type LinkedInConnection = {
  accessToken: string;
  expiresAt: number;
  memberId: string;
  name: string;
};

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
};

export async function isAdmin() {
  const value = (await cookies()).get(ADMIN_COOKIE)?.value;
  const session = await unseal<AdminSession>(value);
  return session?.role === "admin" && session.expiresAt > Date.now();
}

export async function createAdminSession() {
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  (await cookies()).set(ADMIN_COOKIE, await seal({ role: "admin", expiresAt }), {
    ...cookieOptions,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60,
  });
}

export async function clearAdminSession() {
  (await cookies()).delete(ADMIN_COOKIE);
}

export async function getLinkedInConnection() {
  const value = (await cookies()).get(LINKEDIN_COOKIE)?.value;
  const connection = await unseal<LinkedInConnection>(value);
  if (!connection || connection.expiresAt <= Date.now()) return null;
  return connection;
}

export async function setLinkedInConnection(connection: LinkedInConnection, expiresIn: number) {
  (await cookies()).set(LINKEDIN_COOKIE, await seal(connection), {
    ...cookieOptions,
    maxAge: Math.max(60, expiresIn),
  });
}

export async function clearLinkedInConnection() {
  (await cookies()).delete(LINKEDIN_COOKIE);
}

export async function assertAdmin() {
  if (!(await isAdmin())) throw new Error("UNAUTHORIZED");
}
