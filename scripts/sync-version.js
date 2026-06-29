import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const packageJsonPath = path.join(rootDir, "package.json");
const tauriConfPath = path.join(rootDir, "src-tauri", "tauri.conf.json");

try {
  // Read package.json
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const version = packageJson.version;

  if (!version) {
    throw new Error("Version not found in package.json");
  }

  // Read tauri.conf.json
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
  
  // Update version
  tauriConf.version = version;

  // Write back to tauri.conf.json
  fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + "\n", "utf8");
  console.log(`Successfully synchronized version ${version} to src-tauri/tauri.conf.json`);

  // Attempt to stage tauri.conf.json if inside a git repository
  try {
    execSync("git add src-tauri/tauri.conf.json", { stdio: "ignore" });
    console.log("Staged src-tauri/tauri.conf.json in git");
  } catch (gitError) {
    // Gracefully ignore if not in a git repo or git is not available
  }
} catch (error) {
  console.error("Error synchronizing versions:", error);
  process.exit(1);
}
