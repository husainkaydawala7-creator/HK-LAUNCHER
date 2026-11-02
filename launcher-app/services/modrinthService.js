const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');

const MODRINTH_API = "https://api.modrinth.com/v2";
const USER_AGENT = "HK-Launcher/0.1.0 (dev@hklauncher.local)";

const CURATED_SLUGS = [
  "fabric-api",
  "sodium",
  "lithium",
  "iris",
  "ferrite-core",
  "entityculling",
  "immediatelyfast",
  "modernfix",
  "indium"
];

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": USER_AGENT } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJson(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Modrinth API request failed with status ${res.statusCode} for ${url}`));
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

function downloadFileWithHash(url, destPath, expectedSha512, onProgress) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const tempPath = destPath + ".tmp";
    const fileStream = fs.createWriteStream(tempPath);
    const hash = crypto.createHash("sha512");
    let downloaded = 0;

    https.get(url, { headers: { "User-Agent": USER_AGENT } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fileStream.close();
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        return downloadFileWithHash(res.headers.location, destPath, expectedSha512, onProgress).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        fileStream.close();
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        return reject(new Error(`Download failed with HTTP ${res.statusCode}`));
      }

      const total = parseInt(res.headers["content-length"] || "0", 10);

      res.on("data", (chunk) => {
        hash.update(chunk);
        fileStream.write(chunk);
        downloaded += chunk.length;
        if (onProgress && total > 0) {
          onProgress(Math.round((downloaded / total) * 100));
        }
      });

      res.on("end", () => {
        fileStream.end();
      });
    }).on("error", (err) => {
      fileStream.close();
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      reject(err);
    });

    fileStream.on("finish", () => {
      const calculated = hash.digest("hex");
      if (expectedSha512 && calculated.toLowerCase() !== expectedSha512.toLowerCase()) {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        return reject(new Error(`File integrity check failed (SHA512 mismatch).`));
      }
      fs.renameSync(tempPath, destPath);
      resolve();
    });

    fileStream.on("error", (err) => {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      reject(err);
    });
  });
}

/**
 * Searches Modrinth mods with optional game version and category filters.
 */
async function searchMods(query = "", mcVersion = "", category = "") {
  const facets = [
    ["categories:fabric"],
    ["project_type:mod"]
  ];

  if (mcVersion && mcVersion !== "latest-compatible" && mcVersion !== "latest-release") {
    facets.push([`versions:${mcVersion}`]);
  }
  if (category) {
    facets.push([`categories:${category}`]);
  }

  const encodedFacets = encodeURIComponent(JSON.stringify(facets));
  const url = `${MODRINTH_API}/search?query=${encodeURIComponent(query)}&facets=${encodedFacets}&limit=20`;
  const result = await fetchJson(url);

  return (result.hits || []).map((hit) => ({
    id: hit.project_id,
    slug: hit.slug,
    title: hit.title,
    description: hit.description,
    author: hit.author,
    iconUrl: hit.icon_url || "",
    downloads: hit.downloads,
    follows: hit.follows,
    categories: hit.categories || [],
    versions: hit.versions || []
  }));
}

/**
 * Reads all installed .jar files in the instance mods directory.
 */
function getInstalledMods(modsDir) {
  if (!fs.existsSync(modsDir)) return [];
  const files = fs.readdirSync(modsDir);
  const installed = [];

  for (const filename of files) {
    if (!filename.toLowerCase().endsWith(".jar")) continue;
    const fullPath = path.join(modsDir, filename);
    try {
      const zip = new AdmZip(fullPath);
      const manifestEntry = zip.getEntry("fabric.mod.json");
      if (manifestEntry) {
        const text = zip.readAsText(manifestEntry);
        const meta = JSON.parse(text);
        installed.push({
          id: meta.id || filename.replace(/\.jar$/i, ""),
          name: meta.name || meta.id || filename,
          version: meta.version || "Unknown",
          description: meta.description || "",
          filename,
          fullPath,
          size: fs.statSync(fullPath).size
        });
        continue;
      }
    } catch (_) {}

    // Fallback if fabric.mod.json is not present or unreadable
    installed.push({
      id: filename.replace(/\.jar$/i, ""),
      name: filename,
      version: "Unknown",
      description: "",
      filename,
      fullPath,
      size: fs.statSync(fullPath).size
    });
  }

  return installed;
}

/**
 * Fetches the curated performance and essential mod list.
 */
