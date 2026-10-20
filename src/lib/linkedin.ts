import "server-only";

const RESTLI_HEADER = { "X-Restli-Protocol-Version": "2.0.0" };

async function linkedInRequest<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...RESTLI_HEADER,
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LinkedIn rejected the publish (${response.status}): ${detail.slice(0, 300)}`);
  }
  if (response.status === 204) return {} as T;
  return (await response.json()) as T;
}

async function uploadImage(accessToken: string, author: string, bytes: ArrayBuffer, contentType: string) {
  const registration = await linkedInRequest<{
    value: {
      asset: string;
      uploadMechanism: {
        "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": { uploadUrl: string };
      };
    };
  }>("https://api.linkedin.com/v2/assets?action=registerUpload", accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        owner: author,
        serviceRelationships: [
          { relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" },
        ],
      },
    }),
  });

  const mechanism = registration.value.uploadMechanism[
    "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
  ];
  const upload = await fetch(mechanism.uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": contentType },
    body: bytes,
  });
  if (!upload.ok) throw new Error(`LinkedIn image upload failed (${upload.status}).`);
  return registration.value.asset;
}

export async function publishLinkedInPost(options: {
  accessToken: string;
  memberId: string;
  text: string;
  title: string;
  image?: { bytes: ArrayBuffer; contentType: string };
}) {
  const author = `urn:li:person:${options.memberId}`;
  const asset = options.image
    ? await uploadImage(options.accessToken, author, options.image.bytes, options.image.contentType)
    : null;

  const response = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      ...RESTLI_HEADER,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: options.text },
          shareMediaCategory: asset ? "IMAGE" : "NONE",
          ...(asset
            ? {
                media: [
                  {
                    status: "READY",
                    media: asset,
                    title: { text: options.title },
                  },
                ],
              }
            : {}),
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LinkedIn rejected the post (${response.status}): ${detail.slice(0, 300)}`);
  }
  return response.headers.get("x-restli-id") || "published";
}
