// Enhanced Settings Panel with Improved Scrolling and Remote Focus
// Handles data statistics, logs, downloads, and processing with proper navigation

class EnhancedSettings {
  constructor() {
    this.autoRefreshEnabled = false;
    this.autoRefreshInterval = null;
    this.currentScrollContainer = null;
    this.scrollPosition = 0;
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupKeyboardNavigation();
    this.setupDevTools();
    logInfo("EnhancedSettings initialized");
  }

  setupEventListeners() {
    // System Info buttons
    $("#toggle-dev-mode-btn").on("sn:enter-down", () => this.toggleDevMode());

    // Data Statistics buttons
    $("#refresh-stats-btn").on("sn:enter-down", () => this.refreshDataStats());
    $("#force-sync-btn").on("sn:enter-down", () => this.forceSync());
    $("#clear-synced-btn").on("sn:enter-down", () => this.clearSyncedData());

    // Archive Files panel buttons
    $("#refresh-archives-btn").on("sn:enter-down", () =>
      this.refreshArchives()
    );
    $("#send-archives-btn").on("sn:enter-down", () => this.sendAllArchives());
    $("#scroll-top-archives-btn").on("sn:enter-down", () =>
      this.scrollToTop("archives")
    );
    $("#scroll-bottom-archives-btn").on("sn:enter-down", () =>
      this.scrollToBottom("archives")
    );

    // Logs panel buttons
    $("#auto-refresh-logs-btn").on("sn:enter-down", () =>
      this.toggleAutoRefresh()
    );
    $("#clear-logs-btn").on("sn:enter-down", () => this.clearLogs());
    $("#scroll-top-logs-btn").on("sn:enter-down", () =>
      this.scrollToTop("logs")
    );
    $("#scroll-bottom-logs-btn").on("sn:enter-down", () =>
      this.scrollToBottom("logs")
    );

    // Downloads panel buttons
    $("#refresh-downloads-btn").on("sn:enter-down", () =>
      this.refreshDownloads()
    );
    $("#scroll-top-downloads-btn").on("sn:enter-down", () =>
      this.scrollToTop("downloaded")
    );
    $("#scroll-bottom-downloads-btn").on("sn:enter-down", () =>
      this.scrollToBottom("downloaded")
    );

    // Processing panel buttons
    $("#refresh-progress-btn").on("sn:enter-down", () =>
      this.refreshProgress()
    );
    $("#scroll-top-progress-btn").on("sn:enter-down", () =>
      this.scrollToTop("processing")
    );
    $("#scroll-bottom-progress-btn").on("sn:enter-down", () =>
      this.scrollToBottom("processing")
    );

    // Errors panel buttons
    $("#clear-errors-btn").on("sn:enter-down", () => this.clearErrors());
    $("#scroll-top-errors-btn").on("sn:enter-down", () =>
      this.scrollToTop("errors")
    );
    $("#scroll-bottom-errors-btn").on("sn:enter-down", () =>
      this.scrollToBottom("errors")
    );

    // Developer Tools panel buttons
    $("#scroll-top-devtools-btn").on("sn:enter-down", () =>
      this.scrollToTop("devtools")
    );
    $("#scroll-bottom-devtools-btn").on("sn:enter-down", () =>
      this.scrollToBottom("devtools")
    );
    $("#refresh-devtools-btn").on("sn:enter-down", () =>
      this.refreshDevTools()
    );
    $("#test-sync-btn").on("sn:enter-down", () => this.testSync());
    $("#test-bulk-sync-btn").on("sn:enter-down", () => this.testBulkSync());
    $("#test-archive-btn").on("sn:enter-down", () => this.testArchive());
    $("#test-telemetry-btn").on("sn:enter-down", () => this.testTelemetry());
    $("#test-network-btn").on("sn:enter-down", () => this.testNetwork());
    $("#test-cleanup-btn").on("sn:enter-down", () => this.testCleanup());
    $("#generate-test-data-btn").on("sn:enter-down", () =>
      this.generateTestData()
    );
    $("#clear-all-data-btn").on("sn:enter-down", () => this.clearAllData());
  }

