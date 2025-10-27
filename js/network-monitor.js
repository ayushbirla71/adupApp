// Network Connectivity Monitor
// Provides robust network detection and connectivity management

class NetworkMonitor {
  constructor() {
    this.isOnline = navigator.onLine;
    this.lastOnlineCheck = Date.now();
    this.checkInterval = 30000; // 30 seconds
    this.retryInterval = 5000; // 5 seconds when offline
    this.maxRetries = 3;
    this.currentRetries = 0;
    this.listeners = [];
    this.checkTimer = null;
    this.isChecking = false;

    // Network quality metrics
    this.networkQuality = {
      latency: null,
      bandwidth: null,
      lastMeasured: null,
    };

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.startPeriodicChecks();
    this.performInitialCheck();
    logInfo("NetworkMonitor initialized");
  }

  setupEventListeners() {
    // Browser online/offline events
    window.addEventListener("online", () => {
      logInfo("Browser detected online status");
      this.handleOnlineEvent();
    });

    window.addEventListener("offline", () => {
      logInfo("Browser detected offline status");
      this.handleOfflineEvent();
    });

    // Visibility change - check when app becomes visible
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && Date.now() - this.lastOnlineCheck > 10000) {
        this.checkConnectivity();
      }
    });

    // MQTT connection events (if available)
    if (window.mqttClient) {
      this.setupMQTTListeners();
    }
  }

  setupMQTTListeners() {
    // Monitor MQTT connection status as additional connectivity indicator
    const originalConnect = window.connectMQTT;
    if (originalConnect) {
      window.connectMQTT = (options) => {
        const result = originalConnect(options);

        // Monitor MQTT events for connectivity
        if (window.mqttClient) {
          window.mqttClient.on("connect", () => {
            logInfo("MQTT connected - network is stable");
            this.handleOnlineEvent();
          });

          window.mqttClient.on("offline", () => {
            logWarn("MQTT offline - checking network connectivity");
            this.checkConnectivity();
          });

          window.mqttClient.on("error", (error) => {
            logWarn("MQTT error - possible network issue:", error.message);
            this.checkConnectivity();
          });
        }

        return result;
      };
    }
  }

  async performInitialCheck() {
    const isConnected = await this.checkConnectivity();
    this.updateConnectionStatus(isConnected);
  }

  startPeriodicChecks() {
    this.scheduleNextCheck();
  }

  scheduleNextCheck() {
    if (this.checkTimer) {
      clearTimeout(this.checkTimer);
    }

    const interval = this.isOnline ? this.checkInterval : this.retryInterval;

    this.checkTimer = setTimeout(() => {
      this.checkConnectivity().then((isConnected) => {
        this.updateConnectionStatus(isConnected);
        this.scheduleNextCheck();
      });
    }, interval);
  }

  async checkConnectivity() {
    if (this.isChecking) {
      return this.isOnline;
    }

    this.isChecking = true;
    this.lastOnlineCheck = Date.now();

    try {
      // Multiple connectivity checks for reliability
      const checks = await Promise.allSettled([
        this.checkAPIEndpoint(),
        this.checkInternetConnectivity(),
        this.measureNetworkQuality(),
      ]);

      // Consider online if at least one check succeeds
      const isConnected = checks.some(
        (result) => result.status === "fulfilled" && result.value === true
      );

      logInfo("Connectivity check result:", {
        isConnected,
        apiCheck: checks[0].status === "fulfilled" ? checks[0].value : false,
        internetCheck:
          checks[1].status === "fulfilled" ? checks[1].value : false,
        qualityCheck:
          checks[2].status === "fulfilled" ? checks[2].value : false,
      });

      return isConnected;
    } catch (error) {
      logError("Connectivity check failed:", error);
      return false;
    } finally {
      this.isChecking = false;
    }
  }

  async checkAPIEndpoint() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      // Try to reach a simple connectivity test instead of logs endpoint
      // Since logs endpoint may not support HEAD requests
      await fetch("https://www.google.com/favicon.ico", {
        method: "HEAD",
        signal: controller.signal,
        cache: "no-cache",
        mode: "no-cors",
      });

      clearTimeout(timeoutId);
      return true; // If we get here, we have connectivity
    } catch (error) {
      logWarn("API endpoint check failed:", error.message);
      return false;
    }
  }

  async checkInternetConnectivity() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

      // Use a reliable external service
      await fetch("https://www.google.com/favicon.ico", {
        method: "HEAD",
        signal: controller.signal,
        cache: "no-cache",
        mode: "no-cors",
      });

      clearTimeout(timeoutId);
      return true; // If we get here, we have internet
    } catch (error) {
      logWarn("Internet connectivity check failed:", error.message);
      return false;
    }
  }

  async measureNetworkQuality() {
    try {
      const startTime = performance.now();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      // Use a simple connectivity test instead of ping endpoint
      await fetch("https://www.google.com/favicon.ico", {
        method: "HEAD",
        signal: controller.signal,
        cache: "no-cache",
        mode: "no-cors",
      });

      clearTimeout(timeoutId);
      const endTime = performance.now();
      const latency = endTime - startTime;

      this.networkQuality = {
        latency: latency,
        bandwidth: null, // Could be measured with larger requests
        lastMeasured: new Date().toISOString(),
      };

      logInfo("Network quality measured:", this.networkQuality);
      return true; // If we get here, we have connectivity
    } catch (error) {
      logWarn("Network quality measurement failed:", error.message);
      return false;
    }
  }

  updateConnectionStatus(isConnected) {
    const wasOnline = this.isOnline;
    this.isOnline = isConnected;

    if (wasOnline !== isConnected) {
      logInfo(
        `Network status changed: ${wasOnline ? "online" : "offline"} -> ${
          isConnected ? "online" : "offline"
        }`
      );

      if (isConnected) {
        this.currentRetries = 0;
        this.notifyListeners("online");

        // Trigger data sync when coming back online
        if (window.dataManager) {
          window.dataManager.triggerSync();
        }
      } else {
        this.notifyListeners("offline");
      }
    }

    // Update retry logic
    if (!isConnected) {
      this.currentRetries++;
      if (this.currentRetries >= this.maxRetries) {
        logWarn(`Network connectivity failed after ${this.maxRetries} retries`);
        this.notifyListeners("connection-failed");
      }
    } else {
      this.currentRetries = 0;
    }
  }

  handleOnlineEvent() {
    // Browser says we're online, but verify with actual connectivity check
    setTimeout(() => {
      this.checkConnectivity().then((isConnected) => {
        this.updateConnectionStatus(isConnected);
      });
    }, 1000); // Small delay to allow network to stabilize
  }

  handleOfflineEvent() {
    this.updateConnectionStatus(false);
  }

  // Event listener management
  addListener(callback) {
    this.listeners.push(callback);
  }

  removeListener(callback) {
    const index = this.listeners.indexOf(callback);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  notifyListeners(event) {
    this.listeners.forEach((callback) => {
      try {
        callback(event, {
          isOnline: this.isOnline,
          retries: this.currentRetries,
          quality: this.networkQuality,
        });
      } catch (error) {
        logError("Error in network listener:", error);
      }
    });
  }

  // Public methods
  getStatus() {
    return {
      isOnline: this.isOnline,
      lastCheck: this.lastOnlineCheck,
      retries: this.currentRetries,
      quality: this.networkQuality,
      isChecking: this.isChecking,
    };
  }

  async forceCheck() {
    const isConnected = await this.checkConnectivity();
    this.updateConnectionStatus(isConnected);
    return isConnected;
  }

  destroy() {
    if (this.checkTimer) {
      clearTimeout(this.checkTimer);
    }
    this.listeners = [];
    logInfo("NetworkMonitor destroyed");
  }
}

// Global instance
window.networkMonitor = null;

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  window.networkMonitor = new NetworkMonitor();

  // Add listener for data manager integration
  if (window.networkMonitor) {
    window.networkMonitor.addListener((event, status) => {
      logInfo("Network event:", event, status);

      // Record network events
      if (window.dataManager) {
        window.dataManager.recordEvent({
          eventType: "NETWORK_STATUS_CHANGE",
          payload: {
            event: event,
            isOnline: status.isOnline,
            retries: status.retries,
            quality: status.quality,
          },
        });
      }
    });
  }
});
