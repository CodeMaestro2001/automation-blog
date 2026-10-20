import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/session";

export async function GET() {
  try {
    await assertAdmin();
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const redirectUri = process.env.LINKEDIN_REDIRECT_URI;
    if (!clientId || !redirectUri) throw new Error("LinkedIn OAuth is not configured.");
    const state = randomBytes(24).toString("base64url");
    (await cookies()).set("linkedin_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });
    const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", "openid profile w_member_social");
    return NextResponse.redirect(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to connect LinkedIn.";
    return NextResponse.redirect(new URL(`/?linkedin_error=${encodeURIComponent(message)}`, process.env.LINKEDIN_REDIRECT_URI || "http://localhost:3000"));
  }
}
