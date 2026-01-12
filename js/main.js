// window.onload = function () {
//   console.log("Main screen");
//   window.SN = SpatialNavigation;
//   SN.init();
//   //register_number_keys();

//   if (localStorage.getItem("token") && localStorage.getItem("group_id")) {
//     setTimeout(function () {
//       $(".login_loader").hide();
//     }, 1000);

//     // localStorage.setItem("token", newToken);
//     var ads = JSON.parse(localStorage.getItem("ads")); // optional if needed
//     var device_id = localStorage.setItem("device_id");
//     var group_id = localStorage.getItem("group_id");
//     console.log("ads", ads);

//     $(".joinGroup-container").hide();
//     $(".main-container").hide();
//     $(".ad-player-container").show();
//     $(".ad-player-container").addClass("active");
//     $(".joinGroup-container").removeClass("active");
//     // Focus on the first OTP input field
//     SN.focus("#ad_player");
//     var contentHTML = generateImageAds(ads[0]);

//     // Append content to the element
//     var $element = $("#ad_player");
//     $element.html("");
//     // $element.html(contentHTML);
//     connectMQTT({
//       device_id: device_id,
//       group_id: group_id,
//     });
//   } else {
//     manage_spatial_navigation("joinGroup-container");
//     setTimeout(function () {
//       $(".login_loader").hide();
//     }, 1000);

//     $(".ad-player-container").addClass("active");
//     SN.focus("#groupId");
//   }

//   // document.getElementById('emailId').value = "user@auf.tv";
//   // document.getElementById('password').value = "auftv";

//   // SN.focus("#login_container");

//   // When something press from remote keys
//   $(window).keydown(function (evt) {
//     console.log("key event", evt.keyCode);
//     switch (evt.keyCode) {
//       case 10009: //Back/Return
//         if (
//           (!$("#groupId").is(":focus") &&
//             !$("#joinGroupButton").is(":focus")) ||
//           $(".joinGroup-container").hasClass("active") ||
//           $(".joinGroup-container").is(":visible") ||
//           $(".ad-player-container").hasClass("active")
//         ) {
//           window.close(); // Attempts to close the window
//         }
//         break;

//       default:
//         console.log("Remote keyCode: ", evt.keyCode);
//     }
//   });
// };

// function set_focus(containerId, itemId) {
//   console.log("set focus");
//   var restrictVal = "self-first";
//   if (containerId == "EXIT" || containerId == "RETRY_CANCEL")
//     restrictVal = "self-only";

//   SN.remove(containerId);
//   SN.add({
//     id: containerId,
//     selector: "#" + containerId + " .focusable",
//     restrict: restrictVal,
//     defaultElement: "#" + itemId,
//     enterTo: "last-focused",
//   });
//   SN.makeFocusable();
// }

// function manage_spatial_navigation(containerClass, favoriteStatus, vodId) {
//   switch (containerClass) {
//     case "joinGroup-container":
//       set_focus("joinGroupContainer", "groupId");
//       $("#groupId").on("sn:focused", function (e) {
//         console.log("set focus !");
//       });
//       $("#groupId").on("sn:enter-down", function (e) {
//         // window.location.href = "home.html";
//       });
//       $("#joinGroupButton").on("sn:focused", function (e) {
//         console.log("set focus !");
//       });
//       $("#joinGroupButton").on("sn:enter-down", function (e) {
//         // window.location.href = "home.html";
//         console.log("Join Group Button Clicked", e);
//         const groupId = $("#groupId").val();
//         console.log("Group ID:", groupId);
//         if (groupId) {
//           // localStorage.setItem("groupId", groupId);
//           joinGroup(groupId); // Call the joinGroup function with the group ID
//         } else {
//           alert("Please enter a valid Group ID.");
//         }
//       });
//       break;

//     case "ad-player-container":
//       set_focus("ad_player", "groupId");

//       $("#groupId").on("sn:focused", function (e) {
//         console.log("set focus !");
//       });

//       break;

//     default:
//       console.log("containerClass", containerClass);
//   }
// }

