// MQTT Configuration

var mqttClient = null;
var currentGroupTopic = null;
var currentGroupNotifTopic = null;

function connectMQTT(options) {
  var device_id = options.device_id || localStorage.getItem("device_id");
  var group_id = options.group_id || localStorage.getItem("group_id");
  let android_id = localStorage.getItem("android_id");

  // var url = "ws://cms.ad96.in:9001/mqtt"; // Use wss:// if SSL is supported
  // var url = "ws://console.adup.live:9001/mqtt";
  var url = "ws://dev.ad96.in:9001/mqtt";
  var client = null;
  // handleMQTTAds({
  //   ads: options.ads,
  //   rcs: options.rcs,
  //   placeholderUpdate: true,
  //   placeholder_enabled: options.placeholder_enabled,
  //   rcs_enabled: options.rcs_enabled,
  //   logo_enabled: options.logo_enabled,
  // });

  processAds(
    client,
    options.content,
    options.rcs,
    true,
    options.placeholder_enabled,
    options.rcs_enabled,
    options.logo_enabled,
  );

  // Identifies this MQTT session so the server can ignore a late Last Will
  // "offline" from a previous session after the device has reconnected.
  var sessionId =
    "signage-" +
    (device_id ? device_id + "-" : "") +
    Math.random().toString(36).substr(2, 8);
  window.mqttSessionId = sessionId;

  var willPayload = {
    device_id: device_id,
    android_id: android_id,
    group_id: group_id,
    type: "DEVICE_OFFLINE",
    title: "Device Offline",
    message: "Screen lost connection to MQTT broker (Unplanned Disconnect)",
    severity: "warning",
    data: {
      reason: "mqtt_lwt_disconnect",
      status: "offline",
      session_id: sessionId,
    },
    timestamp: Date.now(),
  };

  client = mqtt.connect(url, {
    clientId: sessionId,
    username: "myuser",
    password: "adup_2025",
    reconnectPeriod: 5000,
    keepalive: 60,
    clean: true,
    will: {
      topic: "device/notification",
      payload: JSON.stringify(willPayload),
      qos: 1,
      retain: false,
    },
  });

  // `client` is local to connectMQTT; the exit teardown (top-level) needs to reach it.
  window.mqttClient = client;

  publishAcknowledgment(client); // Send acknowledgment after connecting

  console.log("🚀 MQTT Client Created with LWT Offline Will");
  console.log("data", options);

  client.on("connect", function () {
    console.log("✅ MQTT Connected");

    var groupTopic = "ads/" + group_id;
    currentGroupTopic = groupTopic;
    client.subscribe(groupTopic, function (err) {
      if (err) {
        console.error(
          "❌ MQTT Subscription Error for " + groupTopic + ":",
          err,
        );
      } else {
        console.log("📡 Subscribed to topic: " + groupTopic);
      }
    });

    // Subscribe to group notification topic
    var groupNotifTopic = "ads/" + group_id + "/notification";
    currentGroupNotifTopic = groupNotifTopic;
    client.subscribe(groupNotifTopic, function (err) {
      if (err) {
        console.error(
          "❌ MQTT Subscription Error for " + groupNotifTopic + ":",
          err,
        );
      } else {
        console.log("📡 Subscribed to group notification topic: " + groupNotifTopic);
      }
    });

    var deviceTopic = "device/" + device_id;
    client.subscribe(deviceTopic, function (err) {
      if (err) {
        console.error(
          "❌ MQTT Subscription Error for " + deviceTopic + ":",
          err,
        );
      } else {
        console.log("📡 Subscribed to topic: " + deviceTopic);
      }
    });

    // Subscribe to device-specific notification channel
    var deviceNotifTopic = "device/" + device_id + "/notification";
    client.subscribe(deviceNotifTopic, function (err) {
      if (err) {
        console.error(
          "❌ MQTT Subscription Error for " + deviceNotifTopic + ":",
          err,
        );
      } else {
        console.log("📡 Subscribed to device notification topic: " + deviceNotifTopic);
      }
    });

    // The exit command may have been missed while offline (or the device was
    // force-deleted from the CMS): ask the server on every (re)connect.
    checkDeviceDeletedOnServer().then(function (deleted) {
      if (deleted && !window.deviceExiting) {
        console.warn("🗑️ Server reports this device was deleted - resetting");
        performDeviceExitTeardown(null, "server_reconcile");
      }
    });

    // Trigger instant online notification to backend & CMS
    setTimeout(function () {
      if (typeof window.triggerDeviceNotification === "function") {
        window.triggerDeviceNotification(
          "DEVICE_ONLINE",
          "Device Online",
          "Screen connected to MQTT broker and active",
          {
            status: "online",
            device_id: device_id,
            group_id: group_id,
            session_id: sessionId,
            reconnected: client.reconnecting || false,
          },
          "success",
        );
      }
    }, 1000);
  });

  // client.on("message", function (topic, message) {
  //   try {
  //     var data = JSON.parse(message.toString());
  //     console.log(
  //       "📥 MQTT message on topic '" + "date_time" + Date.now() + topic + "':",
  //       data
  //     );

  //     if (topic.indexOf("ads/") === 0) {
  //       // const content = data.content || [];
  //       let ads = data.ads || [];
  //       let content = data.content || [];

  //       // localStorage.setItem("ads", JSON.stringify(ads));
  //       localStorage.setItem("content", JSON.stringify(content));
  //       localStorage.setItem("rcs", data.rcs || "");

  //       // Store logo_enabled flag from payload
  //       if (data.logo_enabled !== null && data.logo_enabled !== undefined) {
  //         localStorage.setItem("logo_enabled", data.logo_enabled);
  //       }

  //       if (
  //         data.placeholder_enabled !== null &&
  //         data.placeholder_enabled !== undefined &&
  //         data.placeholder_enabled == true
  //       ) {
  //         if (data.placeholder) {
  //           let timestamps = new Date().getTime();
  //           localStorage.setItem("placeholder", data.placeholder);
  //           localStorage.setItem("timestamp", timestamps),
  //             deletePlaceHolderFile("placeholder")
  //               .then(function () {
  //                 // ads.push({
  //                 //   url: data.placeholder,
  //                 //   timestamp: timestamps,
  //                 // });
  //                 content.push({
  //                   type: "placeholder",
  //                   url: data.placeholder,
  //                   timestamp: timestamps,
  //                 });
  //                 processAds(
  //                   client,
  //                   content,
  //                   data.rcs,
  //                   true,
  //                   data.placeholder_enabled,
  //                   data.rcs_enabled,
  //                   data.logo_enabled
  //                 );
  //               })
  //               .catch(function (error) {
  //                 console.error("❌ Error deleting placeholder file:", error);
  //                 processAds(
  //                   client,
  //                   content,
  //                   data.rcs,
  //                   false,
  //                   data.placeholder_enabled,
  //                   data.rcs_enabled,
  //                   data.logo_enabled
  //                 );
  //               });
  //         } else {
  //           // ads.push({
  //           //   url: localStorage.getItem("placeholder"),
  //           //   timestamp: localStorage.getItem("timestamp"),
  //           // });
  //           content.push({
  //             type: "placeholder",
  //             url: localStorage.getItem("placeholder"),
  //             timestamp: localStorage.getItem("timestamp"),
  //           });
  //           processAds(
  //             client,
  //             content,
  //             data.rcs,
  //             false,
  //             data.placeholder_enabled,
  //             data.rcs_enabled,
  //             data.logo_enabled
  //           );
  //         }
  //       } else {
  //         processAds(
  //           client,
  //           content,
  //           data.rcs,
  //           false,
  //           data.placeholder_enabled,
  //           data.rcs_enabled,
  //           data.logo_enabled
  //         );
  //       }
  //     } else if (topic.indexOf("device/") === 0) {
  //       console.log("🔧 Handling device-specific action...");

  //       if (data.action === "exit") {
  //         console.log("🔌 Exiting application...");
  //         localStorage.clear();

  //         if (client && typeof client.end === "function") {
  //           client.end(true, function () {
  //             console.log("MQTT client disconnected.");
  //           });
  //         }

  //         try {
  //           if (typeof tizen !== "undefined" && tizen.application) {
  //             tizen.application.getCurrentApplication().exit();
  //           } else {
  //             console.warn("Tizen application API not available.");
  //             window.close();
  //           }
  //         } catch (e) {
  //           console.warn(
  //             "⚠️ Unable to close window. This may be blocked by browser security."
  //           );
  //         }
  //       } else if (data.action === "updateGroup") {
  //         console.log("🔄 Updating group subscription...");
  //         resubscribeGroupTopic(data.group_id);
  //       } else {
  //         console.log("ℹ️ Unknown device command:", data);
  //       }
  //     } else {
  //       showToast("error", "Unknown topic: " + topic);
  //       console.warn("❓ Unknown topic:", topic);
  //     }
  //   } catch (e) {
  //     console.error("⚠️ Error parsing MQTT message:", e);
  //   }
  // });

  client.on("message", function (topic, message) {
    try {
      var data = JSON.parse(message.toString());
      console.log(
        "📥 MQTT message on topic '" + "date_time" + Date.now() + topic + "':",
        data,
      );

      // Handle real-time notification alerts (Downlink from server/CMS)
      if (
        topic.endsWith("/notification") ||
        (data && data.action === "notification")
      ) {
        console.log("🔔 Remote notification alert received:", data);
        showDeviceNotificationOverlay(data);
      } else if (topic.indexOf("ads/") === 0) {
        // Server-assigned id of this push (absent on older backends)
        var payloadMeta = getPayloadMeta(data);
        var payloadGuard = checkPayloadGuard(payloadMeta);
        if (payloadGuard === "stale") {
          console.warn("⏭️ Ignoring stale payload", payloadMeta.payload_id);
          return;
        }
        if (payloadGuard === "duplicate") {
          // Retained message replayed after an MQTT reconnect: already applied
          // in this session, so just re-acknowledge instead of restarting zones.
          console.log("♻️ Payload already applied, acknowledging only");
          publishAcknowledgment(client, payloadMeta);
          return;
        }

        let content = data.content || [];

        localStorage.setItem("content", JSON.stringify(content));
        localStorage.setItem("rcs", data.rcs || "");

        // Store logo_enabled flag from payload
        if (data.logo_enabled !== null && data.logo_enabled !== undefined) {
          localStorage.setItem("logo_enabled", data.logo_enabled);
        }

        if (
          data.placeholder_enabled !== null &&
          data.placeholder_enabled !== undefined &&
          data.placeholder_enabled == true
        ) {
          if (data.placeholder) {
            let timestamps = new Date().getTime();
            localStorage.setItem("placeholder", data.placeholder);
            localStorage.setItem("timestamp", timestamps);

            deletePlaceHolderFile("placeholder")
              .then(function () {
                content.push({
                  type: "placeholder",
                  url: data.placeholder,
                  timestamp: timestamps,
                });
                processAds(
                  client,
                  content,
                  data.rcs,
                  true,
                  data.placeholder_enabled,
                  data.rcs_enabled,
                  data.logo_enabled,
                  payloadMeta,
                );
              })
              .catch(function (error) {
                console.error("❌ Error deleting placeholder file:", error);
                processAds(
                  client,
                  content,
                  data.rcs,
                  false,
                  data.placeholder_enabled,
                  data.rcs_enabled,
                  data.logo_enabled,
                  payloadMeta,
                );
              });
          } else {
            content.push({
              type: "placeholder",
              url: localStorage.getItem("placeholder"),
              timestamp: localStorage.getItem("timestamp"),
            });
            processAds(
              client,
              content,
              data.rcs,
              false,
              data.placeholder_enabled,
              data.rcs_enabled,
              data.logo_enabled,
              payloadMeta,
            );
          }
        } else {
          processAds(
            client,
            content,
            data.rcs,
            false,
            data.placeholder_enabled,
            data.rcs_enabled,
            data.logo_enabled,
            payloadMeta,
          );
        }
      } else if (topic.indexOf("device/") === 0) {
        console.log("🔧 Handling device-specific action...");

        if (data.action === "exit") {
          console.log("🔌 Exiting application...");
          handleRemoteExit(data.commandId);
        } else if (data.action === "updateGroup") {
          console.log("🔄 Updating group subscription...");
          resubscribeGroupTopic(data.group_id);
        } else {
          console.log("ℹ️ Unknown device command:", data);
        }
      } else {
        if (typeof showToast === "function")
          showToast("error", "Unknown topic: " + topic);
        console.warn("❓ Unknown topic:", topic);
      }
    } catch (e) {
      console.error("⚠️ Error parsing MQTT message:", e);
    }
  });

  client.on("error", function (error) {
    console.error("🚨 MQTT Error:", JSON.stringify(error));
    showToast("error", "MQTT Connection Error – loading from local ads");

    try {
      console.warn("⚠️ processAds function is not available.");
    } catch (e) {
      console.error("❌ Error while loading local ads:", e.message);
    }
  });

  client.on("close", function () {
    console.log("🔌 MQTT Connection Closed");
  });

  client.on("offline", function () {
    console.log("📴 MQTT Offline");
  });

  client.on("reconnect", function () {
    console.log("🔁 MQTT Reconnecting...");
  });

  mqttClient = client;
}

