const fs = require("fs/promises");
const path = require("path");

async function copySQLFile() {
  const sourceFile = path.join(__dirname, "..", "SQL_Commands.sql");
  const destFile = path.join(__dirname, "..", "dist", "database", "SQL_Commands.sql");

  await fs.copyFile(sourceFile, destFile);
  console.log("SQL_Commands.sql copied successfully!");
}

/**
 * Recursively copy a directory
 */
async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function copyTemplates() {
  const sourceDir = path.join(__dirname, "..", "templates");
  const destDir = path.join(__dirname, "..", "dist", "templates");

  await fs.mkdir(destDir, { recursive: true });

  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourceFile = path.join(sourceDir, entry.name);
    const destFile = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      await copyDir(sourceFile, destFile);
      console.log(`${entry.name}/ directory copied successfully!`);
    } else {
      await fs.copyFile(sourceFile, destFile);
      console.log(`${entry.name} copied successfully!`);
    }
  }
}

async function copyLocales() {
  const sourceDir = path.join(__dirname, "..", "locales");
  const destDir = path.join(__dirname, "..", "dist", "locales");

  try {
    await copyDir(sourceDir, destDir);
    console.log("locales/ directory copied successfully!");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

async function copyFile() {
  try {
    await copySQLFile();
    await copyTemplates();
    await copyLocales();
  } catch (error) {
    console.error("Error copying file: ", error);
    process.exit(1);
  }
}

// execute the function
(async () => {
  await copyFile();
})();
