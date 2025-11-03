# 📊 Complete Data Sync & Proof of Play Flow Documentation

## 🎯 System Overview

This Tizen signage application implements an **offline-first data management system** that tracks:

- **Proof of Play** (ad playback tracking)
- **Telemetry** (system metrics)
- **Events** (app lifecycle, errors, diagnostics)

All data is stored locally in **IndexedDB** and synced to the cloud when online.

---

## 🏗️ Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         TIZEN SIGNAGE DEVICE                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    DATA COLLECTION LAYER                         │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │                                                                   │   │
│  │  ProofOfPlayTracker          TelemetryCollector    EventLogger   │   │
│  │  ├─ Track ad playback        ├─ CPU usage         ├─ App events │   │
│  │  ├─ Start/end times          ├─ RAM usage         ├─ Errors     │   │
│  │  ├─ Duration tracking        ├─ Storage info      ├─ Warnings   │   │
│  │  └─ Media type (video/img)   ├─ Network info      └─ Lifecycle  │   │
│  │                               └─ Device info                      │   │
│  └──────────────────┬────────────────────┬──────────────┬───────────┘   │
│                     │                    │              │                │
│                     ▼                    ▼              ▼                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    DATA STORAGE LAYER                            │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │                                                                   │   │
│  │                        DataManager                                │   │
│  │  ┌──────────────────────────────────────────────────────────┐   │   │
│  │  │              IndexedDB (AdupDataDB)                       │   │   │
│  │  ├──────────────────────────────────────────────────────────┤   │   │
│  │  │  📋 proofOfPlay Table                                     │   │   │
│  │  │     - eventId (PK)                                        │   │   │
│  │  │     - adId, scheduleId                                    │   │   │
│  │  │     - startTime, endTime, durationPlayedMs                │   │   │
│  │  │     - synced (boolean), createdAt, syncedAt               │   │   │
│  │  │                                                            │   │   │
│  │  │  📊 telemetry Table                                       │   │   │
│  │  │     - id (PK, auto-increment)                             │   │   │
│  │  │     - timestamp, cpuUsage, ramFreeMb, storageFreeMb       │   │   │
│  │  │     - networkType, appVersionCode                         │   │   │
│  │  │     - synced (boolean)                                    │   │   │
│  │  │                                                            │   │   │
│  │  │  📝 events Table                                          │   │   │
│  │  │     - eventId (PK)                                        │   │   │
│  │  │     - timestamp, eventType, payload                       │   │   │
│  │  │     - synced (boolean)                                    │   │   │
│  │  │                                                            │   │   │
│  │  │  🔄 syncQueue Table                                       │   │   │
│  │  │     - id (PK, auto-increment)                             │   │   │
│  │  │     - timestamp, priority                                 │   │   │
│  │  └──────────────────────────────────────────────────────────┘   │   │
│  │                                                                   │   │
│  │  Indexes:                                                         │   │
│  │  - timestamp (for time-based queries)                            │   │
│  │  - synced (for filtering unsynced records)                       │   │
│  │  - adId (for proof of play queries)                              │   │
│  │  - eventType (for event filtering)                               │   │
│  └───────────────────────────┬───────────────────────────────────────┘   │
│                              │                                            │
│                              ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                  DATA SYNCHRONIZATION LAYER                      │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │                                                                   │   │
│  │  DataManager.syncAllData()                                       │   │
│  │  ├─ Check total unsynced records                                │   │
│  │  ├─ Decide: Normal Sync vs Bulk Sync                            │   │
│  │  │                                                               │   │
│  │  ├─ NORMAL SYNC (< 500 records)                                 │   │
│  │  │  ├─ Get max 50 proof of play records                         │   │
│  │  │  ├─ Get max 50 telemetry records                             │   │
│  │  │  ├─ Get max 50 event records                                 │   │
│  │  │  ├─ Send to: LOGS_API_BASE_URL                               │   │
│  │  │  └─ Timeout: 30 seconds                                      │   │
│  │  │                                                               │   │
│  │  └─ BULK SYNC (> 500 records)                                   │   │
│  │     ├─ Get ALL unsynced records (no limit)                      │   │
│  │     ├─ Send to: BULK_LOGS_API_BASE_URL                          │   │
│  │     └─ Timeout: 120 seconds (2 minutes)                         │   │
│  │                                                                   │   │
│  │  Sync Triggers:                                                  │   │
│  │  - Periodic: Every 15 minutes                                    │   │
│  │  - Network online event                                          │   │
│  │  - After recording proof of play                                │   │
│  │  - After critical events                                         │   │
│  └───────────────────────────┬───────────────────────────────────────┘   │
│                              │                                            │
│                              ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                       API COMMUNICATION LAYER                    │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │                                                                   │   │
│  │  DataAPI Class (js/api.js)                                       │   │
│  │  ├─ sendLogsToAPI(payload)         → Normal sync                │   │
│  │  └─ sendBulkLogsToAPI(bulkPayload) → Bulk sync                  │   │
│  │                                                                   │   │
│  │  Headers:                                                         │   │
│  │  - Content-Type: application/json                                │   │
│  │  - X-Device-ID: {device_id}                                      │   │
│  │  - X-Android-ID: {android_id}                                    │   │
│  │  - X-Sync-Type: BULK (for bulk sync only)                        │   │
│  └───────────────────────────┬───────────────────────────────────────┘   │
│                              │                                            │
└──────────────────────────────┼────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLOUD API                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Normal API: https://xrf24byn2f.execute-api.ap-south-1.amazonaws.com/   │
│  Bulk API:   https://xrf24byn2f.execute-api.ap-south-1.amazonaws.com/bulk│
│                                                                           │
│  ├─ Receives logs payload                                                │
│  ├─ Stores in database                                                   │
│  ├─ Returns success/error response                                       │
│  └─ Processes analytics                                                  │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Complete Data Flow

