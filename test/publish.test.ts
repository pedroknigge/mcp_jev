import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("package.json is publish-ready: name, bin, files, engines, repo metadata", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as {
    name: string;
    bin: Record<string, string>;
    files: string[];
    engines: { node: string };
    repository: { url: string };
    bugs: { url: string };
    homepage: string;
    publishConfig: { access: string };
  };
  assert.equal(pkg.name, "mcp_jev");
  assert.equal(pkg.bin.mcp_jev, "dist/index.js");
  assert.ok(pkg.files.includes("dist"));
  assert.ok(pkg.files.includes("skills"));
  assert.ok(pkg.files.includes("README.md"));
  assert.ok(pkg.files.includes("LICENSE"));
  assert.ok(!pkg.files.includes("src"));
  assert.ok(!pkg.files.includes("test"));
  assert.match(pkg.engines.node, />=20/);
  assert.match(pkg.repository.url, /github\.com\/pedroknigge\/mcp_jev/);
  assert.match(pkg.bugs.url, /github\.com\/pedroknigge\/mcp_jev\/issues/);
  assert.match(pkg.homepage, /github\.com\/pedroknigge\/mcp_jev/);
  assert.equal(pkg.publishConfig.access, "public");
  assert.ok(fs.existsSync(path.join(root, ".npmignore")));
  assert.ok(fs.existsSync(path.join(root, "docs", "PUBLISH.md")));
  assert.ok(fs.existsSync(path.join(root, ".github", "workflows", "release.yml")));
});

test("npm pack allowlist includes dist and skills, excludes src and test", () => {
  const dist = path.join(root, "dist", "index.js");
  if (!fs.existsSync(dist)) {
    const built = spawnSync("npm", ["run", "build"], { cwd: root, encoding: "utf8" });
    assert.equal(built.status, 0, built.stderr);
  }
  const shebang = fs.readFileSync(dist, "utf8").split("\n", 1)[0] ?? "";
  assert.equal(shebang, "#!/usr/bin/env node");

  const result = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout) as Array<{ files: Array<{ path: string }> }> | { files: Array<{ path: string }> };
  const files = (Array.isArray(parsed) ? parsed[0]?.files : parsed.files) ?? [];
  const paths = files.map((file) => file.path.replaceAll("\\", "/"));
  assert.ok(paths.includes("package.json"));
  assert.ok(paths.includes("dist/index.js"));
  assert.ok(paths.includes("README.md"));
  assert.ok(paths.includes("LICENSE"));
  assert.ok(paths.includes("skills/mcp_jev/SKILL.md"));
  assert.ok(paths.includes(".env.example"));
  assert.ok(!paths.some((item) => item.startsWith("src/")));
  assert.ok(!paths.some((item) => item.startsWith("test/")));
  assert.ok(!paths.some((item) => item.startsWith(".github/")));
});
