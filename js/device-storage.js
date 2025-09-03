// Tizen Ad Loop Player - Handles large video downloads & async loading

const fileDir = "downloads/subDir";
var localAds = []; // Tracks local ad filenames
let adsFromServer = []; // Tracks ads from MQTT
let adLoopTimeouts = []; // 🔁 To track all timeouts
let currentVideo = null; // 🔇 To track currently playing video
let lastAdSignature = ""; // For checking ad updates
var p1, p2;
var iterator = 0;
let useP1Next = true; // Global or scoped toggle

// ✅ Ensure directory exists
tizen.filesystem.createDirectory(
  fileDir,
  (dir) => console.log("📁 Directory created:", dir),
  (err) => console.error("❌ Directory creation error:", err.message)
);

var sources = "";

tizen.filesystem.resolve(
  `${fileDir}`,
  (file) => {
    console.log("📁 Resolved file:", file.toURI());
    sources = file.toURI();
  },
  (err) => {
    console.warn("❌ Failed to resolve file:", fileDir);
  },
  "r"
);

p1 = webapis.avplaystore.getPlayer();
p2 = webapis.avplaystore.getPlayer();

function increaseIterator(x) {
  iterator++;
  if (iterator >= x.length) {
    iterator = 0;
  }
  console.log("Current iterator value: " + iterator);
}

// 📥 Handle ads from MQTT payload
async function handleMQTTAds(payload) {
  const ads = payload.ads;
  const rcs = payload.rcs;

  console.log("📥 Received ads:", ads);

  const filenames = ads.map((ad) => getFileName(ad));
  const newSignature = filenames.join(",");

  startAdSlide("ad_snippet", rcs, 2);

  console.log("placeholderUpdate:", payload.placeholderUpdate);

  if (newSignature === lastAdSignature && !payload.placeholderUpdate) {
    console.log("📭 No ad changes. Skipping update.");
    return;
  }

  lastAdSignature = newSignature;

  try {
    await cleanUpOldAds(filenames);
    console.log("🧹 Cleanup done!");

    // Download all files first (sequential or parallel)
    for (let i = 0; i < filenames.length; i++) {
      await checkAndDownloadContent(ads[i].url, filenames[i]);
    }
    console.log("✅ All downloads complete, starting playback");
    localAds = filenames;
    stopCurrentPlayback(); // 💥 Stop current playback first
    adsFromServer = ads;
    playAllContentInLoop(filenames, ads, rcs);
    // document.getElementById("ad_player").innerHTML = ""; // Clear previous content
  } catch (err) {
    console.error("❌ Error in ad handling:", err.message || err);
  }
}

function getFileName(adsData) {
  let url = adsData.url;
  let ad_id = adsData.ad_id;

  const originalName = url.substring(url.lastIndexOf("/") + 1).split("?")[0];
  const dotIndex = originalName.lastIndexOf(".");

  if (dotIndex === -1) {
    return ad_id ? `${originalName}_${ad_id}` : originalName;
  }

  const nameWithoutExt = originalName.substring(0, dotIndex);
  const extension = originalName.substring(dotIndex);

  if (nameWithoutExt.startsWith("placeholder")) {
    console.log("data in placehoder", adsData);
    return `${nameWithoutExt}_${adsData?.timestamp}${extension}`;
  }

  return ad_id ? `${nameWithoutExt}_${ad_id}${extension}` : originalName;
}

async function checkAndDownloadContent(url, fileName) {
  return new Promise((resolve, reject) => {
    tizen.filesystem.resolve(
      fileDir,
      (dir) => {
        try {
          dir.resolve(fileName);
          console.log("✅ Already downloaded:", fileName);
          addDownloadedFile(fileName);
          trackDownloadProgress(fileName, url, 100);
          resolve();
        } catch (e) {
          addInfoLog(`Downloading: ${fileName}`);
          trackDownloadProgress(fileName, url, 0);
          console.log("⬇️ Downloading:", fileName);
          const request = new tizen.DownloadRequest(url, fileDir, fileName);
          const downloadId = tizen.download.start(request);

          tizen.download.setListener(downloadId, {
            onprogress: (id, received, total) => {
              const percent = Math.floor((received / total) * 100);
              console.log(`Downloading ${fileName}: ${percent}%`);
              trackDownloadProgress(fileName, url, percent);
              addInfoLog(`Downloading ${fileName}: ${percent}%`);
            },
            onpaused: (id) => {
              console.warn(`Paused: ${fileName}`);
              addInfoLog(`Paused: ${fileName}`);
            },
            oncanceled: (id) => {
              addInfoLog(`Canceled: ${fileName}`);
              resolve();
            },
            oncompleted: (id, path) => {
              console.log(`Download complete: ${fileName}`);
              addInfoLog(`Download complete: ${fileName}`);
              addDownloadedFile(fileName);
              trackDownloadProgress(fileName, url, 100);
              resolve();
            },
            onfailed: (id, error) => {
              console.log(`Failed to download ${fileName}: ${error.message}`);
              addErrorLog(`Failed to download ${fileName}: ${error.message}`);
              resolve(); // or reject(error) if needed
            },
          });
        }
      },
      (err) => {
        addErrorLog(`Directory resolve failed: ${err.message}`);
        reject(err);
      },
      "rw"
    );
  });
}
// Stop current playback and clear timeouts
function stopCurrentPlayback() {
  iterator = 0;
  try {
    p1.stop();
  } catch (e) {
    console.warn("Error stopping p1:", e);
  }

  try {
    p2.stop();
  } catch (e) {
    console.warn("Error stopping p1:", e);
  }

  adLoopTimeouts.forEach(clearTimeout);
  adLoopTimeouts = [];

  document.getElementById("image-player").style.display = "none";
  document.getElementById("av-player").classList.remove("vid");
  document.getElementById("av-player2").classList.remove("vid");
}

