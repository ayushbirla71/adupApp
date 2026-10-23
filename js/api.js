async function joinGroup() {
  const groupId = $("#groupId").val();
  // var groupId = "AYUSHGOQOI"; // Use var, not const
  if (!groupId) {
    alert("Please enter license key.");
    return;
  }

  $(".login_loader").show();
  await deletePlaceHolderFile("placeholder");

  getTVDeviceInfo().then(function (deviceInfo) {
    if (!deviceInfo) {
      alert("Failed to retrieve device information.");
      return;
    }

    var android_id = deviceInfo.android_id;
    localStorage.setItem("android_id", android_id);
    var location = deviceInfo.location;
    console.log("Device Info:", deviceInfo);

    $.ajax({
      url: API_BASE_URL + "device/register",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      data: JSON.stringify({
        location: "No Location",
        reg_code: groupId,
        android_id: android_id,
      }),
      success: function (response) {
        console.log("Group joined successfully:", response);
        showToast("success", "Group joined successfully");

        var newToken = response.token;
        var ads = response.ads;

        // Decode token
        var decoded = decodeTokenPayload(newToken);
        console.log("Decoded Token Payload:", decoded);

        // Store token and decoded info in localStorage
        localStorage.setItem("token", newToken);
        localStorage.setItem(
          "group_id",
          decoded && decoded.group_id ? decoded.group_id : ""
        );
        localStorage.setItem("placeholder", ads[0]);
        localStorage.setItem(
          "device_id",
          decoded && decoded.device_id ? decoded.device_id : ""
        );

        $(".joinGroup-container").hide();
        $(".main-container").hide();
        $(".ad-player-container").show();
        $(".ad-player-container").addClass("active");
        $(".joinGroup-container").removeClass("active");

        SN.focus("#ad_player");
        var contentHTML = generateImageAds(ads[0]);

        var $element = $("#ad_player");
        $element.html("");
        $element.html(contentHTML);

        connectMQTT({
          device_id: decoded && decoded.device_id ? decoded.device_id : "",
          group_id: decoded && decoded.group_id ? decoded.group_id : "",
        });
      },
      error: function (error) {
        console.error("Error joining group:", error);
        alert("Failed to join group.");
      },
      complete: function () {
        $(".login_loader").hide();
      },
    });
  });
}

async function registerDevice() {
  $(".login_loader").show();
  getTizenSignageInfo()
    .then(function (deviceInfo) {
      console.log("Device Info:", deviceInfo);
      $.ajax({
        url: API_BASE_URL + "device/new-register",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        data: JSON.stringify(deviceInfo),
        success: function (response) {
          console.log("Device registered successfully:", response);
          showToast("success", "Device registered successfully");
          let { pairing_code } = response;
          localStorage.setItem("android_id", response.android_id);
          localStorage.setItem("device_id", response.device_id);
          // Assuming pairing_code is a string of 6 digits
          for (let i = 0; i < pairing_code.length; i++) {
            $(`#digit-${i}`).text(pairing_code[i]);
          }

          $(".pairing-box").show();
          waitingForMqttReplyForDeviceConfirmation(
            response.android_id,
            response.device_id
          );

          deviceOriantationChange(
            window.DEVICE_WINDOW_ORIENT,
            window.DEVICE_WINDOW_WIDTH + "x" + window.DEVICE_WINDOW_HEIGHT
          );
        },

        error: function (error) {
          console.error("Error registering device:", error);
          $(".pairing-box").show();
          alert("Failed to register device.");
        },
        complete: function () {
          $(".login_loader").hide();
        },
      });
    })
    .catch(function (error) {
      console.error("Error getting device info:", error);
      $(".login_loader").hide();
    });
}

async function completeRegisterNewDevice(device_id) {
  const android_id = localStorage.getItem("android_id");
  if (!android_id) {
    alert("Android ID not found. Please join a group first.");
    return;
  }
  // $(".login_loader").show();
  getTVDeviceInfo()
    .then(function (deviceInfo) {
      if (!deviceInfo) {
        alert("Failed to retrieve device information.");
        return;
      }
      console.log("Device Info:", deviceInfo);
      $.ajax({
        url: API_BASE_URL + "device/complete-registration",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        data: JSON.stringify({
          device_id: device_id,
        }),
        success: function (response) {
          console.log("Device registration completed successfully:", response);
          showToast("success", "Device registration completed successfully");
        },
        error: function (error) {
          console.error("Error completing device registration:", error);
          alert("Failed to complete device registration.");
        },
        complete: function () {
          $(".login_loader").hide();
        },
      });
    })
    .catch(function (error) {
      console.error("Error getting device info:", error);
      $(".login_loader").hide();
    });
}

