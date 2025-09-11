// Enhanced Logging System with Memory Management
// Replaces console.log with controlled logging

class Logger {
  constructor() {
    this.logLevels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3,
      TRACE: 4
    };
    
    this.currentLevel = this.logLevels.INFO; // Default log level
    this.isProduction = false; // Set to true in production
  }

  setLogLevel(level) {
    if (typeof level === 'string') {
      this.currentLevel = this.logLevels[level.toUpperCase()] || this.logLevels.INFO;
    } else {
      this.currentLevel = level;
    }
  }

  setProduction(isProduction) {
    this.isProduction = isProduction;
    if (isProduction) {
      this.currentLevel = this.logLevels.WARN; // Only warnings and errors in production
    }
  }

  // Enhanced logging methods
  error(message, ...args) {
    if (this.currentLevel >= this.logLevels.ERROR) {
      console.error(`❌ [ERROR] ${message}`, ...args);
      if (window.addErrorLog) {
        window.addErrorLog(`${message} ${args.length ? JSON.stringify(args) : ''}`);
      }
    }
  }

  warn(message, ...args) {
    if (this.currentLevel >= this.logLevels.WARN) {
      console.warn(`⚠️ [WARN] ${message}`, ...args);
      if (window.addInfoLog) {
        window.addInfoLog(`WARN: ${message} ${args.length ? JSON.stringify(args) : ''}`);
      }
    }
  }

  info(message, ...args) {
    if (this.currentLevel >= this.logLevels.INFO && !this.isProduction) {
      console.info(`ℹ️ [INFO] ${message}`, ...args);
      if (window.addInfoLog) {
        window.addInfoLog(`${message} ${args.length ? JSON.stringify(args) : ''}`);
      }
    }
  }

  debug(message, ...args) {
    if (this.currentLevel >= this.logLevels.DEBUG && !this.isProduction) {
      console.log(`🐛 [DEBUG] ${message}`, ...args);
    }
  }

  trace(message, ...args) {
    if (this.currentLevel >= this.logLevels.TRACE && !this.isProduction) {
      console.log(`🔍 [TRACE] ${message}`, ...args);
    }
  }

  // Special logging methods for different contexts
  mqtt(message, ...args) {
    this.info(`📡 MQTT: ${message}`, ...args);
  }

  video(message, ...args) {
    this.info(`🎥 VIDEO: ${message}`, ...args);
  }

  download(message, ...args) {
    this.info(`⬇️ DOWNLOAD: ${message}`, ...args);
  }

  cleanup(message, ...args) {
    this.info(`🧹 CLEANUP: ${message}`, ...args);
  }

  memory(message, ...args) {
    this.debug(`💾 MEMORY: ${message}`, ...args);
  }

  performance(message, ...args) {
    this.debug(`⚡ PERF: ${message}`, ...args);
  }

  // Group logging for related operations
  group(label) {
    if (this.currentLevel >= this.logLevels.DEBUG && !this.isProduction) {
      console.group(label);
    }
  }

  groupEnd() {
    if (this.currentLevel >= this.logLevels.DEBUG && !this.isProduction) {
      console.groupEnd();
    }
  }

  // Time logging for performance monitoring
  time(label) {
    if (this.currentLevel >= this.logLevels.DEBUG && !this.isProduction) {
      console.time(label);
    }
  }

  timeEnd(label) {
    if (this.currentLevel >= this.logLevels.DEBUG && !this.isProduction) {
      console.timeEnd(label);
    }
  }

  // Table logging for structured data
  table(data) {
    if (this.currentLevel >= this.logLevels.DEBUG && !this.isProduction) {
      console.table(data);
    }
  }
}

// Create global logger instance
window.logger = new Logger();

// Convenience functions for backward compatibility
window.logError = function(message, ...args) {
  window.logger.error(message, ...args);
};

window.logWarn = function(message, ...args) {
  window.logger.warn(message, ...args);
};

window.logInfo = function(message, ...args) {
  window.logger.info(message, ...args);
};

window.logDebug = function(message, ...args) {
  window.logger.debug(message, ...args);
};

// Context-specific logging functions
window.logMqtt = function(message, ...args) {
  window.logger.mqtt(message, ...args);
};

window.logVideo = function(message, ...args) {
  window.logger.video(message, ...args);
};

window.logDownload = function(message, ...args) {
  window.logger.download(message, ...args);
};

window.logCleanup = function(message, ...args) {
  window.logger.cleanup(message, ...args);
};

window.logMemory = function(message, ...args) {
  window.logger.memory(message, ...args);
};

window.logPerformance = function(message, ...args) {
  window.logger.performance(message, ...args);
};

// Production mode detection
if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
  window.logger.setProduction(true);
}

// Memory-aware console override (less aggressive than memory-manager.js)
const originalConsoleLog = console.log;
let consoleLogCount = 0;
const MAX_CONSOLE_LOGS_LOGGER = 200;

console.log = function(...args) {
  consoleLogCount++;
  if (consoleLogCount <= MAX_CONSOLE_LOGS_LOGGER) {
    originalConsoleLog.apply(console, args);
  } else if (consoleLogCount === MAX_CONSOLE_LOGS_LOGGER + 1) {
    originalConsoleLog.warn('🚨 Logger: Console log limit reached. Use logger.info() instead.');
  }
  
  // Reset count periodically
  if (consoleLogCount > MAX_CONSOLE_LOGS_LOGGER * 2) {
    consoleLogCount = 0;
  }
};