// 🔄 Call this when you need to change the group subscription
function resubscribeGroupTopic(newGroupId) {
  if (!mqttClient || !mqttClient.connected) {
    console.error("❌ MQTT client is not connected yet.");
    return;
  }

  localStorage.setItem("group_id", newGroupId);
  var newTopic = "ads/" + newGroupId;
  var newNotifTopic = "ads/" + newGroupId + "/notification";

  if (currentGroupTopic) {
    mqttClient.unsubscribe(currentGroupTopic, function (err) {
      if (err) {
        console.error("❌ Unsubscribe Error:", err);
      } else {
        console.log("🚫 Unsubscribed from:", currentGroupTopic);
      }
    });
  }

  if (currentGroupNotifTopic) {
    mqttClient.unsubscribe(currentGroupNotifTopic, function (err) {
      if (err) {
        console.error("❌ Unsubscribe Error:", err);
      } else {
        console.log("🚫 Unsubscribed from:", currentGroupNotifTopic);
      }
    });
  }

  subscribeNewGroupTopic(newTopic, newNotifTopic, newGroupId);
}

function subscribeNewGroupTopic(topic, notifTopic, newGroupId) {
  mqttClient.subscribe(topic, function (err) {
    if (err) {
      console.error("❌ Subscription Error:", err);
    } else {
      currentGroupTopic = topic;
      localStorage.setItem("group_id", newGroupId);
      console.log("📡 Resubscribed to:", topic);
    }
  });

  if (notifTopic) {
    mqttClient.subscribe(notifTopic, function (err) {
      if (err) {
        console.error("❌ Notification Subscription Error:", err);
      } else {
        currentGroupNotifTopic = notifTopic;
        console.log("📡 Resubscribed to group notification topic:", notifTopic);
      }
    });
  }
}

