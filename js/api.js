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
  getTVDeviceInfo().then(function (deviceInfo) {
    console.log("Device Info:", deviceInfo);
    $.ajax({
      url: API_BASE_URL + "device/new-register",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      data: JSON.stringify({
        android_id: deviceInfo.android_id,
      }),
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
  });
}

async function completeRegisterNewDevice(device_id) {
  const android_id = localStorage.getItem("android_id");
  if (!android_id) {
    alert("Android ID not found. Please join a group first.");
    return;
  }
  $(".login_loader").show();
  getTVDeviceInfo().then(function (deviceInfo) {
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
  });
}
