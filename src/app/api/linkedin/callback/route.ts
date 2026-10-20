import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { assertAdmin, setLinkedInConnection } from "@/lib/session";

export async function GET(request: Request) {
  const home = new URL("/", request.url);
  try {
    await assertAdmin();
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");
    const error = requestUrl.searchParams.get("error_description");
    const cookieStore = await cookies();
    const expectedState = cookieStore.get("linkedin_oauth_state")?.value;
    cookieStore.delete("linkedin_oauth_state");
    if (error) throw new Error(error);
    if (!code || !state || !expectedState || state !== expectedState) throw new Error("LinkedIn OAuth state did not match.");

    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    const redirectUri = process.env.LINKEDIN_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) throw new Error("LinkedIn OAuth is not configured.");
    const tokenResponse = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
    });
    if (!tokenResponse.ok) throw new Error(`LinkedIn token exchange failed (${tokenResponse.status}).`);
    const token = (await tokenResponse.json()) as { access_token: string; expires_in: number };
    const userResponse = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${token.access_token}` },
      cache: "no-store",
    });
    if (!userResponse.ok) throw new Error(`LinkedIn profile request failed (${userResponse.status}).`);
    const user = (await userResponse.json()) as { sub: string; name?: string };
    await setLinkedInConnection(
      {
        accessToken: token.access_token,
        expiresAt: Date.now() + token.expires_in * 1000,
        memberId: user.sub,
        name: user.name || "LinkedIn member",
      },
      token.expires_in,
    );
    home.searchParams.set("linkedin", "connected");
  } catch (error) {
    home.searchParams.set("linkedin_error", error instanceof Error ? error.message : "Connection failed.");
  }
  return NextResponse.redirect(home);
}
