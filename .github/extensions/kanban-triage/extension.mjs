import { createServer } from "node:http";
import { joinSession, createCanvas } from "@github/copilot-sdk/extension";

const servers = new Map();
const defaultRepository = "SourabhMagar/githubTraining";

async function getRepository() {
    return process.env.GITHUB_REPOSITORY || defaultRepository;
}

function urgencyScore(issue) {
    const labels = issue.labels.map((label) => label.name.toLowerCase());
    let score = 0;
    if (labels.some((label) => /critical|blocker|urgent|p0/.test(label))) score += 100;
    if (labels.some((label) => /security|vulnerability/.test(label))) score += 80;
    if (labels.some((label) => /bug|regression|broken/.test(label))) score += 45;
    if (labels.some((label) => /high|important|p1/.test(label))) score += 35;
    if (!issue.assignee) score += 10;
    score += Math.min(issue.comments, 10) * 2;
    score += Math.max(0, 20 - Math.floor((Date.now() - Date.parse(issue.updated_at)) / 86400000));
    return score;
}

function explainPriority(issue, rank) {
    const labels = issue.labels.map((label) => label.name.toLowerCase());
    const reasons = [];
    if (labels.some((label) => /critical|blocker|urgent|p0/.test(label))) reasons.push("urgent severity label");
    if (labels.some((label) => /security|vulnerability/.test(label))) reasons.push("security-related label");
    if (labels.some((label) => /bug|regression|broken/.test(label))) reasons.push("bug or regression");
    if (labels.some((label) => /high|important|p1/.test(label))) reasons.push("high-priority label");
    if (!issue.assignee) reasons.push("currently unassigned");
    if (issue.comments > 0) reasons.push(`${issue.comments} discussion comment${issue.comments === 1 ? "" : "s"}`);
    if (reasons.length === 0) reasons.push("recently updated compared with the remaining open issues");
    return `Ranked #${rank} because of ${reasons.slice(0, 2).join(" and ")}.`;
}

async function fetchIssues() {
    const repository = await getRepository();
    const response = await fetch(`https://api.github.com/repos/${repository}/issues?state=open&per_page=100`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "copilot-kanban-triage" },
    });
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status} while loading issues for ${repository}.`);
    const issues = (await response.json())
        .filter((issue) => !issue.pull_request)
        .map((issue) => ({ ...issue, score: urgencyScore(issue) }))
        .sort((a, b) => b.score - a.score || Date.parse(b.updated_at) - Date.parse(a.updated_at));
    return {
        repository,
        top: issues.slice(0, 3).map((issue, index) => ({ ...issue, justification: explainPriority(issue, index + 1) })),
        remainder: issues.slice(3).map((issue) => ({ ...issue, justification: "Included below the immediate triage queue based on the urgency score." })),
    };
}

function renderHtml() {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Issue triage board</title>
  <style>
    body { margin: 0; padding: 24px; background: var(--background-color-default, #fff); color: var(--text-color-default, #1f2328); font: 14px/1.5 var(--font-sans, system-ui, sans-serif); }
    h1, h2, h3 { margin: 0; line-height: 1.25; } h1 { font-size: 24px; } h2 { margin-top: 28px; font-size: 17px; }
    .subtitle, .muted, .updated { color: var(--text-color-muted, #656d76); } .board { display: grid; gap: 12px; margin-top: 14px; }
    .card { border: 1px solid var(--border-color-default, #d0d7de); border-radius: 10px; padding: 16px; background: var(--background-color-default, #fff); }
    .featured { border-color: var(--true-color-red, #cf222e); } .card-header { display: flex; justify-content: space-between; gap: 12px; }
    .number { font-weight: 700; color: var(--true-color-blue, #0969da); } h3 { margin-top: 8px; font-size: 16px; } h3 a { color: inherit; }
    .description { white-space: pre-wrap; max-height: 7.5em; overflow: hidden; } .labels { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
    .label { border: 1px solid var(--border-color-default, #d0d7de); border-radius: 999px; padding: 2px 8px; font-size: 12px; }
    .why { margin: 12px 0; padding: 9px 10px; border-left: 3px solid var(--true-color-blue, #0969da); }
    button { border: 0; border-radius: 6px; padding: 8px 12px; color: var(--color-white, #fff); background: var(--true-color-blue, #0969da); cursor: pointer; font: inherit; }
    button:hover { filter: brightness(1.1); } button:focus-visible { outline: 2px solid var(--color-focus-outline, #0969da); outline-offset: 2px; }
    button:disabled { opacity: .6; cursor: wait; } .status { margin-left: 8px; color: var(--text-color-muted, #656d76); } .error { color: var(--true-color-red, #cf222e); }
  </style>
</head>
<body>
  <header><h1>Issue triage board</h1><p class="subtitle" id="repo">Loading open issues…</p></header>
  <main id="content" aria-live="polite"><p>Loading the latest GitHub issues…</p></main>
  <script>
    const content = document.querySelector("#content");
    const repo = document.querySelector("#repo");
    const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const card = (issue, featured) => {
      const labels = issue.labels.map((label) => '<span class="label">' + esc(label.name) + '</span>').join("");
      const payload = esc(JSON.stringify({ number: issue.number, title: issue.title, url: issue.html_url, body: issue.body || "" }));
      return '<article class="card' + (featured ? ' featured' : '') + '">' +
        '<div class="card-header"><span class="number">#' + issue.number + '</span><span class="updated">Updated ' + new Date(issue.updated_at).toLocaleDateString() + '</span></div>' +
        '<h3><a href="' + esc(issue.html_url) + '" target="_blank" rel="noreferrer">' + esc(issue.title) + '</a></h3>' +
        '<p class="description">' + esc(issue.body?.trim() || "No issue description provided.") + '</p>' +
        '<div class="labels">' + (labels || '<span class="muted">No labels</span>') + '</div>' +
        '<p class="why"><strong>Why here:</strong> ' + esc(issue.justification) + '</p>' +
        '<button data-issue="' + payload + '">Add to current context</button><span class="status" aria-live="polite"></span></article>';
    };
    async function load() {
      try {
        const response = await fetch("/api/issues");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load issues.");
        repo.textContent = data.repository + " · " + (data.top.length + data.remainder.length) + " open issues";
        content.innerHTML = '<h2>Needs attention now</h2><section class="board">' +
          (data.top.length ? data.top.map((issue) => card(issue, true)).join("") : '<p>No open issues found.</p>') + '</section>' +
          (data.remainder.length ? '<h2>Remaining open issues</h2><section class="board">' + data.remainder.map((issue) => card(issue, false)).join("") + '</section>' : '');
        content.querySelectorAll("button[data-issue]").forEach((button) => button.addEventListener("click", async () => {
          button.disabled = true;
          const status = button.nextElementSibling;
          status.textContent = "Adding…";
          try {
            const result = await fetch("/api/context", { method: "POST", headers: { "Content-Type": "application/json" }, body: button.dataset.issue });
            const payload = await result.json();
            if (!result.ok) throw new Error(payload.error || "Unable to add issue.");
            status.textContent = "Added to current context.";
          } catch (error) {
            status.textContent = error.message;
            button.disabled = false;
          }
        }));
      } catch (error) {
        content.innerHTML = '<p class="error">' + esc(error.message) + '</p>';
        repo.textContent = "Issue loading failed";
      }
    }
    load();
  </script>
</body>
</html>`;
}