// Enhanced API functions for data management system
async function sendLogsToAPI(payload) {
  return new Promise((resolve) => {
    $.ajax({
      url: LOGS_API_BASE_URL,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-ID": localStorage.getItem("device_id") || "",
        "X-Android-ID": localStorage.getItem("android_id") || "",
        "X-stg" : IS_STG,
      },
      data: JSON.stringify(payload),
      timeout: 30000, // 30 seconds
      success: function (result) {
        logInfo("Logs sent to API successfully:", result);
        resolve({ success: true, data: result });
      },
      error: function (xhr, status, error) {
        const statusCode = xhr.status || 0;
        const errorText = xhr.responseText || error || status;

        logError("API logs request failed:", statusCode, errorText);

        // Determine if error is retryable
        const retryable = statusCode === 0 || statusCode >= 500; // Network errors (0) or server errors (5xx)

        resolve({
          success: false,
          error: `HTTP ${statusCode}: ${errorText}`,
          retryable: retryable,
        });
      },
    });
  });
}

async function sendBulkLogsToAPI(bulkPayload) {
  return new Promise((resolve) => {
    try {
      logInfo(
        `Sending BULK logs to API: ${bulkPayload.totalRecords} total records`
      );

      // ✅ Create JSON file from payload
      const jsonString = JSON.stringify(bulkPayload);
      const jsonBlob = new Blob([jsonString], { type: "application/json" });

      // ✅ Create filename with timestamp and device ID
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const deviceId = localStorage.getItem("device_id") || "unknown";
      const filename = `bulk_logs_${deviceId}_${timestamp}.json`;

      // ✅ Create FormData and append JSON file
      const formData = new FormData();
      formData.append("file", jsonBlob, filename);
      formData.append("deviceId", deviceId);
      formData.append("androidId", localStorage.getItem("android_id") || "");
      formData.append("syncType", "BULK");
      formData.append("totalRecords", bulkPayload.totalRecords.toString());
      formData.append("sentAt", bulkPayload.sentAt);

      logInfo(`Sending bulk data as JSON file: ${filename}`);

      $.ajax({
        url: BULK_LOGS_API_BASE_URL,
        method: "POST",
        headers: {
          // ❌ DON'T set Content-Type - jQuery will set it automatically with boundary
          "X-Device-ID": deviceId,
          "X-Android-ID": localStorage.getItem("android_id") || "",
          "X-Sync-Type": "BULK",
          "X-stg" : IS_STG,
        },
        data: formData,
        processData: false, // ✅ IMPORTANT: Don't process FormData
        contentType: false, // ✅ IMPORTANT: Let browser set Content-Type with boundary
        timeout: 120000, // 2 minutes timeout for bulk uploads
        success: function (result) {
          logInfo("Bulk logs sent to API successfully:", result);
          resolve({ success: true, data: result });
        },
        error: function (xhr, status, error) {
          const statusCode = xhr.status || 0;
          const errorText = xhr.responseText || error || status;

          logError("Bulk API logs request failed:", statusCode, errorText);

          // Determine if error is retryable
          const retryable = statusCode === 0 || statusCode >= 500; // Network errors (0) or server errors (5xx)

          resolve({
            success: false,
            error: `HTTP ${statusCode}: ${errorText}`,
            retryable: retryable,
          });
        },
      });
    } catch (error) {
      logError("Failed to send bulk logs to API:", error);
      resolve({
        success: false,
        error: error.message,
        retryable: true, // Network errors are retryable
      });
    }
  });
}

