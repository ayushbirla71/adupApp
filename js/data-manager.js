// Data Management System with IndexedDB for Offline/Online Synchronization
// Handles proof of play, telemetry, and events data

class DataManager {
  constructor() {
    this.dbName = "AdupDataDB";
    this.dbVersion = 1;
    this.db = null;
    this.isOnline = navigator.onLine;
    this.syncInProgress = false;
    this.deviceId =
      localStorage.getItem("device_id") || this.generateDeviceId();

    // Store tables configuration
    this.tables = {
      proofOfPlay: "proofOfPlay",
      telemetry: "telemetry",
      events: "events",
      syncQueue: "syncQueue",
    };

    this.isInitialized = false;
    this.initPromise = null;

    // Start initialization but don't wait for it in constructor
    this.initPromise = this.init();
    this.setupNetworkListeners();
    this.setupDeviceIdWatcher();
  }

  generateDeviceId() {
    const deviceId = generateUUID();
    localStorage.setItem("device_id", deviceId);
    return deviceId;
  }

  setupDeviceIdWatcher() {
    // Watch for device ID changes in localStorage
    setInterval(() => {
      const currentDeviceId = localStorage.getItem("device_id");
      if (currentDeviceId && currentDeviceId !== this.deviceId) {
        logInfo(
          `Device ID updated from ${this.deviceId} to ${currentDeviceId}`
        );
        this.deviceId = currentDeviceId;
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

      // Start telemetry collection
      this.startTelemetryCollection();
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
    window.addEventListener("online", () => {
      this.isOnline = true;
      logInfo("Network connection restored - triggering sync");
      this.triggerSync();
    });

    window.addEventListener("offline", () => {
      this.isOnline = false;
      logInfo("Network connection lost - data will be stored locally");
    });
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
        this.triggerSync();
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
      appVersionCode: telemetryData.appVersionCode || "UNKNOWN",

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

  async getDataStats() {
    await this.waitForInitialization();

    if (!this.db) {
      throw new Error("Database not initialized");
    }

    const stats = {
      total: {},
      unsynced: {},
      lastUpdated: new Date().toISOString(),
    };

    const promises = Object.values(this.tables).map((tableName) => {
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([tableName], "readonly");
        const store = transaction.objectStore(tableName);

        // Get all records and count in JavaScript
        const request = store.getAll();
        request.onsuccess = () => {
          const allRecords = request.result;
          stats.total[tableName] = allRecords.length;
          stats.unsynced[tableName] = allRecords.filter(
            (record) => !record.synced
          ).length;
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    });

    await Promise.all(promises);
    return stats;
  }

  async cleanupOldRecords(retentionDays = 30) {
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

  // Telemetry collection
  startTelemetryCollection() {
    // Collect telemetry every 5 minutes
    setInterval(() => {
      this.collectSystemTelemetry();
    }, 5 * 60 * 1000);

    // Collect initial telemetry
    this.collectSystemTelemetry();
  }

  async collectSystemTelemetry() {
    try {
      // Get system information (simplified for Tizen)
      const telemetryData = {
        cpuUsage: this.getCPUUsage(),
        ramFreeMb: this.getAvailableRAM(),
      };

      await this.recordTelemetry(telemetryData);
    } catch (error) {
      logError("Failed to collect telemetry:", error);
    }
  }

  getCPUUsage() {
    // Simplified CPU usage calculation
    // In a real implementation, you'd use Tizen system APIs
    return Math.random() * 0.5 + 0.2; // Mock value between 0.2-0.7
  }

  getAvailableRAM() {
    // Simplified RAM calculation
    // In a real implementation, you'd use Tizen system APIs
    return Math.floor(Math.random() * 500) + 1500; // Mock value between 1500-2000 MB
  }

  // Periodic sync
  startPeriodicSync() {
    // Attempt sync every 2 minutes
    setInterval(() => {
      if (this.isOnline && !this.syncInProgress) {
        this.triggerSync();
      }
    }, 15 * 60 * 1000); // 4 minutes
  }

  async triggerSync() {
    if (this.syncInProgress) {
      logInfo("Sync already in progress, skipping...");
      return;
    }

    // Check network connectivity before attempting sync
    const isConnected = await this.checkNetworkConnectivity();
    if (!isConnected) {
      logInfo("⚠️ Device is offline - skipping sync (data stored locally)");
      return;
    }

    this.syncInProgress = true;
    logInfo("Starting data synchronization...");

    try {
      await this.syncAllData();
      logInfo("Data synchronization completed successfully");
    } catch (error) {
      logError("Data synchronization failed:", error);
    } finally {
      this.syncInProgress = false;
    }
  }

  async syncAllData() {
    try {
      // Get batch size and bulk threshold from config
      const batchSize = window.dataConfigMonitor?.config?.sync?.batchSize || 50;
      const bulkThreshold =
        window.dataConfigMonitor?.config?.sync?.bulkSyncThreshold || 500;

      // First, get count of unsynced records
      const stats = await this.getDataStats();
      const totalUnsynced =
        (stats.proofOfPlay?.unsynced || 0) +
        (stats.telemetry?.unsynced || 0) +
        (stats.events?.unsynced || 0);

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
      // Get limited unsynced data (max 50 records per table)
      const [proofOfPlayData, telemetryData, eventsData] = await Promise.all([
        this.getUnsyncedRecords(this.tables.proofOfPlay, batchSize),
        this.getUnsyncedRecords(this.tables.telemetry, batchSize),
        this.getUnsyncedRecords(this.tables.events, batchSize),
      ]);

      if (
        proofOfPlayData.length === 0 &&
        telemetryData.length === 0 &&
        eventsData.length === 0
      ) {
        logInfo("No data to sync");
        return;
      }

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

      logInfo("Syncing data (NORMAL):", {
        proofOfPlay: proofOfPlayData.length,
        telemetry: telemetryData.length,
        events: eventsData.length,
      });

      // Send to API
      const success = await this.sendDataToAPI(payload);

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

        logInfo("Data marked as synced successfully");

        // Update last sync time
        this.setLastSyncTime();

        // Clean up old synced records
        await this.cleanupOldRecords();
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

        logInfo("Bulk data marked as synced successfully");

        // Update last sync time
        this.setLastSyncTime();

        // Clean up old synced records
        await this.cleanupOldRecords();
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

      // Use the enhanced DataAPI class
      if (window.DataAPI) {
        const result = await window.DataAPI.sendLogsToAPI(payload);
        return result.success;
      }

      // Fallback to direct fetch
      const response = await fetch(LOGS_API_BASE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-ID": this.getCurrentDeviceId(),
        },
        body: JSON.stringify(payload),
        timeout: 30000,
      });

      if (response.ok) {
        const result = await response.json();
        logInfo("Data sent to API successfully:", result);
        return true;
      } else {
        logError("API request failed:", response.status, response.statusText);
        return false;
      }
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
      if (window.DataAPI) {
        const result = await window.DataAPI.sendBulkLogsToAPI(bulkPayload);
        return result.success;
      }

      // Fallback if DataAPI not available (shouldn't happen)
      logWarn("DataAPI not available, using fallback");
      const response = await fetch(BULK_LOGS_API_BASE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-ID": this.getCurrentDeviceId(),
          "X-Android-ID": localStorage.getItem("android_id"),
          "X-Sync-Type": "BULK",
        },
        body: JSON.stringify(bulkPayload),
        timeout: 120000,
      });

      if (response.ok) {
        const result = await response.json();
        logInfo("Bulk data sent to API successfully:", result);
        return true;
      } else {
        logError("Bulk API request failed:", response.status);
        return false;
      }
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

  async cleanupOldRecords() {
    try {
      // Get retention days from config, default to 30 days for offline periods
      const retentionDays =
        window.dataConfigMonitor?.config?.storage?.retentionDays || 30;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      logInfo(
        `Cleaning up synced records older than ${retentionDays} days (before ${cutoffDate.toISOString()})`
      );

      // Only cleanup old synced proof of play records (keep all unsynced)
      await this.deleteOldSyncedRecords(this.tables.proofOfPlay, cutoffDate);

      // Aggressively cleanup events and telemetry (they are less important)
      await this.cleanupEventsAndTelemetry();

      logInfo("Old records cleaned up successfully");
    } catch (error) {
      logError("Failed to cleanup old records:", error);
    }
  }

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
    // Use NetworkMonitor if available (more reliable)
    if (window.networkMonitor) {
      const status = window.networkMonitor.getStatus();
      if (!status.isOnline) {
        logInfo("NetworkMonitor reports device is offline");
        return false;
      }
      // If NetworkMonitor says online, trust it
      return true;
    }

    // Fallback to basic navigator.onLine check
    if (!navigator.onLine) {
      logInfo("navigator.onLine reports device is offline");
      return false;
    }

    // If navigator says online, assume it's true
    // (Don't make additional HTTP requests to check connectivity)
    return true;
  }

  // Get statistics
  async getDataStats() {
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
        isOnline: this.isOnline,
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
}

// Global instance
window.dataManager = null;

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  window.dataManager = new DataManager();
});
