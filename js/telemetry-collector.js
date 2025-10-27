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
      networkLatency: []
    };

    this.init();
  }

  init() {
    logInfo('TelemetryCollector initialized');
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

    logInfo('Telemetry collection started');
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

    logInfo('Telemetry collection stopped');
  }

  async collectTelemetry() {
    try {
      const telemetryData = await this.gatherSystemMetrics();
      
      // Store in data manager
      if (window.dataManager) {
        await window.dataManager.recordTelemetry(telemetryData);
      }

      this.lastCollection = new Date().toISOString();
      logInfo('Telemetry collected successfully');

    } catch (error) {
      logError('Failed to collect telemetry:', error);
    }
  }

  async gatherSystemMetrics() {
    const metrics = {
      timestamp: new Date().toISOString(),
      cpuUsage: await this.getCPUUsage(),
      ramFreeMb: await this.getAvailableRAM(),
      storageInfo: await this.getStorageInfo(),
      networkInfo: await this.getNetworkInfo(),
      displayInfo: await this.getDisplayInfo(),
      batteryInfo: await this.getBatteryInfo(),
      performanceMetrics: this.getPerformanceMetrics()
    };

    return metrics;
  }

  async getCPUUsage() {
    try {
      // Try to get CPU usage from Tizen system info
      if (tizen && tizen.systeminfo) {
        return new Promise((resolve) => {
          tizen.systeminfo.getPropertyValue('CPU', 
            (cpu) => {
              // CPU load is typically a value between 0 and 1
              resolve(cpu.load || this.estimateCPUUsage());
            },
            () => {
              resolve(this.estimateCPUUsage());
            }
          );
        });
      }
    } catch (error) {
      logWarn('Failed to get CPU usage from Tizen API:', error);
    }

    return this.estimateCPUUsage();
  }

  estimateCPUUsage() {
    // Estimate CPU usage based on performance metrics
    const baseUsage = 0.2; // Base system usage
    const playbackUsage = window.currentVideo ? 0.3 : 0; // Additional usage during playback
    const downloadUsage = window.DOWNLOAD_PROGRESS && window.DOWNLOAD_PROGRESS.length > 0 ? 0.2 : 0;
    
    return Math.min(baseUsage + playbackUsage + downloadUsage + (Math.random() * 0.1), 1.0);
  }

  async getAvailableRAM() {
    try {
      // Try to get memory info from Tizen system info
      if (tizen && tizen.systeminfo) {
        return new Promise((resolve) => {
          tizen.systeminfo.getPropertyValue('MEMORY', 
            (memory) => {
              // Convert to MB and return available memory
              const availableMB = memory.available ? Math.floor(memory.available / (1024 * 1024)) : null;
              resolve(availableMB || this.estimateAvailableRAM());
            },
            () => {
              resolve(this.estimateAvailableRAM());
            }
          );
        });
      }
    } catch (error) {
      logWarn('Failed to get memory info from Tizen API:', error);
    }

    return this.estimateAvailableRAM();
  }

  estimateAvailableRAM() {
    // Estimate available RAM (typical Tizen TV has 1-4GB)
    const baseRAM = 2000; // 2GB base
    const usedByApp = 200 + (window.localAds ? window.localAds.length * 50 : 0); // Estimate app usage
    return Math.max(baseRAM - usedByApp + (Math.random() * 200 - 100), 500);
  }

  async getStorageInfo() {
    try {
      if (tizen && tizen.filesystem) {
        return new Promise((resolve) => {
          tizen.filesystem.resolve('downloads', 
            (dir) => {
              // Get storage info for downloads directory
              resolve({
                downloadPath: dir.toURI(),
                available: 'unknown' // Tizen doesn't easily provide storage space
              });
            },
            () => {
              resolve({ available: 'unknown', error: 'Cannot access storage' });
            }
          );
        });
      }
    } catch (error) {
      logWarn('Failed to get storage info:', error);
    }

    return { available: 'unknown', error: 'Storage API not available' };
  }

  async getNetworkInfo() {
    try {
      const networkInfo = {
        isOnline: navigator.onLine,
        connectionType: 'unknown',
        effectiveType: 'unknown'
      };

      // Try to get network connection info
      if (navigator.connection) {
        networkInfo.connectionType = navigator.connection.type || 'unknown';
        networkInfo.effectiveType = navigator.connection.effectiveType || 'unknown';
        networkInfo.downlink = navigator.connection.downlink || null;
        networkInfo.rtt = navigator.connection.rtt || null;
      }

      // Add network quality from network monitor
      if (window.networkMonitor) {
        const status = window.networkMonitor.getStatus();
        networkInfo.quality = status.quality;
        networkInfo.lastCheck = status.lastCheck;
      }

      return networkInfo;
    } catch (error) {
      logWarn('Failed to get network info:', error);
      return { isOnline: navigator.onLine, error: error.message };
    }
  }

  async getDisplayInfo() {
    try {
      if (tizen && tizen.systeminfo) {
        return new Promise((resolve) => {
          tizen.systeminfo.getPropertyValue('DISPLAY', 
            (display) => {
              resolve({
                width: display.resolutionWidth || window.screen.width,
                height: display.resolutionHeight || window.screen.height,
                colorDepth: display.colorDepth || window.screen.colorDepth,
                pixelDepth: display.pixelDepth || window.screen.pixelDepth
              });
            },
            () => {
              resolve({
                width: window.screen.width,
                height: window.screen.height,
                colorDepth: window.screen.colorDepth,
                pixelDepth: window.screen.pixelDepth
              });
            }
          );
        });
      }
    } catch (error) {
      logWarn('Failed to get display info:', error);
    }

    return {
      width: window.screen.width,
      height: window.screen.height,
      colorDepth: window.screen.colorDepth,
      pixelDepth: window.screen.pixelDepth
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
          dischargingTime: battery.dischargingTime
        };
      }
    } catch (error) {
      logWarn('Failed to get battery info:', error);
    }

    return { available: false, error: 'Battery API not supported' };
  }

  getPerformanceMetrics() {
    return {
      memoryUsageHistory: this.performanceMetrics.memoryUsage.slice(-10), // Last 10 readings
      averageDownloadSpeed: this.calculateAverageDownloadSpeed(),
      playbackErrorCount: this.performanceMetrics.playbackErrors,
      averageNetworkLatency: this.calculateAverageLatency(),
      uptime: this.getUptime()
    };
  }

  calculateAverageDownloadSpeed() {
    if (this.performanceMetrics.downloadSpeeds.length === 0) {
      return 0;
    }
    
    const sum = this.performanceMetrics.downloadSpeeds.reduce((a, b) => a + b, 0);
    return sum / this.performanceMetrics.downloadSpeeds.length;
  }

  calculateAverageLatency() {
    if (this.performanceMetrics.networkLatency.length === 0) {
      return null;
    }
    
    const sum = this.performanceMetrics.networkLatency.reduce((a, b) => a + b, 0);
    return sum / this.performanceMetrics.networkLatency.length;
  }

  getUptime() {
    // Estimate app uptime (simplified)
    const startTime = localStorage.getItem('app_start_time');
    if (startTime) {
      return Date.now() - parseInt(startTime);
    }
    return 0;
  }

  // Methods to track performance metrics
  recordMemoryUsage(usage) {
    this.performanceMetrics.memoryUsage.push({
      timestamp: Date.now(),
      usage: usage
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
      performanceMetrics: this.performanceMetrics
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
document.addEventListener('DOMContentLoaded', () => {
  // Set app start time for uptime calculation
  if (!localStorage.getItem('app_start_time')) {
    localStorage.setItem('app_start_time', Date.now().toString());
  }
  
  window.telemetryCollector = new TelemetryCollector();
});
