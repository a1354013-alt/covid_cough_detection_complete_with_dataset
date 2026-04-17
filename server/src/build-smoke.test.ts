import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { promises as fs } from "node:fs";

const repoRoot = path.resolve(process.cwd(), "..");

function runPnpm(args: string[], cwd: string) {
  const command = process.platform === "win32" ? "cmd.exe" : "corepack";
  const spawnArgs =
    process.platform === "win32" ? ["/c", "corepack", "pnpm", ...args] : ["pnpm", ...args];

  return spawnSync(command, spawnArgs, {
    cwd,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

describe("Build smoke tests", () => {
  it("client builds without errors", async () => {
    const result = runPnpm(["--filter", "./client", "run", "build"], repoRoot);

    if (result.status !== 0) {
      console.error("Client build stdout:", result.stdout);
      console.error("Client build stderr:", result.stderr);
      console.error("Client build error:", result.error);
    }

    assert.equal(result.status, 0, "Client build should succeed");

    // Verify build output exists
    const distExists = await fs
      .stat(path.join(repoRoot, "client", "dist"))
      .then(() => true)
      .catch(() => false);
    assert.ok(distExists, "client/dist directory should exist after build");

    // Verify critical files exist
    const indexHtmlExists = await fs
      .stat(path.join(repoRoot, "client", "dist", "index.html"))
      .then(() => true)
      .catch(() => false);
    assert.ok(indexHtmlExists, "client/dist/index.html should exist after build");
  });

  it("server compiles without type errors", () => {
    const result = runPnpm(["--filter", "./server", "run", "check"], repoRoot);

    if (result.status !== 0) {
      console.error("Server type check stdout:", result.stdout);
      console.error("Server type check stderr:", result.stderr);
      console.error("Server type check error:", result.error);
    }

    assert.equal(result.status, 0, "Server type checking should pass");
  });

  it("server builds without errors", () => {
    const result = runPnpm(["--filter", "./server", "run", "build"], repoRoot);

    if (result.status !== 0) {
      console.error("Server build stdout:", result.stdout);
      console.error("Server build stderr:", result.stderr);
      console.error("Server build error:", result.error);
    }

    assert.equal(result.status, 0, "Server build should succeed");
  });

  it("python project compiles without errors", () => {
    const result = spawnSync("python", ["-m", "compileall", "src/covid_cough_detection", "-q"], {
      cwd: path.join(repoRoot, "python_project"),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (result.status !== 0) {
      console.error("Python compile stdout:", result.stdout);
      console.error("Python compile stderr:", result.stderr);
      console.error("Python compile error:", result.error);
    }

    assert.equal(result.status, 0, "Python project should compile without errors");
  });

  it("version consistency check passes", () => {
    const result = runPnpm(["run", "check:version"], repoRoot);

    if (result.status !== 0) {
      console.error("Version check stdout:", result.stdout);
      console.error("Version check stderr:", result.stderr);
      console.error("Version check error:", result.error);
    }

    assert.equal(result.status, 0, "Version consistency check should pass");
  });
});
