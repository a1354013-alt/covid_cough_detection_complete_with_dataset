import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { promises as fs } from "node:fs";

const repoRoot = path.resolve(process.cwd(), "..");

describe("Build smoke tests", () => {
  it("client builds without errors", async () => {
    const result = spawnSync("pnpm", ["--filter", "./client", "run", "build"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (result.status !== 0) {
      console.error("Client build stdout:", result.stdout);
      console.error("Client build stderr:", result.stderr);
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
    const result = spawnSync("pnpm", ["--filter", "./server", "run", "check"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (result.status !== 0) {
      console.error("Server type check stdout:", result.stdout);
      console.error("Server type check stderr:", result.stderr);
    }

    assert.equal(result.status, 0, "Server type checking should pass");
  });

  it("server builds without errors", () => {
    const result = spawnSync("pnpm", ["--filter", "./server", "run", "build"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (result.status !== 0) {
      console.error("Server build stdout:", result.stdout);
      console.error("Server build stderr:", result.stderr);
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
    }

    assert.equal(result.status, 0, "Python project should compile without errors");
  });

  it("version consistency check passes", () => {
    const result = spawnSync("pnpm", ["run", "check:version"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (result.status !== 0) {
      console.error("Version check stdout:", result.stdout);
      console.error("Version check stderr:", result.stderr);
    }

    assert.equal(result.status, 0, "Version consistency check should pass");
  });
});