async function getCuratedFeaturedMods(mcVersion = "1.21.1", modsDir = "") {
  const installed = getInstalledMods(modsDir);
  const installedIds = new Set(installed.map((m) => m.id.toLowerCase()));
  const installedFiles = new Set(installed.map((m) => m.filename.toLowerCase()));

  const promises = CURATED_SLUGS.map(async (slug) => {
    try {
      const proj = await fetchJson(`${MODRINTH_API}/project/${slug}`);
      const isInstalled = installedIds.has(slug.toLowerCase()) ||
        installedIds.has(proj.id.toLowerCase()) ||
        Array.from(installedFiles).some((fn) => fn.includes(slug.replace("-", "")));

      return {
        id: proj.id,
        slug: proj.slug,
        title: proj.title,
        description: proj.description,
        author: proj.organization || proj.team || "Community",
        iconUrl: proj.icon_url || "",
        downloads: proj.downloads,
        categories: proj.categories || [],
        isInstalled
      };
    } catch (_) {
      return null;
    }
  });

  const results = await Promise.all(promises);
  return results.filter(Boolean);
}

/**
 * Finds and downloads the most compatible version of a mod for the target Minecraft version,
 * resolving dependencies (like Fabric API) automatically.
 */
async function installMod(projectIdOrSlug, mcVersion, modsDir, onProgress = () => {}) {
  fs.mkdirSync(modsDir, { recursive: true });
  onProgress({ percent: 5, message: `Resolving compatible version for ${projectIdOrSlug}...` });

  // 1. Fetch available versions for this Minecraft version and Fabric loader
  const versionsUrl = `${MODRINTH_API}/project/${projectIdOrSlug}/version?game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}&loaders=${encodeURIComponent(JSON.stringify(["fabric"]))}`;
  const versions = await fetchJson(versionsUrl);

  if (!versions || versions.length === 0) {
    throw new Error(`No compatible version found for mod "${projectIdOrSlug}" on Minecraft ${mcVersion} (Fabric).`);
  }

  // 2. Select best version: prefer release, then beta, latest first
  const selected = versions.find((v) => v.version_type === "release") || versions[0];
  const primaryFile = selected.files.find((f) => f.primary) || selected.files[0];

  if (!primaryFile || !primaryFile.url) {
    throw new Error(`No downloadable file found for version ${selected.name}`);
  }

  const installedFiles = [];

  // 3. Resolve and install required dependencies
  if (Array.isArray(selected.dependencies)) {
    const requiredDeps = selected.dependencies.filter((d) => d.dependency_type === "required");
    for (const dep of requiredDeps) {
      if (dep.project_id) {
        onProgress({ percent: 20, message: `Resolving required dependency ${dep.project_id}...` });
        try {
          const installedMods = getInstalledMods(modsDir);
          const alreadyInstalled = installedMods.some((m) => m.id.toLowerCase().includes(dep.project_id.toLowerCase()));
          if (!alreadyInstalled) {
            const depResult = await installMod(dep.project_id, mcVersion, modsDir, onProgress);
            installedFiles.push(...depResult.installedFiles);
          }
        } catch (depErr) {
          console.warn(`Dependency installation warning for ${dep.project_id}:`, depErr.message);
        }
      }
    }
  }

  // 4. Download primary mod jar file
  const destPath = path.join(modsDir, primaryFile.filename);
  onProgress({ percent: 50, message: `Downloading ${primaryFile.filename}...` });

  await downloadFileWithHash(
    primaryFile.url,
    destPath,
    primaryFile.hashes?.sha512 || null,
    (pct) => onProgress({ percent: Math.round(50 + pct * 0.48), message: `Downloading ${primaryFile.filename} (${pct}%)...` })
  );

  installedFiles.push(primaryFile.filename);
  onProgress({ percent: 100, message: `Installed ${primaryFile.filename} successfully!` });

  return {
    success: true,
    installedFiles,
    versionName: selected.name,
    versionNumber: selected.version_number
  };
}

/**
 * Safely uninstalls a mod by deleting its jar file from the instance mods directory.
 */
function uninstallMod(filename, modsDir) {
  const safeFilename = path.basename(filename);
  if (!safeFilename.toLowerCase().endsWith(".jar")) {
    throw new Error("Invalid mod file to remove.");
  }

  const targetPath = path.join(modsDir, safeFilename);
  // Ensure the target is strictly inside the instance mods directory
  const resolvedTarget = path.resolve(targetPath);
  const resolvedDir = path.resolve(modsDir);
  if (!resolvedTarget.startsWith(resolvedDir)) {
    throw new Error("Access denied: Path traversal detected.");
  }

  if (fs.existsSync(resolvedTarget)) {
    fs.unlinkSync(resolvedTarget);
    return { success: true, removed: safeFilename };
  }

  return { success: false, message: "File not found." };
}

module.exports = {
  searchMods,
  getInstalledMods,
  getCuratedFeaturedMods,
  installMod,
  uninstallMod
};