/**
 * Trigger an uplink notification from this Tizen screen to the backend server
 * Backend will log to DeviceEventLog and forward via FCM to web / mobile users.
 *
 * @param {string} type - Event/Notification type (e.g. "MEDIA_PLAYBACK_ERROR", "STORAGE_WARNING", "CUSTOM_ALERT")
 * @param {string} title - Human readable title
 * @param {string} message - Description or alert details
 * @param {Object} data - Additional metadata or payload parameters
 * @param {string} severity - "info" | "warning" | "error" | "success"
 * @returns {boolean} Whether publish was initiated
 */
window.triggerDeviceNotification = function (
  type,
  title,
  message,
  data,
  severity,
) {
  if (!mqttClient || !mqttClient.connected) {
    console.warn("⚠️ Cannot send notification: MQTT client not connected");
    return false;
  }

  var device_id = localStorage.getItem("device_id");
  var android_id = localStorage.getItem("android_id");
  var group_id = localStorage.getItem("group_id");

  var payload = {
    device_id: device_id,
    android_id: android_id,
    group_id: group_id,
    type: type || "DEVICE_ALERT",
    title: title || "Device Alert",
    message: message || "",
    severity: severity || "info",
    data: data || {},
    timestamp: Date.now(),
  };

  // Publish on general topic and device-specific topic for maximum compatibility
  mqttClient.publish(
    "device/notification",
    JSON.stringify(payload),
    { qos: 1 },
    function (err) {
      if (err) {
        console.error("❌ Failed to publish notification to server:", err);
      } else {
        console.log("📤 Device notification published to server successfully:", payload);
      }
    },
  );

  return true;
};