function cleanUpOldAds(newFilenames) {
  return new Promise((resolve, reject) => {
    tizen.filesystem.resolve(
      fileDir,
      (dir) => {
        dir.listFiles(
          (entries) => {
            const deletions = entries
              .filter((entry) => !newFilenames.includes(entry.name))
              .map((entry) => deleteFileFromDir(dir, entry.name));
            Promise.all(deletions).then(resolve).catch(reject);
          },
          (err) => reject(err)
        );
      },
      (err) => reject(err),
      "rw"
    );
  });
}

function deleteFileFromDir(dir, name) {
  return new Promise((resolve, reject) => {
    dir.deleteFile(
      `${fileDir}/${name}`,
      () => {
        console.log("🗑️ Deleted:", name);
        addInfoLog(`Deleted file: ${name}`);
        resolve();
      },
      (err) => {
        console.error("❌ Delete failed:", name, err.message);
        addErrorLog(`Failed to delete ${name}: ${err.message}`);
        reject(err);
      }
    );
  });
}

function isVideo(fileName) {
  return (
    fileName.endsWith(".mp4") ||
    fileName.endsWith(".mkv") ||
    fileName.endsWith(".avi")
  );
}

// 🖼️ Show image
function showImage(file, resolve) {
  let imageLoaded = false;
  let loadTimeout = null;

  const cleanupAndResolve = () => {
    if (imageLoaded) return;
    imageLoaded = true;
    if (loadTimeout) clearTimeout(loadTimeout);
    resolve();
  };

  try {
    $(".login_loader").hide();
    var imgElement = document.getElementById("image-player");
    var videoElement1 = document.getElementById("av-player");
    var videoElement2 = document.getElementById("av-player2");

    // Hide videos
    videoElement1.classList.remove("vid");
    videoElement2.classList.remove("vid");
    imgElement.style.display = "block";

    // Set up error handler
    imgElement.onerror = function () {
      console.error("❌ Error loading image:", file);
      addErrorLog("Failed to load image: " + file);
      imgElement.style.display = "none";
      $(".login_loader").show();
      cleanupAndResolve();
    };

    // Set up load handler
    imgElement.onload = function () {
      console.log("✅ Image loaded successfully:", file);
      if (loadTimeout) clearTimeout(loadTimeout);
      // Don't resolve here, let the timeout in playImage handle it
    };

    // Timeout for image loading (in case onload/onerror never fire)
    loadTimeout = setTimeout(() => {
      if (!imageLoaded) {
        console.warn("⏰ Image load timeout:", file);
        addErrorLog("Image load timeout: " + file);
        cleanupAndResolve();
      }
    }, 5000); // 5 seconds timeout for image loading

    console.log("image_url " + sources + "/" + file);
    console.log("🖼️ Displaying image:", adsFromServer[iterator]);
    let image_url = sources + "/" + file;

    // Add cache buster for placeholder images
    if (file.startsWith("placeholder")) {
      image_url = image_url + "?v=" + new Date().getTime();
    }

    imgElement.src = image_url;
  } catch (err) {
    console.error("❌ Error preparing image:", err);
    addErrorLog("Error preparing image file: " + (err.message || err));
    cleanupAndResolve();
  }
}

let timeoutBox = null;

