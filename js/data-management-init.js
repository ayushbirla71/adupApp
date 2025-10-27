// Data Management System Initialization
// Coordinates all data management components and ensures proper startup sequence

class DataManagementSystem {
  constructor() {
    this.components = {
      dataManager: null,
      networkMonitor: null,
      telemetryCollector: null,
      eventLogger: null,
      proofOfPlayTracker: null,
      syncEngine: null,
      configMonitor: null,
    };

    this.initializationOrder = [
      "networkMonitor",
      "eventLogger",
      "dataManager",
      "telemetryCollector",
      "proofOfPlayTracker",
      "configMonitor",
    ];

    this.isInitialized = false;
    this.initStartTime = Date.now();
  }

  async initialize() {
    if (this.isInitialized) {
      logWarn("Data management system already initialized");
      return;
    }

    logInfo("Initializing data management system...");

    try {
      // Wait for DOM to be ready
      await this.waitForDOM();

      // Initialize components in order
      for (const componentName of this.initializationOrder) {
        await this.initializeComponent(componentName);
      }

      // Setup integrations between components
      this.setupIntegrations();

      // Record initialization event
      this.recordInitializationEvent();

      this.isInitialized = true;
      const initTime = Date.now() - this.initStartTime;

      logInfo(
        `Data management system initialized successfully in ${initTime}ms`
      );

      // Show initialization status to user
      this.showInitializationStatus();
    } catch (error) {
      logError("Failed to initialize data management system:", error);
      this.handleInitializationError(error);
    }
  }

