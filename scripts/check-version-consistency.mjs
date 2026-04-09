import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8")
);
const sharedVersion = fs.readFileSync(
  path.join(root, "shared", "version.ts"),
  "utf8"
);
const serverVersion = fs.readFileSync(
  path.join(root, "server", "src", "config", "version.ts"),
  "utf8"
);
const pythonVersion = fs.readFileSync(
  path.join(root, "python_project", "src", "version.py"),
  "utf8"
);

function extractTsVersion(content) {
  const match = content.match(/APP_VERSION\s*=\s*["']([^"']+)["']/);
  return match?.[1];
}

function extractPyVersion(content) {
  const match = content.match(/APP_VERSION\s*=\s*["']([^"']+)["']/);
  return match?.[1];
}

const versions = {
  package: packageJson.version,
  shared: extractTsVersion(sharedVersion),
  server: extractTsVersion(serverVersion),
  python: extractPyVersion(pythonVersion),
};

const unique = [...new Set(Object.values(versions))];
if (unique.length !== 1) {
  console.error("Version mismatch detected:", versions);
  process.exit(1);
}

console.log(`Version consistency OK: ${unique[0]}`);
