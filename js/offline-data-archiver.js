// Offline Data Archiver
// Creates JSON files every 3 days when device is offline
// Sends archived files to bulk API when device comes online

class OfflineDataArchiver {
  constructor() {
    this.archiveInterval = 3 * 24 * 60 * 60 * 1000; // 3 days in milliseconds
    this.lastArchiveTime = null;
    this.archiveCheckInterval = null;
    this.archiveDirectory = "wgt-private/offline_archives";
    this.isInitialized = false;
  }

  async init() {
    if (this.isInitialized) {
      logWarn("OfflineDataArchiver already initialized");
      return;
    }

    try {
      logInfo("Initializing OfflineDataArchiver...");

      // Create archive directory if it doesn't exist
      await this.ensureArchiveDirectory();

      // Load last archive time from localStorage
      const savedTime = localStorage.getItem("last_archive_time");
      this.lastArchiveTime = savedTime ? parseInt(savedTime) : Date.now();

      // Start periodic check (every hour)
      this.startArchiveCheck();

      this.isInitialized = true;
      logInfo("OfflineDataArchiver initialized successfully");
    } catch (error) {
      logError("Failed to initialize OfflineDataArchiver:", error);
    }
  }

  async ensureArchiveDirectory() {
    return new Promise((resolve, reject) => {
      try {
        tizen.filesystem.resolve(
          "wgt-private",
          (dir) => {
            dir.listFiles(
              (files) => {
                const archiveDir = files.find(
                  (f) => f.name === "offline_archives"
                );
                if (!archiveDir) {
                  dir.createDirectory("offline_archives");
                  logInfo("Created offline_archives directory");
                }
                resolve();
              },
              (error) => {
                // Directory doesn't exist, create it
                try {
                  dir.createDirectory("offline_archives");
                  logInfo("Created offline_archives directory");
                  resolve();
                } catch (err) {
                  logError("Failed to create archive directory:", err);
                  reject(err);
                }
              }
            );
          },
          (error) => {
            logError("Failed to resolve wgt-private:", error);
            reject(error);
          }
        );
      } catch (error) {
        logError("Error in ensureArchiveDirectory:", error);
        reject(error);
      }
    });
  }

  startArchiveCheck() {
    // Check every hour if we need to create an archive
    this.archiveCheckInterval = setInterval(() => {
      this.checkAndArchive();
    }, 1 * 60 * 1000); // 1 hour

    // Also check immediately
    this.checkAndArchive();
  }

  async checkAndArchive() {
    try {
      const now = Date.now();
      const timeSinceLastArchive = now - this.lastArchiveTime;

      // Check if device is offline
      const isOnline = window.networkMonitor
        ? window.networkMonitor.isOnline
        : navigator.onLine;

      if (!isOnline && timeSinceLastArchive >= this.archiveInterval) {
        logInfo(
          `Device offline for ${Math.floor(
            timeSinceLastArchive / (24 * 60 * 60 * 1000)
          )} days - creating archive`
        );

        // ✅ Prevent sync from running while archiving
        if (window.dataManager) {
          window.dataManager.syncInProgress = true;
        }

        await this.createArchive();
        this.lastArchiveTime = now;
        localStorage.setItem("last_archive_time", now.toString());

        // ✅ Re-enable sync after archiving
        if (window.dataManager) {
          window.dataManager.syncInProgress = false;
        }
      }
    } catch (error) {
      logError("Error in checkAndArchive:", error);

      // ✅ Make sure to re-enable sync even if archive fails
      if (window.dataManager) {
        window.dataManager.syncInProgress = false;
      }
    }
  }

  async createArchive() {
    try {
      logInfo("Creating offline data archive...");

      // Get all data from IndexedDB
      const proofOfPlayData = await window.dataManager.getAllRecords(
        "proofOfPlay"
      );
      const eventsData = await window.dataManager.getAllRecords("events");

      // Filter only ERROR events (don't include normal/info events)
      const errorEvents = eventsData.filter(
        (event) =>
          event.eventType === "ERROR" ||
          event.level === "error" ||
          event.severity === "error" ||
          (event.message && event.message.toLowerCase().includes("error"))
      );

      // ✅ Check if there's any data to archive
      if (proofOfPlayData.length === 0 && errorEvents.length === 0) {
        logInfo("No data to archive - skipping archive creation");
        return null;
      }

      // Create archive object in SAME format as normal/bulk API payload
      const archive = {
        deviceId: localStorage.getItem("device_id"),
        sentAt: new Date().toISOString(),
        syncType: "ARCHIVE",
        totalRecords: proofOfPlayData.length + errorEvents.length,
        archiveDate: Date.now(),
        logs: {
          proofOfPlay: proofOfPlayData.map((record) => ({
            eventId: record.eventId,
            adId: record.adId,
            scheduleId: record.scheduleId,
            startTime: record.startTime,
            endTime: record.endTime,
            durationPlayedMs: record.durationPlayedMs,
          })),
          telemetry: [], // No telemetry in archives
          events: errorEvents.map((record) => ({
            eventId: record.eventId,
            timestamp: record.timestamp,
            eventType: record.eventType,
            payload: record.payload,
          })),
        },
      };

      // Save archive to file
      const filename = `archive_${Date.now()}.json`;
      await this.saveArchiveFile(filename, archive);

      logInfo(
        `Archive created: ${filename} (${archive.logs.proofOfPlay.length} PoP, ${archive.logs.events.length} error events)`
      );

      // Clean up: Delete ALL data that was added to archive
      await this.cleanupAfterArchive(proofOfPlayData, errorEvents);

      return filename;
    } catch (error) {
      logError("Failed to create archive:", error);
      throw error;
    }
  }