  setupKeyboardNavigation() {
    // Handle UP/DOWN arrow keys for scrolling ONLY when focused on list items
    $(document).on("keydown", (evt) => {
      const activePanel = $(".section-panel.active");
      if (!activePanel.length) return;

      const scrollContainer = activePanel.find(".scrollable-container");
      if (!scrollContainer.length) return;

      // Get currently focused element
      const focusedElement = $(document.activeElement);

      // Only scroll if focused element is a list item (not a button)
      const isListItem =
        focusedElement.hasClass("log-item") ||
        focusedElement.hasClass("error-item") ||
        focusedElement.hasClass("download-item") ||
        focusedElement.hasClass("progress-block") ||
        focusedElement.hasClass("archive-item");

      if (!isListItem) {
        return; // Don't scroll when navigating buttons
      }

      switch (evt.keyCode) {
        case 38: // UP arrow
          this.scrollUp(scrollContainer, focusedElement);
          break;
        case 40: // DOWN arrow
          this.scrollDown(scrollContainer, focusedElement);
          break;
        case 33: // Page Up
          this.pageUp(scrollContainer);
          break;
        case 34: // Page Down
          this.pageDown(scrollContainer);
          break;
      }
    });
  }

  scrollUp(container, focusedElement) {
    // Scroll to keep focused element visible
    if (focusedElement && focusedElement.length) {
      focusedElement[0].scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }

  scrollDown(container, focusedElement) {
    // Scroll to keep focused element visible
    if (focusedElement && focusedElement.length) {
      focusedElement[0].scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }

  pageUp(container) {
    const scrollAmount = container.height() * 0.8;
    container.scrollTop(container.scrollTop() - scrollAmount);
  }

  pageDown(container) {
    const scrollAmount = container.height() * 0.8;
    container.scrollTop(container.scrollTop() + scrollAmount);
  }

  scrollToTop(panelId) {
    const scrollContainer = $(`#${panelId} .scrollable-container`);
    if (scrollContainer.length) {
      scrollContainer.animate({ scrollTop: 0 }, 300);
      logInfo(`Scrolled to top of ${panelId}`);
    }
  }

  scrollToBottom(panelId) {
    const scrollContainer = $(`#${panelId} .scrollable-container`);
    if (scrollContainer.length) {
      const scrollHeight = scrollContainer[0].scrollHeight;
      scrollContainer.animate({ scrollTop: scrollHeight }, 300);
      logInfo(`Scrolled to bottom of ${panelId}`);
    }
  }

  // Data Statistics Methods
  async refreshDataStats() {
    try {
      logInfo("Refreshing data statistics...");

      if (!window.dataManager) {
        logWarn("DataManager not available");
        return;
      }

      const stats = await window.dataManager.getDataStats();

      if (stats) {
        // Update Proof of Play stats
        $("#stat-pop-total").text(stats.total?.proofOfPlay || 0);
        $("#stat-pop-unsynced").text(stats.unsynced?.proofOfPlay || 0);

        // Update Telemetry stats
        $("#stat-tel-total").text(stats.total?.telemetry || 0);
        $("#stat-tel-unsynced").text(stats.unsynced?.telemetry || 0);

        // Update Events stats
        $("#stat-evt-total").text(stats.total?.events || 0);
        $("#stat-evt-unsynced").text(stats.unsynced?.events || 0);

        // Update Network status
        const networkStatus = stats.isOnline ? "🟢 Online" : "🔴 Offline";
        $("#stat-network").text(networkStatus);

        // Update Last Sync time
        const lastSync = localStorage.getItem("lastSuccessfulSync");
        if (lastSync) {
          const syncDate = new Date(lastSync);
          const timeAgo = this.getTimeAgo(syncDate);
          $("#stat-last-sync").text(timeAgo);
        } else {
          $("#stat-last-sync").text("Never");
        }

        logInfo("Data statistics refreshed successfully");
      }
    } catch (error) {
      logError("Failed to refresh data statistics:", error);
    }
  }

  async forceSync() {
    try {
      logInfo("Forcing data sync...");

      if (!window.dataManager) {
        logWarn("DataManager not available");
        return;
      }

      await window.dataManager.triggerSync();

      // Refresh stats after sync
      setTimeout(() => this.refreshDataStats(), 1000);

      logInfo("Force sync completed");
    } catch (error) {
      logError("Force sync failed:", error);
    }
  }

  async clearSyncedData() {
    try {
      logInfo("Clearing synced data...");

      if (!window.dataManager) {
        logWarn("DataManager not available");
        return;
      }

      await window.dataManager.cleanupOldRecords();

      // Refresh stats after cleanup
      setTimeout(() => this.refreshDataStats(), 500);

      logInfo("Synced data cleared successfully");
    } catch (error) {
      logError("Failed to clear synced data:", error);
    }
  }

  // Logs Methods
  toggleAutoRefresh() {
    this.autoRefreshEnabled = !this.autoRefreshEnabled;

    const btn = $("#auto-refresh-logs-btn");
    if (this.autoRefreshEnabled) {
      btn.addClass("active");
      btn.text("🔄 Auto (ON)");
      this.startAutoRefresh();
      logInfo("Auto-refresh enabled");
    } else {
      btn.removeClass("active");
      btn.text("🔄 Auto");
      this.stopAutoRefresh();
      logInfo("Auto-refresh disabled");
    }
  }

  startAutoRefresh() {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }

    this.autoRefreshInterval = setInterval(() => {
      const activePanel = $(".section-panel.active");
      const panelId = activePanel.attr("id");

      if (panelId === "logs") {
        this.renderLogs();
      } else if (panelId === "errors") {
        this.renderErrors();
      } else if (panelId === "processing") {
        this.renderProgress();
      }
    }, 2000); // Refresh every 2 seconds
  }

  stopAutoRefresh() {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }
  }

