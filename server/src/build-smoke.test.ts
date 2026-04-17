import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import path from "node:path";
import { promises as fs } from "node:fs";

const repoRoot = path.resolve(process.cwd(), "..");
const pythonCommand = process.platform === "win32" ? "python" : "python3";

function getPnpmInvocation(): { command: string; prefixArgs: string[] } {
  const corepackRoot = process.env.COREPACK_ROOT;
  if (corepackRoot) {
    const pnpmEntrypoint = path.join(corepackRoot, "dist", "pnpm.js");
    return { command: process.execPath, prefixArgs: [pnpmEntrypoint] };
  }

  const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  return { command: pnpmCommand, prefixArgs: [] };
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
): SpawnSyncReturns<string> {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (result.error) {
    console.error(`Command failed to start: ${command} ${args.join(" ")}`);
    console.error(result.error);
  }

  return result;
}

function assertCommandSucceeded(
  result: SpawnSyncReturns<string>,
  label: string,
) {
  if (result.status !== 0) {
    console.error(`${label} stdout:`, result.stdout);
    console.error(`${label} stderr:`, result.stderr);

    if (result.error) {
      console.error(`${label} spawn error:`, result.error);
    }
  }

  assert.equal(result.status, 0, `${label} should succeed`);
}

describe("Build smoke tests", () => {
  it("client builds without errors", async () => {
    const pnpm = getPnpmInvocation();
    const result = runCommand(
      pnpm.command,
      [...pnpm.prefixArgs, "--filter", "./client", "run", "build"],
      repoRoot,
    );

    assertCommandSucceeded(result, "Client build");

    const distExists = await fs
      .stat(path.join(repoRoot, "client", "dist"))
      .then(() => true)
      .catch(() => false);
    assert.ok(distExists, "client/dist directory should exist after build");

    const indexHtmlExists = await fs
      .stat(path.join(repoRoot, "client", "dist", "index.html"))
      .then(() => true)
      .catch(() => false);
    assert.ok(indexHtmlExists, "client/dist/index.html should exist after build");
  });

  it("server compiles without type errors", () => {
    const pnpm = getPnpmInvocation();
    const result = runCommand(
      pnpm.command,
      [...pnpm.prefixArgs, "--filter", "./server", "run", "check"],
      repoRoot,
    );

    assertCommandSucceeded(result, "Server type check");
  });

  it("server builds without errors", () => {
    const pnpm = getPnpmInvocation();
    const result = runCommand(
      pnpm.command,
      [...pnpm.prefixArgs, "--filter", "./server", "run", "build"],
      repoRoot,
    );

    assertCommandSucceeded(result, "Server build");
  });

  it("python project compiles without errors", () => {
    const result = runCommand(
      pythonCommand,
      ["-m", "compileall", "src/covid_cough_detection", "-q"],
      path.join(repoRoot, "python_project"),
    );

    assertCommandSucceeded(result, "Python compile");
  });

  it("version consistency check passes", () => {
    const pnpm = getPnpmInvocation();
    const result = runCommand(
      pnpm.command,
      [...pnpm.prefixArgs, "run", "check:version"],
      repoRoot,
    );

    assertCommandSucceeded(result, "Version consistency check");
  });
});