async function startServer() {
    const server = createServer((req, res) => {
        const url = new URL(req.url || "/", "http://127.0.0.1");
        if (req.method === "GET" && url.pathname === "/api/issues") {
            fetchIssues().then((issues) => {
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                res.end(JSON.stringify(issues));
            }).catch((error) => {
                res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
                res.end(JSON.stringify({ error: error.message }));
            });
            return;
        }
        if (req.method === "POST" && url.pathname === "/api/context") {
            let body = "";
            req.setEncoding("utf8");
            req.on("data", (chunk) => { body += chunk; });
            req.on("end", async () => {
                try {
                    const issue = JSON.parse(body);
                    if (!Number.isInteger(issue.number) || typeof issue.title !== "string" || typeof issue.url !== "string") throw new Error("Invalid issue payload.");
                    await session.send({ prompt: `Add GitHub issue #${issue.number} to the current work context and start triaging it.\n\nTitle: ${issue.title}\nURL: ${issue.url}\n\nIssue description:\n${issue.body || "No description provided."}` });
                    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                    res.end(JSON.stringify({ ok: true }));
                } catch (error) {
                    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
                    res.end(JSON.stringify({ error: error.message }));
                }
            });
            return;
        }
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(renderHtml());
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    return { server, url: `http://127.0.0.1:${port}/` };
}

const session = await joinSession({
    canvases: [
        createCanvas({
            id: "kanban-triage",
            displayName: "Issue triage board",
            description: "A Kanban board that ranks open GitHub issues and adds selected issues to the current session context.",
            actions: [
                {
                    name: "refresh_issues",
                    description: "Refresh the ranked open issue list used by the triage board.",
                    handler: async () => fetchIssues(),
                },
                {
                    name: "add_issue_to_context",
                    description: "Add a GitHub issue to the current session context.",
                    inputSchema: {
                        type: "object",
                        properties: { number: { type: "integer" }, title: { type: "string" }, url: { type: "string" }, body: { type: "string" } },
                        required: ["number", "title", "url"],
                    },
                    handler: async (ctx) => {
                        const issue = ctx.input;
                        await session.send({ prompt: `Add GitHub issue #${issue.number} to the current work context and start triaging it.\n\nTitle: ${issue.title}\nURL: ${issue.url}\n\nIssue description:\n${issue.body || "No description provided."}` });
                        return { ok: true, number: issue.number };
                    },
                },
            ],
            open: async (ctx) => {
                let entry = servers.get(ctx.instanceId);
                if (!entry) {
                    entry = await startServer();
                    servers.set(ctx.instanceId, entry);
                }
                return { title: "Issue triage board", url: entry.url };
            },
            onClose: async (ctx) => {
                const entry = servers.get(ctx.instanceId);
                if (entry) {
                    servers.delete(ctx.instanceId);
                    await new Promise((resolve) => entry.server.close(() => resolve()));
                }
            },
        }),
    ],
});
