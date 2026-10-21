import "server-only";

type GitHubFile = {
  path: string;
  content: string;
  encoding: "utf-8" | "base64";
};

export type StagedGitHubPublication = {
  sha: string;
  htmlUrl: string;
  parentSha: string;
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

async function branchHeadSha() {
  const { repository, branch } = githubConfig();
  const ref = await githubFetch<{ object: { sha: string } }>(
    `/repos/${repository}/git/ref/heads/${encodeURIComponent(branch)}`,
  );
  return ref.object.sha;
}

export async function stageFiles(files: GitHubFile[], title: string): Promise<StagedGitHubPublication> {
  const { repository } = githubConfig();
  const parentSha = await branchHeadSha();
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
  return { sha: commit.sha, htmlUrl: commit.html_url, parentSha };
}

export async function promoteStagedFiles(publication: StagedGitHubPublication): Promise<GitHubResponse> {
  const { repository, branch } = githubConfig();
  const currentSha = await branchHeadSha();
  if (currentSha !== publication.parentSha) {
    throw new Error("The portfolio branch changed while this dispatch was publishing. Nothing was promoted.");
  }
  await githubFetch(`/repos/${repository}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: publication.sha, force: false }),
  });
  return { sha: publication.sha, htmlUrl: publication.htmlUrl };
}

export async function stagedPublicationIsLive(publication: StagedGitHubPublication) {
  const { repository } = githubConfig();
  const currentSha = await branchHeadSha();
  if (currentSha === publication.sha) return true;
  const comparison = await githubFetch<{ status: string }>(
    `/repos/${repository}/compare/${publication.sha}...${currentSha}`,
  );
  return comparison.status === "ahead" || comparison.status === "identical";
}

export async function publishFiles(files: GitHubFile[], title: string): Promise<GitHubResponse> {
  return promoteStagedFiles(await stageFiles(files, title));
}