  waitForDOM() {
    return new Promise((resolve) => {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", resolve);
      } else {
        resolve();
      }
    });
  }

  async initializeComponent(componentName) {
    try {
      logInfo(`Initializing ${componentName}...`);

      switch (componentName) {
        case "networkMonitor":
          if (!window.networkMonitor) {
            window.networkMonitor = new NetworkMonitor();
          }
          this.components.networkMonitor = window.networkMonitor;
          break;

        case "eventLogger":
          if (!window.eventLogger) {
            window.eventLogger = new EventLogger();
          }
          this.components.eventLogger = window.eventLogger;
          break;

        case "dataManager":
          if (!window.dataManager) {
            window.dataManager = new DataManager();
            // Wait for IndexedDB to be ready
            await this.waitForDataManager();
          }
          this.components.dataManager = window.dataManager;
          break;

        case "telemetryCollector":
          if (!window.telemetryCollector) {
            window.telemetryCollector = new TelemetryCollector();
          }
          this.components.telemetryCollector = window.telemetryCollector;
          break;

        case "proofOfPlayTracker":
          if (!window.proofOfPlayTracker) {
            window.proofOfPlayTracker = new ProofOfPlayTracker();
          }
          this.components.proofOfPlayTracker = window.proofOfPlayTracker;
          break;

        case "configMonitor":
          if (!window.dataConfigMonitor) {
            window.dataConfigMonitor = new DataConfigMonitor();
          }
          this.components.configMonitor = window.dataConfigMonitor;
          break;
      }

      logInfo(`${componentName} initialized successfully`);
    } catch (error) {
      logError(`Failed to initialize ${componentName}:`, error);
      throw error;
    }
  }

  waitForDataManager() {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (window.dataManager && window.dataManager.isInitialized) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);

      // Timeout after 15 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error("DataManager initialization timeout"));
      }, 15000);
    });
  }

  setupIntegrations() {
    try {
      // Integrate network monitor with data manager
      if (this.components.networkMonitor && this.components.dataManager) {
        this.components.networkMonitor.addListener((event) => {
          if (event === "online" && this.components.dataManager) {
            this.components.dataManager.triggerSync();
          }
        });
      }

      // Integrate event logger with all components
      if (this.components.eventLogger) {
        // Override existing download tracking
        this.integrateDownloadTracking();

        // Override existing error logging
        this.integrateErrorLogging();
      }

      // Setup sync engine if not already done
      if (
        this.components.dataManager &&
        !this.components.dataManager.syncEngine
      ) {
        this.components.dataManager.syncEngine = new SyncEngine(
          this.components.dataManager
        );
        this.components.syncEngine = this.components.dataManager.syncEngine;
      }

      logInfo("Component integrations setup successfully");
    } catch (error) {
      logError("Failed to setup integrations:", error);
    }
  }

  integrateDownloadTracking() {
    // Override the existing trackDownloadProgress function
    const originalTrackProgress = window.trackDownloadProgress;
    if (originalTrackProgress) {
      window.trackDownloadProgress = (fileName, url, progress) => {
        // Call original function
        originalTrackProgress(fileName, url, progress);

        // Add event logging
        if (this.components.eventLogger) {
          if (progress === 0) {
            this.components.eventLogger.logContentDownload(
              "started",
              fileName,
              { url }
            );
          } else if (progress === 100) {
            this.components.eventLogger.logContentDownload(
              "completed",
              fileName,
              { url }
            );
          }
        }
      };
    }
  }

  integrateErrorLogging() {
    // Override the existing addErrorLog function
    const originalAddErrorLog = window.addErrorLog;
    if (originalAddErrorLog) {
      window.addErrorLog = (message) => {
        // Call original function
        originalAddErrorLog(message);

        // Add event logging
        if (this.components.eventLogger) {
          this.components.eventLogger.logDiagnostic(
            "error",
            "Application",
            message
          );
        }
      };
    }
  }

  recordInitializationEvent() {
    if (this.components.eventLogger) {
      this.components.eventLogger.logEvent("DATA_MANAGEMENT_INITIALIZED", {
        initializationTime: Date.now() - this.initStartTime,
        components: Object.keys(this.components).filter(
          (key) => this.components[key] !== null
        ),
        timestamp: new Date().toISOString(),
      });
    }
  }

  showInitializationStatus() {
    // Add a subtle notification to the UI
    const statusMessage = "Data management system ready";

    // Use existing toast system if available
    if (window.showToast) {
      window.showToast("success", statusMessage);
    } else {
      // Fallback to console
      logInfo(statusMessage);
    }
  }

  handleInitializationError(error) {
    // Record the error
    if (this.components.eventLogger) {
      this.components.eventLogger.logEvent("DATA_MANAGEMENT_INIT_FAILED", {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });
    }

    // Show error to user
    if (window.showToast) {
      window.showToast("error", "Data management system failed to initialize");
    }
  }

  // Public methods for external access
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      components: Object.keys(this.components).reduce((status, key) => {
        status[key] = this.components[key] !== null;
        return status;
      }, {}),
      initializationTime: this.isInitialized
        ? Date.now() - this.initStartTime
        : null,
    };
  }

  async getSystemStats() {
    if (!this.isInitialized) {
      return { error: "System not initialized" };
    }

    const stats = {
      timestamp: new Date().toISOString(),
      system: this.getStatus(),
    };

    // Gather stats from each component
    if (this.components.dataManager) {
      stats.dataManager = await this.components.dataManager.getDataStats();
    }

    if (this.components.syncEngine) {
      stats.syncEngine = this.components.syncEngine.getStats();
    }

    if (this.components.networkMonitor) {
      stats.networkMonitor = this.components.networkMonitor.getStatus();
    }

    if (this.components.telemetryCollector) {
      stats.telemetryCollector = this.components.telemetryCollector.getStatus();
    }

    if (this.components.eventLogger) {
      stats.eventLogger = this.components.eventLogger.getStats();
    }

    if (this.components.proofOfPlayTracker) {
      stats.proofOfPlayTracker = this.components.proofOfPlayTracker.getStats();
    }

    return stats;
  }

  // Manual sync trigger
  async triggerSync() {
    if (this.components.dataManager) {
      return await this.components.dataManager.triggerSync();
    }
    return false;
  }

  // Emergency cleanup
  async emergencyCleanup() {
    logWarn("Performing emergency cleanup...");

    try {
      // Stop all periodic operations
      if (this.components.telemetryCollector) {
        this.components.telemetryCollector.stopCollection();
      }

      if (this.components.configMonitor) {
        this.components.configMonitor.stopMonitoring();
      }

      // Force final sync
      if (this.components.dataManager && navigator.onLine) {
        await this.components.dataManager.triggerSync();
      }

      // Cleanup old data
      if (this.components.dataManager) {
        await this.components.dataManager.cleanupOldRecords();
      }

      logInfo("Emergency cleanup completed");
    } catch (error) {
      logError("Emergency cleanup failed:", error);
    }
  }
}

// Global instance
window.dataManagementSystem = null;

// Auto-initialize when script loads
(function () {
  // Wait a bit for other scripts to load
  setTimeout(() => {
    window.dataManagementSystem = new DataManagementSystem();
    window.dataManagementSystem.initialize();
  }, 1000);
})();

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  if (window.dataManagementSystem) {
    window.dataManagementSystem.emergencyCleanup();
  }
});
