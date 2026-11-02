const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const https = require('node:https');
const net = require('node:net');

class OfflineCacheManager {
  constructor(cacheDir, versionsDir) {
    this.cacheDir = cacheDir;
    this.versionsDir = versionsDir;
    this.isOnline = true;
    this.lastCheck = 0;
    fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  /**
   * Fast network connectivity check.
   */
  async checkOnline(timeoutMs = 2500) {
    return new Promise((resolve) => {
      const socket = net.createConnection(443, "piston-meta.mojang.com");
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          socket.destroy();
          this.isOnline = false;
          resolve(false);
        }
      }, timeoutMs);

      socket.on("connect", () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          socket.destroy();
          this.isOnline = true;
          resolve(true);
        }
      });

      socket.on("error", () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          socket.destroy();
          this.isOnline = false;
          resolve(false);
        }
      });
    });
  }

  /**
   * Fetches JSON from URL with timeout, caching the response to disk.
   * If network fails or timeout occurs, immediately loads from disk cache.
   */
  async fetchWithCache(url, cacheKey, timeoutMs = 4000) {
    const cacheFile = path.join(this.cacheDir, `${cacheKey}.json`);

    try {
      const remoteData = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          req.destroy(new Error(`Network timeout (${timeoutMs}ms) for ${url}`));
        }, timeoutMs);

        const req = https.get(url, { headers: { "User-Agent": "HK-Launcher/0.1.0" } }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            clearTimeout(timer);
            return this.fetchWithCache(res.headers.location, cacheKey, timeoutMs).then(resolve, reject);
          }
          if (res.statusCode !== 200) {
            clearTimeout(timer);
            return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          }

          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            clearTimeout(timer);
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
        });

        req.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      // Save to disk cache asynchronously
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(remoteData, null, 2), "utf8");
      this.isOnline = true;
      return { data: remoteData, fromCache: false, isOnline: true };
    } catch (networkErr) {
      this.isOnline = false;
      // Fallback to disk cache if available
      if (fs.existsSync(cacheFile)) {
        try {
          const cachedJson = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
          return { data: cachedJson, fromCache: true, isOnline: false, error: networkErr.message };
        } catch (_) {}
      }

      // If this is Mojang version manifest and no cache exists, generate fallback from installed versions
      if (cacheKey.includes("manifest")) {
        const localManifest = this.generateLocalFallbackManifest();
        return { data: localManifest, fromCache: true, isOnline: false, error: networkErr.message };
      }

      throw networkErr;
    }
  }

  /**
   * Generates a minimal version manifest from installed versions on disk.
   */
  generateLocalFallbackManifest() {
    const versions = [];
    if (fs.existsSync(this.versionsDir)) {
      try {
        const entries = fs.readdirSync(this.versionsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const versionId = entry.name;
          const jsonPath = path.join(this.versionsDir, versionId, `${versionId}.json`);
          if (fs.existsSync(jsonPath)) {
            try {
              const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
              versions.push({
                id: versionId,
                type: parsed.type || "release",
                url: "",
                time: parsed.time || new Date().toISOString(),
                releaseTime: parsed.releaseTime || new Date().toISOString(),
                installed: true
              });
            } catch (_) {}
          }
        }
      } catch (_) {}
    }

    const latest = versions.length > 0 ? versions[0].id : "1.21.1";
    return {
      latest: { release: latest, snapshot: latest },
      versions
    };
  }
}

module.exports = OfflineCacheManager;
