import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseRootArg(argv) {
  const idx = argv.indexOf("--root");
  if (idx === -1) return null;
  const value = argv[idx + 1];
  if (!value) {
    throw new Error("--root requires a path value");
  }
  return value;
}

const root = path.resolve(parseRootArg(process.argv) ?? path.resolve(__dirname, ".."));
const checkOnly = process.argv.includes("--check") || process.argv.includes("--verify");

const packageJsonPath = path.join(root, "package.json");
const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
const version = packageJson.version;

if (typeof version !== "string" || version.trim().length === 0) {
  throw new Error("Root package.json version is missing or invalid.");
}

const generatedNotice = [
  "AUTO-GENERATED FILE.",
  "Source of truth: root package.json version.",
  "Run `corepack pnpm run sync:version` after version bumps.",
];

const sharedVersionContent = `/**\n * ${generatedNotice[0]}\n * ${generatedNotice[1]}\n * ${generatedNotice[2]}\n */\n\nexport const APP_VERSION = \"${version}\";\nexport const API_VERSION = \"${version}\";\n\nexport function getVersionInfo() {\n  return {\n    version: APP_VERSION,\n    api_version: API_VERSION,\n    timestamp: new Date().toISOString(),\n  };\n}\n`;

const serverVersionContent = `/**\n * ${generatedNotice[0]}\n * ${generatedNotice[1]}\n * ${generatedNotice[2]}\n */\n\nexport const APP_VERSION = \"${version}\";\nexport const API_VERSION = \"${version}\";\n\nexport function getVersionInfo() {\n  return {\n    version: APP_VERSION,\n    api_version: API_VERSION,\n    timestamp: new Date().toISOString(),\n  };\n}\n`;

const pythonVersionContent = `\"\"\"\n${generatedNotice[0]}\n${generatedNotice[1]}\n${generatedNotice[2]}\n\"\"\"\n\nAPP_VERSION = \"${version}\"\nAPI_VERSION = \"${version}\"\n\nVERSION_INFO = {\n    \"version\": APP_VERSION,\n    \"api_version\": API_VERSION,\n}\n`;

const targets = [
  {
    label: "shared/version.ts",
    filepath: path.join(root, "shared", "version.ts"),
    expected: sharedVersionContent,
  },
  {
    label: "server/src/config/version.ts",
    filepath: path.join(root, "server", "src", "config", "version.ts"),
    expected: serverVersionContent,
  },
  {
    label: "python_project/src/covid_cough_detection/version.py",
    filepath: path.join(root, "python_project", "src", "covid_cough_detection", "version.py"),
    expected: pythonVersionContent,
  },
];

let hasMismatch = false;

const packageVersionTargets = [
  path.join(root, "client", "package.json"),
  path.join(root, "server", "package.json"),
];

for (const packagePath of packageVersionTargets) {
  const packageContent = JSON.parse(await fs.readFile(packagePath, "utf8"));
  if (packageContent.version === version) {
    continue;
  }

  if (checkOnly) {
    console.error(`Version sync check failed for ${path.relative(root, packagePath)}`);
    hasMismatch = true;
    continue;
  }

  packageContent.version = version;
  await fs.writeFile(packagePath, `${JSON.stringify(packageContent, null, 2)}\n`, "utf8");
  console.log(`Updated ${path.relative(root, packagePath)}`);
}

const pyprojectPath = path.join(root, "python_project", "pyproject.toml");
const pyprojectRaw = await fs.readFile(pyprojectPath, "utf8");
const pyprojectNext = pyprojectRaw.replace(
  /(^version\s*=\s*")[^"]+(")/m,
  `$1${version}$2`
);

if (pyprojectNext !== pyprojectRaw) {
  if (checkOnly) {
    console.error("Version sync check failed for python_project/pyproject.toml");
    hasMismatch = true;
  } else {
    await fs.writeFile(pyprojectPath, pyprojectNext, "utf8");
    console.log("Updated python_project/pyproject.toml");
  }
}

for (const target of targets) {
  let current = "";
  try {
    current = await fs.readFile(target.filepath, "utf8");
  } catch {
    current = "";
  }

  if (current === target.expected) {
    continue;
  }

  if (checkOnly) {
    console.error(`Version sync check failed for ${target.label}`);
    hasMismatch = true;
    continue;
  }

  await fs.mkdir(path.dirname(target.filepath), { recursive: true });
  await fs.writeFile(target.filepath, target.expected, "utf8");
  console.log(`Updated ${target.label}`);
}

if (checkOnly) {
  if (hasMismatch) {
    process.exit(1);
  }
  console.log(`Version sync check OK: ${version}`);
} else {
  console.log(`Version sync completed: ${version}`);
}
