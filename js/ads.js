// MQTT Configuration

function connectMQTT(options) {
  var device_id = options.device_id || localStorage.getItem("device_id");
  var group_id = options.group_id || localStorage.getItem("group_id");

  let url = "ws://console.adup.live:9001/mqtt"; // Use wss:// if SSL is supported

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
    // client.subscribe("ads/" + group_id, function (err) {
    //   if (err) {
    //     console.error("❌ MQTT Subscription Error:", err);
    //   } else {
    //     console.log("📡 Subscribed to topic:");
    //   }
    // });

    // Subscribe to group topic
    const groupTopic = `ads/${group_id}`;
    client.subscribe(groupTopic, function (err) {
      if (err) {
        console.error(`❌ MQTT Subscription Error for ${groupTopic}:`, err);
      } else {
        console.log(`📡 Subscribed to topic: ${groupTopic}`);
      }
    });

    // Subscribe to device-specific topic
    const deviceTopic = `device/${localStorage.getItem("device_id")}`;
    client.subscribe(deviceTopic, function (err) {
      if (err) {
        console.error(`❌ MQTT Subscription Error for ${deviceTopic}:`, err);
      } else {
        console.log(`📡 Subscribed to topic: ${deviceTopic}`);
      }
    });
  });

  client.on("message", async function (topic, message) {
    try {
      let data = JSON.parse(message.toString());
      console.log(`📥 MQTT message on topic '${topic}':`, data);

      if (topic.startsWith(`ads/`)) {
        // handleMQTTAds(data.ads); // Call the function to handle ads
        let ads = data.ads || []; // Assuming data is an array of ads
        // var ads = [
        //   {
        //     ad_id: "c7a63684-b761-485a-bd1c-4dcbae9b9f54",
        //     name: "NVR",
        //     url: "https://adup-ads.s3.ap-south-1.amazonaws.com/ad-1742833840418.jpeg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIAYHJANS7CQCPFUSXX%2F20250426%2Fap-south-1%2Fs3%2Faws4_request&X-Amz-Date=20250426T074553Z&X-Amz-Expires=600&X-Amz-Signature=43cc470ae69a23ef213a590dd5004bca5ea363ccb3a9cd7498ee9ca9ae949b4b&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject",
        //     duration: 10,
        //     total_plays: 360,
        //     start_time: "2025-04-26T06:00:00.000Z",
        //   },
        // ];

        if (data.placeholder) {
          localStorage.setItem("placeholder", data.placeholder);
          await deletePlaceHolderFile("downloads/subDir/placeholder.jpg"); // Delete the old placeholder file
          ads.push({
            url: data.placeholder,
          });
        } else {
          ads.push({
            url: localStorage.getItem("placeholder"),
          });
        }

        ads = ads.filter((ad) => {
          return ad.url && ad.url !== "null" && ad.url !== "undefined";
        });
        // Assuming data is an array of ads
        console.log("Ads:", ads);

        let rcs = data.rcs; // Assuming data is an array of ads
        publishAcknowledgment(client);
        handleMQTTAds({ ads: ads, rcs: rcs });
        //   if (data.ads)
        //     //  syncAds(data.ads);
        //     syncAds([
        //       {
        //         url: "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4",
        //       },
        //        // Assuming the first ad is the one to play
        //     ]);
        // Send acknowledgment after receiving ads
      } else if (topic.startsWith(`device/`)) {
        // 🟦 Logic for 'device/device_id'
        console.log("🔧 Handling device-specific action...");

        if (data.action === "exit") {
          console.log("🔌 Exiting application...");

          // Step 1: Clear localStorage
          localStorage.clear();

          // Step 2: Disconnect MQTT client
          if (client && typeof client.end === "function") {
            client.end(true, () => {
              console.log("MQTT client disconnected.");
            });
          }

          // Step 3: Attempt to close the application window
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

  // Save reference globally
  window.mqttClient = client;
}

function publishAcknowledgment(client) {
  if (!client) {
    console.error("❌ MQTT Client not initialized");
    return;
  }

  // Publish acknowledgment message
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
  return new Promise((resolve, reject) => {
    try {
      const rootName = relativePath.split("/")[0]; // e.g., "downloads"
      const fileSubPath = relativePath.substring(relativePath.indexOf("/") + 1); // "subDir/placeholder.jpg"

      tizen.filesystem.resolve(
        rootName,
        function (root) {
          try {
            const file = root.resolve(fileSubPath);

            // File exists, attempt deletion
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