  clearLogs() {
    if (confirm("Clear all logs?")) {
      window.INFO_LOGS = [];
      this.renderLogs();
      logInfo("Logs cleared");
    }
  }

  renderLogs() {
    const $logList = $("#logList");
    const scrollContainer = $("#logs-scroll-container");
    const currentScroll = scrollContainer.scrollTop();

    $logList.empty();

    if (window.INFO_LOGS.length === 0) {
      $logList.append('<li class="log-item">No logs available</li>');
      return;
    }

    // Show last 100 logs (most recent first)
    const recentLogs = window.INFO_LOGS.slice(-100).reverse();

    recentLogs.forEach((log, i) => {
      $logList.append(
        `<li class="log-item focusable" tabindex="0" id="log-${i}">${log}</li>`
      );
    });

    // Restore scroll position
    scrollContainer.scrollTop(currentScroll);
  }

  // Downloads Methods
  refreshDownloads() {
    this.renderDownloadedFiles();
  }

  renderDownloadedFiles() {
    const $list = $("#downloaded-list");
    $list.empty();

    const fileDir = "downloads/subDir";

    tizen.filesystem.resolve(
      fileDir,
      (dir) => {
        dir.listFiles(
          (entries) => {
            const files = entries.map((entry) => ({
              name: entry.name,
              size: entry.fileSize,
              modified: entry.modified,
            }));

            if (files.length === 0) {
              $list.append(
                `<li class="download-item">No downloaded files found.</li>`
              );
              return;
            }

            files.forEach((file, i) => {
              const sizeKB = (file.size / 1024).toFixed(2);
              const modifiedDate = new Date(file.modified).toLocaleString();

              $list.append(`
                <li class="download-item focusable" tabindex="0" id="download-${i}">
                  <div style="font-weight: bold;">${file.name}</div>
                  <div style="font-size: 12px; color: #888;">
                    Size: ${sizeKB} KB | Modified: ${modifiedDate}
                  </div>
                </li>
              `);
            });
          },
          (err) => {
            console.error("❌ Failed to list files:", err.message);
            $list.append(
              `<li class="download-item error">Error listing files</li>`
            );
          }
        );
      },
      (err) => {
        console.error("❌ Failed to resolve directory:", err.message);
        $list.append(
          `<li class="download-item error">Directory not found</li>`
        );
      },
      "r"
    );
  }

  // Processing Methods
  refreshProgress() {
    this.renderProgress();
  }

  renderProgress() {
    const $content = $("#processing-content");
    $content.empty();

    if (!window.DOWNLOAD_PROGRESS || window.DOWNLOAD_PROGRESS.length === 0) {
      $content.append('<div class="progress-block">No active downloads</div>');
      return;
    }

    window.DOWNLOAD_PROGRESS.forEach((item, i) => {
      if (typeof item === "number") {
        $content.append(`
          <div class="progress-block focusable" tabindex="0">
            <p class="progress-label">Task ${i + 1}</p>
            <progress value="${item}" max="100"></progress>
            <p style="font-size: 12px; color: #888;">${item}%</p>
          </div>
        `);
      } else {
        const { name, url, progress } = item;
        $content.append(`
          <div class="progress-block focusable" tabindex="0" id="progress-${i}">
            <p class="progress-label">${name}</p>
            <progress value="${progress}" max="100"></progress>
            <p style="font-size: 12px; color: #888;">${progress}% - ${url}</p>
          </div>
        `);
      }
    });
  }