/**
 * Render non-intrusive on-screen notification overlay / banner on Tizen display
 * Floating HUD over video/image playback without stopping active presentation.
 *
 * @param {Object} notif - Notification payload { title, message, body, severity, display_duration }
 */
function showDeviceNotificationOverlay(notif) {
  try {
    var title = notif.title || "Notification";
    var message = notif.message || notif.body || "";
    var severity = (notif.severity || "info").toLowerCase();
    var duration = parseInt(notif.display_duration, 10) || 8000;

    var overlay = document.getElementById("device-notification-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "device-notification-overlay";
      overlay.className = "device-notification-overlay";
      document.body.appendChild(overlay);
    }

    var badgeClass = "notif-badge " + severity;
    var badgeLabel = severity.toUpperCase();

    overlay.className = "device-notification-overlay show " + severity;
    overlay.innerHTML =
      '<div class="notif-header">' +
        '<span class="' + badgeClass + '">' + badgeLabel + '</span>' +
        '<span class="notif-title">' + escapeHTML(title) + '</span>' +
      '</div>' +
      '<div class="notif-body">' + escapeHTML(message) + '</div>';

    if (window._deviceNotifTimer) {
      clearTimeout(window._deviceNotifTimer);
    }

    window._deviceNotifTimer = setTimeout(function () {
      if (overlay) {
        overlay.className = "device-notification-overlay";
      }
    }, duration);
  } catch (e) {
    console.error("❌ Error rendering notification overlay:", e);
  }
}