### 1️⃣ **Proof of Play Tracking Flow**

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AD PLAYBACK LIFECYCLE                             │
└─────────────────────────────────────────────────────────────────────┘

Step 1: Ad Starts Playing
├─ Video/Image player starts
├─ ProofOfPlayTracker.startTracking(adData, mediaType)
│  ├─ Generate trackingId (UUID)
│  ├─ Record startTime (ISO timestamp)
│  ├─ Store in activePlaybacks Map
│  └─ Log: "Started tracking ad playback"
│
Step 2: During Playback (Optional)
├─ ProofOfPlayTracker.addPlaybackEvent(trackingId, eventType, data)
│  ├─ Events: BUFFERING, PLAY, PAUSE, ERROR
│  └─ Stored in playback.events array
│
Step 3: Ad Completes/Aborts
├─ ProofOfPlayTracker.endTracking(trackingId, reason)
│  ├─ Reasons: "completed", "aborted", "error", "new_content_loaded"
│  ├─ Record endTime (ISO timestamp)
│  ├─ Calculate durationPlayedMs
│  │  ├─ If reason === "completed" → Use expectedDurationMs (exact)
│  │  └─ Else → Calculate actual elapsed time
│  ├─ Move from activePlaybacks to completedPlaybacks
│  └─ Call recordProofOfPlay(playback)
│
Step 4: Store in IndexedDB
├─ ProofOfPlayTracker.recordProofOfPlay(playback)
│  └─ DataManager.recordProofOfPlay(proofData)
│     ├─ Create record:
│     │  {
│     │    eventId: UUID,
│     │    adId: "ad-123",
│     │    scheduleId: "schedule-456",
│     │    startTime: "2025-10-31T10:00:00.000Z",
│     │    endTime: "2025-10-31T10:00:10.000Z",
│     │    durationPlayedMs: 10000,
│     │    synced: false,
│     │    createdAt: "2025-10-31T10:00:10.100Z"
│     │  }
│     ├─ Insert into IndexedDB proofOfPlay table
│     └─ Trigger sync if online
│
Step 5: Sync to API
├─ DataManager.triggerSync()
│  └─ DataManager.syncAllData()
│     ├─ Get unsynced proof of play records
│     ├─ Send to API
│     ├─ Mark as synced (synced: true, syncedAt: timestamp)
│     └─ Cleanup old synced records (> 30 days)
```

---

### 2️⃣ **Telemetry Collection Flow**

```
┌─────────────────────────────────────────────────────────────────────┐
│                  TELEMETRY COLLECTION LIFECYCLE                      │
└─────────────────────────────────────────────────────────────────────┘

