// Resource Cleanup Utilities
// Provides enhanced cleanup for timeouts, intervals, event listeners, and DOM elements

class ResourceCleanup {
  constructor() {
    this.resources = {
      timeouts: new Map(),
      intervals: new Map(),
      eventListeners: new Map(),
      observers: new Set(),
      abortControllers: new Set(),
      mediaElements: new Set(),
      objectUrls: new Set()
    };
    
    this.setupGlobalCleanup();
  }

  // Enhanced timeout management
  createTimeout(callback, delay, label = 'unnamed') {
    const timeoutId = setTimeout(() => {
      this.resources.timeouts.delete(timeoutId);
      try {
        callback();
      } catch (error) {
        logError(`Timeout callback error (${label}):`, error);
      }
    }, delay);
    
    this.resources.timeouts.set(timeoutId, {
      label,
      created: Date.now(),
      delay
    });
    
    return timeoutId;
  }

  // Enhanced interval management
  createInterval(callback, interval, label = 'unnamed') {
    const intervalId = setInterval(() => {
      try {
        callback();
      } catch (error) {
        logError(`Interval callback error (${label}):`, error);
        this.clearInterval(intervalId);
      }
    }, interval);
    
    this.resources.intervals.set(intervalId, {
      label,
      created: Date.now(),
      interval
    });
    
    return intervalId;
  }

  // Clear specific timeout
  clearTimeout(timeoutId) {
    clearTimeout(timeoutId);
    this.resources.timeouts.delete(timeoutId);
  }

  // Clear specific interval
  clearInterval(intervalId) {
    clearInterval(intervalId);
    this.resources.intervals.delete(intervalId);
  }

  // Enhanced event listener management
  addEventListener(element, event, handler, options = false, label = 'unnamed') {
    element.addEventListener(event, handler, options);
    
    if (!this.resources.eventListeners.has(element)) {
      this.resources.eventListeners.set(element, []);
    }
    
    this.resources.eventListeners.get(element).push({
      event,
      handler,
      options,
      label,
      created: Date.now()
    });
  }

  // Remove specific event listener
  removeEventListener(element, event, handler) {
    element.removeEventListener(event, handler);
    
    if (this.resources.eventListeners.has(element)) {
      const listeners = this.resources.eventListeners.get(element);
      const index = listeners.findIndex(l => l.event === event && l.handler === handler);
      if (index > -1) {
        listeners.splice(index, 1);
      }
      if (listeners.length === 0) {
        this.resources.eventListeners.delete(element);
      }
    }
  }

  // Observer management (MutationObserver, IntersectionObserver, etc.)
  addObserver(observer, label = 'unnamed') {
    this.resources.observers.add({
      observer,
      label,
      created: Date.now()
    });
    return observer;
  }

  removeObserver(observer) {
    for (const item of this.resources.observers) {
      if (item.observer === observer) {
        observer.disconnect();
        this.resources.observers.delete(item);
        break;
      }
    }
  }

  // AbortController management
  createAbortController(label = 'unnamed') {
    const controller = new AbortController();
    this.resources.abortControllers.add({
      controller,
      label,
      created: Date.now()
    });
    return controller;
  }

  abortController(controller) {
    controller.abort();
    for (const item of this.resources.abortControllers) {
      if (item.controller === controller) {
        this.resources.abortControllers.delete(item);
        break;
      }
    }
  }

  // Media element management
  addMediaElement(element, label = 'unnamed') {
    this.resources.mediaElements.add({
      element,
      label,
      created: Date.now()
    });
  }

  removeMediaElement(element) {
    for (const item of this.resources.mediaElements) {
      if (item.element === element) {
        this.cleanupMediaElement(element);
        this.resources.mediaElements.delete(item);
        break;
      }
    }
  }

  // Object URL management
  createObjectURL(blob, label = 'unnamed') {
    const url = URL.createObjectURL(blob);
    this.resources.objectUrls.add({
      url,
      label,
      created: Date.now()
    });
    return url;
  }

  revokeObjectURL(url) {
    URL.revokeObjectURL(url);
    for (const item of this.resources.objectUrls) {
      if (item.url === url) {
        this.resources.objectUrls.delete(item);
        break;
      }
    }
  }

  // Cleanup specific media element
  cleanupMediaElement(element) {
    try {
      if (element.pause) element.pause();
      if (element.src) element.src = '';
      if (element.srcObject) element.srcObject = null;
      if (element.load) element.load();
    } catch (error) {
      logWarn('Media element cleanup error:', error);
    }
  }

  // Get resource statistics
  getResourceStats() {
    return {
      timeouts: this.resources.timeouts.size,
      intervals: this.resources.intervals.size,
      eventListeners: this.resources.eventListeners.size,
      observers: this.resources.observers.size,
      abortControllers: this.resources.abortControllers.size,
      mediaElements: this.resources.mediaElements.size,
      objectUrls: this.resources.objectUrls.size
    };
  }