async function deviceOriantationChange(orientationType, resolution) {
  if (!localStorage.getItem("device_id")) {
    return;
  }

  let isConnected = await window.networkMonitor.checkConnectivity();
  if (!isConnected) {
    logWarn("Device is offline - skipping orientation change");
    return;
  }
  $.ajax({
    url:
      API_BASE_URL +
      "device/update/metadata-confirm/" +
      localStorage.getItem("device_id"),
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    data: JSON.stringify({
      device_orientation: orientationType,
      device_resolution: resolution,
    }),
    success: function (response) {
      console.log("Device orientation changed successfully:", response);
    },
    error: function (error) {
      console.error("Error changing device orientation:", error);
    },
  });
}




// ---------------------------------------------------------------------------
// Device delete ("exit") handshake
// Server publishes {action:"exit", commandId}; after tearing down, the player
// calls POST device/confirm-delete/:device_id. The commandId (only delivered
// over MQTT) and android_id are the proof; the server treats the call as
// idempotent, so retrying is always safe.
// ---------------------------------------------------------------------------
var PENDING_EXIT_CONFIRM_KEY = "pending_exit_confirm";

// Resolves "ok" (200 / device already unknown), "retry" (network / 5xx) or
// "rejected" (4xx other than 404, retrying will not help).
function postExitConfirm(payload) {
  return new Promise(function (resolve) {
    $.ajax({
      url: API_BASE_URL + "device/confirm-delete/" + payload.device_id,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({
        commandId: payload.commandId || null,
        android_id: payload.android_id || null,
      }),
      timeout: 15000,
      success: function () {
        resolve("ok");
      },
      error: function (xhr) {
        var status = (xhr && xhr.status) || 0;
        logWarn("Exit confirm failed, HTTP " + status);
        if (status === 404) resolve("ok");
        else if (status === 0 || status >= 500) resolve("retry");
        else resolve("rejected");
      },
    });
  });
}

function delayMs(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

// Never rejects. Resolves { confirmed, payload } so the caller can persist
// `payload` for a later retry when the server could not be reached.
async function deviceExitConfirm(commandId) {
  var payload = {
    device_id: localStorage.getItem("device_id"),
    android_id: localStorage.getItem("android_id"),
    commandId: commandId || null,
  };
  if (!payload.device_id) {
    return { confirmed: true, payload: payload }; // nothing to confirm
  }

  var backoff = [0, 2000, 5000];
  for (var i = 0; i < backoff.length; i++) {
    try {
      if (backoff[i]) await delayMs(backoff[i]);
      var result = await postExitConfirm(payload);
      if (result === "ok") return { confirmed: true, payload: payload };
      if (result === "rejected") break;
    } catch (e) {
      logError("Exit confirm attempt crashed:", e);
    }
  }
  return { confirmed: false, payload: payload };
}

// Called at boot: if a previous exit could not be confirmed (offline), retry
// now. The record survives localStorage.clear() because it is written after it.
async function flushPendingExitConfirm() {
  try {
    var raw = localStorage.getItem(PENDING_EXIT_CONFIRM_KEY);
    if (!raw) return;
    var payload = JSON.parse(raw);
    if (!payload || !payload.device_id) {
      localStorage.removeItem(PENDING_EXIT_CONFIRM_KEY);
      return;
    }
    var result = await postExitConfirm(payload);
    if (result !== "retry") {
      localStorage.removeItem(PENDING_EXIT_CONFIRM_KEY);
    }
  } catch (e) {
    logError("Pending exit confirm flush failed:", e);
  }
}

// Reconcile for a screen that missed the exit command (it was offline, or the
// device was force-deleted from the CMS). Resolves true only when the server
// explicitly says this device is deleted; any error resolves false so a network
// problem can never wipe a working screen.
function checkDeviceDeletedOnServer() {
  return new Promise(function (resolve) {
    var deviceId = localStorage.getItem("device_id");
    var androidId = localStorage.getItem("android_id");
    if (!deviceId || !androidId) return resolve(false);
    $.ajax({
      url:
        API_BASE_URL +
        "device/is-deleted/" +
        encodeURIComponent(deviceId) +
        "?android_id=" +
        encodeURIComponent(androidId),
      method: "GET",
      timeout: 15000,
      success: function (res) {
        resolve(!!(res && res.deleted === true));
      },
      error: function () {
        resolve(false);
      },
    });
  });
}