window.onload = async function () {
  console.log("Main screen");
  window.SN = SpatialNavigation;
  SN.init();
  manage_spatial_navigation("settings-container");
  checkDeviceResolution();

  // ✅ Wait for orientation to be initialized BEFORE proceeding
  console.log("Initializing orientation listener...");
  await initOrientationListener();
  console.log("Orientation listener initialized successfully");

  // const newToken = "your_token_here"; // Set this appropriately
  localStorage.setItem("group_id", "13a3aeb6-5952-43c2-9d0b-25777fdf4e9d");
  localStorage.setItem("device_id", "83de41b0-4cac-480e-a8f9-3278d8fb7e69");

  if (localStorage.getItem("group_id")?.trim()) {
    setTimeout(function () {
      $(".login_loader").hide();
    }, 1000);

    // localStorage.setItem("token", newToken);
    const ads = JSON.parse(localStorage.getItem("ads") || "[]"); // fallback to empty array if null
    const device_id = localStorage.getItem("device_id");
    const group_id = localStorage.getItem("group_id");
    let placeholder = localStorage.getItem("placeholder");
    let timestamps = localStorage.getItem("timestamp");
    let placeholder_enabled =
      localStorage.getItem("placeholder_enabled") || false;
    let rcs_enabled = localStorage.getItem("rcs_enabled");
    let logo_enabled = localStorage.getItem("logo_enabled");
    if (placeholder && placeholder_enabled == true) {
      ads.push({ url: placeholder, timestamp: timestamps });
    }
    let rcs = localStorage.getItem("rcs");
    console.log("ads", ads);

    // $(".joinGroup-container").hide();
    $(".pairing-container").hide();
    $(".main-container").hide();
    $(".ad-player-container").show().addClass("active");
    // $(".joinGroup-container").removeClass("active");
    $(".pairing-container").removeClass("active");

    SN.focus("#ad_player");

    // if (ads && Array.isArray(ads) && ads.length > 0) {
    //   const contentHTML = generateImageAds(ads[0]);
    //   const $element = $("#ad_player");
    //   $element.html(""); // Optionally clear
    //   $element.html(contentHTML); // Uncomment if needed
    // }
    deviceOriantationChange(
      window.DEVICE_WINDOW_ORIENT,
      window.DEVICE_WINDOW_WIDTH + "x" + window.DEVICE_WINDOW_HEIGHT
    );

    connectMQTT({
      ads: ads,
      rcs: rcs,
      device_id: device_id,
      group_id: group_id,
      placeholder_enabled: placeholder_enabled,
      rcs_enabled: rcs_enabled,
      logo_enabled: logo_enabled,
    });
  } else {
    manage_spatial_navigation("joinGroup-container");
    await registerDevice();
    setTimeout(function () {
      $(".login_loader").hide();
    }, 1000);

    // $(".pairing-container").addClass("active");
    // SN.focus("#pairingBox");
  }

  $(window).keydown(function (evt) {
    console.log("key event", evt.keyCode);
    switch (evt.keyCode) {
      case 10009: // Back/Return
        if (
          (!$("#groupId").is(":focus") &&
            !$("#joinGroupButton").is(":focus")) ||
          $(".joinGroup-container").hasClass("active")
        ) {
          if ($("#settingsSlider").hasClass("open")) {
            // Hide settings
            $("#settingsSlider").removeClass("open").hide();
            // Optional: focus back to ad player or previous item
            SN.focus("#ad_player");
          } else {
            // Show settings
            $("#settingsSlider").addClass("open").show();
            SN.focus("#systemInfo-btn");
          }
        }
        if (
          (!$("#groupId").is(":focus") &&
            !$("#joinGroupButton").is(":focus")) ||
          $(".joinGroup-container").hasClass("active") ||
          $(".joinGroup-container").is(":visible") ||
          $(".ad-player-container").hasClass("active")
        ) {
          // NOTE: window.close may not work unless window was opened via JS
          console.log("Attempting to close window");
          // window.close();
        }
        break;

      case 457: // Info button
        if ($("#settingsSlider").hasClass("open")) {
          // Hide settings
          $("#settingsSlider").removeClass("open").hide();
          // Optional: focus back to ad player or previous item
          SN.focus("#ad_player");
        } else {
          // Show settings
          $("#settingsSlider").addClass("open").show();
          SN.focus("#systemInfo-btn");
        }
        break;

      default:
        console.log("Remote keyCode: ", evt.keyCode);
    }
  });
};

