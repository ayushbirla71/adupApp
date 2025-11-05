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
    logInfo("EnhancedSettings initialized");
  }

  setupEventListeners() {
    // Data Statistics buttons
    $("#refresh-stats-btn").on("sn:enter-down", () => this.refreshDataStats());
    $("#force-sync-btn").on("sn:enter-down", () => this.forceSync());
    $("#clear-synced-btn").on("sn:enter-down", () => this.clearSyncedData());

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
        focusedElement.hasClass("progress-block");

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
