// Enhanced Telemetry Collection System for Tizen
// Collects system metrics and performance data

class TelemetryCollector {
  constructor() {
    this.isCollecting = false;
    this.collectionInterval = 5 * 60 * 1000; // 5 minutes
    this.intervalId = null;
    this.lastCollection = null;

    // Performance tracking
    this.performanceMetrics = {
      memoryUsage: [],
      downloadSpeeds: [],
      playbackErrors: 0,
      networkLatency: [],
    };

    this.init();
  }

  init() {
    logInfo("TelemetryCollector initialized");
    this.startCollection();
  }

  startCollection() {
    if (this.isCollecting) {
      return;
    }

    this.isCollecting = true;

    // Collect initial telemetry
    this.collectTelemetry();

    // Set up periodic collection
    this.intervalId = setInterval(() => {
      this.collectTelemetry();
    }, this.collectionInterval);

    logInfo("Telemetry collection started");
  }

  stopCollection() {
    if (!this.isCollecting) {
      return;
    }

    this.isCollecting = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    logInfo("Telemetry collection stopped");
  }

  async collectTelemetry() {
    try {
      const telemetryData = await this.gatherSystemMetrics();

      // Store in data manager
      if (window.dataManager) {
        await window.dataManager.recordTelemetry(telemetryData);
      }

      this.lastCollection = new Date().toISOString();
      logInfo("Telemetry collected successfully");
    } catch (error) {
      logError("Failed to collect telemetry:", error);
    }
  }

  async gatherSystemMetrics() {
    // Collect all real data
    const cpuData = await this.getCPUUsage();
    const memoryData = await this.getAvailableRAM();
    const storageData = await this.getStorageInfo();
    const networkData = await this.getNetworkInfo();
    const buildData = await this.getBuildInfo();

    // Format in required structure (camelCase)
    const metrics = {
      deviceId: localStorage.getItem("device_id"),
      timestamp: new Date().toISOString(),
      cpuUsage: cpuData ? cpuData.load : null,
      ramFreeMb: memoryData ? memoryData.availableMB : null,
      storageFreeMb:
        storageData && storageData.length > 0
          ? storageData[0].availableCapacityMB
          : null,
      networkType: networkData ? networkData.type : null,
      // appVersionCode: buildData ? buildData.buildVersion : null,
      appVersionCode: window.APP_VERSION,
    };

    logInfo(
      "📊 Real Tizen Telemetry collected:",
      JSON.stringify(metrics, null, 2)
    );
    return metrics;
  }

  async getCPUUsage() {
    try {
      // Get real CPU usage from Tizen system info
      if (typeof tizen !== "undefined" && tizen.systeminfo) {
        return new Promise((resolve) => {
          tizen.systeminfo.getPropertyValue(
            "CPU",
            (cpu) => {
              // CPU load is a value between 0 and 1
              const cpuLoad = cpu.load;
              logInfo(`Real CPU load: ${(cpuLoad * 100).toFixed(2)}%`);
              resolve(cpuLoad);
            },
            (error) => {
              logWarn("Failed to get CPU usage from Tizen API:", error.message);
              resolve(null);
            }
          );
        });
      }
    } catch (error) {
      logWarn("Failed to get CPU usage from Tizen API:", error);
    }

    return null;
  }

  async getAvailableRAM() {
    try {
      // Get real memory info from Tizen system info
      if (typeof tizen !== "undefined" && tizen.systeminfo) {
        // Get total and available memory
        const totalMemory = tizen.systeminfo.getTotalMemory();
        const availableMemory = tizen.systeminfo.getAvailableMemory();

        const totalMB = Math.floor(totalMemory / (1024 * 1024));
        const availableMB = Math.floor(availableMemory / (1024 * 1024));
        const usedMB = totalMB - availableMB;
        const usagePercent = ((usedMB / totalMB) * 100).toFixed(2);

        logInfo(
          `Real Memory: ${availableMB}MB free / ${totalMB}MB total (${usagePercent}% used)`
        );

        return {
          totalMB: totalMB,
          availableMB: availableMB,
          usedMB: usedMB,
          usagePercent: parseFloat(usagePercent),
        };
      }
    } catch (error) {
      logWarn("Failed to get memory info from Tizen API:", error);
    }

    return null;
  }

  async getStorageInfo() {
    try {
      // Get real storage info from Tizen system info
      if (typeof tizen !== "undefined" && tizen.systeminfo) {
        return new Promise((resolve) => {
          tizen.systeminfo.getPropertyValue(
            "STORAGE",
            (storage) => {
              const storageUnits = storage.units || [];
              const storageInfo = storageUnits.map((unit) => ({
                type: unit.type, // "INTERNAL" or "EXTERNAL"
                capacityBytes: unit.capacity, // Keep raw bytes
                availableCapacityBytes: unit.availableCapacity, // Keep raw bytes
                capacityMB: Math.floor(unit.capacity / (1024 * 1024)), // Convert to MB
                availableCapacityMB: Math.floor(
                  unit.availableCapacity / (1024 * 1024)
                ), // Convert to MB
                isRemovable: unit.isRemovable,
                usagePercent: (
                  ((unit.capacity - unit.availableCapacity) / unit.capacity) *
                  100
                ).toFixed(2),
              }));

              logInfo(`Real Storage Info: ${JSON.stringify(storageInfo)}`);
              resolve(storageInfo);
            },
            (error) => {
              logWarn(
                "Failed to get storage info from Tizen API:",
                error.message
              );
              resolve(null);
            }
          );
        });
      }
    } catch (error) {
      logWarn("Failed to get storage info:", error);
    }

    return null;
  }