  async saveArchiveFile(filename, data) {
    return new Promise((resolve, reject) => {
      try {
        const jsonString = JSON.stringify(data, null, 2);

        tizen.filesystem.resolve(
          this.archiveDirectory,
          (dir) => {
            const file = dir.createFile(filename);
            file.openStream(
              "w",
              (fs) => {
                fs.write(jsonString);
                fs.close();
                logInfo(`Archive file saved: ${filename}`);
                resolve(filename);
              },
              (error) => {
                logError("Failed to write archive file:", error);
                reject(error);
              },
              "UTF-8"
            );
          },
          (error) => {
            logError("Failed to resolve archive directory:", error);
            reject(error);
          }
        );
      } catch (error) {
        logError("Error in saveArchiveFile:", error);
        reject(error);
      }
    });
  }

  async cleanupAfterArchive(archivedPoP, archivedErrorEvents) {
    try {
      logInfo("Cleaning up archived data from IndexedDB...");

      // Delete all proof of play records that were added to archive
      // ✅ proofOfPlay table uses keyPath: "eventId"
      if (archivedPoP && archivedPoP.length > 0) {
        for (const record of archivedPoP) {
          if (record.eventId) {
            await window.dataManager.deleteRecord(
              "proofOfPlay",
              record.eventId
            );
          } else {
            logWarn("Proof of play record missing eventId:", record);
          }
        }
        logInfo(
          `✅ Deleted ${archivedPoP.length} proof of play records from IndexedDB`
        );
      }

      // Delete all error events that were added to archive
      // ✅ events table uses keyPath: "eventId"
      if (archivedErrorEvents && archivedErrorEvents.length > 0) {
        for (const event of archivedErrorEvents) {
          if (event.eventId) {
            await window.dataManager.deleteRecord("events", event.eventId);
          } else {
            logWarn("Event record missing eventId:", event);
          }
        }
        logInfo(
          `✅ Deleted ${archivedErrorEvents.length} error events from IndexedDB`
        );
      }

      // Delete ALL telemetry data (not included in archive)
      await window.dataManager.clearTable("telemetry");
      logInfo("✅ All telemetry data cleared");

      // Delete ALL normal/info events (not included in archive)
      const allEvents = await window.dataManager.getAllRecords("events");
      const normalEvents = allEvents.filter(
        (event) =>
          event.eventType !== "ERROR" &&
          event.level !== "error" &&
          event.severity !== "error" &&
          (!event.message || !event.message.toLowerCase().includes("error"))
      );

      for (const event of normalEvents) {
        if (event.eventId) {
          await window.dataManager.deleteRecord("events", event.eventId);
        } else {
          logWarn("Normal event missing eventId:", event);
        }
      }
      logInfo(
        `✅ Deleted ${normalEvents.length} normal/info events from IndexedDB`
      );

      logInfo(
        "✅ Cleanup after archive completed - only NEW data remains in IndexedDB"
      );
    } catch (error) {
      logError("❌ Failed to cleanup after archive:", error);
      throw error; // Re-throw to let caller know cleanup failed
    }
  }

  async getArchiveFiles() {
    return new Promise((resolve, reject) => {
      try {
        tizen.filesystem.resolve(
          this.archiveDirectory,
          (dir) => {
            dir.listFiles(
              (files) => {
                const archiveFiles = files
                  .filter(
                    (f) =>
                      f.name.startsWith("archive_") && f.name.endsWith(".json")
                  )
                  .sort((a, b) => a.name.localeCompare(b.name)); // Sort by timestamp
                resolve(archiveFiles);
              },
              (error) => {
                logWarn("No archive files found:", error);
                resolve([]);
              }
            );
          },
          (error) => {
            logError("Failed to resolve archive directory:", error);
            resolve([]);
          }
        );
      } catch (error) {
        logError("Error in getArchiveFiles:", error);
        resolve([]);
      }
    });
  }

  async readArchiveFile(file) {
    return new Promise((resolve, reject) => {
      try {
        file.openStream(
          "r",
          (fs) => {
            const content = fs.read(file.fileSize);
            fs.close();
            const data = JSON.parse(content);
            resolve(data);
          },
          (error) => {
            logError("Failed to read archive file:", error);
            reject(error);
          },
          "UTF-8"
        );
      } catch (error) {
        logError("Error in readArchiveFile:", error);
        reject(error);
      }
    });
  }

