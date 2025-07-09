function generateUUID() {
  // Public Domain/MIT
  var d = new Date().getTime();
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    d += performance.now(); //use high-precision timer if available
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (d + Math.random() * 16) % 16 | 0;
    d = Math.floor(d / 16);
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function decodeTokenPayload(token) {
  try {
    var parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid JWT format");
    }

    var base64Url = parts[1];
    var base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");

    // Decode base64 string
    var jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map(function (c) {
          return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join("")
    );

    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error("Failed to decode token:", error);
    return null;
  }
}

function getTVDeviceInfo() {
  return new Promise(function (resolve, reject) {
    try {
      let android_id = tizen.systeminfo.getCapability(
        "http://tizen.org/system/tizenid"
      );

      tizen.systeminfo.getPropertyValue(
        "BUILD",
        function (build) {
          var model = build.model;
          var version = build.buildVersion;

          if (tizen.geolocation) {
            tizen.geolocation.getCurrentPosition(
              function (position) {
                var location = {
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                };

                resolve({
                  android_id: android_id || model, // Fallback to model if ID not available
                  location: location,
                });
              },
              function (error) {
                console.warn("Location error:", error.message);
                // Resolve anyway without location
                resolve({
                  android_id: android_id || model,
                  location: null,
                });
              }
            );
          } else {
            resolve({
              android_id: android_id || model,
              location: null,
            });
          }
        },
        function (error) {
          console.error("Error getting build info:", error);
          reject(error);
        }
      );
    } catch (err) {
      console.error("Error in getTVDeviceInfo:", err);
      reject(err);
    }
  });
}
function generateImageAds(url) {
  console.log("Image URL:", url);

  return "<img src=" + url + " class='ad-player-image' alt='Ad Image' />";
}

function generateVideoAds(url) {
  return (
    "<div class='ad-player'><video src=" +
    encodeURI(url) +
    " controls></video></div>"
  );
}

function generateTextAds(text) {
  return "<div class='ad-text'>" + escapeHtml(text) + "</div>";
}

// Optional: Escape text to prevent HTML injection
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function startAdSlide(containerId, textData, speed) {
  console.log("Ad Slide Start", containerId, textData, speed);
  if (!containerId || !textData) {
    console.error(
      "Invalid parameters for startAdSlide:",
      containerId,
      textData,
      speed
    );
    return;
  }
  if (window.SNIPIT_TEXT_ITIMEOUT_ID) {
    clearTimeout(window.SNIPIT_TEXT_ITIMEOUT_ID);
  }
  if (!speed) speed = 1; // Default speed

  var container = document.getElementById(containerId);
  var text = document.getElementById("sliding_text");
  text.innerHTML = ""; // Clear previous text
  text.innerHTML = textData; // Set new text

  if (!container || !text) return;

  var pos = container.offsetWidth;

  function animate() {
    pos -= speed;
    if (pos < -text.offsetWidth) {
      pos = container.offsetWidth;
    }
    text.style.left = pos + "px";
    window.SNIPIT_TEXT_ITIMEOUT_ID = setTimeout(animate, 20);
  }

  animate();
}

function showToast(type, message, timer) {
  const toast = document.getElementById("toast");

  // Remove all type classes
  toast.className = "";

  // Add type and show classes
  toast.classList.add(type, "show");
  toast.textContent = message;

  // Remove the toast after 3 seconds
  setTimeout(function() {
    toast.className = "";
  }, timer || 3000);
}