function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Process MQTT payload with backward compatibility
 * @param {Object} data - MQTT payload
 */
function processMQTTPayload(data) {
  // New structure: data.content exists
  if (data.content) {
    console.log("📦 New content structure detected");
    return {
      ads: data.content.ads || [],
      carousels: data.content.carousels || [],
      liveContents: data.content.live_contents || [],
    };
  }

  // Old structure: data.ads exists
  if (data.ads) {
    console.log("📦 Old ads structure detected (backward compatible)");
    return {
      ads: data.ads,
      carousels: [],
      liveContents: [],
    };
  }

  // No content
  return {
    ads: [],
    carousels: [],
    liveContents: [],
  };
}

// function processAds(
//   client,
//   content,
//   rcs,
//   placeholderUpdate,
//   placeholder_enabled,
//   rcs_enabled,
//   logo_enabled
// ) {
//   // ads = ads.filter(function (ad) {
//   //   return ad.url && ad.url !== "null" && ad.url !== "undefined";
//   // });
// // content = content.filter((item) => {
// //   // For normal ads
// //   if (item.type === "ad") {
// //     return item.url && item.url !== "null" && item.url !== "undefined";
// //   }

// //   // For live content
// //   if (item.type === "live_content") {
// //     return item.url && item.url !== "null" && item.url !== "undefined";
// //   }
// //   if (item.type === "placeholder") {
// //     return item.url && item.url !== "null" && item.url !== "undefined";
// //   }

// //   // For carousel: at least one valid item URL
// //   if (item.type === "carousel") {
// //     return (
// //       Array.isArray(item.items) &&
// //       item.items.some(
// //         (carouselItem) =>
// //           carouselItem.url &&
// //           carouselItem.url !== "null" &&
// //           carouselItem.url !== "undefined"
// //       )
// //     );
// //   }

// //   // Unknown types → discard
// //   return false;
// // });

//  const buckets = {
//     ads: [],
//     carousels: [],
//     liveContents: [],
//   };

//   // Normalize mixed content
//   (content || []).forEach((item) => {
//     if (!item || !item.type){
//        buckets.ads.push(item);
//        return;
//     };

