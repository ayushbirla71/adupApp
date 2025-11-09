// Data Management System with IndexedDB for Offline/Online Synchronization
// Handles proof of play, telemetry, and events data

class DataManager {
  constructor() {
    this.dbName = "AdupDataDB";
    this.dbVersion = 1;
    this.db = null;
    this.isOnline = navigator.onLine;
    this.syncInProgress = false;
    this.deviceId = localStorage.getItem("device_id");

    // Store tables configuration
    this.tables = {
      proofOfPlay: "proofOfPlay",
      telemetry: "telemetry",
      events: "events",
      syncQueue: "syncQueue",
    };

    this.isInitialized = false;
    this.initPromise = null;
    this.deviceIdWatcherTimer = null; // Timer reference for cleanup

    // ✅ NEW: Retry queue and sync statistics (from SyncEngine)
    this.retryQueue = [];
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 seconds
    this.stats = {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      lastSyncTime: null,
      lastSyncDuration: 0,
      recordsSynced: 0,
      retryAttempts: 0,
    };

    // Start initialization but don't wait for it in constructor
    this.initPromise = this.init();

    // ✅ Setup network listeners with delay to ensure NetworkMonitor is ready
    // setTimeout(() => {
    //   this.setupNetworkListeners();
    // }, 100);

    this.setupDeviceIdWatcher();
  }

  generateDeviceId() {
    const deviceId = generateUUID();
    localStorage.setItem("device_id", deviceId);
    return deviceId;
  }

  setupDeviceIdWatcher() {
    // Only watch if device ID is not present
    if (this.deviceId) {
      logInfo("Device ID already present, skipping watcher setup");
      return;
    }

    logInfo("Device ID not found, starting watcher...");

    // Watch for device ID to become available
    this.deviceIdWatcherTimer = setInterval(() => {
      const currentDeviceId = localStorage.getItem("device_id");

      if (currentDeviceId) {
        logInfo(`Device ID detected: ${currentDeviceId}`);
        this.deviceId = currentDeviceId;

        // Terminate the watcher once device ID is available
        if (this.deviceIdWatcherTimer) {
          clearInterval(this.deviceIdWatcherTimer);
          this.deviceIdWatcherTimer = null;
          logInfo("Device ID watcher terminated");
        }
      }
    }, 1000); // Check every second
  }

  getCurrentDeviceId() {
    // Always get the latest device ID from localStorage
    const latestDeviceId = localStorage.getItem("device_id");
    if (latestDeviceId && latestDeviceId !== this.deviceId) {
      this.deviceId = latestDeviceId;
    }
    return this.deviceId;
  }

  async init() {
    try {
      await this.initDB();
      this.isInitialized = true;
      logInfo("DataManager initialized successfully with IndexedDB");

      // Start periodic sync attempts
      this.startPeriodicSync();

      // ❌ DISABLED: Telemetry collection (using TelemetryCollector instead)
      // TelemetryCollector provides real Tizen API data instead of mock data
      // this.startTelemetryCollection();
    } catch (error) {
      logError("Failed to initialize DataManager:", error);
      throw error;
    }
  }

