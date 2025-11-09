# ⏱️ SetInterval Management Documentation

Complete documentation of all `setInterval` timers used across the application for periodic tasks, monitoring, and data synchronization.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [All SetInterval Timers](#all-setinterval-timers)
3. [Timer Summary Table](#timer-summary-table)
4. [Configuration](#configuration)
5. [Management Best Practices](#management-best-practices)
6. [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

The application uses **10 different setInterval timers** for various periodic tasks:

| Category            | Count | Purpose                      |
| ------------------- | ----- | ---------------------------- |
| **Data Sync**       | 2     | Sync data to API             |
| **Data Collection** | 2     | Collect telemetry and events |
| **Monitoring**      | 3     | Network, memory, device ID   |
| **Archiving**       | 1     | Create offline archives      |
| **Cleanup**         | 2     | Resource and memory cleanup  |

**Total Active Timers**: 10

---

## 📊 All SetInterval Timers

### 1️⃣ **Data Manager - Periodic Sync**

**File**: `js/data-manager.js`  
**Method**: `startPeriodicSync()`  
**Interval**: `15 minutes` (900,000 ms)  
**Purpose**: Sync proof of play, telemetry, and events to API

```javascript
setInterval(() => {
  if (this.isOnline && !this.syncInProgress) {
    this.triggerSync();
  }
}, 15 * 60 * 1000); // 15 minutes
```

**Triggers**:

- ✅ Every 15 minutes
- ✅ Only when online
- ✅ Only when not already syncing

**What It Does**:

1. Checks if device is online
2. Checks if sync is not already in progress
3. Calls `triggerSync()` to sync data
4. Decides between normal sync (≤50K records) or bulk sync (>50K records)

---

### 2️⃣ **Data Manager - Telemetry Collection**

**File**: `js/data-manager.js`  
**Method**: `startTelemetryCollection()`  
**Interval**: `5 minutes` (300,000 ms)  
**Purpose**: Collect system telemetry (CPU, RAM, storage, network)

```javascript
setInterval(() => {
  this.collectSystemTelemetry();
}, 5 * 60 * 1000); // 5 minutes
```

**Triggers**:

- ✅ Every 5 minutes
- ✅ Always runs (no conditions)

**What It Does**:

1. Collects CPU usage
2. Collects available RAM
3. Collects storage info
4. Collects network type
5. Stores in IndexedDB `telemetry` table

---

### 3️⃣ **Data Manager - Device ID Watcher**

**File**: `js/data-manager.js`  
**Method**: `setupDeviceIdWatcher()`  
**Interval**: `1 second` (1,000 ms)  
**Purpose**: Watch for device ID changes in localStorage

```javascript
setInterval(() => {
  const currentDeviceId = localStorage.getItem("device_id");
  if (currentDeviceId && currentDeviceId !== this.deviceId) {
    logInfo(`Device ID updated from ${this.deviceId} to ${currentDeviceId}`);
    this.deviceId = currentDeviceId;
  }
}, 1000); // 1 second
```

**Triggers**:

- ✅ Every 1 second
- ✅ Always runs

---

### 4️⃣ **Offline Data Archiver - Archive Check**

**File**: `js/offline-data-archiver.js`  
**Method**: `startArchiveCheck()`  
**Interval**: `1 hour` (3,600,000 ms)  
**Purpose**: Check if archive should be created (every 3 days when offline)

```javascript
this.archiveCheckInterval = setInterval(() => {
  this.checkAndArchive();
}, 60 * 60 * 1000); // 1 hour
```

**Triggers**:

- ✅ Every 1 hour
- ✅ Always runs

**What It Does**:

1. Checks if device is offline
2. Checks if 3 days have passed since last archive
3. Creates archive file if conditions met
4. Stores proof of play and ERROR events
5. Deletes archived data from IndexedDB

---

### 5️⃣ **Sync Engine - Periodic Sync**

**File**: `js/sync-engine.js`  
**Method**: `startPeriodicSync()`  
**Interval**: `2 minutes` (120,000 ms)  
**Purpose**: Alternative sync engine (if used instead of DataManager)

```javascript
this.syncTimer = setInterval(() => {
  if (navigator.onLine && !this.isRunning) {
    this.performSync();
  }
}, this.syncInterval); // 2 minutes
```

**Triggers**:

- ✅ Every 2 minutes
- ✅ Only when online
- ✅ Only when not already running

⚠️ **Note**: This may overlap with DataManager sync. Check if both are active.

---

### 6️⃣ **Telemetry Collector - Collection**

**File**: `js/telemetry-collector.js`  
**Method**: `startCollection()`  
**Interval**: `5 minutes` (300,000 ms)  
**Purpose**: Dedicated telemetry collection (if used separately)

```javascript
this.intervalId = setInterval(() => {
  this.collectTelemetry();
}, this.collectionInterval); // 5 minutes
```

**Triggers**:

- ✅ Every 5 minutes
- ✅ Only when `isCollecting = true`

⚠️ **Note**: This may overlap with DataManager telemetry. Check if both are active.

---

### 7️⃣ **Event Logger - Periodic Flush**

**File**: `js/event-logger.js`  
**Method**: `startPeriodicFlush()`  
**Interval**: `30 seconds` (30,000 ms)  
**Purpose**: Flush event queue to IndexedDB

```javascript
this.flushTimer = setInterval(() => {
  this.flushEvents();
}, this.flushInterval); // 30 seconds
```

**Triggers**:

- ✅ Every 30 seconds
- ✅ Always runs

**What It Does**:

1. Takes all events from queue
2. Sends to DataManager
3. Stores in IndexedDB `events` table
4. Clears queue

---

### 8️⃣ **Memory Manager - Memory Monitoring**

**File**: `js/memory-manager.js`  
**Method**: `startMemoryMonitoring()`  
**Interval**: `30 seconds` (30,000 ms)  
**Purpose**: Monitor memory usage and cleanup if needed

```javascript
this.memoryCheckInterval = this.managedSetInterval(() => {
  this.checkMemoryUsage();
}, window.MEMORY_CHECK_INTERVAL); // 30 seconds
```

**Triggers**:

- ✅ Every 30 seconds
- ✅ Only when `isMonitoring = true`

**What It Does**:

1. Checks memory usage
2. Rotates logs if threshold exceeded
3. Cleans up old data

---

### 9️⃣ **Resource Cleanup - Periodic Cleanup**

**File**: `js/resource-cleanup.js`  
**Method**: `setupGlobalCleanup()`  
**Interval**: `1 minute` (60,000 ms)  
**Purpose**: Clean up old resources (timeouts, intervals, listeners)

```javascript
this.createInterval(
  () => {
    this.cleanupOldResources();
  },
  60000,
  "periodic-cleanup"
); // 1 minute
```

**Triggers**:

- ✅ Every 1 minute
- ✅ Always runs

**What It Does**:

1. Cleans up old timeouts
2. Cleans up old intervals
3. Removes stale event listeners
4. Clears object URLs

---

### 🔟 **Network Monitor - Periodic Checks**

**File**: `js/network-monitor.js`  
**Method**: `scheduleNextCheck()`  
**Interval**: `30 seconds` (online) / `5 seconds` (offline)  
**Purpose**: Check network connectivity

```javascript
const interval = this.isOnline ? this.checkInterval : this.retryInterval;

this.checkTimer = setTimeout(() => {
  this.checkConnectivity().then((isConnected) => {
    this.updateConnectionStatus(isConnected);
    this.scheduleNextCheck();
  });
}, interval);
```

⚠️ **Note**: Uses `setTimeout` (not `setInterval`) but reschedules itself

**Triggers**:

- ✅ Every 30 seconds when online
- ✅ Every 5 seconds when offline

---

## 📊 Timer Summary Table

| #   | Timer Name           | File                     | Interval | Always Active | Conditions           |
| --- | -------------------- | ------------------------ | -------- | ------------- | -------------------- |
| 1   | Periodic Sync        | data-manager.js          | 15 min   | ✅            | Online + Not syncing |
| 2   | Telemetry Collection | data-manager.js          | 5 min    | ✅            | None                 |
| 3   | Device ID Watcher    | data-manager.js          | 1 sec    | ✅            | None                 |
| 4   | Archive Check        | offline-data-archiver.js | 1 hour   | ✅            | Offline + 3 days     |
| 5   | Sync Engine          | sync-engine.js           | 2 min    | ✅            | Online + Not running |
| 6   | Telemetry Collector  | telemetry-collector.js   | 5 min    | ❌            | isCollecting = true  |
| 7   | Event Flush          | event-logger.js          | 30 sec   | ✅            | None                 |
| 8   | Memory Monitor       | memory-manager.js        | 30 sec   | ❌            | isMonitoring = true  |
| 9   | Resource Cleanup     | resource-cleanup.js      | 1 min    | ✅            | None                 |
| 10  | Network Check        | network-monitor.js       | 30s/5s   | ✅            | Dynamic interval     |

---

## ⚙️ Configuration

### Configuration Files

**1. `js/config.js`** - Global configuration

```javascript
window.MEMORY_CHECK_INTERVAL = 30000; // 30 seconds
```

**2. `js/data-config-monitor.js`** - Data sync configuration

```javascript
{
  sync: {
    interval: 5 * 60 * 1000, // 5 minutes (NOT USED - hardcoded to 15 min)
  },
  telemetry: {
    collectionInterval: 10 * 60 * 1000, // 10 minutes (NOT USED - hardcoded to 5 min)
  },
  events: {
    flushInterval: 30000, // 30 seconds
  }
}
```

### How to Change Intervals

**Option 1: Edit Source Code** (Recommended)

```javascript
// In js/data-manager.js line 620
}, 15 * 60 * 1000); // Change to desired interval
```

**Option 2: Use Configuration** (If implemented)

```javascript
// In js/data-config-monitor.js
sync: {
  interval: 10 * 60 * 1000, // 10 minutes
}
```

---

## 🎯 Management Best Practices

### 1. **Avoid Timer Overlap**

⚠️ **Potential Conflicts**:

- **DataManager Sync** (15 min) vs **SyncEngine Sync** (2 min)

  - Both sync data to API
  - **Solution**: Use only one sync system

- **DataManager Telemetry** (5 min) vs **TelemetryCollector** (5 min)
  - Both collect telemetry
  - **Solution**: Use only DataManager telemetry

**Check Active Timers**:

```javascript
// In browser console
console.log("DataManager:", window.dataManager);
console.log("SyncEngine:", window.syncEngine);
console.log("TelemetryCollector:", window.telemetryCollector);
```

---

### 2. **Store Timer IDs for Cleanup**

✅ **Good Practice**:

```javascript
class MyClass {
  constructor() {
    this.timerId = null;
  }

  start() {
    this.timerId = setInterval(() => {
      this.doWork();
    }, 60000);
  }

  stop() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }
}
```

❌ **Bad Practice**:

```javascript
// Timer ID not stored - can't be stopped!
setInterval(() => {
  doWork();
}, 60000);
```

---

### 3. **Use Managed Intervals**

Use `ResourceCleanup` or `MemoryManager` for automatic tracking:

```javascript
// Using ResourceCleanup
const timerId = window.resourceCleanup.createInterval(
  () => {
    doWork();
  },
  60000,
  "my-timer"
);

// Cleanup is automatic on page unload
```

---

### 4. **Add Conditions to Prevent Unnecessary Work**

✅ **Good Practice**:

```javascript
setInterval(() => {
  if (this.isOnline && !this.syncInProgress) {
    this.sync();
  }
}, 60000);
```

❌ **Bad Practice**:

```javascript
setInterval(() => {
  this.sync(); // Runs even when offline or already syncing!
}, 60000);
```

---

### 5. **Use Appropriate Intervals**

| Task Type            | Recommended Interval                     |
| -------------------- | ---------------------------------------- |
| Critical sync        | 1-5 minutes                              |
| Normal sync          | 10-15 minutes                            |
| Telemetry collection | 5-10 minutes                             |
| Memory monitoring    | 30-60 seconds                            |
| Network checks       | 30 seconds (online), 5 seconds (offline) |
| Event flushing       | 30 seconds                               |
| Resource cleanup     | 1-5 minutes                              |
| Device ID check      | 1-5 seconds                              |

---

## 🔧 Troubleshooting

### Problem 1: Too Many Timers Running

**Symptoms**:

- High CPU usage
- Battery drain
- Slow performance

**Solution**:

```javascript
// List all active intervals
if (window.resourceCleanup) {
  window.resourceCleanup.listResources();
}

// Check for duplicate timers
console.log("DataManager sync:", window.dataManager?.syncTimer);
console.log("SyncEngine sync:", window.syncEngine?.syncTimer);
```

---

### Problem 2: Timer Not Running

**Symptoms**:

- Data not syncing
- Telemetry not collected
- Events not flushed

**Debugging**:

```javascript
// Check if timer is active
console.log("Timer ID:", this.timerId);

// Check if conditions are met
console.log("Is online:", this.isOnline);
console.log("Sync in progress:", this.syncInProgress);

// Add logging to timer callback
setInterval(() => {
  console.log("Timer fired at:", new Date().toISOString());
  this.doWork();
}, 60000);
```

---

### Problem 3: Timer Running Too Frequently

**Symptoms**:

- API rate limit errors
- High network usage
- Database locks

**Solution**:

```javascript
// Add debouncing
let lastRun = 0;
setInterval(() => {
  const now = Date.now();
  if (now - lastRun < 60000) {
    console.log("Skipping - too soon");
    return;
  }
  lastRun = now;
  this.doWork();
}, 30000);
```

---

### Problem 4: Memory Leak from Timers

**Symptoms**:

- Memory usage increases over time
- App crashes after long runtime

**Solution**:

```javascript
// Always clear timers on cleanup
class MyClass {
  destroy() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }
}

// Use managed intervals
window.resourceCleanup.createInterval(
  () => {
    this.doWork();
  },
  60000,
  "my-timer"
);
```

---

## 📈 Performance Impact

### CPU Usage by Timer

| Timer                | CPU Impact | Notes                          |
| -------------------- | ---------- | ------------------------------ |
| Device ID Watcher    | Low        | Simple localStorage check      |
| Event Flush          | Low        | Only if events in queue        |
| Memory Monitor       | Low        | Simple memory check            |
| Network Check        | Medium     | Makes HTTP request             |
| Telemetry Collection | Medium     | Collects system info           |
| Resource Cleanup     | Medium     | Iterates over resources        |
| Periodic Sync        | High       | Database + API calls           |
| Archive Check        | High       | File I/O + database operations |

---

## 🎛️ Recommended Settings

### For Production (Normal Use)

```javascript
// Data sync
syncInterval: 15 * 60 * 1000, // 15 minutes

// Telemetry
telemetryInterval: 5 * 60 * 1000, // 5 minutes

// Events
eventFlushInterval: 30000, // 30 seconds

// Memory monitoring
memoryCheckInterval: 30000, // 30 seconds

// Network checks
networkCheckInterval: 30000, // 30 seconds (online)
networkRetryInterval: 5000, // 5 seconds (offline)

// Archive check
archiveCheckInterval: 60 * 60 * 1000, // 1 hour

// Resource cleanup
cleanupInterval: 60000, // 1 minute
```

---

### For Development (Testing)

```javascript
// Data sync (faster for testing)
syncInterval: 2 * 60 * 1000, // 2 minutes

// Telemetry (faster for testing)
telemetryInterval: 1 * 60 * 1000, // 1 minute

// Events (faster for testing)
eventFlushInterval: 10000, // 10 seconds

// Archive check (faster for testing)
archiveCheckInterval: 5 * 60 * 1000, // 5 minutes
```

---

### For Low-Power Mode

```javascript
// Data sync (slower to save battery)
syncInterval: 30 * 60 * 1000, // 30 minutes

// Telemetry (slower to save battery)
telemetryInterval: 10 * 60 * 1000, // 10 minutes

// Events (slower to save battery)
eventFlushInterval: 60000, // 1 minute

// Memory monitoring (slower to save CPU)
memoryCheckInterval: 60000, // 1 minute

// Network checks (slower to save battery)
networkCheckInterval: 60000, // 1 minute (online)
```

---

## 🔍 Monitoring Timers

### View All Active Timers

```javascript
// In browser console
if (window.resourceCleanup) {
  window.resourceCleanup.listResources();
}

// Check specific timers
console.log("DataManager timers:", {
  sync: window.dataManager?.syncTimer,
  telemetry: window.dataManager?.telemetryTimer,
  deviceIdWatcher: window.dataManager?.deviceIdWatcherTimer,
});

console.log("Archive timer:", window.offlineDataArchiver?.archiveCheckInterval);
console.log("Event flush timer:", window.eventLogger?.flushTimer);
console.log("Memory monitor timer:", window.memoryManager?.memoryCheckInterval);
```

---

## ✅ Summary

**Total Timers**: 10
**Always Active**: 7
**Conditionally Active**: 3

**Key Points**:

1. ✅ Most timers run continuously
2. ✅ Some timers have conditions (online, not syncing, etc.)
3. ⚠️ Watch for duplicate sync/telemetry timers
4. ✅ Use managed intervals for automatic cleanup
5. ✅ Store timer IDs for manual cleanup
6. ✅ Add conditions to prevent unnecessary work
7. ✅ Choose appropriate intervals for each task

---

**Last Updated**: 2025-11-06
**Version**: 1.0