const safeCapability = (key) => {
  try {
    return tizen.systeminfo.getCapability(key) ?? null;
  } catch {
    return null;
  }
};
function initOrientationListener() {
  return new Promise((resolve) => {
    function handleOrientationChange() {
      console.log("Orientation changed!");

      try {
        let orientation = "unknown";

        // --- Detect orientation based on CURRENT window dimensions ---
        // ✅ Use window.innerWidth/innerHeight which reflect current orientation
        // ❌ Don't use screen.width/height as they don't change with orientation
        const screenWidth = window.innerWidth || screen.width;
        const screenHeight = window.innerHeight || screen.height;

        // Determine orientation based on which dimension is larger
        orientation = screenWidth > screenHeight ? "landscape" : "portrait";

        // --- Get screen resolution using current window dimensions ---
        const device_resolution = `${screenWidth}x${screenHeight}`;

        console.log("Orientation:", orientation);
        console.log("Resolution:", device_resolution);
        console.log("Window dimensions:", screenWidth, "x", screenHeight);
        console.log(
          "Screen dimensions (static):",
          screen.width,
          "x",
          screen.height
        );

        window.DEVICE_WINDOW_WIDTH = screenWidth;
        window.DEVICE_WINDOW_HEIGHT = screenHeight;
        window.DEVICE_WINDOW_ORIENT = orientation;

        // Send orientation change to API if device is registered
        if (localStorage.getItem("device_id")) {
          // deviceOriantationChange(orientation, device_resolution);
        }
      } catch (error) {
        console.error("Error getting orientation:", error);
      }
    }

    // --- Add event listener for orientation changes ---
    if (screen.orientation && screen.orientation.addEventListener) {
      // ✅ Modern browsers (including Tizen 6+)
      screen.orientation.addEventListener("change", handleOrientationChange);
    } else {
      // ✅ Fallback for older browsers or Tizen models
      window.addEventListener("orientationchange", handleOrientationChange);
      window.addEventListener("resize", handleOrientationChange);
    }

    // Trigger once on load and resolve promise
    handleOrientationChange();

    // Resolve immediately after first execution
    setTimeout(() => {
      console.log("Orientation initialized with:", {
        width: window.DEVICE_WINDOW_WIDTH,
        height: window.DEVICE_WINDOW_HEIGHT,
        orientation: window.DEVICE_WINDOW_ORIENT,
      });
      resolve();
    }, 100);
  });
}

function set_focus(containerId, itemId) {
  console.log("set focus");
  let restrictVal = "self-first";
  if (containerId === "EXIT" || containerId === "RETRY_CANCEL")
    restrictVal = "self-only";

  SN.remove(containerId);
  SN.add({
    id: containerId,
    selector: "#" + containerId + " .focusable",
    restrict: restrictVal,
    defaultElement: "#" + itemId,
    enterTo: "last-focused",
  });
  SN.makeFocusable();
}

