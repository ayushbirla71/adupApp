// MQTT Configuration

var mqttClient = null;
var currentGroupTopic = null;

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

  client = mqtt.connect(url, {
    clientId: "signage-" + Math.random().toString(36).substr(2, 8),
    username: "myuser",
    password: "adup_2025",
    reconnectPeriod: 5000,
    keepalive: 60,
    clean: true,
  });

  publishAcknowledgment(client); // Send acknowledgment after connecting

  console.log("🚀 MQTT Client Created");
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

      if (topic.indexOf("ads/") === 0) {
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
          );
        }
      } else if (topic.indexOf("device/") === 0) {
        console.log("🔧 Handling device-specific action...");

        if (data.action === "exit") {
          console.log("🔌 Exiting application...");

          deviceExitConfirm()
            .then(function () {
              // ✅ Only proceed if confirmed

              localStorage.clear();

              if (client && typeof client.end === "function") {
                client.end(true, function () {
                  console.log("MQTT client disconnected.");
                });
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
            })
            .catch(function (err) {
              // ❌ User cancelled or error happened
              console.warn("❌ Exit cancelled or failed:", err);
            });
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

  if (currentGroupTopic) {
    mqttClient.unsubscribe(currentGroupTopic, function (err) {
      if (err) {
        console.error("❌ Unsubscribe Error:", err);
      } else {
        console.log("🚫 Unsubscribed from:", currentGroupTopic);
      }

      subscribeNewGroupTopic(newTopic, newGroupId);
    });
  } else {
    subscribeNewGroupTopic(newTopic, newGroupId);
  }
}

function subscribeNewGroupTopic(topic, newGroupId) {
  mqttClient.subscribe(topic, function (err) {
    if (err) {
      console.error("❌ Subscription Error:", err);
    } else {
      currentGroupTopic = topic;
      localStorage.setItem("group_id", newGroupId);
      console.log("📡 Resubscribed to:", topic);
    }
  });
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
    return;
  }

  console.log(
    placeholderUpdate ? "Placeholder updated" : "No placeholder update",
  );

  publishAcknowledgment(client);

  // 3. Send the clean, multi-zone payload directly to your Zone Controller architecture
  handleMQTTAds(cleanPayload);
}

function publishAcknowledgment(client) {
  if (!client) {
    console.error("❌ MQTT Client not initialized");
    return;
  }

  client.publish(
    "device/sync",
    JSON.stringify({
      android_id: localStorage.getItem("android_id"),
    }),
    { qos: 1, retain: true },
    function (err) {
      if (err) {
        console.error("❌ Error publishing acknowledgment:", err);
        showToast("error", "Error publishing acknowledgment");
      } else {
        console.log("📤 Acknowledgment sent successfully");
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