Step 1: Periodic Collection (Every 5 minutes)
├─ TelemetryCollector.collectTelemetry()
│  └─ TelemetryCollector.gatherSystemMetrics()
│
Step 2: Gather Real Tizen System Data
├─ getCPUUsage()
│  ├─ tizen.systeminfo.getPropertyValue("CPU")
│  └─ Returns: cpu.load (0.0 - 1.0)
│
├─ getAvailableRAM()
│  ├─ tizen.systeminfo.getTotalMemory()
│  ├─ tizen.systeminfo.getAvailableMemory()
│  └─ Returns: { totalMB, availableMB, usedMB, usagePercent }
│
├─ getStorageInfo()
│  ├─ tizen.systeminfo.getPropertyValue("STORAGE")
│  └─ Returns: [{ type, capacityMB, availableCapacityMB, usagePercent }]
│
├─ getNetworkInfo()
│  ├─ tizen.systeminfo.getPropertyValue("WIFI_NETWORK")
│  ├─ tizen.systeminfo.getPropertyValue("ETHERNET_NETWORK")
│  └─ Returns: { type, status, ipAddress, signalStrength, ... }
│
└─ getBuildInfo()
   ├─ tizen.systeminfo.getPropertyValue("BUILD")
   └─ Returns: { model, manufacturer, buildVersion }
│
Step 3: Format Telemetry Data (camelCase)
├─ Create telemetry object:
│  {
│    deviceId: "device-uuid-123",
│    timestamp: "2025-10-31T10:00:00.000Z",
│    cpuUsage: 0.45,
│    ramFreeMb: 1622,
│    storageFreeMb: 4500,
│    networkType: "WIFI",
│    appVersionCode: "1.0.1"
│  }
│
Step 4: Store in IndexedDB
├─ DataManager.recordTelemetry(telemetryData)
│  ├─ Add synced: false
│  ├─ Insert into telemetry table
│  └─ Log: "Telemetry recorded"
│
Step 5: Sync to API (Every 15 minutes)
├─ DataManager.syncAllData()
│  ├─ Get unsynced telemetry records (max 50 for normal sync)
│  ├─ Send to API
│  └─ Mark as synced
```

---

### 3️⃣ **Event Logging Flow**

```
┌─────────────────────────────────────────────────────────────────────┐
│                     EVENT LOGGING LIFECYCLE                          │
└─────────────────────────────────────────────────────────────────────┘

Step 1: Event Occurs
├─ App lifecycle: APP_STARTED, APP_PAUSED, APP_RESUMED, APP_STOPPED
├─ Content: CONTENT_DOWNLOAD_STARTED, COMPLETED, FAILED
├─ Playback: PLAYBACK_STARTED, COMPLETED, ERROR
├─ Network: NETWORK_CONNECTED, DISCONNECTED, ERROR
├─ Diagnostics: DIAGNOSTIC_INFO, WARNING, ERROR
├─ System: MEMORY_WARNING, STORAGE_WARNING, PERFORMANCE_ISSUE
│
Step 2: Log Event
├─ EventLogger.logEvent(eventType, payload)
│  ├─ Generate eventId (UUID)
│  ├─ Add timestamp
│  ├─ Add deviceId, groupId, sessionId to payload
│  ├─ Add to eventQueue (in-memory)
│  └─ If critical event → Immediate flush
│
Step 3: Periodic Flush (Every 30 seconds)
├─ EventLogger.flushEvents()
│  ├─ Get all events from eventQueue
│  ├─ Clear eventQueue
│  └─ For each event:
│     └─ DataManager.recordEvent(eventData)
│        ├─ Create record:
│        │  {
│        │    eventId: UUID,
│        │    timestamp: "2025-10-31T10:00:00.000Z",
│        │    eventType: "PLAYBACK_ERROR",
│        │    payload: { adId: "ad-123", error: "Network timeout" },
│        │    synced: false
│        │  }
│        └─ Insert into events table
│
Step 4: Sync to API
├─ DataManager.syncAllData()
│  ├─ Get unsynced events (max 50 for normal sync)
│  ├─ Send to API
│  └─ Mark as synced
```

---

### 4️⃣ **Sync Decision Logic**

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SYNC DECISION FLOW                                │
└─────────────────────────────────────────────────────────────────────┘

DataManager.syncAllData()
│
├─ Step 1: Get Configuration
│  ├─ batchSize = 50 (from config)
│  └─ bulkThreshold = 500 (from config)
│
├─ Step 2: Count Unsynced Records
│  ├─ Get stats from IndexedDB
│  ├─ totalUnsynced = proofOfPlay.unsynced + telemetry.unsynced + events.unsynced
│  └─ Log: "Total unsynced records: {totalUnsynced}"
│
├─ Step 3: Decision
│  │
│  ├─ IF totalUnsynced > 500 (bulkThreshold)
│  │  ├─ Log: "Using BULK SYNC"
│  │  └─ Call syncAllDataBulk()
│  │     ├─ Get ALL unsynced records (limit: 999999)
│  │     ├─ Create bulkPayload:
│  │     │  {
│  │     │    deviceId: "device-uuid-123",
│  │     │    sentAt: "2025-10-31T10:00:00.000Z",
│  │     │    syncType: "BULK",
│  │     │    totalRecords: 5234,
│  │     │    logs: {
│  │     │      proofOfPlay: [...3200 records],
│  │     │      telemetry: [...1800 records],
│  │     │      events: [...234 records]
│  │     │    }
│  │     │  }
│  │     ├─ Send to BULK_LOGS_API_BASE_URL
│  │     ├─ Timeout: 120 seconds
│  │     └─ Mark all as synced
│  │
│  └─ ELSE (totalUnsynced <= 500)
│     ├─ Log: "Using NORMAL SYNC (batch size: 50)"
│     └─ Call syncAllDataNormal(50)
│        ├─ Get max 50 proof of play records
│        ├─ Get max 50 telemetry records
│        ├─ Get max 50 events records
│        ├─ Create payload:
│        │  {
│        │    deviceId: "device-uuid-123",
│        │    sentAt: "2025-10-31T10:00:00.000Z",
│        │    logs: {
│        │      proofOfPlay: [...50 records],
│        │      telemetry: [...50 records],
│        │      events: [...50 records]
│        │    }
│        │  }
│        ├─ Send to LOGS_API_BASE_URL
│        ├─ Timeout: 30 seconds
│        └─ Mark synced records as synced
│
└─ Step 4: Cleanup
   └─ cleanupOldRecords()
      ├─ Get retention days (30 days from config)
      ├─ Calculate cutoff date
      ├─ Delete synced records older than cutoff
      └─ Keep ALL unsynced records (never delete)
```

