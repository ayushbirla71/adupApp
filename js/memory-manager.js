// Memory Management System for ADUP Application
// Prevents memory leaks and manages resource usage

class MemoryManager {
  constructor() {
    this.timeouts = new Set();
    this.intervals = new Set();
    this.eventListeners = new Map();
    this.memoryCheckInterval = null;
    this.isMonitoring = false;
    
    // Initialize memory monitoring
    this.startMemoryMonitoring();
  }

  // Enhanced Console Logging with Memory Management
  createManagedConsole() {
    const originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info
    };

    // Override console methods
    console.log = (...args) => {
      window.CONSOLE_LOG_COUNT++;
      if (window.CONSOLE_LOG_COUNT <= window.MAX_CONSOLE_LOGS) {
        originalConsole.log(...args);
      } else if (window.CONSOLE_LOG_COUNT === window.MAX_CONSOLE_LOGS + 1) {
        originalConsole.warn('🚨 Console log limit reached. Suppressing further logs to save memory.');
      }
    };

    console.error = (...args) => {
      originalConsole.error(...args); // Always show errors
    };

    console.warn = (...args) => {
      originalConsole.warn(...args); // Always show warnings
    };

    console.info = (...args) => {
      if (window.CONSOLE_LOG_COUNT <= window.MAX_CONSOLE_LOGS) {
        originalConsole.info(...args);
      }
    };

