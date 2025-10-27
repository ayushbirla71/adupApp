// Data Management Configuration and Monitoring System
// Provides configuration options and monitoring dashboard

class DataConfigMonitor {
  constructor() {
    logInfo("DataConfigMonitor constructor starting...");

    // Initialize default config first
    this.defaultConfig = {
      sync: {
        interval: 2 * 60 * 1000, // 2 minutes
        batchSize: 50,
        maxRetries: 3,
        retryDelay: 5000,
        enabled: true,
      },
      telemetry: {
        collectionInterval: 5 * 60 * 1000, // 5 minutes
        enabled: true,
        includePerformanceMetrics: true,
        includeSystemInfo: true,
      },
      events: {
        flushInterval: 30000, // 30 seconds
        maxQueueSize: 1000,
        enabled: true,
        logLevel: "INFO",
      },
      proofOfPlay: {
        enabled: true,
        trackImageAds: true,
        trackVideoAds: true,
        detailedTracking: true,
      },
      storage: {
        retentionDays: 7,
        maxRecordsPerTable: 10000,
        autoCleanup: true,
        cleanupInterval: 24 * 60 * 60 * 1000, // 24 hours
      },
      network: {
        connectivityCheckInterval: 30000, // 30 seconds
        timeoutMs: 10000,
        retryOnFailure: true,
      },
    };

    logInfo("Default config initialized:", this.defaultConfig);

    // Load config after defaults are set
    this.config = this.loadConfig();

    logInfo("Final config loaded:", this.config);

    this.monitoring = {
      isEnabled: true,
      updateInterval: 10000, // 10 seconds
      intervalId: null,
      lastUpdate: null,
    };

    this.init();
  }

  init() {
    this.applyConfig();
    this.startMonitoring();
    this.setupConfigUI();
    logInfo("DataConfigMonitor initialized");
  }

  loadConfig() {
    try {
      logInfo("Loading config, defaultConfig available:", !!this.defaultConfig);

      const savedConfig = localStorage.getItem("data_management_config");
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        const merged = this.mergeConfig(this.defaultConfig, parsed);
        logInfo("Loaded and merged config:", merged);
        return merged;
      }
    } catch (error) {
      logWarn("Failed to load saved config, using defaults:", error);
    }

    // Always return a deep copy of default config
    if (!this.defaultConfig) {
      logError("defaultConfig is not available in loadConfig!");
      return {};
    }

