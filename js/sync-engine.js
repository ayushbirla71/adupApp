// Enhanced Data Synchronization Engine
// Handles robust data sync with retry logic, batch processing, and conflict resolution

class SyncEngine {
  constructor(dataManager) {
    this.dataManager = dataManager;
    this.isRunning = false;
    this.syncQueue = [];
    this.retryQueue = [];
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 seconds
    this.batchSize = 50; // Records per batch
    this.syncInterval = 2 * 60 * 1000; // 2 minutes
    this.syncTimer = null;

    // Sync statistics
    this.stats = {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      lastSyncTime: null,
      lastSyncDuration: 0,
      recordsSynced: 0,
      retryAttempts: 0,
    };

    this.init();
  }

  init() {
    this.startPeriodicSync();
    logInfo("SyncEngine initialized");
  }

  startPeriodicSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(() => {
      if (navigator.onLine && !this.isRunning) {
        this.performSync();
      }
    }, this.syncInterval);

    logInfo("Periodic sync started with interval:", this.syncInterval);
  }

  async performSync() {
    if (this.isRunning) {
      logWarn("Sync already in progress, skipping");
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logInfo("Starting data synchronization...");
      this.stats.totalSyncs++;

      // Check network connectivity first
      const isConnected = await this.checkConnectivity();
      if (!isConnected) {
        logWarn("No network connectivity, sync aborted");
        return;
      }

      // Process retry queue first
      await this.processRetryQueue();

      // Get unsynced data in batches
      const syncResults = await this.syncAllDataTypes();

      // Update statistics
      this.stats.successfulSyncs++;
      this.stats.lastSyncTime = new Date().toISOString();
      this.stats.lastSyncDuration = Date.now() - startTime;
      this.stats.recordsSynced += syncResults.totalRecords;

      logInfo("Data synchronization completed successfully", {
        duration: this.stats.lastSyncDuration,
        recordsSynced: syncResults.totalRecords,
      });

      // Record sync event
      if (window.eventLogger) {
        window.eventLogger.logEvent("SYNC_COMPLETED", {
          duration: this.stats.lastSyncDuration,
          recordsSynced: syncResults.totalRecords,
          batchesSynced: syncResults.batchesSynced,
        });
      }
    } catch (error) {
      this.stats.failedSyncs++;
      logError("Data synchronization failed:", error);

      // Record sync failure event
      if (window.eventLogger) {
        window.eventLogger.logEvent("SYNC_FAILED", {
          error: error.message,
          duration: Date.now() - startTime,
        });
      }
    } finally {
      this.isRunning = false;
    }
  }

  async checkConnectivity() {
    try {
      // Use network monitor if available
      if (window.networkMonitor) {
        return await window.networkMonitor.forceCheck();
      }

      // Fallback connectivity check - just check if we're online
      return navigator.onLine;
    } catch (error) {
      logWarn("Connectivity check failed:", error);
      return false;
    }
  }

  async syncAllDataTypes() {
    const results = {
      totalRecords: 0,
      batchesSynced: 0,
      proofOfPlay: 0,
      telemetry: 0,
      events: 0,
    };

    // Sync each data type in batches
    results.proofOfPlay = await this.syncDataType("proofOfPlay");
    results.telemetry = await this.syncDataType("telemetry");
    results.events = await this.syncDataType("events");

    results.totalRecords =
      results.proofOfPlay + results.telemetry + results.events;
    results.batchesSynced = Math.ceil(results.totalRecords / this.batchSize);

    return results;
  }

  async syncDataType(dataType) {
    let totalSynced = 0;
    let hasMoreData = true;

    while (hasMoreData) {
      try {
        // Get batch of unsynced records
        const records = await this.dataManager.getUnsyncedRecords(
          this.dataManager.tables[dataType],
          this.batchSize
        );

        if (records.length === 0) {
          hasMoreData = false;
          break;
        }

        // Prepare batch payload
        const batchPayload = this.prepareBatchPayload(dataType, records);

        // Send batch to API
        const success = await this.sendBatchToAPI(batchPayload);

        if (success) {
          // Mark records as synced
          const recordIds = records.map((r) => r.eventId || r.id);
          await this.dataManager.markAsSynced(
            this.dataManager.tables[dataType],
            recordIds
          );

          totalSynced += records.length;
          logInfo(`Synced ${records.length} ${dataType} records`);
        } else {
          // Add to retry queue
          this.addToRetryQueue(dataType, records);
          hasMoreData = false; // Stop processing this type for now
        }
      } catch (error) {
        logError(`Failed to sync ${dataType} batch:`, error);
        hasMoreData = false;
      }
    }

    return totalSynced;
  }

  prepareBatchPayload(dataType, records) {
    const payload = {
      deviceId: this.dataManager.deviceId,
      sentAt: new Date().toISOString(),
      batchType: dataType,
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
          storageInfo: record.storageInfo,
          networkInfo: record.networkInfo,
          displayInfo: record.displayInfo,
          batteryInfo: record.batteryInfo,
          performanceMetrics: record.performanceMetrics,
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

  async sendBatchToAPI(payload) {
    try {
      const response = await fetch(LOGS_API_BASE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-ID": this.dataManager.deviceId,
          "X-Batch-Type": payload.batchType,
        },
        body: JSON.stringify(payload),
        timeout: 30000,
      });

      if (response.ok) {
        const result = await response.json();
        logInfo("Batch sent to API successfully:", result);
        return true;
      } else {
        logError(
          "API batch request failed:",
          response.status,
          response.statusText
        );

        // Check if it's a client error (4xx) - don't retry
        if (response.status >= 400 && response.status < 500) {
          logWarn("Client error, marking batch as failed permanently");
          return true; // Don't retry client errors
        }

        return false;
      }
    } catch (error) {
      logError("Failed to send batch to API:", error);
      return false;
    }
  }

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
    logInfo(`Added ${records.length} ${dataType} records to retry queue`);
  }

  async processRetryQueue() {
    if (this.retryQueue.length === 0) {
      return;
    }

    const now = Date.now();
    const itemsToRetry = this.retryQueue.filter(
      (item) => item.nextRetry <= now && item.attempts < this.maxRetries
    );

    for (const item of itemsToRetry) {
      try {
        item.attempts++;
        item.lastAttempt = now;
        this.stats.retryAttempts++;

        logInfo(
          `Retrying sync for ${item.dataType}, attempt ${item.attempts}/${this.maxRetries}`
        );

        const batchPayload = this.prepareBatchPayload(
          item.dataType,
          item.records
        );
        const success = await this.sendBatchToAPI(batchPayload);

        if (success) {
          // Mark records as synced
          const recordIds = item.records.map((r) => r.eventId || r.id);
          await this.dataManager.markAsSynced(
            this.dataManager.tables[item.dataType],
            recordIds
          );

          // Remove from retry queue
          this.retryQueue = this.retryQueue.filter((i) => i.id !== item.id);
          logInfo(`Retry successful for ${item.dataType}`);
        } else {
          // Schedule next retry with exponential backoff
          item.nextRetry = now + this.retryDelay * Math.pow(2, item.attempts);
        }
      } catch (error) {
        logError(`Retry failed for ${item.dataType}:`, error);
        item.nextRetry = now + this.retryDelay * Math.pow(2, item.attempts);
      }
    }

    // Remove items that have exceeded max retries
    const failedItems = this.retryQueue.filter(
      (item) => item.attempts >= this.maxRetries
    );
    if (failedItems.length > 0) {
      logWarn(
        `Removing ${failedItems.length} items from retry queue (max retries exceeded)`
      );
      this.retryQueue = this.retryQueue.filter(
        (item) => item.attempts < this.maxRetries
      );

      // Record permanent failures
      if (window.eventLogger) {
        window.eventLogger.logEvent("SYNC_PERMANENT_FAILURE", {
          failedItems: failedItems.length,
          dataTypes: failedItems.map((i) => i.dataType),
        });
      }
    }
  }

  // Manual sync trigger
  async triggerSync() {
    if (this.isRunning) {
      logWarn("Sync already in progress");
      return false;
    }

    await this.performSync();
    return true;
  }

  // Configuration methods
  setSyncInterval(interval) {
    this.syncInterval = interval;
    this.startPeriodicSync();
    logInfo("Sync interval updated to:", interval);
  }

  setBatchSize(size) {
    this.batchSize = size;
    logInfo("Batch size updated to:", size);
  }

  setMaxRetries(retries) {
    this.maxRetries = retries;
    logInfo("Max retries updated to:", retries);
  }

  // Statistics and monitoring
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      retryQueueSize: this.retryQueue.length,
      syncInterval: this.syncInterval,
      batchSize: this.batchSize,
      maxRetries: this.maxRetries,
    };
  }

  getRetryQueueStatus() {
    return this.retryQueue.map((item) => ({
      id: item.id,
      dataType: item.dataType,
      recordCount: item.records.length,
      attempts: item.attempts,
      nextRetry: new Date(item.nextRetry).toISOString(),
    }));
  }

  // Cleanup
  destroy() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    // Final sync attempt
    if (navigator.onLine && !this.isRunning) {
      this.performSync();
    }

    logInfo("SyncEngine destroyed");
  }
}

// Export for use with DataManager
if (typeof module !== "undefined" && module.exports) {
  module.exports = SyncEngine;
}
