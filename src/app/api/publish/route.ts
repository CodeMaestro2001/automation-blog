import { NextResponse } from "next/server";
import { publishFiles } from "@/lib/github";
import { publishLinkedInPost } from "@/lib/linkedin";
import { buildLinkedInCopy, buildPostUrl, LINKEDIN_MAX_CHARACTERS, slugify } from "@/lib/publishing";
import { errorMessage, hasValidOrigin } from "@/lib/request";
import { assertAdmin, getLinkedInConnection } from "@/lib/session";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const imageExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};

function text(form: FormData, key: string) {
  return String(form.get(key) || "").trim();
}

function cleanCopy(value: string) {
  return value.normalize("NFKC").replace(/\u3164/g, "").trim();
}

function derivePost(content: string) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const titleIndex = lines.findIndex((line) => line.trim());
  if (titleIndex === -1) return null;
  const title = cleanCopy(lines[titleIndex]).replace(/^#{1,6}\s*/, "").slice(0, 140).trim();
  if (!title) return null;
  const body = lines.slice(titleIndex + 1).join("\n").trim() || title;
  const blocks = cleanCopy(body).split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  const excerptSource = blocks.find((block) => !/^#|^📘|engineering notes/i.test(block) && block.length >= 35) || blocks[0] || title;
  const excerpt = excerptSource.replace(/^#{1,6}\s*/gm, "").replace(/^[-*>]\s*/gm, "").replace(/\*\*/g, "").slice(0, 280).trim();
  return { title, body, excerpt };
}

function readImageDimensions(buffer: Buffer, contentType: string) {
  if (contentType === "image/png" && buffer.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (contentType === "image/jpeg") {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  return { width: 1600, height: 900 };
}

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  try {
    await assertAdmin();
  } catch {
    return NextResponse.json({ error: "Your session has expired. Sign in again." }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const content = text(form, "content") || text(form, "linkedInCopy") || [text(form, "title"), text(form, "excerpt"), text(form, "body")].filter(Boolean).join("\n\n");
    const derived = derivePost(content);
    if (!derived) {
      return NextResponse.json({ error: "Write your post before publishing. The first line will become its title." }, { status: 400 });
    }
    const { title, excerpt, body } = derived;
    const slug = slugify(title) || `post-${Date.now()}`;
    const imageAlt = text(form, "imageAlt") || title;
    const tags = text(form, "tags").split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 8);
    const linkedInCopy = content;
    const publishWebsite = form.get("publishWebsite") === "true";
    const publishLinkedIn = form.get("publishLinkedIn") === "true";
    const image = form.get("image");

    if (!publishWebsite && !publishLinkedIn) {
      return NextResponse.json({ error: "Select at least one publishing destination." }, { status: 400 });
    }
    let imageData: { buffer: Buffer; bytes: ArrayBuffer; contentType: string; extension: string; width: number; height: number } | null = null;
    if (image instanceof File && image.size > 0) {
      const extension = imageExtensions[image.type];
      if (!extension) return NextResponse.json({ error: "Use a JPG or PNG image." }, { status: 400 });
      if (image.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Image must be smaller than 4 MB." }, { status: 400 });
      const bytes = await image.arrayBuffer();
      const buffer = Buffer.from(bytes);
      imageData = { buffer, bytes, contentType: image.type, extension, ...readImageDimensions(buffer, image.type) };
    }

    const publishedAt = new Date().toISOString();
    const portfolioBase = (process.env.PORTFOLIO_URL || "").replace(/\/$/, "");
    const postUrl = buildPostUrl(portfolioBase, slug);
    const finalLinkedInCopy = buildLinkedInCopy(linkedInCopy, postUrl);
    if (publishLinkedIn && finalLinkedInCopy.length > LINKEDIN_MAX_CHARACTERS) {
      return NextResponse.json(
        { error: `LinkedIn total is ${finalLinkedInCopy.length.toLocaleString("en-US")} characters including the article link. Shorten it to ${LINKEDIN_MAX_CHARACTERS.toLocaleString("en-US")} or fewer.` },
        { status: 400 },
      );
    }
    const results: Record<string, { ok: boolean; detail: string; url?: string }> = {};

    if (publishWebsite) {
      try {
        const imagePath = imageData ? `/blog/${slug}.${imageData.extension}` : null;
        const post = {
          slug,
          title,
          excerpt,
          body,
          publishedAt,
          tags,
          image: imagePath,
          imageAlt,
          imageWidth: imageData?.width,
          imageHeight: imageData?.height,
        };
        const files = [
          {
            path: `content/blog/${slug}.json`,
            content: JSON.stringify(post, null, 2) + "\n",
            encoding: "utf-8" as const,
          },
          ...(imageData
            ? [
                {
                  path: `public/blog/${slug}.${imageData.extension}`,
                  content: imageData.buffer.toString("base64"),
                  encoding: "base64" as const,
                },
              ]
            : []),
        ];
        const commit = await publishFiles(files, title);
        results.website = { ok: true, detail: `Committed ${commit.sha.slice(0, 7)}`, url: postUrl || commit.htmlUrl };
      } catch (error) {
        results.website = { ok: false, detail: errorMessage(error) };
      }
    }

    if (publishLinkedIn) {
      if (publishWebsite && results.website && !results.website.ok) {
        results.linkedin = { ok: false, detail: "Skipped because the portfolio publish failed; no broken article link was shared." };
      } else {
        try {
          const connection = await getLinkedInConnection();
          if (!connection) throw new Error("Connect LinkedIn before publishing.");
          const postId = await publishLinkedInPost({
            accessToken: connection.accessToken,
            memberId: connection.memberId,
            text: finalLinkedInCopy,
            title,
            image: imageData ? { bytes: imageData.bytes, contentType: imageData.contentType } : undefined,
          });
          results.linkedin = { ok: true, detail: `Post ${postId}` };
        } catch (error) {
          results.linkedin = { ok: false, detail: errorMessage(error) };
        }
      }
    }

    const allSucceeded = Object.values(results).every((result) => result.ok);
    return NextResponse.json(
      { ok: allSucceeded, slug, postUrl, results },
      { status: allSucceeded ? 200 : 207 },
    );
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