  async getNetworkInfo() {
    try {
      // ✅ Use NetworkMonitor as single source of truth
      const isOnline = window.networkMonitor
        ? window.networkMonitor.isOnline
        : navigator.onLine;

      const networkInfo = {
        isOnline: isOnline,
      };

      // Get real network info from Tizen
      if (typeof tizen !== "undefined" && tizen.systeminfo) {
        // Try to get WiFi network info
        try {
          const wifiInfo = await new Promise((resolve) => {
            tizen.systeminfo.getPropertyValue(
              "WIFI_NETWORK",
              (wifi) => {
                resolve({
                  type: "WIFI",
                  status: wifi.status,
                  ssid: wifi.ssid,
                  ipAddress: wifi.ipAddress,
                  ipv6Address: wifi.ipv6Address,
                  macAddress: wifi.macAddress,
                  signalStrength: wifi.signalStrength,
                  signalPercent: parseFloat(
                    (wifi.signalStrength * 100).toFixed(2)
                  ),
                  securityMode: wifi.securityMode,
                  gateway: wifi.gateway,
                  dns: wifi.dns,
                });
              },
              () => resolve(null)
            );
          });
          if (wifiInfo && wifiInfo.status === "ON") {
            Object.assign(networkInfo, wifiInfo);
            logInfo(`Real WiFi Info: ${JSON.stringify(wifiInfo)}`);
          }
        } catch (e) {
          logWarn("WiFi info not available");
        }

        // Try to get Ethernet network info if WiFi not available
        if (!networkInfo.type) {
          try {
            const ethernetInfo = await new Promise((resolve) => {
              tizen.systeminfo.getPropertyValue(
                "ETHERNET_NETWORK",
                (ethernet) => {
                  resolve({
                    type: "ETHERNET",
                    cable: ethernet.cable,
                    status: ethernet.status,
                    ipAddress: ethernet.ipAddress,
                    ipv6Address: ethernet.ipv6Address,
                    macAddress: ethernet.macAddress,
                    gateway: ethernet.gateway,
                    dns: ethernet.dns,
                  });
                },
                () => resolve(null)
              );
            });
            if (ethernetInfo) {
              Object.assign(networkInfo, ethernetInfo);
              logInfo(`Real Ethernet Info: ${JSON.stringify(ethernetInfo)}`);
            }
          } catch (e) {
            logWarn("Ethernet info not available");
          }
        }
      }

      return networkInfo;
    } catch (error) {
      logWarn("Failed to get network info:", error);
      // ✅ Use NetworkMonitor even in error case
      const isOnline = window.networkMonitor
        ? window.networkMonitor.isOnline
        : navigator.onLine;
      return { isOnline: isOnline, error: error.message };
    }
  }

  async getDisplayInfo() {
    try {
      if (typeof tizen !== "undefined" && tizen.systeminfo) {
        return new Promise((resolve) => {
          tizen.systeminfo.getPropertyValue(
            "DISPLAY",
            (display) => {
              const info = {
                resolutionWidth: display.resolutionWidth,
                resolutionHeight: display.resolutionHeight,
                resolution: `${display.resolutionWidth}x${display.resolutionHeight}`,
                dotsPerInchWidth: display.dotsPerInchWidth,
                dotsPerInchHeight: display.dotsPerInchHeight,
                physicalWidth: display.physicalWidth,
                physicalHeight: display.physicalHeight,
                brightness: display.brightness,
                brightnessPercent: parseFloat(
                  (display.brightness * 100).toFixed(2)
                ),
                colorDepth: display.colorDepth,
                pixelDepth: display.pixelDepth,
              };
              logInfo(`Real Display Info: ${JSON.stringify(info)}`);
              resolve(info);
            },
            (error) => {
              logWarn(
                "Failed to get display info from Tizen API:",
                error.message
              );
              resolve({
                resolutionWidth: screen.width,
                resolutionHeight: screen.height,
                resolution: `${screen.width}x${screen.height}`,
                colorDepth: screen.colorDepth,
                pixelDepth: screen.pixelDepth,
              });
            }
          );
        });
      }
    } catch (error) {
      logWarn("Failed to get display info:", error);
    }

    return {
      resolutionWidth: screen.width,
      resolutionHeight: screen.height,
      resolution: `${screen.width}x${screen.height}`,
      colorDepth: screen.colorDepth,
      pixelDepth: screen.pixelDepth,
    };
  }