---

## 📦 API Payload Formats

### Normal Sync Payload

```json
{
  "deviceId": "device-uuid-123",
  "sentAt": "2025-10-31T10:00:00.000Z",
  "logs": {
    "proofOfPlay": [
      {
        "eventId": "event-uuid-1",
        "adId": "ad-123",
        "scheduleId": "schedule-456",
        "startTime": "2025-10-31T10:00:00.000Z",
        "endTime": "2025-10-31T10:00:10.000Z",
        "durationPlayedMs": 10000
      }
      // ... max 50 records
    ],
    "telemetry": [
      {
        "timestamp": "2025-10-31T10:00:00.000Z",
        "cpuUsage": 0.45,
        "ramFreeMb": 1622,
        "storageFreeMb": 4500,
        "networkType": "WIFI",
        "appVersionCode": "1.0.1"
      }
      // ... max 50 records
    ],
    "events": [
      {
        "eventId": "event-uuid-2",
        "timestamp": "2025-10-31T10:00:00.000Z",
        "eventType": "PLAYBACK_ERROR",
        "payload": {
          "adId": "ad-123",
          "error": "Network timeout",
          "deviceId": "device-uuid-123",
          "groupId": "group-456",
          "sessionId": "session-789"
        }
      }
      // ... max 50 records
    ]
  }
}
```

### Bulk Sync Payload

```json
{
  "deviceId": "device-uuid-123",
  "sentAt": "2025-10-31T10:00:00.000Z",
  "syncType": "BULK",
  "totalRecords": 5234,
  "logs": {
    "proofOfPlay": [
      // ... 3200 records (ALL unsynced)
    ],
    "telemetry": [
      // ... 1800 records (ALL unsynced)
    ],
    "events": [
      // ... 234 records (ALL unsynced)
    ]
  }
}
```

---

## ⚙️ Configuration

### Default Configuration (`js/data-config-monitor.js`)

