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

function startAdSlide(containerId, textData, speed, rcs_enabled, logo_enabled) {
  console.log(
    "Ad Slide Start",
    containerId,
    textData,
    speed,
    "rcs_enabled:",
    rcs_enabled,
    "logo_enabled:",
    logo_enabled
  );

  if (!containerId) return;

  if (!speed) speed = 1;

  var container = document.getElementById(containerId);

  updateUiHeight(rcs_enabled);

  // Update logo visibility independently (logo is now outside RCS container)
  updateLogoVisibility(rcs_enabled, logo_enabled);

  if (
    rcs_enabled == false ||
    rcs_enabled == "false" ||
    rcs_enabled == null ||
    rcs_enabled == undefined
  ) {
    // Hide RCS container when disabled
    container.style.display = "none";
    return;
  } else {
    // Show RCS container when enabled
    container.style.display = "block";
  }

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
  text.style.transform = "";

  // Force reflow to restart animation smoothly
  void text.offsetWidth;

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

// Check device resolution
const checkDeviceResolution = () => {
  try {
    const width = tizen.systeminfo.getCapability(
      "http://tizen.org/feature/screen.width"
    );
    const height = tizen.systeminfo.getCapability(
      "http://tizen.org/feature/screen.height"
    );

    console.log(`Device resolution: ${width} x ${height}`);

    let resolutionType = "";
    window.DEVICE_WIDTH = width;
    window.DEVICE_HEIGHT = height;

    if (width >= 3840 && height >= 2160) {
      resolutionType = "4K (Ultra HD)";
    } else if (width >= 1920 && height >= 1080) {
      resolutionType = "Full HD (1080p)";
    } else if (width >= 1280 && height >= 720) {
      resolutionType = "HD (720p)";
    } else {
      resolutionType = "Below HD";
    }

    console.log("Screen supports:", resolutionType);
  } catch (error) {
    console.error("Error checking screen capabilities:", error);
  }
};

async function getTizenSignageInfo() {
  const safeCapability = (key) => {
    try {
      return tizen.systeminfo.getCapability(key) ?? null;
    } catch {
      return null;
    }
  };

  try {
    const info = {};

    // 1. Unique ID (Tizen ID might not exist on all signage)
    info.android_id =
      safeCapability("http://tizen.org/system/tizenid") ||
      safeCapability("http://tizen.org/system/platform.uuid") ||
      "unknown";

    // 2. Device type
    const isTV = safeCapability("http://tizen.org/feature/tv") === true;
    info.device_type = isTV ? "tv" : "signage";

    // 3. Model name
    info.device_model =
      safeCapability("http://tizen.org/system/model_name") || "Samsung Signage";

    // 4. OS details
    info.device_os = "tizen";
    info.device_os_version =
      safeCapability("http://tizen.org/feature/platform.version") || "unknown";

    // 5. Orientation - use values from initOrientationListener if available
    let orientation = "landscape";
    let screenWidth = 0;
    let screenHeight = 0;

    try {
      // ✅ First priority: Use global variables set by initOrientationListener
      if (
        window.DEVICE_WINDOW_ORIENT &&
        window.DEVICE_WINDOW_WIDTH &&
        window.DEVICE_WINDOW_HEIGHT
      ) {
        orientation = window.DEVICE_WINDOW_ORIENT;
        screenWidth = window.DEVICE_WINDOW_WIDTH;
        screenHeight = window.DEVICE_WINDOW_HEIGHT;
        console.log(
          "Using orientation from initOrientationListener:",
          orientation,
          `(${screenWidth}x${screenHeight})`
        );
      } else {
        // ✅ Fallback: Detect from screen dimensions
        screenWidth = window.innerWidth || screen.width;
        screenHeight = window.innerHeight || screen.height;
        orientation = screenWidth > screenHeight ? "landscape" : "portrait";
        console.log(
          "Detected orientation (fallback):",
          orientation,
          `(${screenWidth}x${screenHeight})`
        );
      }
    } catch (err) {
      console.error("Error detecting orientation:", err);
      // Fallback to landscape for signage devices
      orientation = "landscape";
      screenWidth = window.innerWidth || screen.width || 1920;
      screenHeight = window.innerHeight || screen.height || 1080;
    }
    info.device_orientation = orientation;

    // 6. Resolution - use the same dimensions from orientation detection
    info.device_resolution = `${screenWidth}x${screenHeight}`;

    // 7. Device name
    info.device_name =
      safeCapability("http://tizen.org/system/device_name") ||
      info.device_model;

    // 8. Network details (safe fallback)
    info.network_type = safeCapability("http://tizen.org/feature/network.wifi")
      ? "WIFI"
      : "ETHERNET";
    info.device_mac =
      safeCapability("http://tizen.org/system/wifi.mac") ||
      safeCapability("http://tizen.org/system/ethernet.mac") ||
      "unknown";

    // 9. Location via IP (optional)
    try {
      const loc = await new Promise((resolve, reject) => {
        $.ajax({
          url: "https://ipapi.co/json/",
          method: "GET",
          timeout: 5000,
          success: function (data) {
            resolve(data);
          },
          error: function () {
            reject(new Error("Failed to get location"));
          },
        });
      });
      info.location = loc.city || "unknown";
    } catch {
      info.location = "unknown";
    }

    // 10. Video Playback Capabilities (Based on Tizen OS Version)
    const osVer = parseFloat(info.device_os_version) || 0;
    if (osVer >= 6.5) {
      info.max_supported_video_streams = 4; // SSSP10/VXT
      // info.max_video_resolution = "4K";
    } else if (osVer >= 4.0) {
      info.max_supported_video_streams = 2; // SSSP6 - SSSP7
      // info.max_video_resolution = "4K";
    } else if (osVer > 0) {
      info.max_supported_video_streams = 1; // SSSP4 - SSSP5
      // info.max_video_resolution = osVer >= 3.0 ? "4K" : "1080p";
    } else {
      info.max_supported_video_streams = 1; // Fallback
      // info.max_video_resolution = "1080p";
    }

    // 11. RAM (Memory)
    try {
      if (typeof tizen !== "undefined" && tizen.systeminfo) {
        const totalMem = tizen.systeminfo.getTotalMemory();
        const availMem = tizen.systeminfo.getAvailableMemory();
        info.total_ram_mb = Math.floor(totalMem / (1024 * 1024));
        // info.ram_free_mb = Math.floor(availMem / (1024 * 1024));
      }
    } catch (e) {
      console.warn("Could not get RAM info:", e);
      info.total_ram_mb = null;
      // info.ram_free_mb = null;
    }

    // 12. Storage (Internal)
    try {
      if (typeof tizen !== "undefined" && tizen.systeminfo) {
        const storageData = await new Promise((resolve) => {
          tizen.systeminfo.getPropertyValue(
            "STORAGE",
            (storage) => {
              if (storage.units && storage.units.length > 0) {
                const internal = storage.units[0];
                resolve({
                  total_storage_mb: Math.floor(internal.capacity / (1024 * 1024)),
                  // free_mb: Math.floor(internal.availableCapacity / (1024 * 1024)),
                });
              } else {
                resolve(null);
              }
            },
            () => resolve(null)
          );
        });
        
        if (storageData) {
          info.total_storage_mb = storageData.total_storage_mb;
          // info.storage_free_mb = storageData.free_mb;
        }
      }
    } catch (e) {
      console.warn("Could not get Storage info:", e);
      info.total_storage_mb = null;
      // info.storage_free_mb = null;
    }




    console.log("Tizen Signage Info:", info);
    return info;
  } catch (error) {
    console.error("Error getting signage info:", error);
    return null;
  }
}
function updateUiHeight(rcs_enabled) {
  console.log("updateUiHeight", rcs_enabled);
  const elements = [
    document.getElementById("av-player"),
    document.getElementById("av-player2"),
    document.getElementById("hls-player"),
    ...document.querySelectorAll(
      ".ad-player-image, .ad-player, .ad_image, .ad_video"
    ),
  ];

  elements.forEach((el) => {
    if (!el) return;

    if (rcs_enabled == false) {
      console.log("updateUiHeight rcs_enabled", rcs_enabled);
      el.classList.add("custome-height");
      el.style.height = ""; // clear inline height
    } else {
      el.classList.remove("custome-height");
      el.style.height = "100vh !important"; // default inline height
    }
  });
}

function updateLogoVisibility(rcs_enabled, logo_enabled) {
  console.log(
    "updateLogoVisibility - rcs_enabled:",
    rcs_enabled,
    "logo_enabled:",
    logo_enabled
  );

  var logo = document.getElementById("rcs_logo");

  if (!logo) {
    console.warn("Logo element not found");
    return;
  }

  // Logo visibility logic (logo is now independent from RCS container):
  // 1. If logo_enabled is true, show logo
  // 2. If logo_enabled is false, hide logo
  // 3. Logo is positioned fixed in bottom right corner, independent of RCS

  if (logo_enabled == true || logo_enabled == "true") {
    logo.style.display = "block";
    console.log("✅ Logo visible (independent from RCS)");
  } else {
    logo.style.display = "none";
    console.log("❌ Logo hidden");
  }
}



// ==========================================
// 📊 INTELLIGENT PAYLOAD TRANSFORMER
// ==========================================
// function transformPayload(serverPayload) {
//     if (!serverPayload || !serverPayload.content || !Array.isArray(serverPayload.content)) {
//         console.warn("⚠️ Invalid payload structure. Showing empty layout.");
//         return { rcs_enabled: false, zones: [] };
//     }

//     const contentArray = serverPayload.content;
//     let screenW = 1920;
//     let screenH = 1080;

//     const getWidgetType = (rawType) => {
//         if (!rawType) return 'iframe';
//         const supported = ["clock_analog", "clock_digital", "calendar", "logo", "emoji", "sliding_text"];
//         return supported.includes(rawType) ? rawType : 'iframe';
//     };

//     const mapAdItem = (itemData, scheduleInfo = null) => {
//         let isWidget = itemData.type === "widget" || (scheduleInfo && scheduleInfo.content_type === "widget");
        
//         let mappedItem = {
//             // ⭐ FIX: Added itemData.live_content_id to catch live streams
//             ad_id: itemData.ad_id || itemData.widget_id || itemData.live_content_id || itemData.id,
//             name: itemData.name,
//             url: itemData.url || (scheduleInfo?.widget_config ? scheduleInfo.widget_config.url : null),
//             file_extension: itemData.file_extension || (isWidget ? 'widget' : 'mp4'),
//             duration: itemData.duration || 15,
//             time_slots: scheduleInfo ? scheduleInfo.time_slots : itemData.time_slots,
//             weekdays: scheduleInfo ? scheduleInfo.weekdays : itemData.weekdays
//         };

//         if (isWidget) {
//             mappedItem.is_widget = true;
//             mappedItem.widget_type = getWidgetType(scheduleInfo?.content?.type || itemData.type);
//             mappedItem.aspect_ratio = scheduleInfo?.content?.aspect_ratio || itemData.aspect_ratio || null; 
//             mappedItem.config = scheduleInfo?.widget_config || {};
//         }
//         return mappedItem;
//     };

//     // PRIORITY 1: Standalone Live Stream
//     const standaloneLive = contentArray.find(item => item.type === "live_content");
//     if (standaloneLive) {
//         console.log("📺 PRIORITY 1: Standalone Live Stream Detected.");
//         return {
//             rcs_enabled: serverPayload.rcs_enabled,
//             placeholder_enabled: serverPayload.placeholder_enabled,
//             logo_enabled: serverPayload.logo_enabled,
//             rcs: serverPayload.rcs,
//             zones: [{
//                 zone_id: "fullscreen-live-zone",
//                 name: "Fullscreen Live",
//                 type: "video_primary", 
//                 rect: { x: 0, y: 0, w: screenW, h: screenH },
//                 ads: [],
//                 carousels: [],
//                 liveContents: [mapAdItem(standaloneLive)]
//             }]
//         };
//     }

//     // PRIORITY 2: Multi-Zone Layout (Which may contain nested live streams)
//     const layoutContent = contentArray.find(item => item.type === "layout");
//     if (layoutContent) {
//         console.log("🪟 PRIORITY 2: Multi-Zone Layout Detected.");
        
//         if (layoutContent.resolution) {
//             const resParts = layoutContent.resolution.split('x');
//             screenW = parseInt(resParts[0], 10) || 1920;
//             screenH = parseInt(resParts[1], 10) || 1080;
//         }

//         let parsedZones = layoutContent.zones.map(z => {
//             const rect = {
//                 x: Math.round((z.x / 100) * screenW),
//                 y: Math.round((z.y / 100) * screenH),
//                 w: Math.round((z.width / 100) * screenW),
//                 h: Math.round((z.height / 100) * screenH)
//             };

//             let ads = [];
//             let carousels = [];
//             let liveContents = []; // ⭐ FIX: Setup array for nested live contents

//             if (z.zone_schedules) {
//                 z.zone_schedules.forEach(schedule => {
//                     if (schedule.content_type === "ad" || schedule.content_type === "widget" || schedule.content_type === "placeholder") {
//                         ads.push(mapAdItem(schedule.content, schedule));
//                     } else if (schedule.content_type === "carousel") {
//                         carousels.push({
//                             carousel_id: schedule.content.carousel_id,
//                             items: schedule.content.items.map(item => mapAdItem(item, schedule))
//                         });
//                     } else if (schedule.content_type === "live_content") {
//                         // ⭐ FIX: Intercept live content nested inside layouts!
//                         liveContents.push(mapAdItem(schedule.content, schedule));
//                     }
//                 });
//             }

//             return {
//                 zone_id: z.zone_id,
//                 name: z.name,
//                 rect: rect,
//                 ads: ads,
//                 carousels: carousels,
//                 liveContents: liveContents, // ⭐ FIX: Pass the populated array to the zone
//                 zIndex: z.z_index || 10,
//                 _area: rect.w * rect.h 
//             };
//         });

//         // Ensure decoders go to the largest zone
//         if (parsedZones.length > 0) {
//             parsedZones.sort((a, b) => b._area - a._area);
//             parsedZones[0].type = "video_primary"; 
//             for (let i = 1; i < parsedZones.length; i++) {
//                 parsedZones[i].type = "image_only"; 
//             }
//         }

//         return {
//             rcs_enabled: serverPayload.rcs_enabled,
//             placeholder_enabled: serverPayload.placeholder_enabled,
//             logo_enabled: serverPayload.logo_enabled,
//             rcs: serverPayload.rcs,
//             zones: parsedZones
//         };
//     }

//     // PRIORITY 3: Legacy Single-Zone
//     console.log("🎞️ PRIORITY 3: Falling back to Single Fullscreen Zone.");
//     let standaloneAds = [];
//     let standaloneCarousels = [];

//     contentArray.forEach(item => {
//         if (item.type === "ad" || item.type === "placeholder") {
//             standaloneAds.push(mapAdItem(item));
//         } else if (item.type === "carousel") {
//             standaloneCarousels.push({
//                 carousel_id: item.id || item.carousel_id,
//                 items: item.items ? item.items.map(i => mapAdItem(i)) : []
//             });
//         }
//     });

//     return {
//         rcs_enabled: serverPayload.rcs_enabled,
//         placeholder_enabled: serverPayload.placeholder_enabled,
//         logo_enabled: serverPayload.logo_enabled,
//         rcs: serverPayload.rcs,
//         zones: [{
//             zone_id: "fullscreen-legacy-zone",
//             name: "Fullscreen Legacy",
//             type: "video_primary", 
//             rect: { x: 0, y: 0, w: screenW, h: screenH },
//             ads: standaloneAds,
//             carousels: standaloneCarousels,
//             liveContents: []
//         }]
//     };
// }


// ==========================================
// 📊 INTELLIGENT PAYLOAD TRANSFORMER
// Enforces Strict Widget Exclusivity
// ==========================================
// function transformPayload(serverPayload) {
//     if (!serverPayload || !serverPayload.content || !Array.isArray(serverPayload.content)) {
//         console.warn("⚠️ Invalid payload structure. Showing empty layout.");
//         return { rcs_enabled: false, zones: [] };
//     }

//     const contentArray = serverPayload.content;
//     let screenW = 1920;
//     let screenH = 1080;

//     const getWidgetType = (rawType) => {
//         if (!rawType) return 'iframe';
//         const supported = ["clock_analog", "clock_digital", "calendar", "logo", "emoji", "sliding_text", "ticker"];
//         return supported.includes(rawType) ? rawType : 'iframe';
//     };

//     const mapAdItem = (itemData, scheduleInfo = null) => {
//         let isWidget = itemData.type === "widget" || (scheduleInfo && scheduleInfo.content_type === "widget");
        
//         let mappedItem = {
//             ad_id: itemData.ad_id || itemData.widget_id || itemData.live_content_id || itemData.id,
//             name: itemData.name,
//             url: itemData.url || (scheduleInfo?.widget_config ? scheduleInfo.widget_config.url : null),
//             file_extension: itemData.file_extension || (isWidget ? 'widget' : 'mp4'),
//             duration: itemData.duration || 15,
//             time_slots: scheduleInfo ? scheduleInfo.time_slots : itemData.time_slots,
//             weekdays: scheduleInfo ? scheduleInfo.weekdays : itemData.weekdays
//         };

//         if (isWidget) {
//             mappedItem.is_widget = true;
//             mappedItem.widget_type = getWidgetType(scheduleInfo?.content?.type || itemData.type);
//             mappedItem.aspect_ratio = scheduleInfo?.content?.aspect_ratio || itemData.aspect_ratio || null; 
//             mappedItem.config = scheduleInfo?.widget_config || {};
//         }
//         return mappedItem;
//     };

//     // PRIORITY 1: Standalone Live Stream
//     const standaloneLive = contentArray.find(item => item.type === "live_content");
//     if (standaloneLive) {
//         console.log("📺 PRIORITY 1: Standalone Live Stream Detected.");
//         return {
//             rcs_enabled: serverPayload.rcs_enabled,
//             placeholder_enabled: serverPayload.placeholder_enabled,
//             logo_enabled: serverPayload.logo_enabled,
//             rcs: serverPayload.rcs,
//             zones: [{
//                 zone_id: "fullscreen-live-zone",
//                 name: "Fullscreen Live",
//                 type: "video_primary", 
//                 rect: { x: 0, y: 0, w: screenW, h: screenH },
//                 ads: [],
//                 carousels: [],
//                 liveContents: [mapAdItem(standaloneLive)]
//             }]
//         };
//     }

//     // PRIORITY 2: Multi-Zone Layout
//     const layoutContent = contentArray.find(item => item.type === "layout");
//     if (layoutContent) {
//         console.log("🪟 PRIORITY 2: Multi-Zone Layout Detected.");
        
//         if (layoutContent.resolution) {
//             const resParts = layoutContent.resolution.split('x');
//             screenW = parseInt(resParts[0], 10) || 1920;
//             screenH = parseInt(resParts[1], 10) || 1080;
//         }

//         let parsedZones = layoutContent.zones.map(z => {
//             const rect = {
//                 x: Math.round((z.x / 100) * screenW),
//                 y: Math.round((z.y / 100) * screenH),
//                 w: Math.round((z.width / 100) * screenW),
//                 h: Math.round((z.height / 100) * screenH)
//             };

//             let ads = [];
//             let carousels = [];
//             let liveContents = []; 

//             if (z.zone_schedules) {
//                 z.zone_schedules.forEach(schedule => {
//                     if (schedule.content_type === "ad" || schedule.content_type === "widget" || schedule.content_type === "placeholder") {
//                         ads.push(mapAdItem(schedule.content, schedule));
//                     } else if (schedule.content_type === "carousel") {
//                         carousels.push({
//                             carousel_id: schedule.content.carousel_id,
//                             items: schedule.content.items.map(item => mapAdItem(item, schedule))
//                         });
//                     } else if (schedule.content_type === "live_content") {
//                         liveContents.push(mapAdItem(schedule.content, schedule));
//                     }
//                 });
//             }

//             // ⭐ CRITICAL FIX: STRICT WIDGET EXCLUSIVITY RULE
//             const foundWidget = ads.find(item => item.is_widget === true);
//             if (foundWidget) {
//                 console.log(`🔒 Zone [${z.name}] locked to exclusive widget: ${foundWidget.widget_type}`);
//                 ads = [foundWidget]; // Keep exactly ONE widget
//                 carousels = [];      // Delete all carousels
//                 liveContents = [];   // Delete all live streams
//             }

//             return {
//                 zone_id: z.zone_id,
//                 name: z.name,
//                 rect: rect,
//                 ads: ads,
//                 carousels: carousels,
//                 liveContents: liveContents,
//                 zIndex: z.z_index || 10,
//                 _area: rect.w * rect.h 
//             };
//         });

//         // Ensure decoders go to the largest zone
//         if (parsedZones.length > 0) {
//             parsedZones.sort((a, b) => b._area - a._area);
//             parsedZones[0].type = "video_primary"; 
//             for (let i = 1; i < parsedZones.length; i++) {
//                 parsedZones[i].type = "image_only"; 
//             }
//         }

//         return {
//             rcs_enabled: serverPayload.rcs_enabled,
//             placeholder_enabled: serverPayload.placeholder_enabled,
//             logo_enabled: serverPayload.logo_enabled,
//             rcs: serverPayload.rcs,
//             zones: parsedZones
//         };
//     }

//     // PRIORITY 3: Legacy Single-Zone
//     console.log("🎞️ PRIORITY 3: Falling back to Single Fullscreen Zone.");
//     let standaloneAds = [];
//     let standaloneCarousels = [];

//     contentArray.forEach(item => {
//         if (item.type === "ad" || item.type === "placeholder" || item.type === "widget") {
//             standaloneAds.push(mapAdItem(item));
//         } else if (item.type === "carousel") {
//             standaloneCarousels.push({
//                 carousel_id: item.id || item.carousel_id,
//                 items: item.items ? item.items.map(i => mapAdItem(i)) : []
//             });
//         }
//     });

//     // ⭐ STRICT WIDGET EXCLUSIVITY RULE (For Legacy Fallback)
//     const foundWidgetFallback = standaloneAds.find(item => item.is_widget === true);
//     if (foundWidgetFallback) {
//         standaloneAds = [foundWidgetFallback];
//         standaloneCarousels = [];
//     }

//     return {
//         rcs_enabled: serverPayload.rcs_enabled,
//         placeholder_enabled: serverPayload.placeholder_enabled,
//         logo_enabled: serverPayload.logo_enabled,
//         rcs: serverPayload.rcs,
//         zones: [{
//             zone_id: "fullscreen-legacy-zone",
//             name: "Fullscreen Legacy",
//             type: "video_primary", 
//             rect: { x: 0, y: 0, w: screenW, h: screenH },
//             ads: standaloneAds,
//             carousels: standaloneCarousels,
//             liveContents: []
//         }]
//     };
// }


// ==========================================
// 📊 INTELLIGENT PAYLOAD TRANSFORMER
// (Your Working Master Code + 96vh RCS Squeeze)
// ==========================================
// function transformPayload(serverPayload) {
//     if (!serverPayload || !serverPayload.content || !Array.isArray(serverPayload.content)) {
//         console.warn("⚠️ Invalid payload structure. Showing empty layout.");
//         return { rcs_enabled: false, zones: [] };
//     }

//     let background_color = "transparent";

//     const contentArray = serverPayload.content;
//     let screenW = 1920;
//     let screenH = 1080;

//     // ⭐ SAFE RCS CHECK: Handles both booleans (true) and strings ("true")
//     const isRcsEnabled = serverPayload.rcs_enabled === true || String(serverPayload.rcs_enabled).toLowerCase() === "true";

//     const getWidgetType = (rawType) => {
//         if (!rawType) return 'iframe';
//         const supported = ["clock_analog", "clock_digital", "calendar", "logo", "emoji", "sliding_text", "ticker","countdown_timer"];
//         return supported.includes(rawType) ? rawType : 'iframe';
//     };

//     const mapAdItem = (itemData, scheduleInfo = null) => {
//         let isWidget = itemData.type === "widget" || (scheduleInfo && scheduleInfo.content_type === "widget");
        
//         let mappedItem = {
//             ad_id: itemData.ad_id || itemData.widget_id || itemData.live_content_id || itemData.id,
//             name: itemData.name,
//             timestamp: itemData.timestamp || null,
//             url: itemData.url || (scheduleInfo?.widget_config ? scheduleInfo.widget_config.url : null),
//             file_extension: itemData.file_extension || (isWidget ? 'widget' : 'mp4'),
//             duration: itemData.duration || 15,
//             time_slots: scheduleInfo ? scheduleInfo.time_slots : itemData.time_slots,
//             weekdays: scheduleInfo ? scheduleInfo.weekdays : itemData.weekdays
//         };

//         if (isWidget) {
//             mappedItem.is_widget = true;
//             mappedItem.widget_type = getWidgetType(scheduleInfo?.content?.type || itemData.type);
//             mappedItem.aspect_ratio = scheduleInfo?.content?.aspect_ratio || itemData.aspect_ratio || null; 
//             mappedItem.config = scheduleInfo?.widget_config || {};
//         }
//         return mappedItem;
//     };

//     // PRIORITY 1: Standalone Live Stream
//     const standaloneLive = contentArray.find(item => item.type === "live_content");
//     if (standaloneLive) {
//         console.log("📺 PRIORITY 1: Standalone Live Stream Detected.");
        
//         // ⭐ If RCS is active, shrink fullscreen height to 96%
//         let effectiveScreenH = isRcsEnabled ? Math.round(screenH * 0.96) : screenH; 

//         return {
//             rcs_enabled: serverPayload.rcs_enabled,
//             placeholder_enabled: serverPayload.placeholder_enabled,
//             logo_enabled: serverPayload.logo_enabled,
//             rcs: serverPayload.rcs,
//             background_color:background_color,
//             zones: [{
//                 zone_id: "fullscreen-live-zone",
//                 name: "Fullscreen Live",
//                 type: "video_primary", 
//                 border_radius:0,
//                 rect: { x: 0, y: 0, w: screenW, h: effectiveScreenH }, // ⭐ Adjusted Height
//                 ads: [],
//                 carousels: [],
//                 liveContents: [mapAdItem(standaloneLive)]
//             }]
//         };
//     }

//     // PRIORITY 2: Multi-Zone Layout
//     const layoutContent = contentArray.find(item => item.type === "layout");
//     if (layoutContent) {
//         console.log("🪟 PRIORITY 2: Multi-Zone Layout Detected.");
//         background_color = layoutContent.background_color || "transparent"
//         if (layoutContent.resolution) {
//             const resParts = layoutContent.resolution.split('x');
//             screenW = parseInt(resParts[0], 10) || 1920;
//             screenH = parseInt(resParts[1], 10) || 1080;
//         }

//         // ⭐ Calculate the new 96% screen height for the layout engine
//         let effectiveScreenH = isRcsEnabled ? Math.round(screenH * 0.96) : screenH; 

//         let parsedZones = layoutContent.zones.map(z => {
//             // ⭐ Multiply the layout percentages against the newly shrunk effective height
//             const rect = {
//                 x: Math.round((z.x / 100) * screenW),
//                 y: Math.round((z.y / 100) * effectiveScreenH), // Scaled Y
//                 w: Math.round((z.width / 100) * screenW),
//                 h: Math.round((z.height / 100) * effectiveScreenH) // Scaled Height
//             };

//             let ads = [];
//             let carousels = [];
//             let liveContents = []; 

//             if (z.zone_schedules) {
//                 z.zone_schedules.forEach(schedule => {
//                     if (schedule.content_type === "ad" || schedule.content_type === "widget" || schedule.content_type === "placeholder") {
//                         ads.push(mapAdItem(schedule.content, schedule));
//                     } else if (schedule.content_type === "carousel") {
//                         carousels.push({
//                             carousel_id: schedule.content.carousel_id,
//                             items: schedule.content.items.map(item => mapAdItem(item, schedule))
//                         });
//                     } else if (schedule.content_type === "live_content") {
//                         liveContents.push(mapAdItem(schedule.content, schedule));
//                     }
//                 });
//             }

//             // CRITICAL FIX: STRICT WIDGET EXCLUSIVITY RULE
//             const foundWidget = ads.find(item => item.is_widget === true);
//             if (foundWidget) {
//                 console.log(`🔒 Zone [${z.name}] locked to exclusive widget: ${foundWidget.widget_type}`);
//                 ads = [foundWidget]; // Keep exactly ONE widget
//                 carousels = [];      // Delete all carousels
//                 liveContents = [];   // Delete all live streams
//             }

//             return {
//                 zone_id: z.zone_id,
//                 name: z.name,
//                 rect: rect,
//                 border_radius:z.border_radius || 0,
//                 ads: ads,
//                 carousels: carousels,
//                 liveContents: liveContents,
//                 zIndex: z.z_index || 10,
//                 _area: rect.w * rect.h 
//             };
//         });

//         // Ensure decoders go to the largest zone
//         if (parsedZones.length > 0) {
//             parsedZones.sort((a, b) => b._area - a._area);
//             parsedZones[0].type = "video_primary"; 
//             for (let i = 1; i < parsedZones.length; i++) {
//                 parsedZones[i].type = "image_only"; 
//             }
//         }

//         return {
//             rcs_enabled: serverPayload.rcs_enabled,
//             placeholder_enabled: serverPayload.placeholder_enabled,
//             logo_enabled: serverPayload.logo_enabled,
//             rcs: serverPayload.rcs,
//             background_color:background_color,
//             zones: parsedZones
//         };
//     }

//     // PRIORITY 3: Legacy Single-Zone
//     console.log("🎞️ PRIORITY 3: Falling back to Single Fullscreen Zone.");
    
//     // ⭐ Calculate 96% height for the fallback single zone
//     let effectiveScreenH = isRcsEnabled ? Math.round(screenH * 0.96) : screenH; 

//     let standaloneAds = [];
//     let standaloneCarousels = [];

//     contentArray.forEach(item => {
//         if (item.type === "ad" || item.type === "placeholder" || item.type === "widget") {
//             standaloneAds.push(mapAdItem(item));
//         } else if (item.type === "carousel") {
//             standaloneCarousels.push({
//                 carousel_id: item.id || item.carousel_id,
//                 items: item.items ? item.items.map(i => mapAdItem(i)) : []
//             });
//         }
//     });

//     // STRICT WIDGET EXCLUSIVITY RULE (For Legacy Fallback)
//     const foundWidgetFallback = standaloneAds.find(item => item.is_widget === true);
//     if (foundWidgetFallback) {
//         standaloneAds = [foundWidgetFallback];
//         standaloneCarousels = [];
//     }

//     return {
//         rcs_enabled: serverPayload.rcs_enabled,
//         placeholder_enabled: serverPayload.placeholder_enabled,
//         logo_enabled: serverPayload.logo_enabled,
//         rcs: serverPayload.rcs,
//         background_color:background_color,
//         zones: [{
//             zone_id: "fullscreen-legacy-zone",
//             name: "Fullscreen Legacy",
//             type: "video_primary", 
//             border_radius: 0,
//             rect: { x: 0, y: 0, w: screenW, h: effectiveScreenH }, // ⭐ Adjusted Height
//             ads: standaloneAds,
//             carousels: standaloneCarousels,
//             liveContents: []
//         }]
//     };
// }


function transformPayload(serverPayload) {
    if (!serverPayload || !serverPayload.content || !Array.isArray(serverPayload.content)) {
        console.warn("⚠️ Invalid payload structure. Showing empty layout.");
        return { rcs_enabled: false, zones: [] };
    }

    let background_color = "transparent";

    const contentArray = serverPayload.content;
let isPortrait = DEVICE_WINDOW_ORIENT === "portrait";

let screenW = isPortrait ? 1080 : 1920;
let screenH = isPortrait ? 1920 : 1080;

    // ⭐ SAFE RCS CHECK: Handles both booleans (true) and strings ("true")
    const isRcsEnabled = serverPayload.rcs_enabled === true || String(serverPayload.rcs_enabled).toLowerCase() === "true";

    const getWidgetType = (rawType) => {
        if (!rawType) return 'iframe';
        const supported = ["clock_analog", "clock_digital", "calendar", "logo", "emoji", "sliding_text", "ticker", "countdown_timer", "heading_v1", "heading"];
        return supported.includes(rawType) ? rawType : 'iframe';
    };

    const mapAdItem = (itemData, scheduleInfo = null) => {
        let isWidget = itemData.type === "widget" || (scheduleInfo && scheduleInfo.content_type === "widget");
        
        let mappedItem = {
            ad_id: itemData.ad_id || itemData.widget_id || itemData.live_content_id || itemData.id,
            name: itemData.name,
            timestamp: itemData.timestamp || null,
            website_type:itemData.website_type || null,
            url: itemData.url || (scheduleInfo?.widget_config ? scheduleInfo.widget_config.url : null),
            file_extension: itemData.file_extension || (isWidget ? 'widget' : 'mp4'),
            duration: itemData.duration || 15,
            time_slots: scheduleInfo ? scheduleInfo.time_slots : itemData.time_slots,
            weekdays: scheduleInfo ? scheduleInfo.weekdays : itemData.weekdays
        };

        if (isWidget) {
            mappedItem.is_widget = true;
            mappedItem.widget_type = getWidgetType(scheduleInfo?.content?.type || itemData.type);
            mappedItem.aspect_ratio = scheduleInfo?.content?.aspect_ratio || itemData.aspect_ratio || null; 
            mappedItem.config = scheduleInfo?.widget_config || {};
        }
        return mappedItem;
    };

    // ========================================================================
    // ⭐ NEW CONTENT-AWARE CHECK: Does this zone actually contain Video/Live?
    // ========================================================================
    const zoneNeedsVideo = (z) => {
        const hasVideo = (item) => {
            if (!item || item.is_widget) return false;
            const ext = (item.file_extension || '').toLowerCase();
            const url = (item.url || '').toLowerCase();
            return ['mp4', 'mkv', 'avi', 'm3u8'].includes(ext) || url.endsWith('.mp4') || url.endsWith('.m3u8') || url.includes('youtube');
        };

        const adsHaveVideo = z.ads.some(hasVideo);
        const liveHasVideo = z.liveContents.length > 0;
        const carouselsHaveVideo = z.carousels.some(c => c.items.some(hasVideo));

        return adsHaveVideo || liveHasVideo || carouselsHaveVideo;
    };

    // PRIORITY 1: Standalone Live Stream
    const standaloneLive = contentArray.find(item => item.type === "live_content");
    if (standaloneLive) {
        console.log("📺 PRIORITY 1: Standalone Live Stream Detected.");
        let effectiveScreenH = isRcsEnabled ? Math.round(screenH * 0.96) : screenH; 

        return {
            rcs_enabled: serverPayload.rcs_enabled,
            placeholder_enabled: serverPayload.placeholder_enabled,
            logo_enabled: serverPayload.logo_enabled,
            rcs: serverPayload.rcs,
            background_color: background_color,
            zones: [{
                zone_id: "fullscreen-live-zone",
                name: "Fullscreen Live",
                type: "video_primary", 
                border_radius: 0,
                rect: { x: 0, y: 0, w: screenW, h: effectiveScreenH }, 
                ads: [],
                carousels: [],
                liveContents: [mapAdItem(standaloneLive)]
            }]
        };
    }

    // PRIORITY 2: Multi-Zone Layout
    const layoutContent = contentArray.find(item => item.type === "layout");
    if (layoutContent) {
        console.log("🪟 PRIORITY 2: Multi-Zone Layout Detected.");
        background_color = layoutContent.background_color || "transparent";
        if (layoutContent.resolution) {
            const resParts = layoutContent.resolution.split('x');
            screenW = parseInt(resParts[0], 10) || 1920;
            screenH = parseInt(resParts[1], 10) || 1080;
        }

        let effectiveScreenH = isRcsEnabled ? Math.round(screenH * 0.96) : screenH; 

        let parsedZones = layoutContent.zones.map(z => {
            const rect = {
                x: Math.round((z.x / 100) * screenW),
                y: Math.round((z.y / 100) * effectiveScreenH),
                w: Math.round((z.width / 100) * screenW),
                h: Math.round((z.height / 100) * effectiveScreenH) 
            };

            let ads = [];
            let carousels = [];
            let liveContents = []; 

            if (z.zone_schedules) {
                z.zone_schedules.forEach(schedule => {
                    if (schedule.content_type === "ad" || schedule.content_type === "widget" || schedule.content_type === "placeholder") {
                        ads.push(mapAdItem(schedule.content, schedule));
                    } else if (schedule.content_type === "carousel") {
                        carousels.push({
                            carousel_id: schedule.content.carousel_id,
                            items: schedule.content.items.map(item => mapAdItem(item, schedule))
                        });
                    } else if (schedule.content_type === "live_content") {
                        liveContents.push(mapAdItem(schedule.content, schedule));
                    }
                });
            }

            // CRITICAL FIX: STRICT WIDGET EXCLUSIVITY RULE
            const foundWidget = ads.find(item => item.is_widget === true);
            if (foundWidget) {
                console.log(`🔒 Zone [${z.name}] locked to exclusive widget: ${foundWidget.widget_type}`);
                ads = [foundWidget]; 
                carousels = [];      
                liveContents = [];   
            }

            return {
                zone_id: z.zone_id,
                name: z.name,
                rect: rect,
                border_radius: z.border_radius || 0,
                ads: ads,
                carousels: carousels,
                liveContents: liveContents,
                zIndex: z.z_index || 10,
                _area: rect.w * rect.h 
            };
        });

        // ========================================================================
        // ⭐ INTELLIGENT DECODER ASSIGNMENT
        // ========================================================================
        if (parsedZones.length > 0) {
            // 1. Tag zones with video content
            parsedZones.forEach(z => { z._needsVideo = zoneNeedsVideo(z); });

            // 2. Sort intelligently: Prioritize zones that NEED video first. Tie-breaker is the physical area size.
            parsedZones.sort((a, b) => {
                if (a._needsVideo && !b._needsVideo) return -1;
                if (!a._needsVideo && b._needsVideo) return 1;
                return b._area - a._area; 
            });

            console.log(`🎥 Assigning Hardware Decoder to: [${parsedZones[0].name}] (Needs Video: ${parsedZones[0]._needsVideo})`);

            // 3. Grant decoder to the winner
            parsedZones[0].type = "video_primary"; 
            
            // Protect TV Hardware: Force all secondary zones to fallback to Image/Widget rendering only
            for (let i = 1; i < parsedZones.length; i++) {
                parsedZones[i].type = "image_only"; 
            }
        }

        return {
            rcs_enabled: serverPayload.rcs_enabled,
            placeholder_enabled: serverPayload.placeholder_enabled,
            logo_enabled: serverPayload.logo_enabled,
            rcs: serverPayload.rcs,
            background_color: background_color,
            zones: parsedZones
        };
    }

    // PRIORITY 3: Legacy Single-Zone
    console.log("🎞️ PRIORITY 3: Falling back to Single Fullscreen Zone.");
    let effectiveScreenH = isRcsEnabled ? Math.round(screenH * 0.96) : screenH; 

    let standaloneAds = [];
    let standaloneCarousels = [];

    contentArray.forEach(item => {
        if (item.type === "ad" || item.type === "placeholder" || item.type === "widget") {
            standaloneAds.push(mapAdItem(item));
        } else if (item.type === "carousel") {
            standaloneCarousels.push({
                carousel_id: item.id || item.carousel_id,
                items: item.items ? item.items.map(i => mapAdItem(i)) : []
            });
        }
    });

    const foundWidgetFallback = standaloneAds.find(item => item.is_widget === true);
    if (foundWidgetFallback) {
        standaloneAds = [foundWidgetFallback];
        standaloneCarousels = [];
    }

    return {
        rcs_enabled: serverPayload.rcs_enabled,
        placeholder_enabled: serverPayload.placeholder_enabled,
        logo_enabled: serverPayload.logo_enabled,
        rcs: serverPayload.rcs,
        background_color: background_color,
        zones: [{
            zone_id: "fullscreen-legacy-zone",
            name: "Fullscreen Legacy",
            type: "video_primary", 
            border_radius: 0,
            rect: { x: 0, y: 0, w: screenW, h: effectiveScreenH }, 
            ads: standaloneAds,
            carousels: standaloneCarousels,
            liveContents: []
        }]
    };
}