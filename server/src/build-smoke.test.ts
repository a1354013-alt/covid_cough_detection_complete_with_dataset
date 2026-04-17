import test from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

test("delivery smoke: client build contract", () => {
  const result = spawnSync(
    "corepack",
    ["pnpm", "--filter", "./client", "run", "build"],
    {
      cwd: rootDir,
      shell: true,
      encoding: "utf-8",
    }
  );

  console.error("Client build stdout:", result.stdout);
  console.error("Client build stderr:", result.stderr);

  assert.strictEqual(result.status, 0, "Build smoke failed: client build contract broke");
});

test("delivery smoke: server check contract", () => {
  const result = spawnSync(
    "corepack",
    ["pnpm", "--filter", "./server", "run", "check"],
    {
      cwd: rootDir,
      shell: true,
      encoding: "utf-8",
    }
  );

  console.error("Server type check stdout:", result.stdout);
  console.error("Server type check stderr:", result.stderr);

  assert.strictEqual(result.status, 0, "Build smoke failed: server check contract broke");
});

test("delivery smoke: server build contract", () => {
  const result = spawnSync(
    "corepack",
    ["pnpm", "--filter", "./server", "run", "build"],
    {
      cwd: rootDir,
      shell: true,
      encoding: "utf-8",
    }
  );

  console.error("Server build stdout:", result.stdout);
  console.error("Server build stderr:", result.stderr);

  assert.strictEqual(result.status, 0, "Build smoke failed: server build contract broke");
});

test("delivery smoke: version sync contract", () => {
  const result = spawnSync(
    "corepack",
    ["pnpm", "run", "check:version"],
    {
      cwd: rootDir,
      shell: true,
      encoding: "utf-8",
    }
  );

  console.error("Version check stdout:", result.stdout);
  console.error("Version check stderr:", result.stderr);

  assert.strictEqual(result.status, 0, "Build smoke failed: version consistency contract broke");
});
