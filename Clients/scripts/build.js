#!/usr/bin/env node

/**
 * Build script that replaces build-time placeholders and adds versioning
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import path from "path";

const buildTime = new Date().toISOString();

console.log("🏗️  Building VerifyWise application...");
console.log(`📅 Build time: ${buildTime}`);

try {
  // Run the actual build
  console.log("📦 Running Vite build...");
  execSync("vite build", { stdio: "inherit" });

  // Replace build time placeholder in the built HTML
  const htmlPath = path.join(process.cwd(), "dist", "index.html");

  try {
    let html = readFileSync(htmlPath, "utf8");
    html = html.replace("BUILD_TIME_PLACEHOLDER", buildTime);
    writeFileSync(htmlPath, html);
    console.log("✅ Build time placeholder updated successfully");
  } catch (htmlError) {
    console.warn("⚠️  Could not update build time in HTML (non-critical):", htmlError.message);
  }

  console.log("✅ Build completed successfully!");
  console.log(`📁 Output directory: ${path.join(process.cwd(), "dist")}`);
} catch (error) {
  console.error("❌ Build failed:", error.message);
  process.exit(1);
}