//     if (item.type === "ad") {
//       buckets.ads.push(item);
//     } else if (item.type === "carousel") {
//       buckets.carousels.push(item);
//     } else if (item.type === "live_content") {
//       buckets.liveContents.push(item);
//     }
//     else if (item.type === "placeholder") {
//       buckets.ads.push(item);
//     }
//     else {
//       buckets.ads.push(item);
//     }
//   });

//   console.log("Ads:", buckets.ads.length);
//   console.log("Carousels:", buckets.carousels.length);
//   console.log("Live contents:", buckets.liveContents.length);

//   console.log(
//     placeholderUpdate ? "Placeholder updated" : "No placeholder update"
//   );

//   publishAcknowledgment(client);

//   handleMQTTAds({
//     ads: buckets.ads,
//     carousels: buckets.carousels,
//     liveContents: buckets.liveContents,
//     rcs: rcs || "",
//     placeholderUpdate,
//     placeholder_enabled,
//     rcs_enabled,
//     logo_enabled,
//   });
// }

function processAds(
  client,
  content,
  rcs,
  placeholderUpdate,
  placeholder_enabled,
  rcs_enabled,
  logo_enabled,
  payloadMeta,
) {
  console.log("🔄 Routing data through Multi-Zone Transformer...");

  // 1. Rebuild a mock "server payload" object that the transformer expects
  let mockServerPayload = {
    content: content || [],
    rcs: rcs || "",
    placeholder_enabled: placeholder_enabled,
    rcs_enabled: rcs_enabled,
    logo_enabled: logo_enabled,
  };

  // 2. Push it through our intelligent transformer
  let cleanPayload;
  try {
    cleanPayload = transformPayload(mockServerPayload);
    console.log("✅ Successfully generated Layout:", cleanPayload);
  } catch (e) {
    console.error("❌ Transformer failed:", e.message);
    publishAcknowledgment(client, payloadMeta, "failed", e.message);
    return;
  }

  console.log(
    placeholderUpdate ? "Placeholder updated" : "No placeholder update",
  );

  // The payload is parsed and persisted at this point: remember it and ack it
  rememberPayload(payloadMeta);
  publishAcknowledgment(client, payloadMeta);

  // Remember what was applied so the gap monitor can switch between the layout and the
  // standalone ads as the clock moves (no new push needed).
  try {
    window.lastServerPayload = mockServerPayload;
    window.currentContentMode = resolveContentMode(mockServerPayload);
    startContentModeMonitor();
  } catch (e) {
    console.warn("⚠️ Could not start content mode monitor:", e && e.message);
  }

  // 3. Send the clean, multi-zone payload directly to your Zone Controller architecture
  handleMQTTAds(cleanPayload);
}

// ---------------------------------------------------------------------------
// Layout time gaps. Priority is live content > layout > standalone ads. A layout that is
// outside its time slots (or has nothing scheduled in any zone right now) hands the screen to
// the standalone ads, and takes it back when its next slot opens. The decision is re-made
// every few seconds from the last manifest; applying it reuses the normal payload path
// (serialised by mqttAdsQueue), without an ack or a re-download of unchanged files.
// ---------------------------------------------------------------------------
var CONTENT_MODE_CHECK_MS = 5000;
var contentModeTimer = null;

function startContentModeMonitor() {
  if (contentModeTimer) return;
  contentModeTimer = setInterval(function () {
    try {
      if (window.deviceExiting || !window.lastServerPayload) return;
      var mode = resolveContentMode(window.lastServerPayload);
      if (mode === window.currentContentMode) return;
      console.log(
        "🔀 Content mode changed: " + window.currentContentMode + " -> " + mode,
      );
      window.currentContentMode = mode;
      handleMQTTAds(transformPayload(window.lastServerPayload));
    } catch (e) {
      console.error("❌ Content mode monitor failed:", e && e.message);
    }
  }, CONTENT_MODE_CHECK_MS);
}

// Extracts the server-assigned payload identity from an ads/ message.
function getPayloadMeta(data) {
  if (!data || !data.payload_id) return null;
  return {
    payload_id: String(data.payload_id),
    generated_at: data.payload_generated_at
      ? String(data.payload_generated_at)
      : null,
  };
}

