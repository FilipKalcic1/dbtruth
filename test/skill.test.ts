import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// A Windows checkout has CRLF line ends: with LF, the characters are counted as on any other system.
const text = readFileSync(new URL("../skills/dbtruth/SKILL.md", import.meta.url), "utf8").replace(/\r\n/g, "\n");
// Claude Code reads the frontmatter only when its --- is the first line.
const [, name, description] = /^---\nname: (.*)\ndescription: (.*)\n---\n/.exec(text) ?? [];

test("the skill's frontmatter opens on its first line and holds a name and a description, each a plain value", () => {
  assert.ok(name !== undefined && description !== undefined, "the file does not open with a frontmatter of name and description alone");
  // YAML reads a plain value as written when it opens with a letter, holds no ":" before a blank or at its end, which
  // would start a mapping, and no "#" after a blank, which would start a comment, ends with no blank, and is not null,
  // true or false; so no YAML library is needed to know what it reads.
  for (const value of [name, description]) assert.match(value, /^(?!(?:null|true|false)$)[a-z](?!.*(?::\s|:$|\s#)).*(?<!\s)$/i, `not a plain value: ${value}`);
});

test("the skill's name is its folder's, its description under 1,024 characters, and the whole file under 5,000", () => {
  assert.equal(name, "dbtruth", "a name other than its folder's");
  const length = description?.length ?? 0;
  assert.ok(length > 0 && length < 1024, `a description of ${length} characters`);
  assert.ok(text.length < 5000, `${text.length} characters`);
});

test("the skill names every tool the MCP server registers, and no other", () => {
  const registered = [...readFileSync(new URL("../src/mcp.ts", import.meta.url), "utf8").matchAll(/registerTool\(\s*"([^"]+)"/g)].map((m) => m[1]!);
  // A code span of one lowercase word, or words joined by _, is a tool's name: the skill writes values as quoted text,
  // and a command, a flag or a path holds a space, a dash, a slash or a dot.
  const named = [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!).filter((span) => /^[a-z]+(?:_[a-z]+)*$/.test(span));
  assert.deepEqual([...new Set(named)].sort(), registered.sort(), "the tools the skill names, against those mcp.ts registers");
});

test("the skill mentions --reveal only to forbid it", () => {
  const never = /^## Never$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text)?.[1] ?? "";
  const count = (part: string) => part.split("--reveal").length - 1;
  assert.ok(count(never) > 0, "the Never section does not forbid --reveal");
  assert.equal(count(text), count(never), "--reveal is mentioned outside the Never section");
});
