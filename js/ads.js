// MQTT Configuration
function connectMQTT(options) {
  var device_id = options.device_id || localStorage.getItem("device_id");
  var group_id = options.group_id || localStorage.getItem("group_id");

  var url = "ws://cms.ad96.in:9001/mqtt"; // Use wss:// if SSL is supported

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

  client.on("connect", function () {
    console.log("✅ MQTT Connected");

    var groupTopic = "ads/" + group_id;
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

    var deviceTopic = "device/" + localStorage.getItem("device_id");
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
        var ads = data.ads || [];

        if (data.placeholder) {
          localStorage.setItem("placeholder", data.placeholder);
          deletePlaceHolderFile("downloads/subDir/placeholder.jpg").then(
            function () {
              ads.push({
                url: data.placeholder,
              });
              processAds(client, ads, data.rcs);
            }
          );
        } else {
          ads.push({
            url: localStorage.getItem("placeholder"),
          });
          processAds(client, ads, data.rcs);
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
    showToast("error", "MQTT Error");
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

  window.mqttClient = client;
}

function processAds(client, ads, rcs) {
  ads = ads.filter(function (ad) {
    return ad.url && ad.url !== "null" && ad.url !== "undefined";
  });

  console.log("Ads:", ads);
  publishAcknowledgment(client);
  handleMQTTAds({ ads: ads, rcs: rcs || "" });
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

function deletePlaceHolderFile(relativePath) {
  return new Promise(function (resolve, reject) {
    try {
      var rootName = relativePath.split("/")[0];
      var fileSubPath = relativePath.substring(relativePath.indexOf("/") + 1);

      tizen.filesystem.resolve(
        rootName,
        function (root) {
          try {
            var file = root.resolve(fileSubPath);
            file.parent.deleteFile(file.fullPath);
            console.log("✅ File deleted:", file.fullPath);
            resolve(file.fullPath);
          } catch (e) {
            console.log("❌ Error during deletion:", e.message);
            resolve();
          }
        },
        function (error) {
          if (error.name === "NotFoundError") {
            console.log("ℹ️ File does not exist, nothing to delete.");
          } else {
            console.log("❌ Error resolving root:", error.message);
          }
          resolve();
        },
        "rw"
      );
    } catch (error) {
      console.log("⚠️ Exception while checking/deleting file:", error.message);
      resolve();
    }
  });
}
