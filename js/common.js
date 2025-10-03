function generateUUID() {
  // Public Domain/MIT
  var d = new Date().getTime();
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    d += performance.now(); //use high-precision timer if available
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (d + Math.random() * 16) % 16 | 0;
    d = Math.floor(d / 16);
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function decodeTokenPayload(token) {
  try {
    var parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid JWT format");
    }

    var base64Url = parts[1];
    var base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");

    // Decode base64 string
    var jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map(function (c) {
          return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join("")
    );

    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error("Failed to decode token:", error);
    return null;
  }
}

function getTVDeviceInfo() {
  return new Promise(function (resolve, reject) {
    try {
      let android_id = tizen.systeminfo.getCapability(
        "http://tizen.org/system/tizenid"
      );

      tizen.systeminfo.getPropertyValue(
        "BUILD",
        function (build) {
          var model = build.model;
          var version = build.buildVersion;

          if (tizen.geolocation) {
            tizen.geolocation.getCurrentPosition(
              function (position) {
                var location = {
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                };

                resolve({
                  android_id: android_id || model, // Fallback to model if ID not available
                  location: location,
                });
              },
              function (error) {
                console.warn("Location error:", error.message);
                // Resolve anyway without location
                resolve({
                  android_id: android_id || model,
                  location: null,
                });
              }
            );
          } else {
            resolve({
              android_id: android_id || model,
              location: null,
            });
          }
        },
        function (error) {
          console.error("Error getting build info:", error);
          reject(error);
        }
      );
    } catch (err) {
      console.error("Error in getTVDeviceInfo:", err);
      reject(err);
    }
  });
}
function generateImageAds(url) {
  console.log("Image URL:", url);

  return "<img src=" + url + " class='ad-player-image' alt='Ad Image' />";
}

function generateVideoAds(url) {
  return (
    "<div class='ad-player'><video src=" +
    encodeURI(url) +
    " controls></video></div>"
  );
}

function generateTextAds(text) {
  return "<div class='ad-text'>" + escapeHtml(text) + "</div>";
}

// Optional: Escape text to prevent HTML injection
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function startAdSlide(containerId, textData, speed) {
  console.log("Ad Slide Start", containerId, textData, speed);

  if (!containerId) return;

  if (!speed) speed = 1;

  var container = document.getElementById(containerId);
  var text = document.getElementById("sliding_text");
  if (!container || !text) return;

  // Set the text content
  text.innerHTML = textData;

  // Remove any existing animation classes
  text.className = "sliding-text";

  // Cancel any previous animation frame (cleanup from old JS animation)
  if (container._slideAnimationFrameId) {
    cancelAnimationFrame(container._slideAnimationFrameId);
    container._slideAnimationFrameId = null;
  }

  // Clear any inline styles from previous JS animation
  text.style.left = "";

  // Add CSS animation classes based on speed
  var speedClass = "speed-" + Math.min(Math.max(Math.round(speed), 1), 5);
  text.classList.add("animate", speedClass);

  console.log("CSS Animation started with speed class:", speedClass);
}

function stopAdSlide(containerId) {
  console.log("Ad Slide Stop", containerId);

  if (!containerId) return;

  var container = document.getElementById(containerId);
  var text = document.getElementById("sliding_text");
  if (!container || !text) return;

  // Remove animation classes
  text.classList.remove(
    "animate",
    "speed-1",
    "speed-2",
    "speed-3",
    "speed-4",
    "speed-5"
  );

  // Cancel any previous animation frame (cleanup from old JS animation)
  if (container._slideAnimationFrameId) {
    cancelAnimationFrame(container._slideAnimationFrameId);
    container._slideAnimationFrameId = null;
  }

  console.log("CSS Animation stopped");
}

// Test function to verify CSS animation is working
function testAdSlideAnimation() {
  console.log("Testing CSS-based ad slide animation...");

  // Test with sample text and different speeds
  const testTexts = [
    "🎬 Welcome to our premium advertising platform!",
    "📺 Experience smooth CSS animations on Tizen TV",
    "⚡ Optimized for better performance and lower CPU usage",
  ];

  let testIndex = 0;

  function runTest() {
    if (testIndex < testTexts.length) {
      const speed = (testIndex % 5) + 1; // Test speeds 1-5
      console.log(`Testing with speed ${speed}: "${testTexts[testIndex]}"`);
      startAdSlide("ad_snippet", testTexts[testIndex], speed);

      testIndex++;
      setTimeout(runTest, 8000); // Wait 8 seconds between tests
    } else {
      console.log("✅ CSS Animation test completed!");
      stopAdSlide("ad_snippet");
    }
  }

  runTest();
}

function showToast(type, message, timer) {
  const toast = document.getElementById("toast");

  // Remove all type classes
  toast.className = "";

  // Add type and show classes
  toast.classList.add(type, "show");
  toast.textContent = message;

  // Remove the toast after 3 seconds
  setTimeout(function () {
    toast.className = "";
  }, timer || 3000);
}

// These functions are now handled by memory-manager.js
// Keeping these as fallbacks if memory manager is not loaded
function addInfoLog(message) {
  if (window.memoryManager) {
    window.memoryManager.addInfoLog(message);
  } else {
    const time = new Date().toLocaleTimeString();
    window.INFO_LOGS.push(`[${time}] ${message}`);

    // Basic rotation if memory manager not available
    if (window.INFO_LOGS.length > (window.MAX_LOG_ENTRIES || 100)) {
      window.INFO_LOGS = window.INFO_LOGS.slice(-50);
    }
  }
}

function addErrorLog(message) {
  if (window.memoryManager) {
    window.memoryManager.addErrorLog(message);
  } else {
    const time = new Date().toLocaleTimeString();
    window.ERROR_LOGS.push(`[${time}] ${message}`);

    // Basic rotation if memory manager not available
    if (window.ERROR_LOGS.length > (window.MAX_LOG_ENTRIES || 100)) {
      window.ERROR_LOGS = window.ERROR_LOGS.slice(-50);
    }
  }
}

function addDownloadedFile(name) {
  if (!window.DOWNLOADED_FILES.includes(name)) {
    window.DOWNLOADED_FILES.push(name);

    // Rotate downloaded files if too many
    if (window.DOWNLOADED_FILES.length > (window.MAX_LOG_ENTRIES || 100)) {
      window.DOWNLOADED_FILES = window.DOWNLOADED_FILES.slice(-50);
    }
  }
}

// Simple and effective clear logs function
function clearAllLogs() {
  console.log("clearAllLogs function called");

  try {
    // Clear all log arrays
    window.ERROR_LOGS = [];
    window.INFO_LOGS = [];
    window.DOWNLOADED_FILES = [];
    window.DOWNLOAD_STATUS = [];
    window.DOWNLOAD_PROGRESS = [];

    // Reset console log count
    if (window.CONSOLE_LOG_COUNT) {
      window.CONSOLE_LOG_COUNT = 0;
    }

    // Clear UI elements
    const logList = document.getElementById("logList");
    const errorList = document.getElementById("error-list");
    const downloadedList = document.getElementById("downloaded-list");

    if (logList) logList.innerHTML = "";
    if (errorList) errorList.innerHTML = "";
    if (downloadedList) downloadedList.innerHTML = "";

    console.log("Logs cleared successfully");

    // Add confirmation log (no toast for background operation)
    const time = new Date().toLocaleTimeString();
    window.INFO_LOGS.push(`[${time}] All logs cleared`);
  } catch (error) {
    console.error("Error in clearAllLogs:", error);
    showToast("error", "Failed to clear logs");
  }
}

// Simple memory cleanup function
function performMemoryCleanup() {
  console.log("performMemoryCleanup function called");

  try {
    clearAllLogs();

    // Force garbage collection if available (silent background operation)
    if (window.gc && typeof window.gc === "function") {
      try {
        window.gc();
        console.log("Background garbage collection performed");
      } catch (e) {
        console.log("GC failed, but cleanup performed");
      }
    } else {
      console.log("GC not available, cleanup performed");
    }
  } catch (error) {
    console.error("Error in performMemoryCleanup:", error);
    showToast("error", "Failed to perform memory cleanup");
  }
}

// Emergency cleanup function
function emergencyMemoryCleanup() {
  console.log("emergencyMemoryCleanup function called");

  try {
    // Aggressive cleanup
    window.ERROR_LOGS = [];
    window.INFO_LOGS = [];
    window.DOWNLOADED_FILES = [];
    window.DOWNLOAD_STATUS = [];
    window.DOWNLOAD_PROGRESS = [];

    if (window.CONSOLE_LOG_COUNT) {
      window.CONSOLE_LOG_COUNT = 0;
    }

    // Clear all UI elements
    const allLists = document.querySelectorAll(
      "#logList, #error-list, #downloaded-list, #memory-stats-list"
    );
    allLists.forEach((list) => {
      if (list) list.innerHTML = "";
    });

    // Clear any blob URLs
    const images = document.querySelectorAll("img");
    images.forEach((img) => {
      if (img.src && img.src.startsWith("blob:")) {
        URL.revokeObjectURL(img.src);
      }
    });

    // Force garbage collection
    if (window.gc && typeof window.gc === "function") {
      try {
        window.gc();
        console.log("Emergency GC performed");
      } catch (e) {
        console.log("Emergency GC failed:", e);
      }
    }

    console.log("Emergency cleanup completed");
  } catch (error) {
    console.error("Error in emergencyMemoryCleanup:", error);
    showToast("error", "Failed to perform emergency cleanup");
  }
}

function trackDownloadProgress(name, url, progress) {
  const existing = window.DOWNLOAD_PROGRESS.find((d) => d.name === name);
  if (existing) {
    existing.progress = progress;
  } else {
    window.DOWNLOAD_PROGRESS.push({ name, url, progress });
  }
}

// Make functions globally accessible for background operation
window.clearAllLogs = clearAllLogs;
window.performMemoryCleanup = performMemoryCleanup;
window.emergencyMemoryCleanup = emergencyMemoryCleanup;

// Initialize background memory management
if (typeof window !== "undefined") {
  setTimeout(() => {
    console.log("🔧 Background memory management initialized");
  }, 1000);
}
