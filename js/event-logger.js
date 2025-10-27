// Comprehensive Event Logging System
// Tracks app lifecycle, content downloads, diagnostics, and errors

class EventLogger {
  constructor() {
    this.isEnabled = true;
    this.eventQueue = [];
    this.maxQueueSize = 1000;
    this.flushInterval = 30000; // 30 seconds
    this.flushTimer = null;
    
    // Event type categories
    this.eventTypes = {
      APP_LIFECYCLE: ['APP_STARTED', 'APP_PAUSED', 'APP_RESUMED', 'APP_STOPPED', 'APP_CRASH'],
      CONTENT: ['CONTENT_DOWNLOAD_STARTED', 'CONTENT_DOWNLOAD_PROGRESS', 'CONTENT_DOWNLOAD_COMPLETED', 'CONTENT_DOWNLOAD_FAILED'],
      PLAYBACK: ['PLAYBACK_STARTED', 'PLAYBACK_COMPLETED', 'PLAYBACK_ERROR', 'PLAYBACK_SKIPPED'],
      NETWORK: ['NETWORK_CONNECTED', 'NETWORK_DISCONNECTED', 'NETWORK_ERROR', 'NETWORK_SLOW'],
      DIAGNOSTICS: ['DIAGNOSTIC_INFO', 'DIAGNOSTIC_WARNING', 'DIAGNOSTIC_ERROR'],
      USER_INTERACTION: ['USER_INPUT', 'NAVIGATION', 'SETTINGS_CHANGED'],
      SYSTEM: ['MEMORY_WARNING', 'STORAGE_WARNING', 'PERFORMANCE_ISSUE']
    };

    this.init();
  }

  init() {
    this.setupAppLifecycleListeners();
    this.setupErrorHandlers();
    this.startPeriodicFlush();
    
    // Log app start
    this.logEvent('APP_STARTED', {
      reason: 'USER_LAUNCH',
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      platform: navigator.platform
    });

    logInfo('EventLogger initialized');
  }

