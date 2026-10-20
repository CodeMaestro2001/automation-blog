import "server-only";

type GitHubFile = {
  path: string;
  content: string;
  encoding: "utf-8" | "base64";
};

type GitHubResponse = { sha: string; htmlUrl: string };

function githubConfig() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const branch = process.env.GITHUB_BRANCH || "main";
  if (!token || !repository) {
    throw new Error("GitHub publishing is not configured. Add GITHUB_TOKEN and GITHUB_REPOSITORY.");
  }
  return { token, repository, branch };
}

async function githubFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { token } = githubConfig();
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2026-03-10",
      "Content-Type": "application/json",
      "User-Agent": "central-publisher",
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub rejected the publish (${response.status}): ${detail.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

export async function publishFiles(files: GitHubFile[], title: string): Promise<GitHubResponse> {
  const { repository, branch } = githubConfig();
  const ref = await githubFetch<{ object: { sha: string } }>(
    `/repos/${repository}/git/ref/heads/${encodeURIComponent(branch)}`,
  );
  const parentSha = ref.object.sha;
  const parent = await githubFetch<{ tree: { sha: string } }>(`/repos/${repository}/git/commits/${parentSha}`);

  const tree = await Promise.all(
    files.map(async (file) => {
      const blob = await githubFetch<{ sha: string }>(`/repos/${repository}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: file.content, encoding: file.encoding }),
      });
      return { path: file.path, mode: "100644", type: "blob", sha: blob.sha };
    }),
  );

  const nextTree = await githubFetch<{ sha: string }>(`/repos/${repository}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: parent.tree.sha, tree }),
  });
  const commit = await githubFetch<{ sha: string; html_url: string }>(`/repos/${repository}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: `Publish blog post: ${title}`,
      tree: nextTree.sha,
      parents: [parentSha],
    }),
  });
  await githubFetch(`/repos/${repository}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  return { sha: commit.sha, htmlUrl: commit.html_url };
}