```javascript
{
  sync: {
    interval: 5 * 60 * 1000,        // 5 minutes (not used, overridden to 15 min)
    batchSize: 50,                   // Max 50 records per table per sync
    bulkSyncThreshold: 500,          // Use bulk API if > 500 total records
    maxRetries: 3,                   // Retry failed syncs 3 times
    retryDelay: 5000,                // 5 seconds between retries
    enabled: true
  },

  telemetry: {
    collectionInterval: 10 * 60 * 1000,  // 10 minutes (not used, overridden to 5 min)
    enabled: true,
    includePerformanceMetrics: true,
    includeSystemInfo: true
  },

  events: {
    flushInterval: 30000,            // 30 seconds
    maxQueueSize: 1000,              // Max 1000 events in memory
    enabled: true,
    logLevel: "INFO"
  },

  proofOfPlay: {
    enabled: true,
    trackImageAds: true,
    trackVideoAds: true,
    detailedTracking: true
  },

  storage: {
    retentionDays: 30,               // Keep data for 30 days
    maxRecordsPerTable: 20000,       // Max 20,000 records per table
    autoCleanup: true,
    cleanupInterval: 24 * 60 * 60 * 1000  // Cleanup every 24 hours
  },

  network: {
    connectivityCheckInterval: 10 * 60 * 1000,  // 10 minutes
    timeoutMs: 10000,
    retryOnFailure: true
  }
}
```

### Actual Intervals (Hardcoded in Code)

```javascript
// DataManager (js/data-manager.js)
startPeriodicSync() {
  setInterval(() => {
    if (this.isOnline && !this.syncInProgress) {
      this.triggerSync();
    }
  }, 15 * 60 * 1000);  // ✅ 15 minutes (actual sync interval)
}

// TelemetryCollector (js/telemetry-collector.js)
startCollection() {
  setInterval(() => {
    this.collectTelemetry();
  }, 5 * 60 * 1000);  // ✅ 5 minutes (actual telemetry interval)
}

// EventLogger (js/event-logger.js)
startPeriodicFlush() {
  setInterval(() => {
    this.flushEvents();
  }, 30000);  // ✅ 30 seconds (actual event flush interval)
}
```

---

## 🔄 Sync Triggers

### Automatic Triggers

1. **Periodic Sync** (Every 15 minutes)

   - `DataManager.startPeriodicSync()`
   - Runs only if online and not already syncing

2. **Network Online Event**

   - When device reconnects to network
   - `window.addEventListener("online", ...)`
   - Triggers immediate sync

3. **After Recording Proof of Play**

   - `DataManager.recordProofOfPlay()`
   - Triggers sync if online

4. **After Critical Events**
   - Events: `APP_CRASH`, `DIAGNOSTIC_ERROR`, `NETWORK_ERROR`
   - `DataManager.recordEvent()` checks `isCriticalEvent()`
   - Triggers immediate sync

### Manual Triggers

```javascript
// Trigger sync manually
await window.dataManager.triggerSync();

// Force event flush
await window.eventLogger.forceFlush();

// Collect telemetry now
await window.telemetryCollector.collectNow();
```

---

## 📊 Storage Capacity & Limits

### IndexedDB Storage Quota (Tizen)

- **Typical Tizen Signage**: 50-100 MB for IndexedDB
- **Some devices**: Up to 500 MB - 1 GB
- **Depends on**: Device model, firmware version, available storage

### Application Limits

| Setting                   | Value   | Description                                 |
| ------------------------- | ------- | ------------------------------------------- |
| **Retention Days**        | 30 days | Keep synced data for 30 days                |
| **Max Records Per Table** | 20,000  | Maximum records before oldest deleted       |
| **Batch Size (Normal)**   | 50      | Max records per table per sync              |
| **Bulk Threshold**        | 500     | Total unsynced records to trigger bulk sync |
| **Event Queue Size**      | 1,000   | Max events in memory before flush           |

### Storage Calculation Examples

**Scenario 1: Normal Operation (100 ads/day)**

```
Daily proof of play: 100 records
30 days: 3,000 records
Status: ✅ Well within 20,000 limit
```

**Scenario 2: High Volume (500 ads/day)**

```
Daily proof of play: 500 records
30 days: 15,000 records
Status: ✅ Within 20,000 limit
```

**Scenario 3: Very High Volume (1000 ads/day)**

```
Daily proof of play: 1,000 records
30 days: 30,000 records
Status: ⚠️ Exceeds 20,000 limit
Result: Oldest records auto-deleted after 20,000 (still ~20 days of data)
```

**Scenario 4: Device Offline for 30 Days**

```
Proof of play: 3,000 records (unsynced)
Telemetry: 8,640 records (30 days × 24 hours × 12 per hour)
Events: 500 records
Total: 12,140 unsynced records
Status: ✅ All kept (unsynced records never deleted)
When online: ✅ Bulk sync triggered (> 500 threshold)
```

