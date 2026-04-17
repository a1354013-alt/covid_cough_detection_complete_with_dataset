import test from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

test("client builds without errors", () => {
  const result = spawnSync(
    "pnpm",
    ["--filter", "./client", "run", "build"],
    {
      cwd: rootDir,
      shell: true,
      encoding: "utf-8",
    }
  );

  console.error("Client build stdout:", result.stdout);
  console.error("Client build stderr:", result.stderr);

  assert.strictEqual(
    result.status,
    0,
    "Client build should succeed"
  );
});

test("server compiles without type errors", () => {
  const result = spawnSync(
    "pnpm",
    ["--filter", "./server", "run", "check"],
    {
      cwd: rootDir,
      shell: true,
      encoding: "utf-8",
    }
  );

  console.error("Server type check stdout:", result.stdout);
  console.error("Server type check stderr:", result.stderr);

  assert.strictEqual(
    result.status,
    0,
    "Server type checking should pass"
  );
});

test("server builds without errors", () => {
  const result = spawnSync(
    "pnpm",
    ["--filter", "./server", "run", "build"],
    {
      cwd: rootDir,
      shell: true,
      encoding: "utf-8",
    }
  );

  console.error("Server build stdout:", result.stdout);
  console.error("Server build stderr:", result.stderr);

  assert.strictEqual(
    result.status,
    0,
    "Server build should succeed"
  );
});

test("version consistency check passes", () => {
  const result = spawnSync(
    "pnpm",
    ["run", "check:version"],
    {
      cwd: rootDir,
      shell: true,
      encoding: "utf-8",
    }
  );

  console.error("Version check stdout:", result.stdout);
  console.error("Version check stderr:", result.stderr);

  assert.strictEqual(
    result.status,
    0,
    "Version consistency check should pass"
  );
});
