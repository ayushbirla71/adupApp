// MQTT Configuration

var mqttClient = null;
var currentGroupTopic = null;

function connectMQTT(options) {
  var device_id = options.device_id || localStorage.getItem("device_id");
  var group_id = options.group_id || localStorage.getItem("group_id");

  var url = "ws://cms.ad96.in:9001/mqtt"; // Use wss:// if SSL is supported
  // var url = "ws://console.adup.live:9001/mqtt";

  handleMQTTAds({
    ads: options.ads,
    rcs: options.rcs,
    placeholderUpdate: true,
  });

  var client = mqtt.connect(url, {
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
          err
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
          err
        );
      } else {
        console.log("📡 Subscribed to topic: " + deviceTopic);
      }
    });
  });

  client.on("message", function (topic, message) {
    try {
      var data = JSON.parse(message.toString());
      console.log("📥 MQTT message on topic '" + topic + "':", data);

      if (topic.indexOf("ads/") === 0) {
        let ads = data.ads || [];
        localStorage.setItem("ads", JSON.stringify(ads));
        localStorage.setItem("rcs", data.rcs || "");

        if (data.placeholder) {
          let timestamps = new Date().getTime();
          localStorage.setItem("placeholder", data.placeholder);
          localStorage.setItem("timestamp", timestamps),
            deletePlaceHolderFile("placeholder")
              .then(function () {
                ads.push({
                  url: data.placeholder,
                  timestamp: timestamps,
                });
                processAds(client, ads, data.rcs, true);
              })
              .catch(function (error) {
                console.error("❌ Error deleting placeholder file:", error);
                processAds(client, ads, data.rcs, false);
              });
        } else {
          ads.push({
            url: localStorage.getItem("placeholder"),
            timestamp: localStorage.getItem("timestamp"),
          });
          processAds(client, ads, data.rcs, false);
        }
      } else if (topic.indexOf("device/") === 0) {
        console.log("🔧 Handling device-specific action...");

        if (data.action === "exit") {
          console.log("🔌 Exiting application...");
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
            console.warn(
              "⚠️ Unable to close window. This may be blocked by browser security."
            );
          }
        } else if (data.action === "updateGroup") {
          console.log("🔄 Updating group subscription...");
          resubscribeGroupTopic(data.group_id);
        } else {
          console.log("ℹ️ Unknown device command:", data);
        }
      } else {
        showToast("error", "Unknown topic: " + topic);
        console.warn("❓ Unknown topic:", topic);
      }
    } catch (e) {
      console.error("⚠️ Error parsing MQTT message:", e);
    }
  });

  client.on("error", function (error) {
    console.error("🚨 MQTT Error:", error);
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

function processAds(client, ads, rcs, placeholderUpdate) {
  ads = ads.filter(function (ad) {
    return ad.url && ad.url !== "null" && ad.url !== "undefined";
  });

  console.log("Ads:", ads);
  console.log(
    placeholderUpdate ? "Placeholder updated" : "No placeholder update"
  );

  publishAcknowledgment(client);

  handleMQTTAds({
    ads: ads,
    rcs: rcs || "",
    placeholderUpdate: placeholderUpdate,
  });
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
    }
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
                  (entry) => entry.isFile && entry.name.startsWith(fileBaseName)
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
                      }
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
              (err) => reject(err)
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
        "rw"
      );
    } catch (error) {
      console.log("⚠️ Exception:", error.message);
      resolve();
    }
  });
}