    // Store original methods for restoration
    this.originalConsole = originalConsole;
  }

  // Managed setTimeout with automatic cleanup tracking
  managedSetTimeout(callback, delay) {
    const timeoutId = setTimeout(() => {
      this.timeouts.delete(timeoutId);
      callback();
    }, delay);
    
    this.timeouts.add(timeoutId);
    return timeoutId;
  }

  // Managed setInterval with automatic cleanup tracking
  managedSetInterval(callback, interval) {
    const intervalId = setInterval(callback, interval);
    this.intervals.add(intervalId);
    return intervalId;
  }

  // Clear specific timeout
  clearManagedTimeout(timeoutId) {
    clearTimeout(timeoutId);
    this.timeouts.delete(timeoutId);
  }

  // Clear specific interval
  clearManagedInterval(intervalId) {
    clearInterval(intervalId);
    this.intervals.delete(intervalId);
  }

  // Add event listener with tracking
  addManagedEventListener(element, event, handler, options = false) {
    element.addEventListener(event, handler, options);
    
    if (!this.eventListeners.has(element)) {
      this.eventListeners.set(element, []);
    }
    this.eventListeners.get(element).push({ event, handler, options });
  }

  // Remove specific event listener
  removeManagedEventListener(element, event, handler) {
    element.removeEventListener(event, handler);
    
    if (this.eventListeners.has(element)) {
      const listeners = this.eventListeners.get(element);
      const index = listeners.findIndex(l => l.event === event && l.handler === handler);
      if (index > -1) {
        listeners.splice(index, 1);
      }
      if (listeners.length === 0) {
        this.eventListeners.delete(element);
      }
    }
  }

  // Log Management with Rotation
  rotateLogs() {
    const maxEntries = window.MAX_LOG_ENTRIES;
    const threshold = Math.floor(maxEntries * (window.LOG_CLEANUP_THRESHOLD / 100));

    // Rotate INFO_LOGS
    if (window.INFO_LOGS.length > threshold) {
      const keepCount = Math.floor(maxEntries / 2);
      const removed = window.INFO_LOGS.length - keepCount;
      window.INFO_LOGS = window.INFO_LOGS.slice(-keepCount);
      this.addInfoLog(`🔄 Rotated logs: removed ${removed} old entries`);
    }

    // Rotate ERROR_LOGS
    if (window.ERROR_LOGS.length > threshold) {
      const keepCount = Math.floor(maxEntries / 2);
      const removed = window.ERROR_LOGS.length - keepCount;
      window.ERROR_LOGS = window.ERROR_LOGS.slice(-keepCount);
      this.addErrorLog(`🔄 Rotated error logs: removed ${removed} old entries`);
    }

    // Rotate DOWNLOADED_FILES
    if (window.DOWNLOADED_FILES.length > maxEntries) {
      const keepCount = Math.floor(maxEntries / 2);
      window.DOWNLOADED_FILES = window.DOWNLOADED_FILES.slice(-keepCount);
    }

    // Reset console log count periodically
    if (window.CONSOLE_LOG_COUNT > window.MAX_CONSOLE_LOGS * 2) {
      window.CONSOLE_LOG_COUNT = 0;
    }
  }

  // Enhanced logging functions
  addInfoLog(message) {
    const time = new Date().toLocaleTimeString();
    const logEntry = `[${time}] ${message}`;
    
    window.INFO_LOGS.push(logEntry);
    
    // Auto-rotate if needed
    if (window.INFO_LOGS.length > window.MAX_LOG_ENTRIES) {
      this.rotateLogs();
    }
  }

  addErrorLog(message) {
    const time = new Date().toLocaleTimeString();
    const logEntry = `[${time}] ${message}`;
    
    window.ERROR_LOGS.push(logEntry);
    
    // Auto-rotate if needed
    if (window.ERROR_LOGS.length > window.MAX_LOG_ENTRIES) {
      this.rotateLogs();
    }
  }

  // Memory monitoring
  startMemoryMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.memoryCheckInterval = this.managedSetInterval(() => {
      this.checkMemoryUsage();
    }, window.MEMORY_CHECK_INTERVAL);
  }

  stopMemoryMonitoring() {
    if (this.memoryCheckInterval) {
      this.clearManagedInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = null;
    }
    this.isMonitoring = false;
  }

  // Check memory usage and trigger cleanup if needed
  checkMemoryUsage() {
    const stats = this.getMemoryStats();
    
    // Log memory stats periodically
    this.addInfoLog(`📊 Memory: Logs=${stats.totalLogs}, Timeouts=${stats.timeouts}, Intervals=${stats.intervals}, Listeners=${stats.eventListeners}`);
    
    // Trigger cleanup if thresholds exceeded
    if (stats.totalLogs > window.MAX_LOG_ENTRIES * 0.8) {
      this.rotateLogs();
    }
    
    // Force garbage collection if available (Chrome DevTools)
    if (window.gc && typeof window.gc === 'function') {
      try {
        window.gc();
      } catch (e) {
        // Ignore if gc is not available
      }
    }
  }

  // Get memory statistics
  getMemoryStats() {
    return {
      totalLogs: window.INFO_LOGS.length + window.ERROR_LOGS.length,
      infoLogs: window.INFO_LOGS.length,
      errorLogs: window.ERROR_LOGS.length,
      downloadedFiles: window.DOWNLOADED_FILES.length,
      downloadStatus: window.DOWNLOAD_STATUS.length,
      timeouts: this.timeouts.size,
      intervals: this.intervals.size,
      eventListeners: this.eventListeners.size,
      consoleLogCount: window.CONSOLE_LOG_COUNT
    };
  }

  // Complete cleanup - call this when app is closing or restarting
  cleanup() {
    // Clear all timeouts
    this.timeouts.forEach(id => clearTimeout(id));
    this.timeouts.clear();
    
    // Clear all intervals
    this.intervals.forEach(id => clearInterval(id));
    this.intervals.clear();
    
    // Remove all event listeners
    this.eventListeners.forEach((listeners, element) => {
      listeners.forEach(({ event, handler }) => {
        element.removeEventListener(event, handler);
      });
    });
    this.eventListeners.clear();
    
    // Stop memory monitoring
    this.stopMemoryMonitoring();
    
    // Clear logs
    this.clearAllLogs();
    
    // Restore original console
    if (this.originalConsole) {
      Object.assign(console, this.originalConsole);
    }
    
    this.addInfoLog('🧹 Complete memory cleanup performed');
  }

  // Clear all logs
  clearAllLogs() {
    window.ERROR_LOGS.length = 0;
    window.INFO_LOGS.length = 0;
    window.DOWNLOADED_FILES.length = 0;
    window.DOWNLOAD_STATUS.length = 0;
    window.DOWNLOAD_PROGRESS.length = 0;
    window.CONSOLE_LOG_COUNT = 0;
    
    // Clear UI if elements exist
    const logList = document.getElementById("logList");
    const errorList = document.getElementById("error-list");
    const downloadedList = document.getElementById("downloaded-list");
    
    if (logList) logList.innerHTML = "";
    if (errorList) errorList.innerHTML = "";
    if (downloadedList) downloadedList.innerHTML = "";
  }

  // Emergency cleanup - for critical memory situations
  emergencyCleanup() {
    this.addErrorLog('🚨 Emergency memory cleanup triggered');
    
    // Aggressive log cleanup
    window.INFO_LOGS = window.INFO_LOGS.slice(-10);
    window.ERROR_LOGS = window.ERROR_LOGS.slice(-10);
    window.DOWNLOADED_FILES = window.DOWNLOADED_FILES.slice(-20);
    window.DOWNLOAD_STATUS.length = 0;
    window.DOWNLOAD_PROGRESS.length = 0;
    
    // Clear console count
    window.CONSOLE_LOG_COUNT = 0;
    
    // Force cleanup of DOM elements
    this.cleanupDOMElements();
    
    // Force garbage collection if available
    if (window.gc && typeof window.gc === 'function') {
      try {
        window.gc();
      } catch (e) {
        // Ignore if gc is not available
      }
    }
  }

  // Clean up DOM elements that might be holding references
  cleanupDOMElements() {
    // Clear any orphaned elements
    const orphanedElements = document.querySelectorAll('[data-cleanup="true"]');
    orphanedElements.forEach(el => el.remove());
    
    // Clear image sources to free memory
    const images = document.querySelectorAll('img');
    images.forEach(img => {
      if (img.src && img.src.startsWith('blob:')) {
        URL.revokeObjectURL(img.src);
      }
    });
  }
}

// Create global memory manager instance
window.memoryManager = new MemoryManager();

// Initialize managed console
window.memoryManager.createManagedConsole();

// Global cleanup function
window.performMemoryCleanup = function() {
  window.memoryManager.cleanup();
};

// Emergency cleanup function
window.emergencyMemoryCleanup = function() {
  window.memoryManager.emergencyCleanup();
};

// Enhanced logging functions (replace the ones in common.js)
window.addInfoLog = function(message) {
  window.memoryManager.addInfoLog(message);
};

window.addErrorLog = function(message) {
  window.memoryManager.addErrorLog(message);
};

// Managed timeout/interval functions
window.managedSetTimeout = function(callback, delay) {
  return window.memoryManager.managedSetTimeout(callback, delay);
};

window.managedSetInterval = function(callback, interval) {
  return window.memoryManager.managedSetInterval(callback, interval);
};

window.clearManagedTimeout = function(timeoutId) {
  window.memoryManager.clearManagedTimeout(timeoutId);
};

window.clearManagedInterval = function(intervalId) {
  window.memoryManager.clearManagedInterval(intervalId);
};