// "stale": older than the payload already applied in this app session.
// "duplicate": the same payload already applied in this session. Anything else
// is applied normally. Kept in memory only, so a reboot always starts clean and
// a bad timestamp can never make the player ignore future pushes.
function checkPayloadGuard(payloadMeta) {
  if (!payloadMeta) return "apply";
  if (
    payloadMeta.generated_at &&
    window.appliedPayloadGeneratedAt &&
    payloadMeta.generated_at < window.appliedPayloadGeneratedAt
  ) {
    return "stale";
  }
  if (
    window.appliedPayloadId &&
    window.appliedPayloadId === payloadMeta.payload_id
  ) {
    return "duplicate";
  }
  return "apply";
}

function rememberPayload(payloadMeta) {
  if (!payloadMeta) return;
  window.appliedPayloadId = payloadMeta.payload_id;
  window.appliedPayloadGeneratedAt = payloadMeta.generated_at || null;
}

// Without payloadMeta this is the legacy "I'm alive / synced" ack. With it, the
// server records that this device accepted (or failed) that specific push.
function publishAcknowledgment(client, payloadMeta, status, reason) {
  if (!client) {
    console.error("❌ MQTT Client not initialized");
    return;
  }

  try {
    var body = {
      android_id: localStorage.getItem("android_id"),
      device_id: localStorage.getItem("device_id"),
      ts: Date.now(),
    };
    if (payloadMeta && payloadMeta.payload_id) {
      body.payload_id = payloadMeta.payload_id;
      body.status = status || "acked";
      if (reason) body.reason = String(reason).substring(0, 200);
    }

    client.publish(
      "device/sync",
      JSON.stringify(body),
      { qos: 1, retain: false },
      function (err) {
        if (err) {
          console.error("❌ Error publishing acknowledgment:", err);
          showToast("error", "Error publishing acknowledgment");
        } else {
          console.log("📤 Acknowledgment sent successfully");
        }
      },
    );
  } catch (e) {
    console.error("❌ Acknowledgment failed:", e);
  }
}

// ---------------------------------------------------------------------------
// Remote exit (device deleted from the CMS)
// ---------------------------------------------------------------------------
window.deviceExiting = false;

// Confirm to the server FIRST (retries, never throws), then tear down. If the
// server cannot be reached the confirmation is parked in localStorage (written
// after the wipe) and retried at next boot by flushPendingExitConfirm().
function handleRemoteExit(commandId) {
  if (window.deviceExiting) return; // QoS 2 redelivery / duplicate command
  window.deviceExiting = true;

  deviceExitConfirm(commandId)
    .then(function (result) {
      performDeviceExitTeardown(
        result.confirmed ? null : result.payload,
        "remote_exit_command",
      );
    })
    .catch(function (err) {
      console.error("❌ Exit confirm crashed, tearing down anyway:", err);
      performDeviceExitTeardown(null, "remote_exit_command");
    });
}

function wipeIndexedDatabases() {
  return new Promise(function (resolve) {
    try {
      if (window.dataManager && window.dataManager.db) {
        window.dataManager.db.close();
      }
      if (typeof indexedDB === "undefined") return resolve();

      var done = false;
      var finish = function () {
        if (!done) {
          done = true;
          resolve();
        }
      };
      setTimeout(finish, 2000); // never block the teardown

      var names = ["AdupDataDB", "ProofOfPlayDB"];
      var remaining = names.length;
      var settle = function () {
        remaining--;
        if (remaining <= 0) finish();
      };
      names.forEach(function (name) {
        try {
          var req = indexedDB.deleteDatabase(name);
          req.onsuccess = settle;
          req.onerror = settle;
          req.onblocked = settle;
        } catch (e) {
          settle();
        }
      });
    } catch (e) {
      console.warn("⚠️ IndexedDB wipe failed:", e.message);
      resolve();
    }
  });
}

