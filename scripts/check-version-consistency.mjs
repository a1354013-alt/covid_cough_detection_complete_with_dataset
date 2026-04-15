import fs from "node:fs";
import path from "node:path";

function parseRootArg(argv) {
  const idx = argv.indexOf("--root");
  if (idx === -1) return null;
  const value = argv[idx + 1];
  if (!value) {
    throw new Error("--root requires a path value");
  }
  return value;
}

const root = parseRootArg(process.argv) ?? process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function extractVersionConstant(content) {
  const match = content.match(/APP_VERSION\s*=\s*[\"']([^\"']+)[\"']/);
  return match?.[1];
}

const rootVersion = readJson(path.join(root, "package.json")).version;
const clientVersion = readJson(path.join(root, "client", "package.json")).version;
const serverVersion = readJson(path.join(root, "server", "package.json")).version;
const pyproject = readText(path.join(root, "python_project", "pyproject.toml"));
const pyprojectVersionMatch = pyproject.match(/(^version\s*=\s*")([^"]+)(")/m);
const pyprojectVersion = pyprojectVersionMatch?.[2];

const sharedContent = readText(path.join(root, "shared", "version.ts"));
const serverContent = readText(path.join(root, "server", "src", "config", "version.ts"));
const pythonContent = readText(
  path.join(root, "python_project", "src", "covid_cough_detection", "version.py")
);

const generatedMarker = "AUTO-GENERATED FILE.";
const checks = {
  "root package version": rootVersion,
  "client package version": clientVersion,
  "server package version": serverVersion,
  "python pyproject version": pyprojectVersion,
  "shared APP_VERSION": extractVersionConstant(sharedContent),
  "server APP_VERSION": extractVersionConstant(serverContent),
  "python APP_VERSION": extractVersionConstant(pythonContent),
};

for (const [label, value] of Object.entries(checks)) {
  if (value !== rootVersion) {
    console.error(`Version mismatch: ${label}=${value} but root=${rootVersion}`);
    process.exit(1);
  }
}

if (!sharedContent.includes(generatedMarker)) {
  console.error("shared/version.ts is missing generated marker. Run: corepack pnpm run sync:version");
  process.exit(1);
}

if (!serverContent.includes(generatedMarker)) {
  console.error(
    "server/src/config/version.ts is missing generated marker. Run: corepack pnpm run sync:version"
  );
  process.exit(1);
}

if (!pythonContent.includes(generatedMarker)) {
  console.error(
    "python_project/src/covid_cough_detection/version.py is missing generated marker. Run: corepack pnpm run sync:version"
  );
  process.exit(1);
}

console.log(`Version consistency OK: ${rootVersion}`);
