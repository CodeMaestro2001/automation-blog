export const LINKEDIN_MAX_CHARACTERS = 3000;

const ARTICLE_LINK_PREFIX = "Read the full article: ";

export function slugify(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function buildPostUrl(portfolioUrl: string, slug: string) {
  const baseUrl = portfolioUrl.replace(/\/$/, "");
  return baseUrl && slug ? `${baseUrl}/blog/${slug}` : "";
}

export function buildLinkedInCopy(content: string, postUrl: string) {
  const copy = content.trim();
  return postUrl && !copy.includes(postUrl)
    ? `${copy}\n\n${ARTICLE_LINK_PREFIX}${postUrl}`
    : copy;
}