function manage_spatial_navigation(containerClass, favoriteStatus, vodId) {
  switch (containerClass) {
    case "joinGroup-container":
      set_focus("joinGroupContainer", "groupId");

      $("#groupId").on("sn:focused", function () {
        console.log("Group ID field focused");
      });

      $("#groupId").on("sn:enter-down", function () {
        // Navigate or perform action
      });

      $("#joinGroupButton").on("sn:focused", function () {
        console.log("Join Group Button focused");
      });

      $("#joinGroupButton").on("sn:enter-down", function () {
        console.log("Join Group Button Clicked");

        const groupId = $("#groupId").val();
        console.log("Group ID:", groupId);

        if (groupId) {
          joinGroup(groupId); // Ensure this function is defined elsewhere
        } else {
          alert("Please enter a valid Group ID.");
        }
      });
      break;

    case "pairing-container":
      set_focus("pairingContainer", "pairingCode");

      $("#pairingCode").on("sn:focused", function () {
        console.log("Pairing Code field focused");
      });

      $("#pairingCode").on("sn:enter-down", function () {
        // Handle pairing code submission
      });
      break;

    case "ad-player-container":
      set_focus("ad_player", "groupId");

      $("#groupId").on("sn:focused", function () {
        console.log("set focus !");
      });
      break;

    case "settings-container":
      set_focus("settings-container", "settingsToggle");

      $("#settingsToggle").on("sn:enter-down", function () {
        $("#settingsSlider").addClass("open").show();
        setTimeout(() => SN.focus("#systemInfo-btn"), 100);
      });

      $("#closeSlider").on("sn:enter-down", function () {
        $("#settingsSlider").removeClass("open").hide();
        SN.focus("#settingsToggle");
      });

      $(".settings-button").on("sn:enter-down", function () {
        const id = $(this).attr("id").replace("-btn", "");
        showSection(id);
      });
      break;

    default:
      console.log("Unknown containerClass:", containerClass);
  }
}

let interval = null;

function showSection(id) {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }

  $(".section-panel").removeClass("active");
  $("#" + id).addClass("active");

  // Use enhanced settings if available
  if (window.enhancedSettings) {
    switch (id) {
      case "dataStats":
        window.enhancedSettings.refreshDataStats();
        break;
      case "logs":
        window.enhancedSettings.renderLogs();
        break;
      case "downloaded":
        window.enhancedSettings.renderDownloadedFiles();
        break;
      case "processing":
        window.enhancedSettings.renderProgress();
        break;
      case "errors":
        window.enhancedSettings.renderErrors();
        break;
      case "archives":
        window.enhancedSettings.refreshArchives();
        break;
      case "devtools":
        window.enhancedSettings.refreshDevTools();
        break;
      case "systemInfo":
        showSystemInfo();
        break;
    }
  } else {
    // Fallback to old methods
    switch (id) {
      case "logs":
        renderLogs();
        break;
      case "downloaded":
        renderDownloadedFiles();
        break;
      case "processing":
        renderProgress();
        break;
      case "errors":
        renderErrors();
        break;
      case "systemInfo":
        showSystemInfo();
        break;
    }
  }

  // Set focus to first focusable element
  setTimeout(() => {
    const $first = $("#" + id)
      .find(".focusable")
      .first();
    if ($first.length) {
      $first.focus();
      set_focus(id + "-section", "#" + id + " .focusable");
    }
  }, 100);
}

