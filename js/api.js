async function joinGroup() {
  const groupId = $("#groupId").val();
  // var groupId = "LEPLXX8D"; // Use var, not const
  if (!groupId) {
    alert("Please enter license key.");
    return;
  }

  $(".login_loader").show();
  await deletePlaceHolderFile("downloads/subDir/placeholder.jpg");

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

        // var $element = $("#ad_player");
        // $element.html("");
        // $element.html(contentHTML);

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
