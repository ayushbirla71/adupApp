function waitingForMqttReplyForDeviceConfirmation(android_id, deviceId) {
  // This function is called when the device confirmation is requested
  let url = "ws://cms.ad96.in:9001/mqtt"; // Use wss:// if SSL is supported
  // let url = "ws://console.adup.live:9001/mqtt"; // Use wss:// if SSL is supported

  var deviceConfirmationMqtt = mqtt.connect(url, {
    deviceConfirmationMqttId:
      "signage-" + Math.random().toString(36).substr(2, 8),
    username: "myuser",
    password: "adup_2025",
    reconnectPeriod: 5000,
    keepalive: 60,
    clean: true,
  });

  console.log("🚀 MQTT deviceConfirmationMqtt Created for Device Confirmation");

  deviceConfirmationMqtt.on("connect", function () {
    console.log("✅ MQTT Connected for Device Confirmation");
    const deviceTopic = `device/register/${deviceId}`;
    deviceConfirmationMqtt.subscribe(deviceTopic, function (err) {
      if (err) {
        console.error(`❌ MQTT Subscription Error for ${deviceTopic}:`, err);
      } else {
        console.log(`📡 Subscribed to topic: ${deviceTopic}`);
      }
    });
  });

  deviceConfirmationMqtt.on("message", async function (topic, message) {
    try {
      let data = JSON.parse(message.toString());
      console.log(`📥 MQTT message on topic '${topic}':`, data);

      if (data && data.action === "register") {
        console.log("Device confirmation received:", data);
        addInfoLog(`Device confirmation received for ${data.device_id}`);
        // Handle the device confirmation logic here
        completeRegisterNewDevice(data.device_id);
        deviceConfirmationMqtt.end(); // Close the connection after confirmation
        $(".main-container").hide();
        $(".ad-player-container").show();
        $(".ad-player-container").addClass("active");
        $(".joinGroup-container").removeClass("active");

        localStorage.setItem("placeholder", data.placeholder || null);
        let timestamps = new Date().getTime();
        console.log("time stamp", timestamps);
        localStorage.setItem("timestamp", timestamps),
          localStorage.setItem(
            "group_id",
            data && data.group_id ? data.group_id : ""
          );
        SN.focus("#ad_player");
        data.ads.push({
          url: data.placeholder || "",
          timestamp: timestamps,
        });
        connectMQTT({
          ...data,
        }); // Reconnect to MQTT with the new device_id and group_id
      }
    } catch (error) {
      console.error("Error parsing MQTT message:", error);
    }
  });

  deviceConfirmationMqtt.on("error", function (error) {
    console.error("MQTT Error:", error);
  });
}