    const defaultCopy = JSON.parse(JSON.stringify(this.defaultConfig));
    logInfo("Using default config:", defaultCopy);
    return defaultCopy;
  }

  saveConfig() {
    try {
      localStorage.setItem(
        "data_management_config",
        JSON.stringify(this.config)
      );
      logInfo("Configuration saved successfully");
    } catch (error) {
      logError("Failed to save configuration:", error);
    }
  }

  mergeConfig(defaultConfig, userConfig) {
    const merged = { ...defaultConfig };

    for (const [key, value] of Object.entries(userConfig)) {
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        merged[key] = { ...defaultConfig[key], ...value };
      } else {
        merged[key] = value;
      }
    }

    return merged;
  }

  applyConfig() {
    try {
      // Debug: Check if config is loaded
      if (!this.config) {
        logError("Config is null/undefined in applyConfig");
        return;
      }

      logInfo("Applying configuration:", this.config);

      // Apply sync configuration
      if (
        window.dataManager &&
        window.dataManager.syncEngine &&
        this.config.sync
      ) {
        if (
          typeof window.dataManager.syncEngine.setSyncInterval === "function"
        ) {
          window.dataManager.syncEngine.setSyncInterval(
            this.config.sync.interval
          );
        }
        if (typeof window.dataManager.syncEngine.setBatchSize === "function") {
          window.dataManager.syncEngine.setBatchSize(
            this.config.sync.batchSize
          );
        }
        if (typeof window.dataManager.syncEngine.setMaxRetries === "function") {
          window.dataManager.syncEngine.setMaxRetries(
            this.config.sync.maxRetries
          );
        }
      }

      // Apply telemetry configuration
      if (window.telemetryCollector && this.config.telemetry) {
        if (window.telemetryCollector.collectionInterval !== undefined) {
          window.telemetryCollector.collectionInterval =
            this.config.telemetry.collectionInterval;
        }
        if (this.config.telemetry.enabled) {
          if (typeof window.telemetryCollector.startCollection === "function") {
            window.telemetryCollector.startCollection();
          }
        } else {
          if (typeof window.telemetryCollector.stopCollection === "function") {
            window.telemetryCollector.stopCollection();
          }
        }
      }

      // Apply event logging configuration
      if (window.eventLogger && this.config.events) {
        if (typeof window.eventLogger.setEnabled === "function") {
          window.eventLogger.setEnabled(this.config.events.enabled);
        }
        if (typeof window.eventLogger.setFlushInterval === "function") {
          window.eventLogger.setFlushInterval(this.config.events.flushInterval);
        }
      }

      // Apply proof of play configuration
      if (window.proofOfPlayTracker && this.config.proofOfPlay) {
        if (typeof window.proofOfPlayTracker.setEnabled === "function") {
          window.proofOfPlayTracker.setEnabled(this.config.proofOfPlay.enabled);
        }
      }

      // Apply network monitoring configuration
      if (window.networkMonitor && this.config.network) {
        if (window.networkMonitor.checkInterval !== undefined) {
          window.networkMonitor.checkInterval =
            this.config.network.connectivityCheckInterval;
        }
      }

      logInfo("Configuration applied successfully");
    } catch (error) {
      logError("Failed to apply configuration:", error);
    }
  }

  updateConfig(section, key, value) {
    if (!this.config[section]) {
      this.config[section] = {};
    }

    this.config[section][key] = value;
    this.saveConfig();
    this.applyConfig();

    logInfo(`Configuration updated: ${section}.${key} = ${value}`);
  }

  resetConfig() {
    this.config = { ...this.defaultConfig };
    this.saveConfig();
    this.applyConfig();
    logInfo("Configuration reset to defaults");
  }

  startMonitoring() {
    if (this.monitoring.intervalId) {
      clearInterval(this.monitoring.intervalId);
    }

    this.monitoring.intervalId = setInterval(() => {
      this.updateMonitoringData();
    }, this.monitoring.updateInterval);

    logInfo("Monitoring started");
  }

  stopMonitoring() {
    if (this.monitoring.intervalId) {
      clearInterval(this.monitoring.intervalId);
      this.monitoring.intervalId = null;
    }
    logInfo("Monitoring stopped");
  }

  async updateMonitoringData() {
    try {
      const monitoringData = await this.gatherMonitoringData();
      this.monitoring.lastUpdate = new Date().toISOString();

      // Update UI if available
      this.updateMonitoringUI(monitoringData);

      // Check for issues and alerts
      this.checkForAlerts(monitoringData);
    } catch (error) {
      logError("Failed to update monitoring data:", error);
    }
  }

  async gatherMonitoringData() {
    const data = {
      timestamp: new Date().toISOString(),
      dataManager: null,
      syncEngine: null,
      telemetryCollector: null,
      eventLogger: null,
      networkMonitor: null,
      proofOfPlayTracker: null,
    };

    // Gather data manager stats
    if (window.dataManager) {
      data.dataManager = await window.dataManager.getDataStats();
    }

    // Gather sync engine stats
    if (window.dataManager && window.dataManager.syncEngine) {
      data.syncEngine = window.dataManager.syncEngine.getStats();
    }

    // Gather telemetry collector stats
    if (window.telemetryCollector) {
      data.telemetryCollector = window.telemetryCollector.getStatus();
    }

    // Gather event logger stats
    if (window.eventLogger) {
      data.eventLogger = window.eventLogger.getStats();
    }

    // Gather network monitor stats
    if (window.networkMonitor) {
      data.networkMonitor = window.networkMonitor.getStatus();
    }

    // Gather proof of play tracker stats
    if (window.proofOfPlayTracker) {
      data.proofOfPlayTracker = window.proofOfPlayTracker.getStats();
    }

    return data;
  }

  checkForAlerts(data) {
    const alerts = [];

    // Check for high unsynced data
    if (data.dataManager) {
      const totalUnsynced = Object.values(
        data.dataManager.unsynced || {}
      ).reduce((a, b) => a + b, 0);
      if (totalUnsynced > 500) {
        alerts.push({
          type: "warning",
          message: `High number of unsynced records: ${totalUnsynced}`,
          action: "Consider checking network connectivity",
        });
      }
    }

    // Check for sync failures
    if (data.syncEngine && data.syncEngine.failedSyncs > 5) {
      alerts.push({
        type: "error",
        message: `Multiple sync failures: ${data.syncEngine.failedSyncs}`,
        action: "Check API connectivity and logs",
      });
    }

    // Check for network issues
    if (data.networkMonitor && !data.networkMonitor.isOnline) {
      alerts.push({
        type: "warning",
        message: "Device is offline",
        action: "Data will be stored locally until connection is restored",
      });
    }

    // Check for large event queue
    if (data.eventLogger && data.eventLogger.queueSize > 800) {
      alerts.push({
        type: "warning",
        message: `Large event queue: ${data.eventLogger.queueSize}`,
        action: "Events may be lost if queue overflows",
      });
    }

    // Log alerts
    alerts.forEach((alert) => {
      if (alert.type === "error") {
        logError(`ALERT: ${alert.message} - ${alert.action}`);
      } else {
        logWarn(`ALERT: ${alert.message} - ${alert.action}`);
      }
    });

    return alerts;
  }

  setupConfigUI() {
    // Add configuration panel to existing UI
    this.createConfigPanel();
    this.createMonitoringPanel();
  }

  createConfigPanel() {
    // This would integrate with the existing UI system
    // For now, we'll add it to the system info panel

    // Ensure config is available
    if (
      !this.config ||
      !this.config.sync ||
      !this.config.telemetry ||
      !this.config.storage
    ) {
      logWarn("Config not fully loaded, skipping UI creation");
      return;
    }

    const configHTML = `
      <div id="dataConfigPanel" style="display: none;">
        <h3>Data Management Configuration</h3>
        <div class="config-section">
          <h4>Sync Settings</h4>
          <label>Sync Interval (minutes): <input type="number" id="syncInterval" value="${
            (this.config.sync.interval || 120000) / 60000
          }" min="1" max="60"></label>
          <label>Batch Size: <input type="number" id="batchSize" value="${
            this.config.sync.batchSize || 50
          }" min="10" max="200"></label>
          <label>Max Retries: <input type="number" id="maxRetries" value="${
            this.config.sync.maxRetries || 3
          }" min="1" max="10"></label>
        </div>
        <div class="config-section">
          <h4>Telemetry Settings</h4>
          <label>Collection Interval (minutes): <input type="number" id="telemetryInterval" value="${
            (this.config.telemetry.collectionInterval || 300000) / 60000
          }" min="1" max="60"></label>
          <label><input type="checkbox" id="telemetryEnabled" ${
            this.config.telemetry.enabled ? "checked" : ""
          }> Enable Telemetry</label>
        </div>
        <div class="config-section">
          <h4>Storage Settings</h4>
          <label>Retention Days: <input type="number" id="retentionDays" value="${
            this.config.storage.retentionDays || 7
          }" min="1" max="30"></label>
          <label><input type="checkbox" id="autoCleanup" ${
            this.config.storage.autoCleanup ? "checked" : ""
          }> Auto Cleanup</label>
        </div>
        <button onclick="window.dataConfigMonitor.saveUIConfig()">Save Configuration</button>
        <button onclick="window.dataConfigMonitor.resetConfig()">Reset to Defaults</button>
      </div>
    `;

    // Add to existing system info or create new panel
    const existingPanel = document.getElementById("systemInfoPanel");
    if (existingPanel) {
      existingPanel.insertAdjacentHTML("beforeend", configHTML);
    }
  }

  createMonitoringPanel() {
    const monitoringHTML = `
      <div id="dataMonitoringPanel" style="display: none;">
        <h3>Data Management Status</h3>
        <div id="monitoringStats">
          <div class="stat-group">
            <h4>Sync Status</h4>
            <div id="syncStats">Loading...</div>
          </div>
          <div class="stat-group">
            <h4>Data Storage</h4>
            <div id="storageStats">Loading...</div>
          </div>
          <div class="stat-group">
            <h4>Network Status</h4>
            <div id="networkStats">Loading...</div>
          </div>
        </div>
        <button onclick="window.dataConfigMonitor.forceSync()">Force Sync Now</button>
        <button onclick="window.dataConfigMonitor.clearLocalData()">Clear Local Data</button>
      </div>
    `;

    const existingPanel = document.getElementById("systemInfoPanel");
    if (existingPanel) {
      existingPanel.insertAdjacentHTML("beforeend", monitoringHTML);
    }
  }

  updateMonitoringUI(data) {
    // Update sync stats
    const syncStatsEl = document.getElementById("syncStats");
    if (syncStatsEl && data.syncEngine) {
      syncStatsEl.innerHTML = `
        <p>Total Syncs: ${data.syncEngine.totalSyncs}</p>
        <p>Success Rate: ${(
          (data.syncEngine.successfulSyncs / data.syncEngine.totalSyncs) *
          100
        ).toFixed(1)}%</p>
        <p>Last Sync: ${data.syncEngine.lastSyncTime || "Never"}</p>
        <p>Retry Queue: ${data.syncEngine.retryQueueSize}</p>
      `;
    }

    // Update storage stats
    const storageStatsEl = document.getElementById("storageStats");
    if (storageStatsEl && data.dataManager) {
      storageStatsEl.innerHTML = `
        <p>Proof of Play: ${data.dataManager.total.proofOfPlay} (${data.dataManager.unsynced.proofOfPlay} unsynced)</p>
        <p>Telemetry: ${data.dataManager.total.telemetry} (${data.dataManager.unsynced.telemetry} unsynced)</p>
        <p>Events: ${data.dataManager.total.events} (${data.dataManager.unsynced.events} unsynced)</p>
      `;
    }

    // Update network stats
    const networkStatsEl = document.getElementById("networkStats");
    if (networkStatsEl && data.networkMonitor) {
      networkStatsEl.innerHTML = `
        <p>Status: ${data.networkMonitor.isOnline ? "Online" : "Offline"}</p>
        <p>Last Check: ${new Date(
          data.networkMonitor.lastCheck
        ).toLocaleTimeString()}</p>
        <p>Quality: ${
          data.networkMonitor.quality?.latency
            ? `${data.networkMonitor.quality.latency.toFixed(0)}ms`
            : "Unknown"
        }</p>
      `;
    }
  }

  saveUIConfig() {
    try {
      // Get values from UI elements
      const syncInterval =
        parseInt(document.getElementById("syncInterval").value) * 60000;
      const batchSize = parseInt(document.getElementById("batchSize").value);
      const maxRetries = parseInt(document.getElementById("maxRetries").value);
      const telemetryInterval =
        parseInt(document.getElementById("telemetryInterval").value) * 60000;
      const telemetryEnabled =
        document.getElementById("telemetryEnabled").checked;
      const retentionDays = parseInt(
        document.getElementById("retentionDays").value
      );
      const autoCleanup = document.getElementById("autoCleanup").checked;

      // Update configuration
      this.config.sync.interval = syncInterval;
      this.config.sync.batchSize = batchSize;
      this.config.sync.maxRetries = maxRetries;
      this.config.telemetry.collectionInterval = telemetryInterval;
      this.config.telemetry.enabled = telemetryEnabled;
      this.config.storage.retentionDays = retentionDays;
      this.config.storage.autoCleanup = autoCleanup;

      this.saveConfig();
      this.applyConfig();

      alert("Configuration saved successfully!");
    } catch (error) {
      logError("Failed to save UI config:", error);
      alert("Failed to save configuration");
    }
  }

  async forceSync() {
    try {
      if (window.dataManager) {
        await window.dataManager.triggerSync();
        alert("Sync triggered successfully!");
      } else {
        alert("Data manager not available");
      }
    } catch (error) {
      logError("Failed to force sync:", error);
      alert("Failed to trigger sync");
    }
  }

  async clearLocalData() {
    if (
      confirm(
        "Are you sure you want to clear all local data? This cannot be undone."
      )
    ) {
      try {
        // Clear IndexedDB
        if (window.dataManager && window.dataManager.db) {
          const tables = ["proofOfPlay", "telemetry", "events", "syncQueue"];
          for (const table of tables) {
            const transaction = window.dataManager.db.transaction(
              [table],
              "readwrite"
            );
            const store = transaction.objectStore(table);
            await store.clear();
          }
        }

        alert("Local data cleared successfully!");
        logInfo("Local data cleared by user");
      } catch (error) {
        logError("Failed to clear local data:", error);
        alert("Failed to clear local data");
      }
    }
  }

  getConfig() {
    return { ...this.config };
  }

  getMonitoringData() {
    return this.gatherMonitoringData();
  }
}

// Global instance
window.dataConfigMonitor = null;

// DataConfigMonitor is now initialized by the DataManagementSystem
// No direct instantiation needed here