---

## 🎬 Real-World Example: Complete Ad Playback Flow

### Scenario: 5 Ads Playing in Loop, Then MQTT Update

```
┌─────────────────────────────────────────────────────────────────────┐
│                    INITIAL STATE: 5 ADS IN LOOP                      │
└─────────────────────────────────────────────────────────────────────┘

Time: 10:00:00 - Ad 1 starts playing
├─ ProofOfPlayTracker.startTracking(ad1, "video")
│  ├─ trackingId: "track-001"
│  ├─ adId: "ad-001"
│  ├─ startTime: "2025-10-31T10:00:00.000Z"
│  ├─ expectedDurationMs: 10000 (10 seconds)
│  └─ activePlaybacks.set("track-001", {...})

Time: 10:00:10 - Ad 1 completes
├─ ProofOfPlayTracker.endTracking("track-001", "completed")
│  ├─ endTime: "2025-10-31T10:00:10.000Z"
│  ├─ durationPlayedMs: 10000 (uses expectedDurationMs)
│  ├─ activePlaybacks.delete("track-001")
│  └─ DataManager.recordProofOfPlay({
│       eventId: "event-001",
│       adId: "ad-001",
│       startTime: "2025-10-31T10:00:00.000Z",
│       endTime: "2025-10-31T10:00:10.000Z",
│       durationPlayedMs: 10000,
│       synced: false
│     })

Time: 10:00:10 - Ad 2 starts
├─ trackingId: "track-002"
└─ activePlaybacks.set("track-002", {...})

Time: 10:00:20 - Ad 2 completes
├─ endTracking("track-002", "completed")
└─ recordProofOfPlay(...)

Time: 10:00:20 - Ad 3 starts
├─ trackingId: "track-003"
└─ activePlaybacks.set("track-003", {...})

Time: 10:00:30 - Ad 3 completes
├─ endTracking("track-003", "completed")
└─ recordProofOfPlay(...)

Time: 10:00:30 - Ad 4 starts
├─ trackingId: "track-004"
└─ activePlaybacks.set("track-004", {...})

Time: 10:00:40 - Ad 4 completes
├─ endTracking("track-004", "completed")
└─ recordProofOfPlay(...)

Time: 10:00:40 - Ad 5 starts
├─ trackingId: "track-005"
└─ activePlaybacks.set("track-005", {...})

Time: 10:00:45 - 🚨 NEW MQTT MESSAGE ARRIVES (only 1 ad now)
├─ handleMQTTAds({ ads: [newAd] })
│  └─ stopCurrentPlayback()
│     ├─ 🔴 OLD BUG: Ad 5 still tracked, would record wrong data
│     │
│     ├─ ✅ NEW FIX: abortAllActiveTracking("new_content_loaded")
│     │  ├─ endTracking("track-005", "new_content_loaded")
│     │  │  ├─ endTime: "2025-10-31T10:00:45.000Z"
│     │  │  ├─ durationPlayedMs: 5000 (actual elapsed time, not 10000)
│     │  │  └─ recordProofOfPlay({
│     │  │       eventId: "event-005",
│     │  │       adId: "ad-005",
│     │  │       startTime: "2025-10-31T10:00:40.000Z",
│     │  │       endTime: "2025-10-31T10:00:45.000Z",
│     │  │       durationPlayedMs: 5000,  // ✅ Correct: 5 seconds played
│     │  │       synced: false
│     │  │     })
│     │  └─ activePlaybacks.clear()
│     │
│     ├─ p1.stop()
│     ├─ p2.stop()
│     └─ Clear all timeouts

Time: 10:00:45 - New ad starts
├─ trackingId: "track-006"
├─ adId: "new-ad-001"
└─ activePlaybacks.set("track-006", {...})

┌─────────────────────────────────────────────────────────────────────┐
│                    INDEXEDDB STATE AT 10:00:45                       │
└─────────────────────────────────────────────────────────────────────┘

proofOfPlay table:
├─ event-001: ad-001, duration: 10000ms, synced: false ✅
├─ event-002: ad-002, duration: 10000ms, synced: false ✅
├─ event-003: ad-003, duration: 10000ms, synced: false ✅
├─ event-004: ad-004, duration: 10000ms, synced: false ✅
└─ event-005: ad-005, duration: 5000ms, synced: false ✅ (aborted after 5s)

activePlaybacks:
└─ track-006: new-ad-001 (currently playing)
```

