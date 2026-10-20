import { redirect } from "next/navigation";
import { Publisher } from "@/components/Publisher";
import { getLinkedInConnection, isAdmin } from "@/lib/session";

export default async function Home() {
  if (!(await isAdmin())) redirect("/login");
  const linkedIn = await getLinkedInConnection();
  return (
    <Publisher
      linkedIn={linkedIn ? { connected: true, name: linkedIn.name } : { connected: false, name: "" }}
      githubConfigured={Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY)}
      linkedInConfigured={Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET && process.env.LINKEDIN_REDIRECT_URI)}
    />
  );
}
