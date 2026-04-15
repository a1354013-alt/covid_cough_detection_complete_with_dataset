import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

const repoRoot = path.resolve(process.cwd(), "..");

function runNodeScript(scriptRelPath: string, args: string[], cwd: string) {
  const scriptAbs = path.join(repoRoot, scriptRelPath);
  const result = spawnSync(process.execPath, [scriptAbs, ...args], {
    cwd,
    encoding: "utf8",
  });
  return result;
}

describe("delivery contracts", () => {
  it("Dockerfile.node explicitly includes shared/ in build context", async () => {
    const dockerfile = await fs.readFile(path.join(repoRoot, "Dockerfile.node"), "utf8");
    assert.ok(
      dockerfile.includes("COPY shared ./shared"),
      "Dockerfile.node must COPY shared/ so docker builds don't rely on host files"
    );
  });

  it("python_project/Dockerfile installs from pyproject.toml and uses the stable module entrypoint", async () => {
    const dockerfile = await fs.readFile(path.join(repoRoot, "python_project", "Dockerfile"), "utf8");
    assert.ok(dockerfile.includes("COPY pyproject.toml"));
    assert.ok(dockerfile.includes("pip install --no-cache-dir ."));
    assert.ok(dockerfile.includes("covid_cough_detection.app:app"));
  });

  it(".dockerignore excludes samples and research-only assets from node image context", async () => {
    const dockerignore = await fs.readFile(path.join(repoRoot, ".dockerignore"), "utf8");
    assert.ok(dockerignore.includes("dataset/"));
    assert.ok(dockerignore.includes("patches/"));
    assert.ok(dockerignore.includes("python_project/src/experimental/"));
  });

  it("check-version-consistency fails when shared/version.ts is missing", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "covid-cough-version-missing-"));

    await fs.mkdir(path.join(tmpRoot, "client"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "server"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "server", "src", "config"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "python_project"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "python_project", "src", "covid_cough_detection"), {
      recursive: true,
    });

    const version = "9.9.9";
    await fs.writeFile(path.join(tmpRoot, "package.json"), JSON.stringify({ version }), "utf8");
    await fs.writeFile(
      path.join(tmpRoot, "client", "package.json"),
      JSON.stringify({ version }),
      "utf8"
    );
    await fs.writeFile(
      path.join(tmpRoot, "server", "package.json"),
      JSON.stringify({ version }),
      "utf8"
    );
    await fs.writeFile(
      path.join(tmpRoot, "python_project", "pyproject.toml"),
      `version = "${version}"\n`,
      "utf8"
    );

    // Missing shared/version.ts is the point of this test.
    await fs.writeFile(
      path.join(tmpRoot, "server", "src", "config", "version.ts"),
      `export const APP_VERSION = "${version}";\n`,
      "utf8"
    );
    await fs.writeFile(
      path.join(tmpRoot, "python_project", "src", "covid_cough_detection", "version.py"),
      `APP_VERSION = "${version}"\n`,
      "utf8"
    );

    const result = runNodeScript("scripts/check-version-consistency.mjs", ["--root", tmpRoot], tmpRoot);
    assert.notEqual(result.status, 0);
  });

  it("sync-version can generate version files in a clean tree and then passes version consistency", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "covid-cough-sync-"));

    await fs.mkdir(path.join(tmpRoot, "client"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "server"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "python_project"), { recursive: true });

    const version = "2.3.4";
    await fs.writeFile(path.join(tmpRoot, "package.json"), JSON.stringify({ version }), "utf8");
    await fs.writeFile(
      path.join(tmpRoot, "client", "package.json"),
      JSON.stringify({ version: "0.0.1" }),
      "utf8"
    );
    await fs.writeFile(
      path.join(tmpRoot, "server", "package.json"),
      JSON.stringify({ version: "0.0.1" }),
      "utf8"
    );
    await fs.writeFile(
      path.join(tmpRoot, "python_project", "pyproject.toml"),
      `version = "0.0.1"\n`,
      "utf8"
    );

    const check = runNodeScript(
      "scripts/sync-version.mjs",
      ["--root", tmpRoot, "--check"],
      tmpRoot
    );
    assert.notEqual(check.status, 0);

    const sync = runNodeScript("scripts/sync-version.mjs", ["--root", tmpRoot], tmpRoot);
    assert.equal(sync.status, 0);

    const consistency = runNodeScript(
      "scripts/check-version-consistency.mjs",
      ["--root", tmpRoot],
      tmpRoot
    );
    assert.equal(consistency.status, 0, consistency.stderr || consistency.stdout);
  });

  it("release-manifest excludes datasets, patches, and experimental python code", async () => {
    const result = runNodeScript("scripts/release-manifest.mjs", ["--root", repoRoot], repoRoot);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const files = JSON.parse(result.stdout) as string[];
    assert.ok(files.includes("shared/version.ts"));
    assert.ok(files.includes("python_project/src/covid_cough_detection/app.py"));

    assert.equal(files.some((p) => p.startsWith("dataset/")), false);
    assert.equal(files.some((p) => p.startsWith("patches/")), false);
    assert.equal(files.some((p) => p.startsWith("python_project/src/experimental/")), false);
  });
});