function wipeDownloadedMedia() {
  return new Promise(function (resolve) {
    try {
      if (typeof tizen === "undefined" || !tizen.filesystem) return resolve();
      setTimeout(resolve, 3000); // never block the teardown
      tizen.filesystem.resolve(
        "downloads/subDir",
        function (dir) {
          dir.listFiles(
            function (entries) {
              var pending = entries.length;
              if (!pending) return resolve();
              entries.forEach(function (entry) {
                var onDone = function () {
                  pending--;
                  if (pending <= 0) resolve();
                };
                try {
                  if (entry.isFile) dir.deleteFile(entry.fullPath, onDone, onDone);
                  else onDone();
                } catch (e) {
                  onDone();
                }
              });
            },
            function () {
              resolve();
            },
          );
        },
        function () {
          resolve();
        },
        "rw",
      );
    } catch (e) {
      console.warn("⚠️ Media wipe failed:", e.message);
      resolve();
    }
  });
}

// pendingConfirm: payload to retry at next boot when the server was unreachable.
function performDeviceExitTeardown(pendingConfirm, reason) {
  window.deviceExiting = true;

  // Give the TV its own mute state back (the zone mute option may have changed it)
  try {
    if (typeof ZoneAudio !== "undefined") ZoneAudio.restore();
  } catch (e) {}

  if (typeof window.triggerDeviceNotification === "function") {
    try {
      window.triggerDeviceNotification(
        "DEVICE_OFFLINE",
        "Device Stopped",
        "Screen application terminated (" + reason + ")",
        { status: "offline", reason: reason },
        "info",
      );
    } catch (e) {
      console.warn("⚠️ Exit notification failed:", e.message);
    }
  }

  Promise.all([wipeIndexedDatabases(), wipeDownloadedMedia()]).then(
    function () {
      localStorage.clear();
      if (pendingConfirm) {
        try {
          localStorage.setItem(
            PENDING_EXIT_CONFIRM_KEY,
            JSON.stringify(pendingConfirm),
          );
        } catch (e) {
          console.warn("⚠️ Could not persist pending exit confirm:", e.message);
        }
      }

      // Best effort: nothing here may stop the app from exiting below.
      try {
        var mqttRef = window.mqttClient;
        if (mqttRef && typeof mqttRef.end === "function") {
          mqttRef.end(true, function () {
            console.log("MQTT client disconnected.");
          });
        }
      } catch (e) {
        console.warn("⚠️ MQTT disconnect failed:", e.message);
      }

      try {
        if (typeof tizen !== "undefined" && tizen.application) {
          tizen.application.getCurrentApplication().exit();
        } else {
          console.warn("Tizen application API not available.");
          window.close();
        }
      } catch (e) {
        console.warn("⚠️ Unable to close window:", e.message);
      }
    },
  );
}

function deletePlaceHolderFile(fileBaseName) {
  return new Promise(function (resolve, reject) {
    try {
      var rootName = "downloads/subDir";

      tizen.filesystem.resolve(
        rootName,
        function (root) {
          try {
            root.listFiles(
              (entries) => {
                const deletions = entries.filter(
                  (entry) =>
                    entry.isFile && entry.name.startsWith(fileBaseName),
                );
                console.log("Found files to delete:", deletions);
                if (deletions.length === 0) {
                  console.log("ℹ️ No matching placeholder files found.");
                  resolve();
                  return;
                }
                const deletePromises = deletions.map((file) => {
                  return new Promise((delResolve, delReject) => {
                    root.deleteFile(
                      file.fullPath,
                      () => {
                        console.log("✅ File deleted:", file.fullPath);
                        delResolve(file.fullPath);
                      },
                      (err) => {
                        console.error("❌ Error deleting file:", err.message);
                        delReject(err);
                      },
                    );
                  });
                });
                Promise.all(deletePromises)
                  .then((deletedFiles) => {
                    console.log("All specified files deleted:", deletedFiles);
                    resolve(deletedFiles);
                  })
                  .catch((err) => {
                    console.error("❌ Error during file deletion:", err);
                    reject(err);
                  });
              },
              (err) => reject(err),
            );
          } catch (e) {
            console.log("❌ Error during file lookup/deletion:", e.message);
            resolve();
          }
        },
        function (error) {
          if (error.name === "NotFoundError") {
            console.log("ℹ️ Directory does not exist.");
          } else {
            console.log("❌ Error resolving root:", error.message);
          }
          resolve();
        },
        "rw",
      );
    } catch (error) {
      console.log("⚠️ Exception:", error.message);
      resolve();
    }
  });
}