function downloadLogs() {
  const logItems = $("#logList li")
    .map(function () {
      return $(this).text();
    })
    .get()
    .join("\n");

  const blob = new Blob([logItems], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = $("<a>")
    .attr("href", url)
    .attr("download", "logs.txt")
    .appendTo("body");
  a[0].click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderLogs() {
  const $logList = $("#logList");
  $logList.empty();
  window.INFO_LOGS.forEach((log, i) => {
    $logList.append(`<li class="log-item focusable" id="log-${i}">${log}</li>`);
  });
}

function renderDownloadedFiles() {
  const $list = $("#downloaded-list");
  $list.empty();

  const fileDir = "downloads/subDir"; // Same directory used in your code

  tizen.filesystem.resolve(
    fileDir,
    (dir) => {
      dir.listFiles(
        (entries) => {
          const files = entries.map((entry) => entry.name);
          if (files.length === 0) {
            $list.append(
              `<li class="download-item">No downloaded files found.</li>`
            );
            return;
          }

          files.forEach((file, i) => {
            $list.append(
              `<li class="download-item focusable" id="download-${i}">${file}</li>`
            );
          });
        },
        (err) => {
          console.error("❌ Failed to list files:", err.message);
          $list.append(
            `<li class="download-item error">Error listing files</li>`
          );
        }
      );
    },
    (err) => {
      console.error("❌ Failed to resolve directory:", err.message);
      $list.append(`<li class="download-item error">Directory not found</li>`);
    },
    "r"
  );
}

function renderErrors() {
  const $list = $("#error-list");
  $list.empty();
  window.ERROR_LOGS.forEach((err, i) => {
    $list.append(
      `<li class="error-item focusable" id="error-${i}">${err}</li>`
    );
  });
}

function renderProgress() {
  const $section = $("#processing");
  $section.find(".progress-block").remove();

  window.DOWNLOAD_PROGRESS.forEach((item, i) => {
    if (typeof item === "number") {
      $section.append(`
        <div class="progress-block">
          <p class="progress-label">Task ${i + 1}</p>
          <progress value="${item}" max="100"></progress>
        </div>
      `);
    } else {
      const { name, url, progress } = item;
      $section.append(`
        <div class="progress-block" id="progress-${i}">
          <p class="progress-label">${name}</p>
          <progress value="${progress}" max="100"></progress>
          <p style="font-size: 12px; color: #888;">${url}</p>
        </div>
      `);
    }
  });
}

function showSystemInfo() {
  const list = document.getElementById("systemInfoList");
  list.innerHTML = ""; // Clear previous

  try {
    const infoItems = [];

    infoItems.push(["App Version", window.APP_VERSION]);
    infoItems.push(["Build Date", window.APP_BUILD_DATE]);

    // Basic info
    infoItems.push([
      "Android ID",
      tizen.systeminfo.getCapability("http://tizen.org/system/tizenid"),
    ]);
    fetchGeolocation(infoItems);

    infoItems.push(["Device ID", localStorage.getItem("device_id")]);

    infoItems.push(["Group ID", localStorage.getItem("group_id")]);

    infoItems.push([
      "Model",
      tizen.systeminfo.getCapability("http://tizen.org/system/model_name"),
    ]);
    infoItems.push([
      "Firmware",
      tizen.systeminfo.getCapability(
        "http://tizen.org/feature/platform.version"
      ),
    ]);
    infoItems.push([
      "Tizen Version",
      tizen.systeminfo.getCapability(
        "http://tizen.org/feature/platform.native.api.version"
      ),
    ]);
    infoItems.push(["Screen Resolution", `${screen.width} x ${screen.height}`]);
    infoItems.push(["Orientation", window.DEVICE_WINDOW_ORIENT]);

    // Optional: storage
    tizen.systeminfo.getPropertyValue(
      "STORAGE",
      (storage) => {
        const internal = storage.units.find((u) => u.type === "INTERNAL");
        if (internal) {
          infoItems.push([
            "Storage Total",
            (internal.capacity / (1024 * 1024)).toFixed(1) + " MB",
          ]);
          infoItems.push([
            "Storage Available",
            (internal.availableCapacity / (1024 * 1024)).toFixed(1) + " MB",
          ]);
        }
        updateDeviceList(infoItems);
      },
      (err) => {
        infoItems.push(["Storage", "Not Available"]);
        updateDeviceList(infoItems);
      }
    );
  } catch (e) {
    console.warn("System info error:", e.message);
    list.innerHTML = "<li>Unable to fetch device info</li>";
  }
}

function updateDeviceList(infoItems) {
  const list = document.getElementById("systemInfoList");
  list.innerHTML = "";
  infoItems.forEach(([key, value]) => {
    const li = document.createElement("li");
    li.textContent = `${key}: ${value}`;
    list.appendChild(li);
  });
}

function fetchGeolocation(infoItems) {
  if (tizen.geolocation) {
    tizen.geolocation.getCurrentPosition(
      function (position) {
        infoItems.push([
          "Location",
          `Latitude: ${position.coords.latitude}, Longitude: ${position.coords.longitude}`,
        ]);
      },
      function (error) {
        console.warn("Geolocation error:", error.message);
        infoItems.push(["Location", "Not Available"]);
      },
      {
        maximumAge: 60000,
        timeout: 5000,
        enableHighAccuracy: false,
      }
    );
  } else {
    infoItems.push(["Location", "Geolocation API not supported"]);
  }
}
