#!/usr/bin/env node
// Builds index.json and knowledge/INDEX.md from the frontmatter of playbooks and profiles.
// Usage: node scripts/build-index.mjs           write both files
//        node scripts/build-index.mjs --check   fail if frontmatter is invalid or the files are stale
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const REPO = hubRepo();

// The hub this index belongs to: CI's repo, else the upstream of a fork, else origin, so private copies link to themselves.
function hubRepo() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  for (const remote of ["upstream", "origin"]) {
    try {
      const url = execFileSync("git", ["remote", "get-url", remote], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const m = url.trim().match(/github\.com[:/]([^/]+\/[^/]+?)(\.git)?$/);
      if (m) return m[1];
    } catch {}
  }
  return "HedgingHarald/agent-hub";
}
const BLOB = `https://github.com/${REPO}/blob/main/`;
const check = process.argv.includes("--check");

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TYPES = ["playbook", "checklist", "code", "field-report"];
const EVIDENCE = /^(self-reported|screenshot|confirmed-by:@[A-Za-z0-9-]+)$/;
const PLAYBOOK_FIELDS = ["title", "topic", "type", "lang", "agent", "human", "result", "period", "evidence", "updated"];
const PROFILE_FIELDS = ["handle", "agents", "topics", "notify", "updated"];

const errors = [];
const posix = (p) => relative(ROOT, p).split(sep).join("/");

// Minimal YAML subset: `key: value`, quoted strings, [a, b] lists, true/false, trailing # comments.
function parseFrontmatter(file) {
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    errors.push(`${posix(file)}: missing frontmatter`);
    return null;
  }
  const data = {};
  for (const [i, raw] of match[1].split("\n").entries()) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    const kv = line.match(/^([a-z][a-z0-9_-]*):\s*(.*)$/);
    if (!kv) {
      errors.push(`${posix(file)}: frontmatter line ${i + 2} is not "key: value"`);
      continue;
    }
    data[kv[1]] = parseValue(kv[2]);
  }
  return data;
}

function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

function parseValue(v) {
  v = v.trim();
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    return inner ? inner.split(",").map((s) => unquote(s.trim())) : [];
  }
  if (v === "true") return true;
  if (v === "false") return false;
  return unquote(v);
}

const unquote = (s) => (/^(".*"|'.*')$/.test(s) ? s.slice(1, -1) : s);

function requireFields(file, data, fields) {
  for (const f of fields) {
    const v = data[f];
    if (v === undefined || v === "" || (typeof v === "string" && /^<.*>$/.test(v))) {
      errors.push(`${posix(file)}: field "${f}" is missing or still a placeholder`);
    }
  }
}

function playbooks() {
  const dir = join(ROOT, "knowledge");
  const out = [];
  for (const topic of readdirSync(dir).sort()) {
    const topicDir = join(dir, topic);
    if (topic.startsWith("_") || !statSync(topicDir).isDirectory()) continue;
    if (!SLUG.test(topic)) errors.push(`knowledge/${topic}: topic folder must be a lowercase slug`);
    for (const slug of readdirSync(topicDir).sort()) {
      const file = join(topicDir, slug, "README.md");
      if (!statSync(join(topicDir, slug)).isDirectory()) continue;
      if (!SLUG.test(slug)) errors.push(`knowledge/${topic}/${slug}: folder must be a lowercase slug`);
      if (!existsSync(file)) {
        errors.push(`knowledge/${topic}/${slug}: missing README.md`);
        continue;
      }
      const d = parseFrontmatter(file);
      if (!d) continue;
      requireFields(file, d, PLAYBOOK_FIELDS);
      if (d.topic !== topic) errors.push(`${posix(file)}: topic "${d.topic}" does not match folder "${topic}"`);
      if (d.type && !TYPES.includes(d.type)) errors.push(`${posix(file)}: type must be one of ${TYPES.join(", ")}`);
      if (d.evidence && !EVIDENCE.test(d.evidence)) {
        errors.push(`${posix(file)}: evidence must be self-reported, screenshot or confirmed-by:@handle`);
      }
      if (d.updated && !DATE.test(d.updated)) errors.push(`${posix(file)}: updated must be YYYY-MM-DD`);
      const path = posix(file);
      out.push({
        title: d.title,
        topic: d.topic,
        type: d.type,
        lang: d.lang,
        agent: d.agent,
        human: d.human,
        project: d.project ?? null,
        stack: d.stack ?? [],
        result: d.result,
        period: d.period,
        evidence: d.evidence,
        updated: d.updated,
        refs: d.refs ?? [],
        path,
        url: BLOB + path,
      });
    }
  }
  return out;
}

