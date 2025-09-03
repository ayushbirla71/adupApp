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
  try {
    $(".login_loader").hide();
    var imgElement = document.getElementById("image-player");
    var videoElement1 = document.getElementById("av-player");
    var videoElement2 = document.getElementById("av-player2");

    // Hide videos
    videoElement1.classList.remove("vid");
    videoElement2.classList.remove("vid");
    imgElement.style.display = "block";
    // Show image

    imgElement.onerror = function () {
      imgElement.style.display = "none";
      $(".login_loader").show();
      resolve();
      console.error("❌ Error loading image:", file);
    };
    console.log("image_url " + sources + "/" + file);
    console.log("🖼️ Displaying image:", adsFromServer[iterator]);
    let image_url = sources + "/" + file;
    // if (file.startsWith("placeholder")) {
    //   image_url = image_url + "?v=" + new Date().getTime(); // cache buster
    // }
    imgElement.src = image_url; // ✅ use updated URL
  } catch (err) {
    addErrorLog(" Error preparing or Image file:", err.message || err);
  }
}

let timeoutBox = null;

function playImage(file, signal) {
  return new Promise((resolve) => {
    if (timeoutBox) {
      clearTimeout(timeoutBox);
      timeoutBox = null;
    }
    document.getElementById("av-player").classList.remove("vid");
    document.getElementById("av-player2").classList.remove("vid");
    showImage(file, resolve); // your own image render logic

    timeoutBox = setTimeout(() => {
      if (!signal.aborted) {
        console.log("🖼️ Image display complete:", file);
        resolve();
      }
    }, 10000); // 10 seconds per image

    // signal.addEventListener("abort", () => {
    //   clearTimeout(timeout);
    //   console.log("🛑 Aborted during image");
    //   resolve();
    // });
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
    document.getElementById("image-player").style.display = "none";
    document.getElementById("av-player").classList.add("vid");
    document.getElementById("av-player2").classList.add("vid");

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

      function timeoutFallbackHandler() {
        timeoutFallback = setTimeout(() => {
          if (!hasStarted) {
            console.warn("⏭️ Timeout: Skipping stuck video:", file);
            player.stop();
            addErrorLog("Video playback timeout: Skipping stuck video");
            resolve();
          } else {
            console.warn(
              "⏭️ Timeout: Video playback took too long, stopping player."
            );
            player.stop();
            addErrorLog("Video playback timeout: Stopping player");
            resolve();
          }
        }, currentAd?.duration * 1000 || 15000); // e.g., 15 sec fallback
      }

      let successCallback = function () {
        console.log("The media has finished preparing");
        player.setVideoStillMode("false");
        player.play();
        console.log("🎞️ Playing video:", file);
        let state = player.getState();
        console.log("[Player][seekBackward] state 1: ", state);
      };

      let errorCallback = function () {
        console.log("The media has failed to prepare");
        addErrorLog("Video playback error: Failed to prepare media");
        player.stop();
        clearTimeout(timeoutFallback);
        resolve();
      };

      const dynamicListener = {
        onbufferingstart: () => {
          console.log("⏳ Buffering start.");
        },
        onbufferingprogress: function (percent) {
          console.log("Buffering progress data : " + percent);
        },
        onbufferingcomplete: function () {
          console.log("✅ Buffering complete");
          hasStarted = true;
        },
        oncurrentplaytime: function (currentTime) {
          let state = player.getState();
          console.log("[Player][seekBackward] state 2: ", state);
          if (state === "PLYING") {
            if (!timeoutFallback) {
              timeoutFallbackHandler();
            }
          }
          console.log("Current playtime: " + currentTime);
        },
        onstreamcompleted: () => {
          if (!aborted) {
            console.log("🎞️ Stream completed:", file);
            player.setVideoStillMode("true"); // Turn on still mode to keep last frame
            player.stop();
            clearTimeout(timeoutFallback);
            resolve();
          } else {
            console.log(
              "🛑 Aborted during stream completion, stopping player."
            );
            player.stop();
            clearTimeout(timeoutFallback);
            resolve();
          }
        },

        onevent: function (eventType, eventData) {
          console.log("event type: " + eventType + ", data: " + eventData);
        },

        onerror: (errType) => {
          if (!aborted) {
            console.error("❌ Playback error:", errType);
            addErrorLog("Playback error: " + errType);
            player.stop();
            clearTimeout(timeoutFallback);
            resolve();
          } else {
            console.log("🛑 Aborted during error handling, stopping player.");
            player.stop();
            clearTimeout(timeoutFallback);
            resolve();
          }
        },
      };

      player.open(sources + "/" + file);
      player.setListener(dynamicListener);
      player.setDisplayRotation("PLAYER_DISPLAY_ROTATION_90");
      player.setDisplayRect(0, 0, 1080, 1824);
      // player.prepare();

      // --- SET THE SKIP TIMEOUT HERE ---
      // timeoutFallback = setTimeout(() => {
      //   console.warn("⏭️ Timeout: Skipping stuck video:", file);
      //   player.stop();
      //   resolve();
      // }, currentAd?.duration || 15000); // e.g., 15 sec fallback

      player.prepareAsync(successCallback, errorCallback);
      // player.setVideoStillMode("false");
      // player.play();

      // Handle abortion after play started
      if (signal.aborted) {
        aborted = true;
        console.log("🛑 Aborted during video");
        player.stop();
        resolve();
        return;
      }

      const abortHandler = () => {
        aborted = true;
        console.log("🛑 Abort signal triggered during playback");
        player.stop();
        resolve();
      };

      // signal.addEventListener("abort", abortHandler, { once: true });
    } catch (err) {
      console.error("❌ Error playing video:", err.message || err);
      addErrorLog("Video playback error: " + (err.message || err));
      resolve(); // Resolve to continue loop
    }
  });
}

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
  p1 && p1.setListener(null);
  p2 && p2.setListener(null);

  console.log("✅ Cleanup complete");
});
