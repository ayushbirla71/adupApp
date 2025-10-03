// Simple Memory Management for ADUP Application
// Lightweight solution to prevent memory issues

(function () {
  "use strict";

  // Initialize console log counter
  window.CONSOLE_LOG_COUNT = 0;

  // Store original console methods
  const originalConsole = {
    log: console.log.bind(console),
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    info: console.info.bind(console),
  };

  // Simple console log limiting
  console.log = function (...args) {
    window.CONSOLE_LOG_COUNT++;
    if (window.CONSOLE_LOG_COUNT <= window.MAX_CONSOLE_LOGS) {
      originalConsole.log(...args);
    } else if (window.CONSOLE_LOG_COUNT === window.MAX_CONSOLE_LOGS + 1) {
      originalConsole.warn(
        "🚨 Console log limit reached. Further logs suppressed to save memory."
      );
    }

    // Reset counter periodically
    if (window.CONSOLE_LOG_COUNT > window.MAX_CONSOLE_LOGS * 3) {
      window.CONSOLE_LOG_COUNT = 0;
    }
  };

  // Keep other console methods working normally
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;

  // Simple log rotation function
  function rotateLogsIfNeeded() {
    const maxEntries = window.MAX_LOG_ENTRIES || 100;

    // Rotate INFO_LOGS
    if (window.INFO_LOGS && window.INFO_LOGS.length > maxEntries) {
      const keepCount = Math.floor(maxEntries / 2);
      window.INFO_LOGS = window.INFO_LOGS.slice(-keepCount);
      addInfoLog(`🔄 Rotated info logs, kept ${keepCount} entries`);
    }

    // Rotate ERROR_LOGS
    if (window.ERROR_LOGS && window.ERROR_LOGS.length > maxEntries) {
      const keepCount = Math.floor(maxEntries / 2);
      window.ERROR_LOGS = window.ERROR_LOGS.slice(-keepCount);
      addErrorLog(`🔄 Rotated error logs, kept ${keepCount} entries`);
    }

    // Rotate DOWNLOADED_FILES
    if (
      window.DOWNLOADED_FILES &&
      window.DOWNLOADED_FILES.length > maxEntries
    ) {
      const keepCount = Math.floor(maxEntries / 2);
      window.DOWNLOADED_FILES = window.DOWNLOADED_FILES.slice(-keepCount);
    }
  }

  // Enhanced addInfoLog with automatic rotation
  const originalAddInfoLog = window.addInfoLog;
  window.addInfoLog = function (message) {
    if (originalAddInfoLog) {
      originalAddInfoLog(message);
    } else {
      const time = new Date().toLocaleTimeString();
      window.INFO_LOGS.push(`[${time}] ${message}`);
    }

    // Automatic rotation when logs get too large
    if (window.INFO_LOGS.length > (window.MAX_LOG_ENTRIES || 100)) {
      console.log("🔄 Auto-rotating info logs");
      rotateLogsIfNeeded();
    }

    // Emergency cleanup if logs are extremely high
    if (window.INFO_LOGS.length > (window.MAX_LOG_ENTRIES || 100) * 2) {
      console.log("🚨 Emergency log cleanup triggered");
      window.INFO_LOGS = window.INFO_LOGS.slice(-20); // Keep only last 20
    }
  };

  // Enhanced addErrorLog with automatic rotation
  const originalAddErrorLog = window.addErrorLog;
  window.addErrorLog = function (message) {
    if (originalAddErrorLog) {
      originalAddErrorLog(message);
    } else {
      const time = new Date().toLocaleTimeString();
      window.ERROR_LOGS.push(`[${time}] ${message}`);
    }

    // Automatic rotation when error logs get too large
    if (window.ERROR_LOGS.length > (window.MAX_LOG_ENTRIES || 100)) {
      console.log("🔄 Auto-rotating error logs");
      rotateLogsIfNeeded();
    }

    // Emergency cleanup if error logs are extremely high
    if (window.ERROR_LOGS.length > (window.MAX_LOG_ENTRIES || 100) * 2) {
      console.log("🚨 Emergency error log cleanup triggered");
      window.ERROR_LOGS = window.ERROR_LOGS.slice(-20); // Keep only last 20
    }
  };

  // Simple logging functions for different contexts
  window.logInfo = function (message, ...args) {
    if (args.length > 0) {
      console.log(`ℹ️ ${message}`, ...args);
    } else {
      console.log(`ℹ️ ${message}`);
    }
    window.addInfoLog(message);
  };

  window.logError = function (message, ...args) {
    if (args.length > 0) {
      console.error(`❌ ${message}`, ...args);
    } else {
      console.error(`❌ ${message}`);
    }
    window.addErrorLog(message);
  };

  window.logWarn = function (message, ...args) {
    if (args.length > 0) {
      console.warn(`⚠️ ${message}`, ...args);
    } else {
      console.warn(`⚠️ ${message}`);
    }
    window.addInfoLog(`WARN: ${message}`);
  };

  window.logDebug = function (message, ...args) {
    if (window.CONSOLE_LOG_COUNT <= window.MAX_CONSOLE_LOGS) {
      if (args.length > 0) {
        console.log(`🐛 ${message}`, ...args);
      } else {
        console.log(`🐛 ${message}`);
      }
    }
  };

  // Context-specific logging
  window.logMqtt = function (message, ...args) {
    window.logInfo(`📡 MQTT: ${message}`, ...args);
  };

  window.logVideo = function (message, ...args) {
    window.logInfo(`🎥 VIDEO: ${message}`, ...args);
  };

  window.logDownload = function (message, ...args) {
    window.logInfo(`⬇️ DOWNLOAD: ${message}`, ...args);
  };

  window.logCleanup = function (message, ...args) {
    window.logInfo(`🧹 CLEANUP: ${message}`, ...args);
  };

  window.logMemory = function (message, ...args) {
    window.logDebug(`💾 MEMORY: ${message}`, ...args);
  };

  window.logPerformance = function (message, ...args) {
    window.logDebug(`⚡ PERF: ${message}`, ...args);
  };

  // Simple managed timeout/interval functions
  const activeTimeouts = new Set();
  const activeIntervals = new Set();

  window.managedSetTimeout = function (callback, delay) {
    const timeoutId = setTimeout(() => {
      activeTimeouts.delete(timeoutId);
      try {
        callback();
      } catch (error) {
        window.logError("Timeout callback error:", error);
      }
    }, delay);

    activeTimeouts.add(timeoutId);
    return timeoutId;
  };

  window.managedSetInterval = function (callback, interval) {
    const intervalId = setInterval(() => {
      try {
        callback();
      } catch (error) {
        window.logError("Interval callback error:", error);
        window.clearManagedInterval(intervalId);
      }
    }, interval);

    activeIntervals.add(intervalId);
    return intervalId;
  };

  window.clearManagedTimeout = function (timeoutId) {
    clearTimeout(timeoutId);
    activeTimeouts.delete(timeoutId);
  };

  window.clearManagedInterval = function (intervalId) {
    clearInterval(intervalId);
    activeIntervals.delete(intervalId);
  };

  // Memory statistics function
  window.getMemoryStats = function () {
    return {
      infoLogs: window.INFO_LOGS ? window.INFO_LOGS.length : 0,
      errorLogs: window.ERROR_LOGS ? window.ERROR_LOGS.length : 0,
      downloadedFiles: window.DOWNLOADED_FILES
        ? window.DOWNLOADED_FILES.length
        : 0,
      downloadStatus: window.DOWNLOAD_STATUS
        ? window.DOWNLOAD_STATUS.length
        : 0,
      consoleLogCount: window.CONSOLE_LOG_COUNT || 0,
      activeTimeouts: activeTimeouts.size,
      activeIntervals: activeIntervals.size,
    };
  };

  // Force garbage collection function
  window.forceGarbageCollection = function () {
    if (window.gc && typeof window.gc === "function") {
      try {
        window.gc();
        window.addInfoLog("Forced garbage collection");
        return true;
      } catch (e) {
        window.addErrorLog("Failed to force garbage collection: " + e.message);
        return false;
      }
    } else {
      window.addInfoLog("Garbage collection not available");
      return false;
    }
  };

  // Cleanup all managed resources
  window.cleanupAllResources = function () {
    // Clear all managed timeouts
    activeTimeouts.forEach((id) => clearTimeout(id));
    activeTimeouts.clear();

    // Clear all managed intervals
    activeIntervals.forEach((id) => clearInterval(id));
    activeIntervals.clear();

    window.logCleanup(
      `Cleaned up ${
        activeTimeouts.size + activeIntervals.size
      } managed resources`
    );
  };

  // Enhanced automatic memory management
  setInterval(() => {
    const stats = window.getMemoryStats();
    const totalLogs = stats.infoLogs + stats.errorLogs;

    // Automatic log rotation when 80% full
    if (totalLogs > (window.MAX_LOG_ENTRIES || 100) * 0.8) {
      console.log("🔄 Auto-rotating logs due to high usage");
      rotateLogsIfNeeded();
    }

    // Emergency cleanup when logs are very high
    if (totalLogs > (window.MAX_LOG_ENTRIES || 100) * 1.5) {
      console.log("🚨 Emergency cleanup triggered");
      window.emergencyMemoryCleanup();
    }

    // Auto garbage collection every 2 minutes if available
    if (
      Date.now() % 120000 < 30000 &&
      window.gc &&
      typeof window.gc === "function"
    ) {
      try {
        window.gc();
        console.log("♻️ Auto garbage collection performed");
      } catch (e) {
        // Ignore if GC fails
      }
    }

    // Cleanup old timeouts/intervals if too many
    if (stats.activeTimeouts > 20 || stats.activeIntervals > 10) {
      console.log("🧹 Auto-cleaning old resources");
      window.cleanupAllResources();
    }

    // Log memory stats every 5 minutes (less verbose)
    if (Date.now() % 300000 < 30000) {
      console.log(
        `📊 Memory: Logs=${totalLogs}, Console=${
          stats.consoleLogCount
        }, Resources=${stats.activeTimeouts + stats.activeIntervals}`
      );
    }
  }, 15000); // Check every 15 seconds for more responsive cleanup

  // Cleanup on page unload
  window.addEventListener("beforeunload", () => {
    window.cleanupAllResources();
    window.logCleanup("Page unload cleanup performed");
  });

  // Initialize
  window.addInfoLog("Simple memory manager initialized");
})();