function profiles() {
  const dir = join(ROOT, "profiles");
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".md") || name.startsWith("_") || name === "README.md") continue;
    const file = join(dir, name);
    const d = parseFrontmatter(file);
    if (!d) continue;
    requireFields(file, d, PROFILE_FIELDS);
    const handle = String(d.handle ?? "").replace(/^@/, "");
    if (`${handle}.md` !== name) errors.push(`${posix(file)}: file name must be <handle>.md`);
    if (typeof d.notify !== "boolean") errors.push(`${posix(file)}: notify must be true or false`);
    for (const t of d.topics ?? []) {
      if (!SLUG.test(t)) errors.push(`${posix(file)}: topic "${t}" must be a lowercase slug`);
    }
    out.push({
      handle,
      agents: d.agents ?? [],
      topics: d.topics ?? [],
      notify: d.notify === true,
      updated: d.updated,
      path: posix(file),
      url: BLOB + posix(file),
    });
  }
  return out;
}

const pb = playbooks();
const pr = profiles();
const topics = [...new Set([...pb.map((p) => p.topic), ...pr.flatMap((p) => p.topics)])].sort();

const json =
  JSON.stringify(
    {
      repo: REPO,
      docs: "https://github.com/" + REPO + "/blob/main/plugin/skills/agent-hub/SKILL.md",
      topics,
      playbooks: pb,
      profiles: pr,
    },
    null,
    2,
  ) + "\n";

let md = "# Knowledge index\n\n";
md += "Generated by `node scripts/build-index.mjs` from playbook frontmatter. Do not edit by hand.\n";
md += "Machine-readable version: [`index.json`](../index.json).\n";
if (pb.length === 0) {
  md += "\n_No playbooks yet. Be the first: see [CONTRIBUTING.md](../CONTRIBUTING.md)._\n";
}
for (const topic of [...new Set(pb.map((p) => p.topic))]) {
  md += `\n## ${topic}\n\n| Playbook | Result | Evidence | By | Updated |\n|---|---|---|---|---|\n`;
  for (const p of pb.filter((x) => x.topic === topic)) {
    const link = p.path.replace(/^knowledge\//, "");
    md += `| [${p.title}](${link}) | ${p.result} (${p.period}) | ${p.evidence} | ${p.agent} for ${p.human} | ${p.updated} |\n`;
  }
}

if (errors.length) {
  console.error(errors.map((e) => "✗ " + e).join("\n"));
  process.exit(1);
}

const targets = [
  [join(ROOT, "index.json"), json],
  [join(ROOT, "knowledge", "INDEX.md"), md],
];
if (check) {
  const stale = targets.filter(([f, c]) => !existsSync(f) || readFileSync(f, "utf8").replace(/\r\n/g, "\n") !== c);
  if (stale.length) {
    console.error(`✗ ${stale.map(([f]) => posix(f)).join(", ")} out of date. Run: node scripts/build-index.mjs`);
    process.exit(1);
  }
  console.log(`✓ index up to date: ${pb.length} playbooks, ${pr.length} profiles, ${topics.length} topics`);
} else {
  for (const [f, c] of targets) writeFileSync(f, c);
  console.log(`✓ wrote index.json and knowledge/INDEX.md: ${pb.length} playbooks, ${pr.length} profiles`);
}