  async sendArchivesToServer() {
    try {
      logInfo("Checking for archived files to send...");

      const archiveFiles = await this.getArchiveFiles();

      if (archiveFiles.length === 0) {
        logInfo("No archive files to send");
        return { success: true, sent: 0 };
      }

      logInfo(`Found ${archiveFiles.length} archive file(s) to send`);

      let sentCount = 0;
      let failedCount = 0;

      // Send each archive file one by one
      for (const file of archiveFiles) {
        try {
          logInfo(`Sending archive: ${file.name}`);

          // Send file directly (not as JSON payload)
          const success = await this.sendArchiveFileToAPI(file);

          if (success) {
            // Delete the file after successful send
            await this.deleteArchiveFile(file);
            sentCount++;
            logInfo(`Archive sent and deleted: ${file.name}`);
          } else {
            failedCount++;
            logError(`Failed to send archive: ${file.name}`);
          }
        } catch (error) {
          failedCount++;
          logError(`Error processing archive ${file.name}:`, error);
        }
      }

      logInfo(
        `Archive sync completed: ${sentCount} sent, ${failedCount} failed`
      );

      return { success: true, sent: sentCount, failed: failedCount };
    } catch (error) {
      logError("Failed to send archives to server:", error);
      return { success: false, error: error.message };
    }
  }

  async sendArchiveFileToAPI(file) {
    try {
      // Read file content as JSON string
      const fileContent = await this.readArchiveFileAsString(file);

      // Create a Blob from the JSON string
      const blob = new Blob([fileContent], { type: "application/json" });

      // Create FormData and append the file
      const formData = new FormData();
      formData.append("file", blob, file.name);
      formData.append("deviceId", localStorage.getItem("device_id") || "");
      formData.append("groupId", localStorage.getItem("group_id") || "");

      logInfo(`Sending archive file: ${file.name} (${blob.size} bytes)`);

      // ✅ Use SAME endpoint as normal/bulk API
      const response = await fetch(BULK_LOGS_API_BASE_URL, {
        method: "POST",
        headers: {
          "x-device-id": localStorage.getItem("device_id") || "",
          "x-group-id": localStorage.getItem("group_id") || "",
          "X-Sync-Type": "ARCHIVE", // Identify as archive upload
          // Don't set Content-Type - browser will set it with boundary for multipart/form-data
        },
        body: formData,
        timeout: 120000, // 2 minutes timeout for bulk data
      });

      if (response.ok) {
        logInfo("Archive file sent successfully to API");
        return true;
      } else {
        logError(`API returned error: ${response.status}`);
        return false;
      }
    } catch (error) {
      logError("Failed to send archive file to API:", error);
      return false;
    }
  }

  async readArchiveFileAsString(file) {
    return new Promise((resolve, reject) => {
      try {
        file.openStream(
          "r",
          (fileStream) => {
            const content = fileStream.read(file.fileSize);
            fileStream.close();
            resolve(content);
          },
          (error) => {
            logError("Failed to read archive file:", error);
            reject(error);
          },
          "UTF-8"
        );
      } catch (error) {
        logError("Error opening archive file stream:", error);
        reject(error);
      }
    });
  }

  async deleteArchiveFile(file) {
    return new Promise((resolve, reject) => {
      try {
        file.deleteFile(
          () => {
            logInfo(`Archive file deleted: ${file.name}`);
            resolve();
          },
          (error) => {
            logError("Failed to delete archive file:", error);
            reject(error);
          }
        );
      } catch (error) {
        logError("Error in deleteArchiveFile:", error);
        reject(error);
      }
    });
  }

  async getArchiveStats() {
    try {
      const archiveFiles = await this.getArchiveFiles();

      let totalSize = 0;
      let totalRecords = 0;

      for (const file of archiveFiles) {
        totalSize += file.fileSize;
        try {
          const data = await this.readArchiveFile(file);
          totalRecords += data.proofOfPlay?.length || 0;
          totalRecords += data.events?.length || 0;
        } catch (error) {
          logWarn(`Failed to read archive ${file.name}:`, error);
        }
      }

      return {
        fileCount: archiveFiles.length,
        totalSize: totalSize,
        totalRecords: totalRecords,
        files: archiveFiles.map((f) => ({
          name: f.name,
          size: f.fileSize,
          modified: f.modified,
        })),
      };
    } catch (error) {
      logError("Failed to get archive stats:", error);
      return {
        fileCount: 0,
        totalSize: 0,
        totalRecords: 0,
        files: [],
      };
    }
  }

  stop() {
    if (this.archiveCheckInterval) {
      clearInterval(this.archiveCheckInterval);
      this.archiveCheckInterval = null;
      logInfo("OfflineDataArchiver stopped");
    }
  }
}

// Global instance
window.offlineDataArchiver = null;

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  window.offlineDataArchiver = new OfflineDataArchiver();
  window.offlineDataArchiver.init();
});