  // Cleanup old resources (older than specified time)
  cleanupOldResources(maxAge = 300000) { // 5 minutes default
    const now = Date.now();
    let cleaned = 0;

    // Cleanup old timeouts
    for (const [id, info] of this.resources.timeouts) {
      if (now - info.created > maxAge) {
        this.clearTimeout(id);
        cleaned++;
      }
    }

    // Cleanup old intervals
    for (const [id, info] of this.resources.intervals) {
      if (now - info.created > maxAge) {
        this.clearInterval(id);
        cleaned++;
      }
    }

    // Cleanup old observers
    for (const item of this.resources.observers) {
      if (now - item.created > maxAge) {
        this.removeObserver(item.observer);
        cleaned++;
      }
    }

    // Cleanup old abort controllers
    for (const item of this.resources.abortControllers) {
      if (now - item.created > maxAge) {
        this.abortController(item.controller);
        cleaned++;
      }
    }

    // Cleanup old object URLs
    for (const item of this.resources.objectUrls) {
      if (now - item.created > maxAge) {
        this.revokeObjectURL(item.url);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logCleanup(`Cleaned up ${cleaned} old resources`);
    }

    return cleaned;
  }

  // Complete cleanup of all resources
  cleanupAll() {
    let cleaned = 0;

    // Clear all timeouts
    for (const [id] of this.resources.timeouts) {
      clearTimeout(id);
      cleaned++;
    }
    this.resources.timeouts.clear();

    // Clear all intervals
    for (const [id] of this.resources.intervals) {
      clearInterval(id);
      cleaned++;
    }
    this.resources.intervals.clear();

    // Remove all event listeners
    for (const [element, listeners] of this.resources.eventListeners) {
      listeners.forEach(({ event, handler }) => {
        element.removeEventListener(event, handler);
        cleaned++;
      });
    }
    this.resources.eventListeners.clear();

    // Disconnect all observers
    for (const item of this.resources.observers) {
      item.observer.disconnect();
      cleaned++;
    }
    this.resources.observers.clear();

    // Abort all controllers
    for (const item of this.resources.abortControllers) {
      item.controller.abort();
      cleaned++;
    }
    this.resources.abortControllers.clear();

    // Cleanup all media elements
    for (const item of this.resources.mediaElements) {
      this.cleanupMediaElement(item.element);
      cleaned++;
    }
    this.resources.mediaElements.clear();

    // Revoke all object URLs
    for (const item of this.resources.objectUrls) {
      URL.revokeObjectURL(item.url);
      cleaned++;
    }
    this.resources.objectUrls.clear();

    logCleanup(`Complete cleanup: removed ${cleaned} resources`);
    return cleaned;
  }

  // Setup global cleanup handlers
  setupGlobalCleanup() {
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      this.cleanupAll();
    });

    // Cleanup on visibility change (when tab becomes hidden)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.cleanupOldResources();
      }
    });

    // Periodic cleanup
    this.createInterval(() => {
      this.cleanupOldResources();
    }, 60000, 'periodic-cleanup'); // Every minute
  }

  // Debug: List all resources
  listResources() {
    console.group('📋 Resource Inventory');
    
    console.log('Timeouts:', Array.from(this.resources.timeouts.entries()));
    console.log('Intervals:', Array.from(this.resources.intervals.entries()));
    console.log('Event Listeners:', Array.from(this.resources.eventListeners.entries()));
    console.log('Observers:', Array.from(this.resources.observers));
    console.log('Abort Controllers:', Array.from(this.resources.abortControllers));
    console.log('Media Elements:', Array.from(this.resources.mediaElements));
    console.log('Object URLs:', Array.from(this.resources.objectUrls));
    
    console.groupEnd();
  }
}

// Create global resource cleanup instance
window.resourceCleanup = new ResourceCleanup();

// Global convenience functions
window.createManagedTimeout = function(callback, delay, label) {
  return window.resourceCleanup.createTimeout(callback, delay, label);
};

window.createManagedInterval = function(callback, interval, label) {
  return window.resourceCleanup.createInterval(callback, interval, label);
};

window.addManagedEventListener = function(element, event, handler, options, label) {
  return window.resourceCleanup.addEventListener(element, event, handler, options, label);
};

window.createManagedAbortController = function(label) {
  return window.resourceCleanup.createAbortController(label);
};

window.createManagedObjectURL = function(blob, label) {
  return window.resourceCleanup.createObjectURL(blob, label);
};

window.cleanupAllResources = function() {
  return window.resourceCleanup.cleanupAll();
};

window.getResourceStats = function() {
  return window.resourceCleanup.getResourceStats();
};