function playImage(file, signal) {
  return new Promise((resolve) => {
    let imageResolved = false;

    const cleanupAndResolve = () => {
      if (imageResolved) return;
      imageResolved = true;
      if (timeoutBox) {
        clearTimeout(timeoutBox);
        timeoutBox = null;
      }
      resolve();
    };

    if (timeoutBox) {
      clearTimeout(timeoutBox);
      timeoutBox = null;
    }

    document.getElementById("av-player").classList.remove("vid");
    document.getElementById("av-player2").classList.remove("vid");

    // Enhanced image display with error handling
    try {
      showImage(file, cleanupAndResolve);
    } catch (error) {
      console.error("❌ Error showing image:", error);
      addErrorLog("Image display error: " + (error.message || error));
      cleanupAndResolve();
      return;
    }

    timeoutBox = setTimeout(() => {
      if (!signal.aborted && !imageResolved) {
        console.log("🖼️ Image display complete:", file);
        cleanupAndResolve();
      }
    }, 10000); // 10 seconds per image

    // Handle abort signal
    if (signal.aborted) {
      cleanupAndResolve();
    }
  });
}

let currentAbortController = null;

async function playAllContentInLoop(filenames, ads, rcs) {
  console.log("🧹 Cleaning previous timeouts and DOM...");
  addInfoLog("🔁 Re-Start the Loop.....");
  console.log("Loaded ads list in localAds ...", localAds);
  console.log("Loaded ads in filenames :", filenames);
  iterator = 0;

  // 🛑 Abort existing controller and wait for it to settle
  if (currentAbortController) {
    console.log("🛑 Aborting previous loop...");
    currentAbortController.abort();

    // Wait a short time to let pending image/video resolves finish
    await new Promise((res) => setTimeout(res, 50));
  }

  currentAbortController = new AbortController();
  const signal = currentAbortController.signal;

  if (!filenames || filenames.length === 0) {
    addErrorLog("❌ No content to play.");
    return;
  }

  //   if (localAds.length !== filenames.length) {
  //     localAds = filenames;
  //     iterator = 0;
  //   }

  while (!signal.aborted) {
    const currentFile = filenames[iterator % filenames.length];
    const currentAd = ads[iterator % ads.length];
    console.log("▶️ Now playing: " + currentFile);
    console.log("playing index...." + iterator);
    console.log("Playing Index is " + (iterator % filenames.length));
    $(".login_loader").hide();
    var imgElement = document.getElementById("image-player");
    try {
      if (isVideo(currentFile)) {
        console.log(
          "🎥 Displaying video:",
          adsFromServer[iterator % adsFromServer.length]
        );
        await playVideo(currentFile, signal, currentAd);
        let nexIndex = iterator + 1 >= filenames.length ? 0 : iterator + 1;
        if (!isVideo(filenames[nexIndex])) {
          console.log("next content is show...");
          imgElement.src = filenames[nexIndex];
        }
      } else {
        await playImage(currentFile, signal);
      }
    } catch (err) {
      console.error("❌ Error during media playback:", err.message || err);
      addErrorLog("Media playback error: " + (err.message || err));
    }
    increaseIterator(filenames);
  }

  console.log("🛑 Playback loop terminated.");
}