  async waitForInitialization() {
    if (this.isInitialized) {
      return;
    }
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  initDB() {
    return new Promise((resolve, reject) => {
      // Check if IndexedDB is available
      if (!window.indexedDB) {
        reject(new Error("IndexedDB not supported"));
        return;
      }

      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        logError("Failed to open IndexedDB:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        logInfo("IndexedDB opened successfully");
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create proof of play table
        if (!db.objectStoreNames.contains(this.tables.proofOfPlay)) {
          const proofStore = db.createObjectStore(this.tables.proofOfPlay, {
            keyPath: "eventId",
          });
          proofStore.createIndex("timestamp", "startTime", { unique: false });
          proofStore.createIndex("adId", "adId", { unique: false });
          proofStore.createIndex("synced", "synced", { unique: false });
        }

        // Create telemetry table
        if (!db.objectStoreNames.contains(this.tables.telemetry)) {
          const telemetryStore = db.createObjectStore(this.tables.telemetry, {
            keyPath: "id",
            autoIncrement: true,
          });
          telemetryStore.createIndex("timestamp", "timestamp", {
            unique: false,
          });
          telemetryStore.createIndex("synced", "synced", { unique: false });
        }

        // Create events table
        if (!db.objectStoreNames.contains(this.tables.events)) {
          const eventsStore = db.createObjectStore(this.tables.events, {
            keyPath: "eventId",
          });
          eventsStore.createIndex("timestamp", "timestamp", { unique: false });
          eventsStore.createIndex("eventType", "eventType", { unique: false });
          eventsStore.createIndex("synced", "synced", { unique: false });
        }

        // Create sync queue table
        if (!db.objectStoreNames.contains(this.tables.syncQueue)) {
          const syncStore = db.createObjectStore(this.tables.syncQueue, {
            keyPath: "id",
            autoIncrement: true,
          });
          syncStore.createIndex("timestamp", "timestamp", { unique: false });
          syncStore.createIndex("priority", "priority", { unique: false });
        }

        logInfo("IndexedDB schema created/upgraded");
      };
    });
  }

  setupNetworkListeners() {
    // ✅ ONLY use NetworkMonitor (no duplicate browser event listeners)
    if (window.networkMonitor) {
      // Listen to NetworkMonitor status changes
      window.networkMonitor.addListener((_event, status) => {
        const wasOnline = this.isOnline;
        this.isOnline = status.isOnline;

        logInfo(
          `DataManager: Network status updated: ${
            wasOnline ? "online" : "offline"
          } -> ${this.isOnline ? "online" : "offline"}`
        );

        // ❌ REMOVED: Don't trigger sync here - NetworkMonitor already does it
        // This was causing duplicate sync triggers!
        // NetworkMonitor.updateConnectionStatus() handles sync triggering
      });

      // ✅ Sync initial status from NetworkMonitor
      const initialStatus = window.networkMonitor.getStatus();
      this.isOnline = initialStatus.isOnline;
      logInfo(
        `DataManager: Initial network status: ${
          this.isOnline ? "online" : "offline"
        }`
      );
    } else {
      // ❌ Fallback ONLY if NetworkMonitor is not available
      logWarn(
        "NetworkMonitor not available - using basic browser events (not recommended)"
      );

      window.addEventListener("online", () => {
        this.isOnline = true;
        logInfo("Browser event: Network connection restored");
        this.triggerSync();
      });

      window.addEventListener("offline", () => {
        this.isOnline = false;
        logInfo("Browser event: Network connection lost");
      });
    }
  }

  // Proof of Play Methods
  async recordProofOfPlay(adData) {
    const proofRecord = {
      eventId: generateUUID(),
      adId: adData.adId,
      scheduleId: adData.scheduleId || null,
      startTime: adData.startTime,
      endTime: adData.endTime,
      durationPlayedMs: adData.durationPlayedMs,
      synced: false,
      createdAt: new Date().toISOString(),
    };

    try {
      await this.insertRecord(this.tables.proofOfPlay, proofRecord);
      logInfo("Proof of play recorded:", proofRecord.eventId);

      // Trigger immediate sync if online
      if (this.isOnline) {
        // this.triggerSync();
      }

      return proofRecord;
    } catch (error) {
      logError("Failed to record proof of play:", error);
      throw error;
    }
  }

  // Telemetry Methods
  async recordTelemetry(telemetryData) {
    const telemetryRecord = {
      timestamp: new Date().toISOString(),
      cpuUsage: telemetryData.cpuUsage || 0,
      ramFreeMb: telemetryData.ramFreeMb || 0,
      storageFreeMb: telemetryData.storageFreeMb || 0,
      networkType: telemetryData.networkType || "UNKNOWN",
      appVersionCode: telemetryData.appVersionCode || 0, // Integer, not string

      synced: false,
    };

    try {
      await this.insertRecord(this.tables.telemetry, telemetryRecord);
      logInfo("Telemetry recorded");
      return telemetryRecord;
    } catch (error) {
      logError("Failed to record telemetry:", error);
      throw error;
    }
  }

  // Events Methods
  async recordEvent(eventData) {
    const eventRecord = {
      eventId: generateUUID(),
      timestamp: new Date().toISOString(),
      eventType: eventData.eventType,
      payload: eventData.payload || {},
      synced: false,
    };

    try {
      await this.insertRecord(this.tables.events, eventRecord);
      logInfo("Event recorded:", eventRecord.eventType);

      // Trigger immediate sync for critical events
      if (this.isOnline && this.isCriticalEvent(eventData.eventType)) {
        this.triggerSync();
      }

      return eventRecord;
    } catch (error) {
      logError("Failed to record event:", error);
      throw error;
    }
  }

  isCriticalEvent(eventType) {
    const criticalEvents = ["DIAGNOSTIC_ERROR", "APP_CRASH", "NETWORK_ERROR"];
    return criticalEvents.includes(eventType);
  }

  // Generic database operations
  async insertRecord(tableName, record) {
    await this.waitForInitialization();

    if (!this.db) {
      throw new Error("Database not initialized");
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction([tableName], "readwrite");
        const store = transaction.objectStore(tableName);

        // Ensure required fields
        if (record.synced === undefined) {
          record.synced = false;
        }
        if (!record.createdAt) {
          record.createdAt = new Date().toISOString();
        }

        // Generate eventId for proof of play and events if not provided
        if (
          (tableName === this.tables.proofOfPlay ||
            tableName === this.tables.events) &&
          !record.eventId
        ) {
          record.eventId = generateUUID();
        }

        const request = store.add(record);

        request.onsuccess = () => {
          logInfo(`Record inserted into ${tableName}:`, record);
          resolve(request.result);
        };

        request.onerror = () => {
          logError(`Failed to insert record into ${tableName}:`, request.error);
          reject(request.error);
        };
      } catch (error) {
        logError(`Transaction failed for ${tableName}:`, error);
        reject(error);
      }
    });
  }

  async getUnsyncedRecords(tableName, limit = 100) {
    await this.waitForInitialization();

    if (!this.db) {
      throw new Error("Database not initialized");
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction([tableName], "readonly");
        const store = transaction.objectStore(tableName);

        // Get all records and filter in JavaScript instead of using index
        // This is more reliable when dealing with boolean values
        const request = store.getAll();

        request.onsuccess = () => {
          const allRecords = request.result;
          const unsyncedRecords = allRecords
            .filter((record) => !record.synced) // Filter for unsynced records
            .slice(0, limit); // Apply limit
          resolve(unsyncedRecords);
        };
        request.onerror = () => reject(request.error);
      } catch (error) {
        logError(`Failed to get unsynced records from ${tableName}:`, error);
        reject(error);
      }
    });
  }

  async markAsSynced(tableName, recordIds) {
    await this.waitForInitialization();

    if (!this.db) {
      throw new Error("Database not initialized");
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction([tableName], "readwrite");
        const store = transaction.objectStore(tableName);
        let completed = 0;
        let errors = [];

        if (recordIds.length === 0) {
          resolve();
          return;
        }

        recordIds.forEach((id) => {
          const getRequest = store.get(id);
          getRequest.onsuccess = () => {
            const record = getRequest.result;
            if (record) {
              record.synced = true;
              record.syncedAt = new Date().toISOString();

              const putRequest = store.put(record);
              putRequest.onsuccess = () => {
                completed++;
                if (completed === recordIds.length) {
                  if (errors.length > 0) {
                    reject(errors);
                  } else {
                    logInfo(
                      `Marked ${completed} records as synced in ${tableName}`
                    );
                    resolve();
                  }
                }
              };
              putRequest.onerror = () => {
                errors.push(putRequest.error);
                completed++;
                if (completed === recordIds.length) {
                  reject(errors);
                }
              };
            } else {
              completed++;
              if (completed === recordIds.length) {
                if (errors.length > 0) {
                  reject(errors);
                } else {
                  resolve();
                }
              }
            }
          };
          getRequest.onerror = () => {
            errors.push(getRequest.error);
            completed++;
            if (completed === recordIds.length) {
              reject(errors);
            }
          };
        });
      } catch (error) {
        logError(`Failed to mark records as synced in ${tableName}:`, error);
        reject(error);
      }
    });
  }

  async getAllRecords(tableName) {
    await this.waitForInitialization();

    if (!this.db) {
      throw new Error("Database not initialized");
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([tableName], "readonly");
      const store = transaction.objectStore(tableName);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        logError(`Failed to get all records from ${tableName}:`, request.error);
        reject(request.error);
      };
    });
  }

  async clearTable(tableName) {
    await this.waitForInitialization();

    if (!this.db) {
      throw new Error("Database not initialized");
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([tableName], "readwrite");
      const store = transaction.objectStore(tableName);
      const request = store.clear();

      request.onsuccess = () => {
        logInfo(`Table ${tableName} cleared successfully`);
        resolve();
      };

      request.onerror = () => {
        logError(`Failed to clear table ${tableName}:`, request.error);
        reject(request.error);
      };
    });
  }

  async deleteRecord(tableName, recordId) {
    await this.waitForInitialization();

    if (!this.db) {
      throw new Error("Database not initialized");
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([tableName], "readwrite");
      const store = transaction.objectStore(tableName);
      const request = store.delete(recordId);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        logError(
          `Failed to delete record ${recordId} from ${tableName}:`,
          request.error
        );
        reject(request.error);
      };
    });
  }

  // async getDataStats() {
  //   await this.waitForInitialization();

  //   if (!this.db) {
  //     throw new Error("Database not initialized");
  //   }

  //   const stats = {
  //     total: {},
  //     unsynced: {},
  //     lastUpdated: new Date().toISOString(),
  //   };

  //   const promises = Object.values(this.tables).map((tableName) => {
  //     return new Promise((resolve, reject) => {
  //       const transaction = this.db.transaction([tableName], "readonly");
  //       const store = transaction.objectStore(tableName);

  //       // Get all records and count in JavaScript
  //       const request = store.getAll();
  //       request.onsuccess = () => {
  //         const allRecords = request.result;
  //         stats.total[tableName] = allRecords.length;
  //         stats.unsynced[tableName] = allRecords.filter(
  //           (record) => !record.synced
  //         ).length;
  //         resolve();
  //       };
  //       request.onerror = () => reject(request.error);
  //     });
  //   });

  //   await Promise.all(promises);
  //   return stats;
  // }

  async cleanupOldRecords(retentionDays = 7) {
    await this.waitForInitialization();

    if (!this.db) {
      throw new Error("Database not initialized");
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const promises = Object.values(this.tables).map((tableName) => {
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([tableName], "readwrite");
        const store = transaction.objectStore(tableName);

        // Get all records and filter in JavaScript
        const request = store.getAll();
        request.onsuccess = () => {
          const allRecords = request.result;
          let deletedCount = 0;
          let completedDeletes = 0;

          const syncedOldRecords = allRecords.filter((record) => {
            if (!record.synced) return false; // Keep unsynced records
            const recordDate = new Date(record.syncedAt || record.createdAt);
            return recordDate <= cutoffDate;
          });

          if (syncedOldRecords.length === 0) {
            resolve();
            return;
          }

          syncedOldRecords.forEach((record) => {
            const deleteRequest = store.delete(record.id || record.eventId);
            deleteRequest.onsuccess = () => {
              deletedCount++;
              completedDeletes++;
              if (completedDeletes === syncedOldRecords.length) {
                if (deletedCount > 0) {
                  logInfo(
                    `Cleaned up ${deletedCount} old records from ${tableName}`
                  );
                }
                resolve();
              }
            };
            deleteRequest.onerror = () => {
              completedDeletes++;
              if (completedDeletes === syncedOldRecords.length) {
                resolve();
              }
            };
          });
        };
        request.onerror = () => reject(request.error);
      });
    });

    await Promise.all(promises);
  }

  // ❌ DISABLED: Telemetry collection methods (using TelemetryCollector instead)
  // These methods are kept for reference but are NOT called anymore
  // TelemetryCollector (js/telemetry-collector.js) provides real Tizen API data

  // startTelemetryCollection() {
  //   // Collect telemetry every 5 minutes
  //   setInterval(() => {
  //     this.collectSystemTelemetry();
  //   }, 5 * 60 * 1000);
  //
  //   // Collect initial telemetry
  //   this.collectSystemTelemetry();
  // }
  //
  // async collectSystemTelemetry() {
  //   try {
  //     // Get system information (simplified for Tizen)
  //     const telemetryData = {
  //       cpuUsage: this.getCPUUsage(),
  //       ramFreeMb: this.getAvailableRAM(),
  //     };
  //
  //     await this.recordTelemetry(telemetryData);
  //   } catch (error) {
  //     logError("Failed to collect telemetry:", error);
  //   }
  // }
  //
  // getCPUUsage() {
  //   // Simplified CPU usage calculation
  //   // In a real implementation, you'd use Tizen system APIs
  //   return Math.random() * 0.5 + 0.2; // Mock value between 0.2-0.7
  // }
  //
  // getAvailableRAM() {
  //   // Simplified RAM calculation
  //   // In a real implementation, you'd use Tizen system APIs
  //   return Math.floor(Math.random() * 500) + 1500; // Mock value between 1500-2000 MB
  // }

  // Periodic sync
  startPeriodicSync() {
    // Get sync interval from config (default: 15 minutes)
    const syncInterval = window.SYNC_CONFIG?.syncInterval || 15 * 60 * 1000;

    logInfo(
      `Starting periodic sync with interval: ${syncInterval / 60000} minutes`
    );

    // Attempt sync at configured interval
    setInterval(() => {
      if (this.isOnline && !this.syncInProgress) {
        this.triggerSync();
      }
    }, syncInterval);
  }

  async triggerSync() {
    if (this.syncInProgress) {
      logInfo("Sync already in progress, skipping...");
      return;
    }

    let deviceId = this.getCurrentDeviceId();

    if (!deviceId || deviceId === "undefined") {
      logInfo("Device ID not available, skipping sync...");
      return;
    }

    // Check network connectivity before attempting sync
    const isConnected = await window.networkMonitor.checkConnectivity();
    if (!isConnected) {
      logInfo("⚠️ Device is offline - skipping sync (data stored locally)");
      return;
    }

    this.syncInProgress = true;
    const syncStartTime = Date.now();
    logInfo("Starting data synchronization...");

    try {
      // ✅ NEW: Update statistics
      this.stats.totalSyncs++;

      // ✅ NEW: Process retry queue first (failed syncs from previous attempts)
      // await this.processRetryQueue();

      // Perform main sync
      await this.syncAllData();

      // ✅ NEW: Update success statistics
      this.stats.successfulSyncs++;
      this.stats.lastSyncTime = new Date().toISOString();
      this.stats.lastSyncDuration = Date.now() - syncStartTime;

      // Calculate sync duration
      const syncDuration = Date.now() - syncStartTime;
      logInfo(
        `✅ Data synchronization completed successfully in ${syncDuration}ms`
      );

      // Log success event
      if (window.eventLogger) {
        window.eventLogger.logEvent("SYNC_COMPLETED", {
          duration: syncDuration,
          recordsSynced: this.stats.recordsSynced,
        });
      }
    } catch (error) {
      // ✅ NEW: Update failure statistics
      this.stats.failedSyncs++;

      logError("❌ Data synchronization failed:", error);

      // Log error event
      if (window.eventLogger) {
        window.eventLogger.logEvent("SYNC_FAILED", {
          error: error.message,
          duration: Date.now() - syncStartTime,
        });
      }
    } finally {
      this.syncInProgress = false;
    }
  }

  async syncAllData() {
    try {
      // Get batch size and bulk threshold from config
      const batchSize = window.dataConfigMonitor?.config?.sync?.batchSize || 50;
      const bulkThreshold =
        window.dataConfigMonitor?.config?.sync?.bulkSyncThreshold || 5000;

      // First, get count of unsynced records
      const stats = await this.getDataStats();
      const totalUnsynced =
        (stats.unsynced?.proofOfPlay || 0) +
        (stats.unsynced?.telemetry || 0) +
        (stats.unsynced?.events || 0);

      logInfo(`Total unsynced records: ${totalUnsynced}`);

      // Decide whether to use bulk sync or normal sync
      if (totalUnsynced > bulkThreshold) {
        logInfo(
          `Using BULK SYNC (${totalUnsynced} records > ${bulkThreshold} threshold)`
        );
        return await this.syncAllDataBulk();
      } else {
        logInfo(
          `Using NORMAL SYNC (${totalUnsynced} records, batch size: ${batchSize})`
        );
        return await this.syncAllDataNormal(batchSize);
      }
    } catch (error) {
      logError("Sync process failed:", error);
      throw error;
    }
  }

  async syncAllDataNormal(batchSize = 50) {
    try {
      let totalSynced = 0;
      let batchNumber = 0;
      let hasMoreData = true;

      // ✅ Safety: Maximum number of batches to prevent infinite loop
      const maxBatches =
        window.dataConfigMonitor?.config?.sync?.maxBatchesPerSync || 20;

      logInfo(
        `Starting NORMAL SYNC with batch size: ${batchSize} per table (max ${maxBatches} batches)`
      );

      // ✅ Loop until all records are synced OR max batches reached
      while (hasMoreData && batchNumber < maxBatches) {
        batchNumber++;

        // Get next batch of unsynced data
        const [proofOfPlayData, telemetryData, eventsData] = await Promise.all([
          this.getUnsyncedRecords(this.tables.proofOfPlay, batchSize),
          this.getUnsyncedRecords(this.tables.telemetry, batchSize),
          this.getUnsyncedRecords(this.tables.events, batchSize),
        ]);

        // Check if we have any data to sync
        if (
          proofOfPlayData.length === 0 &&
          telemetryData.length === 0 &&
          eventsData.length === 0
        ) {
          if (batchNumber === 1) {
            logInfo("No data to sync");
          } else {
            logInfo(
              `✅ All batches synced! Total: ${totalSynced} records in ${
                batchNumber - 1
              } batches`
            );
          }
          hasMoreData = false;
          break;
        }

        const batchRecordCount =
          proofOfPlayData.length + telemetryData.length + eventsData.length;

        logInfo(
          `Syncing batch #${batchNumber} (${batchRecordCount} records): PoP=${proofOfPlayData.length}, Tel=${telemetryData.length}, Evt=${eventsData.length}`
        );

        // Prepare payload in the required format
        const payload = {
          deviceId: this.getCurrentDeviceId(),
          sentAt: new Date().toISOString(),
          logs: {
            proofOfPlay: proofOfPlayData.map((record) => ({
              eventId: record.eventId,
              adId: record.adId,
              scheduleId: record.scheduleId,
              startTime: record.startTime,
              endTime: record.endTime,
              durationPlayedMs: record.durationPlayedMs,
            })),
            telemetry: telemetryData.map((record) => ({
              timestamp: record.timestamp,
              cpuUsage: record.cpuUsage,
              ramFreeMb: record.ramFreeMb,
              storageFreeMb: record.storageFreeMb,
              networkType: record.networkType,
              appVersionCode: record.appVersionCode,
            })),
            events: eventsData.map((record) => ({
              eventId: record.eventId,
              timestamp: record.timestamp,
              eventType: record.eventType,
              payload: record.payload,
            })),
          },
        };

        // Send batch to API
        const success = await this.sendDataToAPI(payload);

        if (success == true) {
          // Mark records as synced
          await Promise.all([
            this.markAsSynced(
              this.tables.proofOfPlay,
              proofOfPlayData.map((r) => r.eventId)
            ),
            this.markAsSynced(
              this.tables.telemetry,
              telemetryData.map((r) => r.id)
            ),
            this.markAsSynced(
              this.tables.events,
              eventsData.map((r) => r.eventId)
            ),
          ]);

          // Update counters
          totalSynced += batchRecordCount;
          this.stats.recordsSynced += batchRecordCount;

          logInfo(
            `✅ Batch #${batchNumber} synced successfully (${totalSynced} total synced so far)`
          );

          // Update last sync time after each successful batch
          this.setLastSyncTime();
        } else {
          // If batch sync fails, add to retry queue and stop
          logError(
            `❌ Batch #${batchNumber} sync failed, adding to retry queue and stopping sync ${totalSynced}`
          );

          if (proofOfPlayData.length > 0) {
            this.addToRetryQueue("proofOfPlay", proofOfPlayData);
          }
          if (telemetryData.length > 0) {
            this.addToRetryQueue("telemetry", telemetryData);
          }
          if (eventsData.length > 0) {
            this.addToRetryQueue("events", eventsData);
          }

          // Stop syncing on failure
          hasMoreData = false;
          break;
        }

        // Small delay between batches to avoid overwhelming the server
        if (hasMoreData) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
        }
      }

      // ✅ Check if we hit the maximum batch limit
      if (batchNumber >= maxBatches && hasMoreData) {
        logWarn(
          `⚠️ Maximum batch limit reached (${maxBatches} batches). Stopping sync.`
        );
        logWarn(
          `Total synced: ${totalSynced} records. Remaining records will sync in next cycle.`
        );

        // Get remaining unsynced count for logging
        const stats = await this.getDataStats();
        const remainingUnsynced =
          (stats.unsynced?.proofOfPlay || 0) +
          (stats.unsynced?.telemetry || 0) +
          (stats.unsynced?.events || 0);

        logWarn(
          `Remaining unsynced records: ${remainingUnsynced} (will sync in next periodic cycle)`
        );

        // Log event for monitoring
        if (window.eventLogger) {
          window.eventLogger.logEvent("SYNC_MAX_BATCHES_REACHED", {
            batchesProcessed: batchNumber,
            recordsSynced: totalSynced,
            remainingUnsynced: remainingUnsynced,
          });
        }
      }

      // Clean up old synced records after all batches
      if (totalSynced > 0) {
        await this.cleanupOldRecords();
        logInfo(
          `✅ Normal sync completed: ${totalSynced} records synced in ${batchNumber} batches`
        );
      }
    } catch (error) {
      logError("Normal sync process failed:", error);
      throw error;
    }
  }

  async syncAllDataBulk() {
    try {
      // Get ALL unsynced data (no limit)
      const [proofOfPlayData, telemetryData, eventsData] = await Promise.all([
        this.getUnsyncedRecords(this.tables.proofOfPlay, 999999),
        this.getUnsyncedRecords(this.tables.telemetry, 999999),
        this.getUnsyncedRecords(this.tables.events, 999999),
      ]);

      if (
        proofOfPlayData.length === 0 &&
        telemetryData.length === 0 &&
        eventsData.length === 0
      ) {
        logInfo("No data to sync");
        return;
      }

      // Prepare bulk payload
      const bulkPayload = {
        deviceId: this.getCurrentDeviceId(),
        sentAt: new Date().toISOString(),
        syncType: "BULK",
        totalRecords:
          proofOfPlayData.length + telemetryData.length + eventsData.length,
        logs: {
          proofOfPlay: proofOfPlayData.map((record) => ({
            eventId: record.eventId,
            adId: record.adId,
            scheduleId: record.scheduleId,
            startTime: record.startTime,
            endTime: record.endTime,
            durationPlayedMs: record.durationPlayedMs,
          })),
          telemetry: telemetryData.map((record) => ({
            timestamp: record.timestamp,
            cpuUsage: record.cpuUsage,
            ramFreeMb: record.ramFreeMb,
            storageFreeMb: record.storageFreeMb,
            networkType: record.networkType,
            appVersionCode: record.appVersionCode,
          })),
          events: eventsData.map((record) => ({
            eventId: record.eventId,
            timestamp: record.timestamp,
            eventType: record.eventType,
            payload: record.payload,
          })),
        },
      };

      logInfo("Syncing data (BULK):", {
        proofOfPlay: proofOfPlayData.length,
        telemetry: telemetryData.length,
        events: eventsData.length,
        totalRecords: bulkPayload.totalRecords,
      });

      // Send to BULK API
      const success = await this.sendBulkDataToAPI(bulkPayload);

      if (success) {
        // Mark records as synced
        await Promise.all([
          this.markAsSynced(
            this.tables.proofOfPlay,
            proofOfPlayData.map((r) => r.eventId)
          ),
          this.markAsSynced(
            this.tables.telemetry,
            telemetryData.map((r) => r.id)
          ),
          this.markAsSynced(
            this.tables.events,
            eventsData.map((r) => r.eventId)
          ),
        ]);

        // ✅ NEW: Update records synced count
        this.stats.recordsSynced +=
          proofOfPlayData.length + telemetryData.length + eventsData.length;

        logInfo("Bulk data marked as synced successfully");

        // Update last sync time
        this.setLastSyncTime();

        // Clean up old synced records
        await this.cleanupOldRecords();
      } else {
        // ✅ NEW: Add failed records to retry queue
        logWarn("Bulk sync failed, adding records to retry queue");
        if (proofOfPlayData.length > 0) {
          this.addToRetryQueue("proofOfPlay", proofOfPlayData);
        }
        if (telemetryData.length > 0) {
          this.addToRetryQueue("telemetry", telemetryData);
        }
        if (eventsData.length > 0) {
          this.addToRetryQueue("events", eventsData);
        }
      }
    } catch (error) {
      logError("Bulk sync process failed:", error);
      throw error;
    }
  }

  async sendDataToAPI(payload) {
    try {
      // Double-check network connectivity before API call
      const isConnected = await this.checkNetworkConnectivity();
      if (!isConnected) {
        logWarn("⚠️ Cannot send data to API - device is offline");
        return false;
      }

      // ✅ Validate device ID before sending
      const deviceId = this.getCurrentDeviceId();
      if (!deviceId) {
        logError("❌ Cannot send data - device ID is missing!");
        return false;
      }

      // Use the enhanced DataAPI class
      // if () {
      logInfo(
        `Sending data to API (deviceId: ${deviceId}, records: ${
          (payload.logs?.proofOfPlay?.length || 0) +
          (payload.logs?.telemetry?.length || 0) +
          (payload.logs?.events?.length || 0)
        })`
      );

      const result = await sendLogsToAPI(payload);

      if (!result.success) {
        logError("❌ API returned failure:", result.error);
        // Check if retryable
        if (result.retryable === false) {
          logWarn(
            "⚠️ Error is not retryable - marking as success to skip retry"
          );
          return true; // Don't retry non-retryable errors
        }
      }

      return result.success;
      // }

      // Fallback to direct fetch
      // const response = await fetch(LOGS_API_BASE_URL, {
      //   method: "POST",
      //   headers: {
      //     "Content-Type": "application/json",
      //     "X-Device-ID": this.getCurrentDeviceId(),
      //   },
      //   body: JSON.stringify(payload),
      //   timeout: 120000,
      // });

      // if (response.ok) {
      //   const result = await response.json();
      //   logInfo("Data sent to API successfully:", result);
      //   return true;
      // } else {
      //   // ✅ NEW: Check if it's a client error (4xx) - don't retry
      //   if (response.status >= 400 && response.status < 500) {
      //     logWarn(
      //       `⚠️ Client error (${response.status}): ${response.statusText} - marking as permanently failed (won't retry)`
      //     );
      //     // Return true to prevent retry (client errors won't be fixed by retrying)
      //     return true;
      //   }

      //   // Server error (5xx) or other errors - should retry
      //   logError(
      //     `API request failed (${response.status}): ${response.statusText} - will retry`
      //   );
      //   return false;
      // }
    } catch (error) {
      // Check if error is network-related
      if (
        error.name === "TypeError" ||
        error.message.includes("fetch") ||
        error.message.includes("network")
      ) {
        logWarn("⚠️ Network error - device may be offline:", error.message);
        // Update offline status
        this.isOnline = false;
      } else {
        logError("Failed to send data to API:", error);
      }
      return false;
    }
  }

  async sendBulkDataToAPI(bulkPayload) {
    try {
      // Double-check network connectivity before API call
      const isConnected = await this.checkNetworkConnectivity();
      if (!isConnected) {
        logWarn("⚠️ Cannot send bulk data to API - device is offline");
        return false;
      }

      logInfo(
        `Sending BULK data to API: ${bulkPayload.totalRecords} total records`
      );

      // Use the DataAPI class (single source of truth for API calls)
      // if (window.DataAPI) {
      //   const result = await window.DataAPI.sendBulkLogsToAPI(bulkPayload);
      //   return result.success;
      // }

      // Fallback if DataAPI not available (shouldn't happen)
      logWarn("DataAPI not available, using fallback");
      const result = await sendBulkLogsToAPI(bulkPayload);
      if (!result.success) {
        logError("❌ API returned failure:", result.error);
        // Check if retryable
        if (result.retryable === false) {
          logWarn(
            "⚠️ Error is not retryable - marking as success to skip retry"
          );
          return true; // Don't retry non-retryable errors
        }
      }

      return result.success;
      // const response = await fetch(BULK_LOGS_API_BASE_URL, {
      //   method: "POST",
      //   headers: {
      //     "Content-Type": "application/json",
      //     "X-Device-ID": this.getCurrentDeviceId(),
      //     "X-Android-ID": localStorage.getItem("android_id"),
      //     "X-Sync-Type": "BULK",
      //   },
      //   body: JSON.stringify(bulkPayload),
      //   timeout: 120000,
      // });

      // if (response.ok) {
      //   const result = await response.json();
      //   logInfo("Bulk data sent to API successfully:", result);
      //   return true;
      // } else {
      //   // ✅ NEW: Check if it's a client error (4xx) - don't retry
      //   if (response.status >= 400 && response.status < 500) {
      //     logWarn(
      //       `⚠️ Client error in bulk sync (${response.status}): ${response.statusText} - marking as permanently failed (won't retry)`
      //     );
      //     // Return true to prevent retry (client errors won't be fixed by retrying)
      //     return true;
      //   }

      //   // Server error (5xx) or other errors - should retry
      //   logError(
      //     `Bulk API request failed (${response.status}): ${response.statusText} - will retry`
      //   );
      //   return false;
      // }
    } catch (error) {
      // Check if error is network-related
      if (
        error.name === "TypeError" ||
        error.message.includes("fetch") ||
        error.message.includes("network")
      ) {
        logWarn(
          "⚠️ Network error during bulk sync - device may be offline:",
          error.message
        );
        // Update offline status
        this.isOnline = false;
      } else {
        logError("Failed to send bulk data to API:", error);
      }
      return false;
    }
  }

  // async cleanupOldRecords() {
  //   try {
  //     // Get retention days from config, default to 30 days for offline periods
  //     const retentionDays =
  //       window.dataConfigMonitor?.config?.storage?.retentionDays || 30;

  //     const cutoffDate = new Date();
  //     cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  //     logInfo(
  //       `Cleaning up synced records older than ${retentionDays} days (before ${cutoffDate.toISOString()})`
  //     );

  //     // Only cleanup old synced proof of play records (keep all unsynced)
  //     await this.deleteOldSyncedRecords(this.tables.proofOfPlay, cutoffDate);

  //     // Aggressively cleanup events and telemetry (they are less important)
  //     await this.cleanupEventsAndTelemetry();

  //     logInfo("Old records cleaned up successfully");
  //   } catch (error) {
  //     logError("Failed to cleanup old records:", error);
  //   }
  // }

  async cleanupEventsAndTelemetry() {
    try {
      const config = window.dataConfigMonitor?.config?.storage || {};
      const offlineThresholdDays = config.offlineThresholdDays || 3;
      const maxEventsRecords = config.maxEventsRecords || 1000;
      const maxTelemetryRecords = config.maxTelemetryRecords || 2000;

      // Check if device has been offline for more than threshold
      const lastSyncTime = this.getLastSyncTime();
      const now = new Date();
      const offlineDays = lastSyncTime
        ? (now - new Date(lastSyncTime)) / (1000 * 60 * 60 * 24)
        : 0;

      const isOfflineTooLong = offlineDays > offlineThresholdDays;

      if (isOfflineTooLong) {
        logInfo(
          `⚠️ Device offline for ${offlineDays.toFixed(
            1
          )} days (> ${offlineThresholdDays} days threshold)`
        );
        logInfo(
          "🗑️ Cleaning up ALL events and telemetry to save space for proof of play"
        );

        // Delete ALL events and telemetry (both synced and unsynced)
        await Promise.all([
          this.deleteAllRecords(this.tables.events),
          this.deleteAllRecords(this.tables.telemetry),
        ]);

        logInfo(
          "✅ All events and telemetry deleted due to long offline period"
        );
      } else {
        // Check if we have too many events or telemetry records
        const stats = await this.getDataStats();
        const totalEvents = stats.total?.events || 0;
        const totalTelemetry = stats.total?.telemetry || 0;

        // Cleanup events if exceeds limit
        if (totalEvents > maxEventsRecords) {
          logInfo(
            `⚠️ Too many event records: ${totalEvents} (max: ${maxEventsRecords})`
          );
          await this.deleteOldestRecords(
            this.tables.events,
            totalEvents - maxEventsRecords
          );
          logInfo(
            `✅ Deleted ${totalEvents - maxEventsRecords} oldest event records`
          );
        }

        // Cleanup telemetry if exceeds limit
        if (totalTelemetry > maxTelemetryRecords) {
          logInfo(
            `⚠️ Too many telemetry records: ${totalTelemetry} (max: ${maxTelemetryRecords})`
          );
          await this.deleteOldestRecords(
            this.tables.telemetry,
            totalTelemetry - maxTelemetryRecords
          );
          logInfo(
            `✅ Deleted ${
              totalTelemetry - maxTelemetryRecords
            } oldest telemetry records`
          );
        }
      }
    } catch (error) {
      logError("Failed to cleanup events and telemetry:", error);
    }
  }

  getLastSyncTime() {
    try {
      // Get last successful sync time from localStorage
      return localStorage.getItem("lastSuccessfulSync");
    } catch (error) {
      return null;
    }
  }

  setLastSyncTime() {
    try {
      localStorage.setItem("lastSuccessfulSync", new Date().toISOString());
    } catch (error) {
      logError("Failed to set last sync time:", error);
    }
  }

  deleteAllRecords(tableName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([tableName], "readwrite");
      const store = transaction.objectStore(tableName);

      const clearRequest = store.clear();
      clearRequest.onsuccess = () => {
        logInfo(`✅ Cleared all records from ${tableName}`);
        resolve();
      };
      clearRequest.onerror = () => {
        logError(`Failed to clear records from ${tableName}`);
        reject(clearRequest.error);
      };
    });
  }

  deleteOldestRecords(tableName, countToDelete) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([tableName], "readwrite");
      const store = transaction.objectStore(tableName);

      // Get all records sorted by timestamp
      const request = store.getAll();
      request.onsuccess = () => {
        const allRecords = request.result;

        // Sort by timestamp (oldest first)
        allRecords.sort((a, b) => {
          const dateA = new Date(a.timestamp || a.createdAt);
          const dateB = new Date(b.timestamp || b.createdAt);
          return dateA - dateB;
        });

        // Get the oldest records to delete
        const recordsToDelete = allRecords.slice(0, countToDelete);

        if (recordsToDelete.length === 0) {
          resolve();
          return;
        }

        let deletedCount = 0;
        let completedDeletes = 0;

        recordsToDelete.forEach((record) => {
          const deleteRequest = store.delete(record.id || record.eventId);
          deleteRequest.onsuccess = () => {
            deletedCount++;
            completedDeletes++;
            if (completedDeletes === recordsToDelete.length) {
              resolve();
            }
          };
          deleteRequest.onerror = () => {
            completedDeletes++;
            if (completedDeletes === recordsToDelete.length) {
              resolve();
            }
          };
        });
      };
      request.onerror = () => {
        logError(`Failed to get records from ${tableName}`);
        reject(request.error);
      };
    });
  }

  deleteOldSyncedRecords(tableName, cutoffDate) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([tableName], "readwrite");
      const store = transaction.objectStore(tableName);

      // Get all records and filter in JavaScript
      const request = store.getAll();
      request.onsuccess = () => {
        const allRecords = request.result;
        let deletedCount = 0;
        let completedDeletes = 0;

        // Filter for old synced records
        const oldSyncedRecords = allRecords.filter((record) => {
          if (!record.synced) return false; // Keep unsynced records
          const recordDate = new Date(
            record.syncedAt || record.createdAt || record.timestamp
          );
          return recordDate < cutoffDate;
        });

        if (oldSyncedRecords.length === 0) {
          resolve();
          return;
        }

        // Delete old synced records
        oldSyncedRecords.forEach((record) => {
          const deleteRequest = store.delete(record.id || record.eventId);
          deleteRequest.onsuccess = () => {
            deletedCount++;
            completedDeletes++;
            if (completedDeletes === oldSyncedRecords.length) {
              if (deletedCount > 0) {
                logInfo(
                  `Deleted ${deletedCount} old synced records from ${tableName}`
                );
              }
              resolve();
            }
          };
          deleteRequest.onerror = () => {
            completedDeletes++;
            if (completedDeletes === oldSyncedRecords.length) {
              resolve();
            }
          };
        });
      };

      request.onerror = () => reject(request.error);
    });
  }

  // Network connectivity check
  async checkNetworkConnectivity() {
    // ✅ ALWAYS use NetworkMonitor if available (single source of truth)
    if (window.networkMonitor) {
      const status = window.networkMonitor.getStatus();

      // If checking is in progress, wait a bit and check again
      if (status.isChecking) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return window.networkMonitor.getStatus().isOnline;
      }

      return status.isOnline;
    }

    // ❌ Fallback ONLY if NetworkMonitor is not available (should never happen)
    logWarn(
      "NetworkMonitor not available - using navigator.onLine (not recommended)"
    );
    return navigator.onLine;
  }

  // Get statistics
  async getDataStats() {
    const isConnected = await this.checkNetworkConnectivity();
    this.isOnline = isConnected;

    try {
      const [proofCount, telemetryCount, eventsCount] = await Promise.all([
        this.getRecordCount(this.tables.proofOfPlay),
        this.getRecordCount(this.tables.telemetry),
        this.getRecordCount(this.tables.events),
      ]);

      const [unsyncedProof, unsyncedTelemetry, unsyncedEvents] =
        await Promise.all([
          this.getUnsyncedCount(this.tables.proofOfPlay),
          this.getUnsyncedCount(this.tables.telemetry),
          this.getUnsyncedCount(this.tables.events),
        ]);

      return {
        total: {
          proofOfPlay: proofCount,
          telemetry: telemetryCount,
          events: eventsCount,
        },
        unsynced: {
          proofOfPlay: unsyncedProof,
          telemetry: unsyncedTelemetry,
          events: unsyncedEvents,
        },
        isOnline: isConnected,
        syncInProgress: this.syncInProgress,
      };
    } catch (error) {
      logError("Failed to get data stats:", error);
      return null;
    }
  }

  getRecordCount(tableName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([tableName], "readonly");
      const store = transaction.objectStore(tableName);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  getUnsyncedCount(tableName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([tableName], "readonly");
      const store = transaction.objectStore(tableName);

      // Get all records and count unsynced in JavaScript
      const request = store.getAll();
      request.onsuccess = () => {
        const allRecords = request.result;
        const unsyncedCount = allRecords.filter(
          (record) => !record.synced
        ).length;
        resolve(unsyncedCount);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // ✅ NEW: Retry Queue Methods (from SyncEngine)

  addToRetryQueue(dataType, records) {
    const retryItem = {
      id: generateUUID(),
      dataType: dataType,
      records: records,
      attempts: 0,
      lastAttempt: Date.now(),
      nextRetry: Date.now() + this.retryDelay,
    };

    this.retryQueue.push(retryItem);
    logInfo(
      `Added ${records.length} ${dataType} records to retry queue (queue size: ${this.retryQueue.length})`
    );
  }

  async processRetryQueue() {
    if (this.retryQueue.length === 0) {
      return;
    }

    logInfo(`Processing retry queue (${this.retryQueue.length} items)...`);

    const now = Date.now();
    const itemsToRetry = this.retryQueue.filter(
      (item) => item.nextRetry <= now && item.attempts < this.maxRetries
    );

    if (itemsToRetry.length === 0) {
      logInfo("No items ready for retry yet");
      return;
    }

    for (const item of itemsToRetry) {
      try {
        item.attempts++;
        item.lastAttempt = now;
        this.stats.retryAttempts++;

        logInfo(
          `Retrying sync for ${item.dataType}, attempt ${item.attempts}/${this.maxRetries} (${item.records.length} records)`
        );

        // Prepare payload based on data type
        const payload = this.prepareRetryPayload(item.dataType, item.records);

        // Send to API
        const success = await this.sendDataToAPI(payload);

        if (success) {
          // Mark records as synced
          const recordIds = item.records.map((r) => r.eventId || r.id);
          await this.markAsSynced(this.tables[item.dataType], recordIds);

          // Update stats
          this.stats.recordsSynced += item.records.length;

          // Remove from retry queue
          this.retryQueue = this.retryQueue.filter((i) => i.id !== item.id);
          logInfo(
            `✅ Retry successful for ${item.dataType} (${item.records.length} records synced)`
          );
        } else {
          // Schedule next retry with exponential backoff
          item.nextRetry = now + this.retryDelay * Math.pow(2, item.attempts);
          logWarn(
            `Retry failed for ${item.dataType}, next retry in ${
              (item.nextRetry - now) / 1000
            }s`
          );
        }
      } catch (error) {
        logError(`Retry failed for ${item.dataType}:`, error);
        // Schedule next retry with exponential backoff
        item.nextRetry = now + this.retryDelay * Math.pow(2, item.attempts);
      }
    }

    // Remove items that have exceeded max retries
    const failedItems = this.retryQueue.filter(
      (item) => item.attempts >= this.maxRetries
    );

    if (failedItems.length > 0) {
      logWarn(
        `⚠️ Removing ${failedItems.length} items from retry queue (max retries exceeded)`
      );

      // Log permanent failures
      for (const item of failedItems) {
        logError(
          `Permanent sync failure for ${item.dataType}: ${item.records.length} records lost after ${this.maxRetries} attempts`
        );

        // Record permanent failure event
        if (window.eventLogger) {
          window.eventLogger.logEvent("SYNC_PERMANENT_FAILURE", {
            dataType: item.dataType,
            recordCount: item.records.length,
            attempts: item.attempts,
          });
        }
      }

      // Remove failed items from queue
      this.retryQueue = this.retryQueue.filter(
        (item) => item.attempts < this.maxRetries
      );
    }

    logInfo(
      `Retry queue processing complete (${this.retryQueue.length} items remaining)`
    );
  }

  prepareRetryPayload(dataType, records) {
    const payload = {
      deviceId: this.getCurrentDeviceId(),
      sentAt: new Date().toISOString(),
      syncType: "RETRY",
      logs: {},
    };

    switch (dataType) {
      case "proofOfPlay":
        payload.logs.proofOfPlay = records.map((record) => ({
          eventId: record.eventId,
          adId: record.adId,
          scheduleId: record.scheduleId,
          startTime: record.startTime,
          endTime: record.endTime,
          durationPlayedMs: record.durationPlayedMs,
        }));
        break;

      case "telemetry":
        payload.logs.telemetry = records.map((record) => ({
          timestamp: record.timestamp,
          cpuUsage: record.cpuUsage,
          ramFreeMb: record.ramFreeMb,
          storageFreeMb: record.storageFreeMb,
          networkType: record.networkType,
          appVersionCode: record.appVersionCode,
        }));
        break;

      case "events":
        payload.logs.events = records.map((record) => ({
          eventId: record.eventId,
          timestamp: record.timestamp,
          eventType: record.eventType,
          payload: record.payload,
        }));
        break;
    }

    return payload;
  }

  // Get retry queue status
  getRetryQueueStatus() {
    return this.retryQueue.map((item) => ({
      id: item.id,
      dataType: item.dataType,
      recordCount: item.records.length,
      attempts: item.attempts,
      nextRetry: new Date(item.nextRetry).toISOString(),
    }));
  }

  // Get sync statistics
  getSyncStats() {
    return {
      ...this.stats,
      syncInProgress: this.syncInProgress,
      retryQueueSize: this.retryQueue.length,
      maxRetries: this.maxRetries,
      retryDelay: this.retryDelay,
    };
  }

  // Configuration methods
  setMaxRetries(retries) {
    this.maxRetries = retries;
    logInfo(`Max retries updated to: ${retries}`);
  }

  setRetryDelay(delay) {
    this.retryDelay = delay;
    logInfo(`Retry delay updated to: ${delay}ms`);
  }
}

// Global instance
window.dataManager = null;

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  window.dataManager = new DataManager();
});
