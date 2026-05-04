import { NextResponse } from "next/server";

const owner = "Gennety";
const repo = "Gennety";
const repoUrl = `https://github.com/${owner}/${repo}`;
const githubApiUrl = `https://api.github.com/repos/${owner}/${repo}`;

export async function GET() {
  try {
    const response = await fetch(githubApiUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to load GitHub repository data", status: response.status, url: repoUrl },
        { status: 502 }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      url: repoUrl,
      stars: data.stargazers_count ?? 0,
      forks: data.forks_count ?? 0,
      openIssues: data.open_issues_count ?? 0,
      defaultBranch: data.default_branch ?? "main",
      license: data.license?.spdx_id ?? null,
      pushedAt: data.pushed_at ?? null,
    });
  } catch {
    return NextResponse.json({ error: "GitHub repository request failed", url: repoUrl }, { status: 502 });
  }
}