---

## 🛠️ Key Classes & Methods

### ProofOfPlayTracker (`js/proof-of-play-tracker.js`)

| Method                                          | Purpose                            | Returns           |
| ----------------------------------------------- | ---------------------------------- | ----------------- |
| `startTracking(adData, mediaType)`              | Start tracking ad playback         | trackingId (UUID) |
| `endTracking(trackingId, reason)`               | End tracking, record duration      | playback object   |
| `abortAllActiveTracking(reason)`                | Abort all active tracking sessions | void              |
| `recordProofOfPlay(playback)`                   | Store proof of play in DataManager | Promise           |
| `addPlaybackEvent(trackingId, eventType, data)` | Add event to playback              | void              |

### DataManager (`js/data-manager.js`)

| Method                             | Purpose                          | Returns         |
| ---------------------------------- | -------------------------------- | --------------- |
| `recordProofOfPlay(adData)`        | Store proof of play in IndexedDB | Promise<record> |
| `recordTelemetry(telemetryData)`   | Store telemetry in IndexedDB     | Promise<record> |
| `recordEvent(eventData)`           | Store event in IndexedDB         | Promise<record> |
| `syncAllData()`                    | Decide normal vs bulk sync       | Promise<void>   |
| `syncAllDataNormal(batchSize)`     | Sync max 50 records per table    | Promise<void>   |
| `syncAllDataBulk()`                | Sync ALL unsynced records        | Promise<void>   |
| `getUnsyncedRecords(table, limit)` | Get unsynced records             | Promise<array>  |
| `markAsSynced(table, recordIds)`   | Mark records as synced           | Promise<void>   |
| `cleanupOldRecords()`              | Delete old synced records        | Promise<void>   |
| `getDataStats()`                   | Get storage statistics           | Promise<object> |

### TelemetryCollector (`js/telemetry-collector.js`)

| Method                  | Purpose                         | Returns         |
| ----------------------- | ------------------------------- | --------------- |
| `collectTelemetry()`    | Collect and store telemetry     | Promise<void>   |
| `gatherSystemMetrics()` | Get all system metrics          | Promise<object> |
| `getCPUUsage()`         | Get CPU usage from Tizen API    | Promise<number> |
| `getAvailableRAM()`     | Get RAM info from Tizen API     | Promise<object> |
| `getStorageInfo()`      | Get storage info from Tizen API | Promise<array>  |
| `getNetworkInfo()`      | Get network info from Tizen API | Promise<object> |
| `getBuildInfo()`        | Get build info from Tizen API   | Promise<object> |

### EventLogger (`js/event-logger.js`)

| Method                                            | Purpose                    | Returns       |
| ------------------------------------------------- | -------------------------- | ------------- |
| `logEvent(eventType, payload)`                    | Log event to queue         | event object  |
| `flushEvents()`                                   | Flush queue to DataManager | Promise<void> |
| `logContentDownload(action, fileName, details)`   | Log download event         | event object  |
| `logPlaybackEvent(action, adId, details)`         | Log playback event         | event object  |
| `logNetworkEvent(action, details)`                | Log network event          | event object  |
| `logDiagnostic(level, context, message, details)` | Log diagnostic event       | event object  |

### DataAPI (`js/api.js`)

| Method                           | Purpose                 | Returns                         |
| -------------------------------- | ----------------------- | ------------------------------- |
| `sendLogsToAPI(payload)`         | Send normal sync to API | Promise<{success, data, error}> |
| `sendBulkLogsToAPI(bulkPayload)` | Send bulk sync to API   | Promise<{success, data, error}> |

---

## 📈 Monitoring & Debugging

### Check Storage Stats

```javascript
// Get data statistics
const stats = await window.dataManager.getDataStats();
console.log(stats);
// Output:
// {
//   total: { proofOfPlay: 150, telemetry: 300, events: 50 },
//   unsynced: { proofOfPlay: 20, telemetry: 10, events: 5 },
//   isOnline: true,
//   syncInProgress: false
// }
```

### Check Active Tracking

```javascript
// Get proof of play tracker stats
const popStats = window.proofOfPlayTracker.getStats();
console.log(popStats);
// Output:
// {
//   activePlaybacks: 1,
//   completedPlaybacks: 150,
//   isEnabled: true
// }
```

### Check Telemetry Status

