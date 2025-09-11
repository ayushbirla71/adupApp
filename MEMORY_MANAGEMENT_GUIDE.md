# Memory Management System for ADUP Application

## Overview

This comprehensive memory management system prevents memory leaks, controls console logging, and manages resource usage to ensure your Tizen TV application runs efficiently without consuming excessive memory.

## Features Implemented

### 1. Memory Manager (`js/memory-manager.js`)
- **Log Rotation**: Automatically rotates logs when they exceed configured limits
- **Console Log Control**: Limits console.log output to prevent memory buildup
- **Memory Monitoring**: Periodic checks and automatic cleanup
- **Enhanced Logging**: Replaces basic logging with memory-aware versions

### 2. Logger System (`js/logger.js`)
- **Log Levels**: ERROR, WARN, INFO, DEBUG, TRACE
- **Context-Specific Logging**: MQTT, Video, Download, Cleanup, Memory, Performance
- **Production Mode**: Automatically reduces logging in production environments
- **Memory-Aware Console**: Prevents excessive console output

### 3. Resource Cleanup (`js/resource-cleanup.js`)
- **Timeout Management**: Tracks and cleans up timeouts automatically
- **Interval Management**: Manages setInterval calls with automatic cleanup
- **Event Listener Tracking**: Prevents event listener memory leaks
- **Observer Management**: Handles MutationObserver, IntersectionObserver cleanup
- **AbortController Management**: Tracks and aborts controllers properly
- **Media Element Cleanup**: Properly cleans up video/audio elements
- **Object URL Management**: Prevents blob URL memory leaks

### 4. Memory Monitoring Dashboard
- **Real-time Stats**: View current memory usage in the settings panel
- **Visual Indicators**: Color-coded warnings for high memory usage
- **Manual Controls**: Clear logs, emergency cleanup, force garbage collection

## Configuration

### Memory Limits (in `js/config.js`)
```javascript
window.MAX_LOG_ENTRIES = 100;        // Maximum log entries before rotation
window.MAX_CONSOLE_LOGS = 50;        // Maximum console logs before suppression
window.MEMORY_CHECK_INTERVAL = 30000; // Memory check every 30 seconds
window.LOG_CLEANUP_THRESHOLD = 80;    // Cleanup when 80% full
```

## Usage

### Basic Logging (Replaces console.log)
```javascript
// Instead of console.log
logInfo("Application started");
logError("Connection failed", error);
logWarn("High memory usage detected");
logDebug("Debug information");

// Context-specific logging
logMqtt("Connected to MQTT broker");
logVideo("Video playback started");
logDownload("File download complete");
logCleanup("Resources cleaned up");
logMemory("Memory usage: 45MB");
logPerformance("Operation took 150ms");
```

### Managed Resource Creation
```javascript
// Instead of setTimeout
const timeoutId = createManagedTimeout(() => {
  console.log("Timeout executed");
}, 5000, "my-timeout");

// Instead of setInterval
const intervalId = createManagedInterval(() => {
  console.log("Interval executed");
}, 1000, "my-interval");

// Instead of addEventListener
addManagedEventListener(element, 'click', handler, false, "click-handler");

// Instead of new AbortController()
const controller = createManagedAbortController("fetch-operation");

// Instead of URL.createObjectURL()
const url = createManagedObjectURL(blob, "video-blob");
```

### Manual Memory Management
```javascript
// Clear all logs
clearAllLogs();

// Perform complete memory cleanup
performMemoryCleanup();

// Emergency cleanup (aggressive)
emergencyMemoryCleanup();

// Force garbage collection (if available)
forceGarbageCollection();

// Get current resource statistics
const stats = getResourceStats();
console.log(stats);
```

### Memory Monitoring Dashboard
1. Open Settings (press appropriate key)
2. Navigate to "Memory" tab
3. View real-time memory statistics
4. Use action buttons for cleanup operations

## Memory Optimization Best Practices

### 1. Use Managed Functions
Always use the managed versions of resource-creating functions:
- `createManagedTimeout()` instead of `setTimeout()`
- `createManagedInterval()` instead of `setInterval()`
- `addManagedEventListener()` instead of `addEventListener()`

### 2. Proper Cleanup
The system automatically cleans up resources, but you can also:
```javascript
// Clear specific resources
clearManagedTimeout(timeoutId);
clearManagedInterval(intervalId);
resourceCleanup.removeEventListener(element, 'click', handler);
```

### 3. Log Level Management
```javascript
// Set log level (reduces output in production)
logger.setLogLevel('WARN'); // Only warnings and errors
logger.setProduction(true);  // Production mode
```

### 4. Monitor Memory Usage
```javascript
// Check memory stats periodically
const stats = memoryManager.getMemoryStats();
if (stats.totalLogs > 80) {
  memoryManager.rotateLogs();
}
```

## Automatic Features

### 1. Log Rotation
- Automatically rotates logs when they reach 80% of the maximum
- Keeps the most recent 50% of entries
- Logs rotation events for tracking

### 2. Console Log Suppression
- Stops console.log output after reaching the limit
- Shows warning when limit is reached
- Resets count periodically

### 3. Periodic Cleanup
- Runs every 30 seconds by default
- Cleans up old resources (older than 5 minutes)
- Monitors memory usage and triggers cleanup

### 4. Unload Cleanup
- Automatically cleans up all resources when page unloads
- Prevents memory leaks during navigation
- Stops all timers and intervals

## Troubleshooting

### High Memory Usage
1. Check the Memory dashboard for resource counts
2. Look for high numbers of timeouts, intervals, or event listeners
3. Use emergency cleanup if needed
4. Check for console log suppression messages

### Performance Issues
1. Reduce log level in production
2. Increase cleanup intervals if needed
3. Monitor resource statistics regularly
4. Use context-specific logging instead of generic console.log

### Memory Leaks
1. Always use managed resource functions
2. Check for orphaned event listeners
3. Ensure proper cleanup of media elements
4. Monitor object URL usage

## Integration Notes

### Files Modified
- `js/config.js` - Added memory configuration
- `js/common.js` - Updated logging functions
- `js/device-storage.js` - Replaced console.log with managed logging
- `js/main.js` - Added memory monitoring functions
- `index.html` - Added memory management scripts and UI
- `css/style.css` - Added memory dashboard styles

### New Files Added
- `js/memory-manager.js` - Core memory management system
- `js/logger.js` - Enhanced logging system
- `js/resource-cleanup.js` - Resource cleanup utilities

## Performance Impact

The memory management system is designed to be lightweight:
- Minimal overhead for resource tracking
- Efficient cleanup algorithms
- Optional features can be disabled if needed
- Production mode reduces logging overhead

## Browser Compatibility

- Works in all modern browsers
- Optimized for Tizen TV environment
- Graceful fallbacks for unsupported features
- Hardware acceleration where available

## Monitoring and Alerts

The system provides visual feedback:
- Green: Normal memory usage
- Yellow: Warning level (>50 items)
- Red: Critical level (>100 items)
- Toast notifications for cleanup operations
- Real-time statistics in the dashboard

This memory management system ensures your ADUP application runs efficiently on Tizen TV devices without memory-related performance issues.