function playVideo(file, signal, currentAd) {
  return new Promise((resolve, reject) => {
    let aborted = false;
    let hasStarted = false;
    let timeoutFallback = null;
    let prepareTimeout = null;
    document.getElementById("image-player").style.display = "none";
    document.getElementById("av-player").classList.add("vid");
    document.getElementById("av-player2").classList.add("vid");

    // Helper function to clean up and resolve
    const cleanupAndResolve = () => {
      if (timeoutFallback) clearTimeout(timeoutFallback);
      if (prepareTimeout) clearTimeout(prepareTimeout);
      aborted = true;
      resolve();
    };

    try {
      const player = useP1Next ? p1 : p2;
      const otherPlayer = useP1Next ? p2 : p1;

      useP1Next = !useP1Next;
      try {
        otherPlayer.stop?.();
      } catch {}
      try {
        player.stop?.();
      } catch (error) {
        console.log("player close....", error?.message);
        player.close?.();
      }

      let successCallback = function () {
        if (aborted) return;
        if (prepareTimeout) clearTimeout(prepareTimeout);
        console.log("The media has finished preparing");
        try {
          player.setVideoStillMode("false");
          player.play();
          console.log("🎞️ Playing video:", file);
        } catch (error) {
          console.error("❌ Error starting playback:", error);
          addErrorLog("Error starting playback: " + error.message);
          cleanupAndResolve();
        }
      };

      let errorCallback = function (error) {
        if (aborted) return;
        console.log("The media has failed to prepare:", error);
        addErrorLog(
          "Video playback error: Failed to prepare media - " +
            (error?.message || error)
        );
        try {
          player.stop();
        } catch (e) {
          console.warn("Error stopping player after prepare failure:", e);
        }
        cleanupAndResolve();
      };

      const dynamicListener = {
        onbufferingstart: () => {
          if (aborted) return;
          console.log("⏳ Buffering start.");
        },
        onbufferingprogress: function (percent) {
          if (aborted) return;
          console.log("Buffering progress data : " + percent);
        },
        onbufferingcomplete: function () {
          if (aborted) return;
          console.log("✅ Buffering complete");
          hasStarted = true;

          // ⏳ Backup timeout if video hangs without completing
          timeoutFallback = setTimeout(() => {
            if (!aborted) {
              console.warn("⏰ Playback stuck, skipping video:", file);
              addErrorLog("Playback stuck (no stream complete): " + file);
              try {
                player.stop();
              } catch (e) {
                console.warn("Error stopping stuck player:", e);
              }
              cleanupAndResolve();
            }
          }, Math.min(currentAd?.duration || 30000, 180000)); // Max 3 minutes, default 30 seconds
        },
        oncurrentplaytime: function (currentTime) {
          if (aborted) return;
          console.log("Current playtime: " + currentTime);
        },
        onstreamcompleted: () => {
          if (aborted) return;
          console.log("🎞️ Stream completed:", file);
          try {
            player.setVideoStillMode("true"); // Turn on still mode to keep last frame
            player.stop();
          } catch (e) {
            console.warn("Error during stream completion cleanup:", e);
          }
          cleanupAndResolve();
        },
        onerrormsg: function (eventType, errorMsg) {
          if (aborted) return;
          console.error("❌ Error message received:", eventType, errorMsg);
          addErrorLog(`Video error (${eventType}): ${errorMsg}`);
          // Don't resolve here, let onerror handle it
        },
        onerror: (errType) => {
          if (aborted) return;
          console.error("❌ Playback error:", errType);
          addErrorLog("Playback error: " + errType);
          try {
            player.stop();
          } catch (e) {
            console.warn("Error stopping player after error:", e);
          }
          cleanupAndResolve();
        },
      };

      // Add timeout for prepare phase (in case prepareAsync never calls back)
      prepareTimeout = setTimeout(() => {
        if (!aborted && !hasStarted) {
          console.warn("⏰ Prepare timeout, skipping video:", file);
          addErrorLog("Prepare timeout: " + file);
          try {
            player.stop();
          } catch (e) {
            console.warn("Error stopping player after prepare timeout:", e);
          }
          cleanupAndResolve();
        }
      }, 15000); // 15 seconds timeout for prepare

      player.open(sources + "/" + file);
      player.setListener(dynamicListener);
      player.setDisplayRotation("PLAYER_DISPLAY_ROTATION_90");
      player.setDisplayRect(0, 0, 1080, 1824);
      player.prepareAsync(successCallback, errorCallback);

      // Handle abortion after play started
      if (signal.aborted) {
        cleanupAndResolve();
        return;
      }

      const abortHandler = () => {
        console.log("🛑 Abort signal triggered during playback");
        cleanupAndResolve();
      };

      // Uncomment if you want to handle abort signals
      // signal.addEventListener("abort", abortHandler, { once: true });
    } catch (err) {
      console.error("❌ Error playing video:", err.message || err);
      addErrorLog("Video playback error: " + (err.message || err));
      cleanupAndResolve(); // Use cleanup function instead of direct resolve
    }
  });
}

// Global error handler to prevent freezing
window.addEventListener("error", (event) => {
  console.error("❌ Global error caught:", event.error);
  addErrorLog("Global error: " + (event.error?.message || event.error));

  // If error occurs during video playback, try to recover
  try {
    if (p1) p1.stop();
    if (p2) p2.stop();
  } catch (e) {
    console.warn("Error stopping players during global error recovery:", e);
  }
});

// Handle unhandled promise rejections
window.addEventListener("unhandledrejection", (event) => {
  console.error("❌ Unhandled promise rejection:", event.reason);
  addErrorLog(
    "Unhandled promise rejection: " + (event.reason?.message || event.reason)
  );
  event.preventDefault(); // Prevent default browser behavior
});

window.addEventListener("unload", () => {
  console.log("🔁 Unloading... cleaning up");

  // 1. Clear all ad loop timeouts
  adLoopTimeouts.forEach(clearTimeout);
  adLoopTimeouts = [];

  // 2. Abort any current video/image loop
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }

  // 3. Stop and close both video players
  try {
    if (p1) {
      p1.stop();
      p1.close();
    }
    if (p2) {
      p2.stop();
      p2.close();
    }
  } catch (e) {
    console.warn("⚠️ Player cleanup failed:", e);
  }

  // 4. Clear image display
  const img = document.getElementById("image-player");
  if (img) {
    img.src = "";
    img.style.display = "none";
  }

  // 5. Optional: remove listeners on players if any (safety)
  try {
    p1 && p1.setListener(null);
    p2 && p2.setListener(null);
  } catch (e) {
    console.warn("Error removing player listeners:", e);
  }

  console.log("✅ Cleanup complete");
});
