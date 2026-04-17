import fs from "node:fs/promises";
import path from "node:path";

function parseRootArg(argv) {
  const idx = argv.indexOf("--root");
  if (idx === -1) return null;
  const value = argv[idx + 1];
  if (!value) throw new Error("--root requires a path value");
  return value;
}

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function isExcluded(relPosixPath) {
  const rel = relPosixPath.replace(/^\.\/+/, "");

  const excludedPrefixes = [
    ".git/",
    ".github/",
    "node_modules/",
    ".pnpm-store/",
    "client/dist/",
    "server/dist/",
    "dist/",
    "build/",
    ".vite/",
    "coverage/",
    "dataset/",
    "patches/",
    "python_project/models/",
    "python_project/data/",
    "python_project/src/experimental/",
    "python_project/experimental/",
  ];

  return excludedPrefixes.some((prefix) => rel === prefix.slice(0, -1) || rel.startsWith(prefix));
}

async function walkFiles(rootDir, relDir = "") {
  const absDir = path.join(rootDir, relDir);
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const relPath = relDir ? path.join(relDir, entry.name) : entry.name;
    const relPosix = toPosix(relPath);

    if (isExcluded(`${relPosix}${entry.isDirectory() ? "/" : ""}`)) {
      continue;
    }

    if (entry.isDirectory()) {
      results.push(...(await walkFiles(rootDir, relPath)));
      continue;
    }

    results.push(relPosix);
  }

  return results;
}

async function main() {
  const root = path.resolve(parseRootArg(process.argv) ?? process.cwd());

  const includeRoots = [
    "client",
    "server",
    "shared",
    "scripts",
    "python_project",
    "Dockerfile.node",
    "docker-compose.yml",
    "README.md",
    "API_DOCUMENTATION.md",
    "DEPLOYMENT_GUIDE.md",
    "TESTING_GUIDE.md",
    "RELEASE_CHECKLIST.md",
    ".env.example",
  ];

  const manifest = new Set();
  for (const include of includeRoots) {
    const abs = path.join(root, include);
    try {
      const stat = await fs.stat(abs);
      if (stat.isDirectory()) {
        for (const file of await walkFiles(root, include)) {
          manifest.add(file);
        }
      } else {
        const rel = toPosix(include);
        if (!isExcluded(rel)) {
          manifest.add(rel);
        }
      }
    } catch {
      // Ignore missing optional includes to allow contract tests to synthesize minimal trees.
    }
  }

  const sorted = Array.from(manifest).sort();
  process.stdout.write(`${JSON.stringify(sorted, null, 2)}\n`);
}

await main();