```javascript
// Get telemetry collector status
const telemetryStatus = window.telemetryCollector.getStatus();
console.log(telemetryStatus);
// Output:
// {
//   isCollecting: true,
//   lastCollection: "2025-10-31T10:00:00.000Z",
//   collectionInterval: 300000,
//   performanceMetrics: {...}
// }
```

### Check Event Logger Stats

```javascript
// Get event logger stats
const eventStats = window.eventLogger.getStats();
console.log(eventStats);
// Output:
// {
//   queueSize: 15,
//   maxQueueSize: 1000,
//   isEnabled: true,
//   eventTypeCounts: {
//     "PLAYBACK_STARTED": 5,
//     "PLAYBACK_COMPLETED": 5,
//     "DIAGNOSTIC_INFO": 5
//   },
//   flushInterval: 30000
// }
```

### Console Logs to Watch

```javascript
// Proof of play tracking
"Started tracking ad playback: { trackingId, adId, mediaType }";
"Ended tracking ad playback: { trackingId, adId, durationPlayedMs, reason }";
"Aborting 5 active tracking sessions...";
"All active tracking sessions aborted";

// Data sync
"Total unsynced records: 120";
"Using NORMAL SYNC (120 records, batch size: 50)";
"Syncing data (NORMAL): { proofOfPlay: 50, telemetry: 50, events: 20 }";
"Data sent to API successfully";
"Data marked as synced successfully";

// Bulk sync
"Total unsynced records: 5234";
"Using BULK SYNC (5234 records > 500 threshold)";
"Sending BULK data to API: 5234 total records";
"Bulk data sent to API successfully";

// Telemetry
"📊 Real Tizen Telemetry collected: {...}";
"Telemetry recorded";

// Events
"Event logged: PLAYBACK_ERROR { adId: 'ad-123' }";
"Flushed events to data manager: 15";
```

---

## 🚨 Common Issues & Solutions

### Issue 1: Old ads still tracked after MQTT update

**Symptom**: After new MQTT message, old ads continue recording proof of play

**Root Cause**: `stopCurrentPlayback()` stopped players but didn't abort tracking sessions

**Solution**: ✅ Fixed - `abortAllActiveTracking()` called in `stopCurrentPlayback()`

### Issue 2: Duration mismatch (10s ad shows 12.4s)

**Symptom**: 10-second ad shows varying durations like 10, 12, 13.4 seconds

**Root Cause**: Used actual elapsed time instead of expected duration

**Solution**: ✅ Fixed - Use `expectedDurationMs` for completed playback

### Issue 3: Data lost after 7 days offline

**Symptom**: Device offline for 7+ days loses proof of play data

**Root Cause**: Retention was 7 days, cleanup deleted old data

**Solution**: ✅ Fixed - Increased retention to 30 days, max records to 20,000

### Issue 4: Sync fails with large data

**Symptom**: Sync times out when device has 5000+ records

**Root Cause**: Normal sync sends max 50 records, takes too long

**Solution**: ✅ Fixed - Bulk sync API for > 500 records with 2-minute timeout

---

## ✅ Summary

### Data Collection

- ✅ Proof of Play: Tracks ad playback with exact duration
- ✅ Telemetry: Collects real Tizen system metrics every 5 minutes
- ✅ Events: Logs app lifecycle, errors, diagnostics

### Data Storage

- ✅ IndexedDB: Offline-first storage with 30-day retention
- ✅ Capacity: Up to 20,000 records per table
- ✅ Cleanup: Auto-delete synced records > 30 days old

### Data Synchronization

- ✅ Normal Sync: Max 50 records per table, every 15 minutes
- ✅ Bulk Sync: ALL records when > 500 unsynced, 2-minute timeout
- ✅ Smart Decision: Automatically chooses sync method
- ✅ Offline Support: All data preserved until synced

### API Communication

- ✅ Normal API: `https://xrf24byn2f.execute-api.ap-south-1.amazonaws.com/`
- ✅ Bulk API: `https://xrf24byn2f.execute-api.ap-south-1.amazonaws.com/bulk`
- ✅ Headers: Device ID, Android ID, Sync Type
- ✅ Retry Logic: 3 retries with exponential backoff

---

**📝 Document Version**: 1.0
**📅 Last Updated**: 2025-10-31
**👤 Author**: Augment Agent
**🎯 Application**: Tizen Signage Ad Player (ADUP)
