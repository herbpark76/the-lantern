import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? "";
const GITHUB_REPO = Deno.env.get("GITHUB_REPO") ?? "";

interface GitHubIssue {
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  pull_request?: { url: string; html_url: string; merged_at: string | null };
  created_at: string;
  body: string;
  labels: Array<{ name: string }>;
}

async function checkPRsForIssues(issueNumbers: number[]): Promise<Set<number>> {
  if (issueNumbers.length === 0) return new Set();
  const issuesWithOpenPR = new Set<number>();

  const url = `https://api.github.com/repos/${GITHUB_REPO}/pulls?state=open&per_page=100`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
    },
  });
  if (!resp.ok) return issuesWithOpenPR;

  const prs: Array<{ body: string }> = await resp.json();
  for (const pr of prs) {
    if (!pr.body) continue;
    for (const num of issueNumbers) {
      const patterns = [`#${num}`, `fixes #${num}`, `closes #${num}`, `resolves #${num}`, `ref #${num}`];
      if (patterns.some((p) => pr.body.toLowerCase().includes(p.toLowerCase()))) {
        issuesWithOpenPR.add(num);
      }
    }
  }
  return issuesWithOpenPR;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const storySlug = url.searchParams.get("story_slug");

    let page = 1;
    let allIssues: GitHubIssue[] = [];
    let hasMore = true;

    while (hasMore && page <= 10) {
      const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/issues?labels=edit-request&state=all&per_page=100&page=${page}`;
      const resp = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!resp.ok) {
        const errText = await resp.text();
        return new Response(JSON.stringify({ error: `GitHub API error: ${resp.status} ${errText}` }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const issues: GitHubIssue[] = await resp.json();
      allIssues = allIssues.concat(issues);

      if (issues.length < 100) {
        hasMore = false;
      } else {
        page++;
      }
    }

    // Filter by story slug if provided
    let filtered = allIssues;
    if (storySlug) {
      filtered = allIssues.filter((issue) => issue.title.includes(`[${storySlug}]`));
    }

    // Determine status for each issue
    const issueNumbers = filtered.map((i) => i.number);
    const issuesWithPRs = await checkPRsForIssues(issueNumbers);

    const result = filtered.map((issue) => {
      let status: "open" | "in review" | "done";
      if (issue.state === "closed") {
        status = "done";
      } else if (issuesWithPRs.has(issue.number)) {
        status = "in review";
      } else {
        status = "open";
      }

      return {
        number: issue.number,
        title: issue.title,
        url: issue.html_url,
        status,
        created_at: issue.created_at,
        body: issue.body,
      };
    });

    return new Response(JSON.stringify({ issues: result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
 