  async getBatteryInfo() {
    try {
      if (navigator.getBattery) {
        const battery = await navigator.getBattery();
        return {
          charging: battery.charging,
          level: battery.level,
          chargingTime: battery.chargingTime,
          dischargingTime: battery.dischargingTime,
        };
      }
    } catch (error) {
      logWarn("Failed to get battery info:", error);
    }

    return { available: false, error: "Battery API not supported" };
  }

  async getBuildInfo() {
    try {
      if (typeof tizen !== "undefined" && tizen.systeminfo) {
        return new Promise((resolve) => {
          tizen.systeminfo.getPropertyValue(
            "BUILD",
            (build) => {
              const info = {
                model: build.model,
                manufacturer: build.manufacturer,
                buildVersion: build.buildVersion,
              };
              logInfo(`Real Build Info: ${JSON.stringify(info)}`);
              resolve(info);
            },
            (error) => {
              logWarn(
                "Failed to get build info from Tizen API:",
                error.message
              );
              resolve(null);
            }
          );
        });
      }
    } catch (error) {
      logWarn("Failed to get build info:", error);
    }

    return null;
  }

  async getPeripheralInfo() {
    try {
      if (typeof tizen !== "undefined" && tizen.systeminfo) {
        return new Promise((resolve) => {
          tizen.systeminfo.getPropertyValue(
            "PERIPHERAL",
            (peripheral) => {
              const info = {
                isVideoOutputOn: peripheral.isVideoOutputOn,
              };
              logInfo(`Real Peripheral Info: ${JSON.stringify(info)}`);
              resolve(info);
            },
            (error) => {
              logWarn(
                "Failed to get peripheral info from Tizen API:",
                error.message
              );
              resolve(null);
            }
          );
        });
      }
    } catch (error) {
      logWarn("Failed to get peripheral info:", error);
    }

    return null;
  }

  async getOrientationInfo() {
    try {
      // Use screen dimensions for accurate orientation
      const screenWidth = screen.width;
      const screenHeight = screen.height;
      const orientation = screenWidth > screenHeight ? "landscape" : "portrait";

      const info = {
        orientation,
        screenWidth,
        screenHeight,
        resolution: `${screenWidth}x${screenHeight}`,
      };

      logInfo(`Real Orientation: ${JSON.stringify(info)}`);
      return info;
    } catch (error) {
      logWarn("Failed to get orientation info:", error);
    }

    return null;
  }

  getPerformanceMetrics() {
    return {
      memoryUsageHistory: this.performanceMetrics.memoryUsage.slice(-10), // Last 10 readings
      averageDownloadSpeed: this.calculateAverageDownloadSpeed(),
      playbackErrorCount: this.performanceMetrics.playbackErrors,
      averageNetworkLatency: this.calculateAverageLatency(),
      uptime: this.getUptime(),
    };
  }

  calculateAverageDownloadSpeed() {
    if (this.performanceMetrics.downloadSpeeds.length === 0) {
      return 0;
    }

    const sum = this.performanceMetrics.downloadSpeeds.reduce(
      (a, b) => a + b,
      0
    );
    return sum / this.performanceMetrics.downloadSpeeds.length;
  }

  calculateAverageLatency() {
    if (this.performanceMetrics.networkLatency.length === 0) {
      return null;
    }

    const sum = this.performanceMetrics.networkLatency.reduce(
      (a, b) => a + b,
      0
    );
    return sum / this.performanceMetrics.networkLatency.length;
  }

  getUptime() {
    // Estimate app uptime (simplified)
    const startTime = localStorage.getItem("app_start_time");
    if (startTime) {
      return Date.now() - parseInt(startTime);
    }
    return 0;
  }

  // Methods to track performance metrics
  recordMemoryUsage(usage) {
    this.performanceMetrics.memoryUsage.push({
      timestamp: Date.now(),
      usage: usage,
    });

    // Keep only last 50 readings
    if (this.performanceMetrics.memoryUsage.length > 50) {
      this.performanceMetrics.memoryUsage.shift();
    }
  }

  recordDownloadSpeed(speed) {
    this.performanceMetrics.downloadSpeeds.push(speed);

    // Keep only last 20 readings
    if (this.performanceMetrics.downloadSpeeds.length > 20) {
      this.performanceMetrics.downloadSpeeds.shift();
    }
  }

  recordPlaybackError() {
    this.performanceMetrics.playbackErrors++;
  }

  recordNetworkLatency(latency) {
    this.performanceMetrics.networkLatency.push(latency);

    // Keep only last 20 readings
    if (this.performanceMetrics.networkLatency.length > 20) {
      this.performanceMetrics.networkLatency.shift();
    }
  }

  // Get current status
  getStatus() {
    return {
      isCollecting: this.isCollecting,
      lastCollection: this.lastCollection,
      collectionInterval: this.collectionInterval,
      performanceMetrics: this.performanceMetrics,
    };
  }

  // Manual collection trigger
  async collectNow() {
    await this.collectTelemetry();
  }
}

// Global instance
window.telemetryCollector = null;

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  // Set app start time for uptime calculation
  if (!localStorage.getItem("app_start_time")) {
    localStorage.setItem("app_start_time", Date.now().toString());
  }

  window.telemetryCollector = new TelemetryCollector();
});
