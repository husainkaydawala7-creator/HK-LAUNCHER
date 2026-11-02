const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

/**
 * Validates and securely copies dragged files into instance mods or resourcepacks folder.
 */
async function importFiles(targetDir, filePaths, type = "mods", allowOverwrite = false) {
  fs.mkdirSync(targetDir, { recursive: true });
  const resolvedTarget = path.resolve(targetDir);

  const imported = [];
  const skipped = [];
  const errors = [];

  const allowedExts = type === "mods" ? [".jar"] : [".zip"];

  for (const srcPath of filePaths) {
    try {
      if (!srcPath || typeof srcPath !== "string") continue;
      const normalizedSrc = path.normalize(srcPath);

      if (!fs.existsSync(normalizedSrc)) {
        errors.push(`File does not exist: ${path.basename(normalizedSrc)}`);
        continue;
      }

      const stat = fs.statSync(normalizedSrc);
      const ext = path.extname(normalizedSrc).toLowerCase();

      // Check format
      if (!stat.isFile() || !allowedExts.includes(ext)) {
        errors.push(`Unsupported file format for ${path.basename(normalizedSrc)}. Expected ${allowedExts.join(" or ")}`);
        continue;
      }

      const filename = path.basename(normalizedSrc);
      const destPath = path.join(resolvedTarget, filename);

      // Verify no directory traversal
      const resolvedDest = path.resolve(destPath);
      if (!resolvedDest.startsWith(resolvedTarget)) {
        errors.push(`Access denied: Invalid destination path for ${filename}`);
        continue;
      }

      // Check if file already exists
      if (fs.existsSync(resolvedDest)) {
        if (!allowOverwrite) {
          skipped.push(filename);
          continue;
        }
      }

      // Copy file
      await fsp.copyFile(normalizedSrc, resolvedDest);
      imported.push(filename);
    } catch (err) {
      errors.push(`Error importing ${path.basename(srcPath)}: ${err.message}`);
    }
  }

  return { imported, skipped, errors };
}

module.exports = {
  importFiles
};