  // Errors Methods
  clearErrors() {
    if (confirm("Clear all error logs?")) {
      window.ERROR_LOGS = [];
      this.renderErrors();
      logInfo("Error logs cleared");
    }
  }

  renderErrors() {
    const $list = $("#error-list");
    const scrollContainer = $("#errors-scroll-container");
    const currentScroll = scrollContainer.scrollTop();

    $list.empty();

    if (window.ERROR_LOGS.length === 0) {
      $list.append('<li class="error-item">No errors logged</li>');
      return;
    }

    // Show last 100 errors (most recent first)
    const recentErrors = window.ERROR_LOGS.slice(-100).reverse();

    recentErrors.forEach((err, i) => {
      $list.append(
        `<li class="error-item focusable" tabindex="0" id="error-${i}">${err}</li>`
      );
    });

    // Restore scroll position
    scrollContainer.scrollTop(currentScroll);
  }

  // Archive Files Methods
  async refreshArchives() {
    logInfo("Refreshing archive files list...");

    if (!window.offlineDataArchiver) {
      logWarn("OfflineDataArchiver not available");
      this.displayArchives([]);
      return;
    }

    try {
      const archiveFiles = await window.offlineDataArchiver.getArchiveFiles();
      logInfo(`Found ${archiveFiles.length} archive file(s)`);
      this.displayArchives(archiveFiles);
    } catch (error) {
      logError("Failed to get archive files:", error);
      this.displayArchives([]);
    }
  }

  async displayArchives(archiveFiles) {
    const $list = $("#archives-list");
    const scrollContainer = $("#archives .scrollable-container");
    const currentScroll = scrollContainer.scrollTop();

    $list.empty();

    if (!archiveFiles || archiveFiles.length === 0) {
      $list.append(
        '<li class="archive-item focusable" tabindex="0">No archive files found</li>'
      );
      return;
    }

    // Display archive files with details
    for (let i = 0; i < archiveFiles.length; i++) {
      const file = archiveFiles[i];
      const fileSize = this.formatFileSize(file.fileSize);
      const createdDate = new Date(file.created || file.modified);
      const createdStr = createdDate.toLocaleString();

      // Try to read file to get record counts
      let recordInfo = "";
      try {
        const archiveData = await window.offlineDataArchiver.readArchiveFile(
          file
        );
        const popCount = archiveData.logs?.proofOfPlay?.length || 0;
        const eventsCount = archiveData.logs?.events?.length || 0;
        const totalRecords = archiveData.totalRecords || popCount + eventsCount;
        recordInfo = `<br><small>📊 ${totalRecords} records (${popCount} PoP, ${eventsCount} events)</small>`;
      } catch (error) {
        logWarn(`Failed to read archive file ${file.name}:`, error);
      }

      $list.append(`
        <li class="archive-item focusable" tabindex="0" id="archive-${i}">
          <strong>📦 ${file.name}</strong><br>
          <small>📏 Size: ${fileSize}</small><br>
          <small>📅 Created: ${createdStr}</small>
          ${recordInfo}
        </li>
      `);
    }

    // Restore scroll position
    scrollContainer.scrollTop(currentScroll);
  }

  async sendAllArchives() {
    if (!window.offlineDataArchiver) {
      logWarn("OfflineDataArchiver not available");
      return;
    }

    if (!confirm("Send all archive files to server?")) {
      return;
    }

    logInfo("Sending all archive files...");

    try {
      const result = await window.offlineDataArchiver.sendArchivesToServer();

      if (result.success) {
        logInfo(
          `Archive sync completed: ${result.sent} sent, ${
            result.failed || 0
          } failed`
        );
        alert(
          `Archive sync completed!\nSent: ${result.sent}\nFailed: ${
            result.failed || 0
          }`
        );

        // Refresh the list
        await this.refreshArchives();
      } else {
        logError("Failed to send archives:", result.error);
        alert(`Failed to send archives: ${result.error || "Unknown error"}`);
      }
    } catch (error) {
      logError("Error sending archives:", error);
      alert(`Error sending archives: ${error.message}`);
    }
  }