  setupAppLifecycleListeners() {
    // Page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.logEvent('APP_PAUSED', {
          reason: 'VISIBILITY_HIDDEN',
          timestamp: new Date().toISOString()
        });
      } else {
        this.logEvent('APP_RESUMED', {
          reason: 'VISIBILITY_VISIBLE',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Page unload
    window.addEventListener('beforeunload', () => {
      this.logEvent('APP_STOPPED', {
        reason: 'PAGE_UNLOAD',
        timestamp: new Date().toISOString()
      });
      this.flushEvents(); // Immediate flush on app close
    });

    // Tizen app lifecycle events (if available)
    if (tizen && tizen.application) {
      try {
        tizen.application.getCurrentApplication().addEventListener('lowbattery', () => {
          this.logEvent('DIAGNOSTIC_WARNING', {
            context: 'System',
            message: 'Low battery detected'
          });
        });
      } catch (error) {
        logWarn('Failed to setup Tizen app lifecycle listeners:', error);
      }
    }
  }

  setupErrorHandlers() {
    // Global error handler
    window.addEventListener('error', (event) => {
      this.logEvent('DIAGNOSTIC_ERROR', {
        context: 'JavaScript',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error ? event.error.stack : null
      });
    });

    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.logEvent('DIAGNOSTIC_ERROR', {
        context: 'Promise',
        message: 'Unhandled promise rejection',
        reason: event.reason,
        stack: event.reason && event.reason.stack ? event.reason.stack : null
      });
    });

    // Override console.error to capture errors
    const originalConsoleError = console.error;
    console.error = (...args) => {
      this.logEvent('DIAGNOSTIC_ERROR', {
        context: 'Console',
        message: args.join(' '),
        arguments: args
      });
      originalConsoleError.apply(console, args);
    };
  }

  logEvent(eventType, payload = {}) {
    if (!this.isEnabled) {
      return;
    }

    const event = {
      eventId: generateUUID(),
      timestamp: new Date().toISOString(),
      eventType: eventType,
      payload: {
        ...payload,
        deviceId: localStorage.getItem('device_id'),
        groupId: localStorage.getItem('group_id'),
        sessionId: this.getSessionId()
      }
    };

    // Add to queue
    this.eventQueue.push(event);

    // Manage queue size
    if (this.eventQueue.length > this.maxQueueSize) {
      this.eventQueue.shift(); // Remove oldest event
    }

    // Log to console for debugging
    logInfo('Event logged:', eventType, payload);

    // Immediate flush for critical events
    if (this.isCriticalEvent(eventType)) {
      this.flushEvents();
    }

    return event;
  }

  isCriticalEvent(eventType) {
    const criticalEvents = [
      'APP_CRASH', 'DIAGNOSTIC_ERROR', 'NETWORK_ERROR', 
      'PLAYBACK_ERROR', 'CONTENT_DOWNLOAD_FAILED'
    ];
    return criticalEvents.includes(eventType);
  }

  getSessionId() {
    let sessionId = sessionStorage.getItem('session_id');
    if (!sessionId) {
      sessionId = generateUUID();
      sessionStorage.setItem('session_id', sessionId);
    }
    return sessionId;
  }

  startPeriodicFlush() {
    this.flushTimer = setInterval(() => {
      this.flushEvents();
    }, this.flushInterval);
  }

  async flushEvents() {
    if (this.eventQueue.length === 0) {
      return;
    }

    const eventsToFlush = [...this.eventQueue];
    this.eventQueue = [];

    try {
      // Send events to data manager
      if (window.dataManager) {
        for (const event of eventsToFlush) {
          await window.dataManager.recordEvent({
            eventType: event.eventType,
            payload: event.payload
          });
        }
        logInfo('Flushed events to data manager:', eventsToFlush.length);
      } else {
        // If data manager not available, put events back in queue
        this.eventQueue.unshift(...eventsToFlush);
        logWarn('DataManager not available, events returned to queue');
      }
    } catch (error) {
      logError('Failed to flush events:', error);
      // Put events back in queue for retry
      this.eventQueue.unshift(...eventsToFlush);
    }
  }

  // Specific event logging methods
  logContentDownload(action, fileName, details = {}) {
    const eventType = `CONTENT_DOWNLOAD_${action.toUpperCase()}`;
    this.logEvent(eventType, {
      fileName: fileName,
      ...details
    });
  }

  logPlaybackEvent(action, adId, details = {}) {
    const eventType = `PLAYBACK_${action.toUpperCase()}`;
    this.logEvent(eventType, {
      adId: adId,
      ...details
    });
  }

  logNetworkEvent(action, details = {}) {
    const eventType = `NETWORK_${action.toUpperCase()}`;
    this.logEvent(eventType, details);
  }

  logDiagnostic(level, context, message, details = {}) {
    const eventType = `DIAGNOSTIC_${level.toUpperCase()}`;
    this.logEvent(eventType, {
      context: context,
      message: message,
      ...details
    });
  }

  logUserInteraction(action, details = {}) {
    this.logEvent('USER_INPUT', {
      action: action,
      ...details
    });
  }

  logSystemEvent(eventType, details = {}) {
    this.logEvent(eventType, details);
  }

  // Performance and memory monitoring
  logPerformanceIssue(type, details = {}) {
    this.logEvent('PERFORMANCE_ISSUE', {
      issueType: type,
      ...details
    });
  }

  logMemoryWarning(usage, threshold) {
    this.logEvent('MEMORY_WARNING', {
      currentUsage: usage,
      threshold: threshold,
      timestamp: new Date().toISOString()
    });
  }

  // Get statistics
  getStats() {
    const eventTypeCounts = {};
    this.eventQueue.forEach(event => {
      eventTypeCounts[event.eventType] = (eventTypeCounts[event.eventType] || 0) + 1;
    });

    return {
      queueSize: this.eventQueue.length,
      maxQueueSize: this.maxQueueSize,
      isEnabled: this.isEnabled,
      eventTypeCounts: eventTypeCounts,
      flushInterval: this.flushInterval
    };
  }

  // Configuration methods
  setEnabled(enabled) {
    this.isEnabled = enabled;
    logInfo('Event logging', enabled ? 'enabled' : 'disabled');
  }

  setFlushInterval(interval) {
    this.flushInterval = interval;
    
    // Restart timer with new interval
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.startPeriodicFlush();
    }
    
    logInfo('Event flush interval set to:', interval);
  }

  // Manual flush trigger
  async forceFlush() {
    await this.flushEvents();
  }

  // Cleanup
  destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushEvents(); // Final flush
    logInfo('EventLogger destroyed');
  }
}

// Integration with existing systems
class EventLoggerIntegration {
  static setupDownloadTracking() {
    // Override download tracking functions to add event logging
    const originalTrackDownloadProgress = window.trackDownloadProgress;
    if (originalTrackDownloadProgress) {
      window.trackDownloadProgress = function(fileName, url, progress) {
        originalTrackDownloadProgress(fileName, url, progress);
        
        if (window.eventLogger) {
          if (progress === 0) {
            window.eventLogger.logContentDownload('started', fileName, { url });
          } else if (progress === 100) {
            window.eventLogger.logContentDownload('completed', fileName, { url });
          } else {
            window.eventLogger.logContentDownload('progress', fileName, { url, progress });
          }
        }
      };
    }
  }

  static setupNetworkTracking() {
    // Integrate with network monitor
    if (window.networkMonitor) {
      window.networkMonitor.addListener((event, status) => {
        if (window.eventLogger) {
          window.eventLogger.logNetworkEvent(event, status);
        }
      });
    }
  }

  static setupErrorTracking() {
    // Override error logging functions
    const originalAddErrorLog = window.addErrorLog;
    if (originalAddErrorLog) {
      window.addErrorLog = function(message) {
        originalAddErrorLog(message);
        
        if (window.eventLogger) {
          window.eventLogger.logDiagnostic('error', 'Application', message);
        }
      };
    }
  }
}

// Global instance
window.eventLogger = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.eventLogger = new EventLogger();
  
  // Setup integrations
  EventLoggerIntegration.setupDownloadTracking();
  EventLoggerIntegration.setupNetworkTracking();
  EventLoggerIntegration.setupErrorTracking();
});