  formatFileSize(bytes) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }

  // Developer Mode Toggle
  toggleDevMode() {
    const currentMode = localStorage.getItem("developer_mode") === "true";
    const newMode = !currentMode;

    localStorage.setItem("developer_mode", newMode.toString());

    // Update UI
    this.updateDevModeUI(newMode);

    // Update feature flags
    window.FEATURE_FLAGS.enableDevTools = newMode;
    window.IS_DEVELOPMENT = newMode;

    // Show/hide developer tools menu
    if (newMode) {
      $("#devtools-menu-item").show();
      logInfo("✅ Developer Mode ENABLED");
    } else {
      $("#devtools-menu-item").hide();
      logInfo("❌ Developer Mode DISABLED");
    }

    logInfo(`Developer Mode toggled: ${newMode ? "ON" : "OFF"}`);
  }

  updateDevModeUI(isEnabled) {
    const statusText = isEnabled ? "ON" : "OFF";
    const statusColor = isEnabled ? "#4caf50" : "#f44336";

    $("#dev-mode-status").text(statusText).css("color", statusColor);

    // Update button style
    if (isEnabled) {
      $("#toggle-dev-mode-btn").css(
        "background",
        "linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)"
      );
    } else {
      $("#toggle-dev-mode-btn").css("background", "");
    }
  }

  // Developer Tools Methods
  setupDevTools() {
    // Check if developer mode is enabled from localStorage
    const devModeEnabled = localStorage.getItem("developer_mode") === "true";

    // Update UI to reflect current state
    this.updateDevModeUI(devModeEnabled);

    // Show/hide developer tools menu item based on developer mode
    // The panel itself will be shown/hidden by the showSection() function
    if (devModeEnabled) {
      $("#devtools-menu-item").show();
      window.FEATURE_FLAGS.enableDevTools = true;
      window.IS_DEVELOPMENT = true;
      logInfo("Developer Tools menu enabled (from saved preference)");
    } else {
      $("#devtools-menu-item").hide();
      window.FEATURE_FLAGS.enableDevTools = false;
      window.IS_DEVELOPMENT = false;
      logInfo("Developer Tools disabled");
    }
  }

  refreshDevTools() {
    logInfo("Refreshing Developer Tools...");
    this.displayFeatureFlags();
    this.displayTimerStatus();
    this.displaySystemStatus();
    this.displaySyncStats(); // ✅ NEW: Show sync statistics
    this.displayRetryQueue(); // ✅ NEW: Show retry queue
  }

  displayFeatureFlags() {
    const $list = $("#feature-flags-list");
    $list.empty();

    if (!window.FEATURE_FLAGS) {
      $list.append("<p>Feature flags not available</p>");
      return;
    }

    let html =
      '<div style="display: grid; grid-template-columns: 1fr auto; gap: 10px;">';

    for (const [key, value] of Object.entries(window.FEATURE_FLAGS)) {
      const status = value ? "✅ Enabled" : "❌ Disabled";
      const color = value ? "#4caf50" : "#f44336";
      const label = key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (str) => str.toUpperCase());

      html += `
        <div style="padding: 5px;">
          <strong>${label}</strong>
        </div>
        <div style="padding: 5px; color: ${color};">
          ${status}
        </div>
      `;
    }

    html += "</div>";
    $list.html(html);
  }

  displayTimerStatus() {
    const $list = $("#timer-status-list");
    $list.empty();

    const timers = [
      {
        name: "Data Sync",
        active: window.dataManager?.syncInProgress === false,
        interval: "15 min",
      },
      {
        name: "Telemetry Collection",
        active: true,
        interval: "5 min",
      },
      {
        name: "Archive Check",
        active: window.offlineDataArchiver?.isInitialized,
        interval: window.IS_DEVELOPMENT ? "1 min" : "1 hour",
      },
      {
        name: "Event Flush",
        active: window.eventLogger?.isEnabled,
        interval: "30 sec",
      },
      {
        name: "Network Monitor",
        active: window.networkMonitor?.isOnline !== undefined,
        interval: "30 sec",
      },
    ];

    let html =
      '<div style="display: grid; grid-template-columns: 1fr auto auto; gap: 10px;">';

    timers.forEach((timer) => {
      const status = timer.active ? "🟢 Active" : "🔴 Inactive";
      const color = timer.active ? "#4caf50" : "#f44336";

      html += `
        <div style="padding: 5px;">
          <strong>${timer.name}</strong>
        </div>
        <div style="padding: 5px; color: ${color};">
          ${status}
        </div>
        <div style="padding: 5px; color: #999;">
          ${timer.interval}
        </div>
      `;
    });

    html += "</div>";
    $list.html(html);
  }

  displaySystemStatus() {
    const $info = $("#system-status-info");
    $info.empty();

    const isOnline = window.networkMonitor
      ? window.networkMonitor.isOnline
      : navigator.onLine;
    const syncInProgress = window.dataManager?.syncInProgress || false;

    const html = `
      <div style="display: grid; grid-template-columns: 1fr auto; gap: 10px;">
        <div><strong>Environment:</strong></div>
        <div>${window.ENVIRONMENT || "unknown"}</div>

        <div><strong>Network Status:</strong></div>
        <div style="color: ${isOnline ? "#4caf50" : "#f44336"};">
          ${isOnline ? "🟢 Online" : "🔴 Offline"}
        </div>

        <div><strong>Sync Status:</strong></div>
        <div style="color: ${syncInProgress ? "#ff9800" : "#4caf50"};">
          ${syncInProgress ? "⏳ In Progress" : "✅ Idle"}
        </div>

        <div><strong>Device ID:</strong></div>
        <div style="font-size: 12px;">${
          localStorage.getItem("device_id") || "Not set"
        }</div>

        <div><strong>Group ID:</strong></div>
        <div>${localStorage.getItem("group_id") || "Not set"}</div>
      </div>
    `;

    $info.html(html);
  }

  // ✅ NEW: Display Sync Statistics
  displaySyncStats() {
    const $container = $("#sync-stats-container");
    if (!$container.length) {
      // Add container if it doesn't exist
      $("#system-status-info").after(`
        <div style="margin-top: 20px;">
          <h4 style="color: #fff; margin-bottom: 10px;">📊 Sync Statistics</h4>
          <div id="sync-stats-container"></div>
        </div>
      `);
    }

    const stats = window.dataManager?.getSyncStats?.() || null;

    if (!stats) {
      $("#sync-stats-container").html(
        '<p style="color: #999;">Statistics not available</p>'
      );
      return;
    }

    const successRate =
      stats.totalSyncs > 0
        ? ((stats.successfulSyncs / stats.totalSyncs) * 100).toFixed(1)
        : 0;

    const html = `
      <div style="display: grid; grid-template-columns: 1fr auto; gap: 10px; font-size: 14px;">
        <div><strong>Total Syncs:</strong></div>
        <div>${stats.totalSyncs}</div>

        <div><strong>Successful:</strong></div>
        <div style="color: #4caf50;">${stats.successfulSyncs}</div>

        <div><strong>Failed:</strong></div>
        <div style="color: #f44336;">${stats.failedSyncs}</div>

        <div><strong>Success Rate:</strong></div>
        <div style="color: ${
          successRate >= 90
            ? "#4caf50"
            : successRate >= 70
            ? "#ff9800"
            : "#f44336"
        };">
          ${successRate}%
        </div>

        <div><strong>Records Synced:</strong></div>
        <div>${stats.recordsSynced.toLocaleString()}</div>

        <div><strong>Retry Attempts:</strong></div>
        <div style="color: ${stats.retryAttempts > 0 ? "#ff9800" : "#4caf50"};">
          ${stats.retryAttempts}
        </div>

        <div><strong>Last Sync:</strong></div>
        <div style="font-size: 12px;">
          ${
            stats.lastSyncTime
              ? new Date(stats.lastSyncTime).toLocaleString()
              : "Never"
          }
        </div>

        <div><strong>Last Duration:</strong></div>
        <div>${stats.lastSyncDuration}ms</div>

        <div><strong>Retry Queue Size:</strong></div>
        <div style="color: ${
          stats.retryQueueSize > 0 ? "#ff9800" : "#4caf50"
        };">
          ${stats.retryQueueSize} items
        </div>
      </div>
    `;

    $("#sync-stats-container").html(html);
  }

  // ✅ NEW: Display Retry Queue
  displayRetryQueue() {
    const $container = $("#retry-queue-container");
    if (!$container.length) {
      // Add container if it doesn't exist
      $("#sync-stats-container").parent().after(`
        <div style="margin-top: 20px;">
          <h4 style="color: #fff; margin-bottom: 10px;">🔄 Retry Queue</h4>
          <div id="retry-queue-container"></div>
        </div>
      `);
    }

    const retryQueue = window.dataManager?.getRetryQueueStatus?.() || [];

    if (retryQueue.length === 0) {
      $("#retry-queue-container").html(
        '<p style="color: #4caf50;">✅ Queue is empty</p>'
      );
      return;
    }

    let html = '<div style="font-size: 14px;">';

    retryQueue.forEach((item, index) => {
      const nextRetryTime = new Date(item.nextRetry);
      const timeUntilRetry = Math.max(
        0,
        Math.floor((nextRetryTime - new Date()) / 1000)
      );

      html += `
        <div style="background: rgba(255,255,255,0.05); padding: 10px; margin-bottom: 10px; border-radius: 5px; border-left: 3px solid #ff9800;">
          <div style="display: grid; grid-template-columns: 1fr auto; gap: 10px;">
            <div><strong>${item.dataType}</strong></div>
            <div style="color: #999;">${item.recordCount} records</div>

            <div>Attempts:</div>
            <div style="color: ${item.attempts >= 2 ? "#f44336" : "#ff9800"};">
              ${item.attempts}/${window.dataManager?.maxRetries || 3}
            </div>

            <div>Next Retry:</div>
            <div style="font-size: 12px; color: #999;">
              ${timeUntilRetry > 0 ? `in ${timeUntilRetry}s` : "Ready"}
            </div>
          </div>
        </div>
      `;
    });

    html += "</div>";
    $("#retry-queue-container").html(html);
  }

  // Test Feature Methods
  async testSync() {
    if (!window.dataManager) {
      alert("DataManager not available");
      return;
    }

    if (confirm("Trigger manual sync now?")) {
      logInfo("🧪 Testing sync...");
      try {
        await window.dataManager.triggerSync();
        alert("Sync completed! Check logs for details.");
      } catch (error) {
        logError("Sync test failed:", error);
        alert(`Sync failed: ${error.message}`);
      }
    }
  }

  async testBulkSync() {
    if (!window.dataManager) {
      alert("DataManager not available");
      return;
    }

    if (confirm("Trigger bulk sync now? (for large datasets)")) {
      logInfo("🧪 Testing bulk sync...");
      try {
        await window.dataManager.syncAllDataBulk();
        alert("Bulk sync completed! Check logs for details.");
      } catch (error) {
        logError("Bulk sync test failed:", error);
        alert(`Bulk sync failed: ${error.message}`);
      }
    }
  }

  async testArchive() {
    if (!window.offlineDataArchiver) {
      alert("OfflineDataArchiver not available");
      return;
    }

    if (confirm("Create archive file now?")) {
      logInfo("🧪 Testing archive creation...");
      try {
        await window.offlineDataArchiver.createArchive();
        alert("Archive created! Check Archive Files panel.");
        await this.refreshArchives();
      } catch (error) {
        logError("Archive test failed:", error);
        alert(`Archive creation failed: ${error.message}`);
      }
    }
  }

  async testTelemetry() {
    if (!window.dataManager) {
      alert("DataManager not available");
      return;
    }

    if (confirm("Collect telemetry now?")) {
      logInfo("🧪 Testing telemetry collection...");
      try {
        await window.dataManager.collectSystemTelemetry();
        alert("Telemetry collected! Check Data Statistics panel.");
        await this.refreshDataStats();
      } catch (error) {
        logError("Telemetry test failed:", error);
        alert(`Telemetry collection failed: ${error.message}`);
      }
    }
  }

  async testNetwork() {
    if (!window.networkMonitor) {
      alert("NetworkMonitor not available");
      return;
    }

    logInfo("🧪 Testing network connectivity...");
    try {
      const isConnected = await window.networkMonitor.checkConnectivity();
      alert(
        `Network Status: ${
          isConnected ? "🟢 Online" : "🔴 Offline"
        }\n\nCheck console for details.`
      );
      this.refreshDevTools();
    } catch (error) {
      logError("Network test failed:", error);
      alert(`Network check failed: ${error.message}`);
    }
  }

  async testCleanup() {
    if (confirm("Run resource cleanup now?")) {
      logInfo("🧪 Testing resource cleanup...");
      try {
        if (window.resourceCleanup) {
          window.resourceCleanup.cleanupOldResources();
          alert("Resource cleanup completed! Check console for details.");
        } else if (window.memoryManager) {
          window.memoryManager.checkMemoryUsage();
          alert("Memory cleanup completed! Check console for details.");
        } else {
          alert("No cleanup system available");
        }
      } catch (error) {
        logError("Cleanup test failed:", error);
        alert(`Cleanup failed: ${error.message}`);
      }
    }
  }

  async generateTestData() {
    if (!window.dataManager) {
      alert("DataManager not available");
      return;
    }

    const count = prompt("How many test records to generate?", "100");
    if (!count) return;

    const numRecords = parseInt(count);
    if (isNaN(numRecords) || numRecords <= 0) {
      alert("Invalid number");
      return;
    }

    if (
      confirm(
        `Generate ${numRecords} test records?\n\n- Proof of Play: ${Math.floor(
          numRecords * 0.6
        )}\n- Events: ${Math.floor(
          numRecords * 0.3
        )}\n- Telemetry: ${Math.floor(numRecords * 0.1)}`
      )
    ) {
      logInfo(`🧪 Generating ${numRecords} test records...`);
      try {
        // Generate proof of play records
        const popCount = Math.floor(numRecords * 0.6);
        for (let i = 0; i < popCount; i++) {
          await window.dataManager.recordProofOfPlay({
            adId: `test-ad-${i}`,
            scheduleId: `test-schedule-${i}`,
            startTime: new Date(Date.now() - i * 60000).toISOString(),
            endTime: new Date(Date.now() - i * 60000 + 30000).toISOString(),
            durationPlayedMs: 30000,
          });
        }

        // Generate event records
        const eventCount = Math.floor(numRecords * 0.3);
        for (let i = 0; i < eventCount; i++) {
          await window.dataManager.recordEvent({
            eventType: i % 5 === 0 ? "ERROR" : "INFO",
            payload: {
              message: `Test event ${i}`,
              timestamp: new Date().toISOString(),
            },
          });
        }

        // Generate telemetry records
        const telemetryCount = Math.floor(numRecords * 0.1);
        for (let i = 0; i < telemetryCount; i++) {
          await window.dataManager.collectSystemTelemetry();
        }

        alert(
          `Generated ${numRecords} test records!\n\n- Proof of Play: ${popCount}\n- Events: ${eventCount}\n- Telemetry: ${telemetryCount}\n\nCheck Data Statistics panel.`
        );
        await this.refreshDataStats();
      } catch (error) {
        logError("Test data generation failed:", error);
        alert(`Failed to generate test data: ${error.message}`);
      }
    }
  }

  async clearAllData() {
    if (
      !confirm(
        "⚠️ WARNING ⚠️\n\nThis will DELETE ALL DATA from IndexedDB:\n\n- All Proof of Play records\n- All Telemetry records\n- All Event records\n- All Archive files\n\nThis action CANNOT be undone!\n\nAre you sure?"
      )
    ) {
      return;
    }

    if (!confirm("Are you REALLY sure? This will delete EVERYTHING!")) {
      return;
    }

    logWarn("🧪 Clearing all data...");
    try {
      // Clear IndexedDB tables
      if (window.dataManager) {
        await window.dataManager.clearTable("proofOfPlay");
        await window.dataManager.clearTable("telemetry");
        await window.dataManager.clearTable("events");
        await window.dataManager.clearTable("syncQueue");
      }

      // Clear archive files
      if (window.offlineDataArchiver) {
        const archiveFiles = await window.offlineDataArchiver.getArchiveFiles();
        for (const file of archiveFiles) {
          await window.offlineDataArchiver.deleteArchiveFile(file);
        }
      }

      // Clear localStorage items
      localStorage.removeItem("last_archive_time");
      localStorage.removeItem("last_sync_time");

      alert(
        "All data cleared!\n\n- IndexedDB tables cleared\n- Archive files deleted\n- localStorage cleared\n\nRefreshing panels..."
      );

      // Refresh all panels
      await this.refreshDataStats();
      await this.refreshArchives();
      await this.refreshLogs();
      await this.refreshErrors();
      await this.refreshDevTools();
    } catch (error) {
      logError("Failed to clear all data:", error);
      alert(`Failed to clear data: ${error.message}`);
    }
  }

  // Utility Methods
  getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);

    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }
}

// Initialize when DOM is ready
$(document).ready(() => {
  window.enhancedSettings = new EnhancedSettings();
});
