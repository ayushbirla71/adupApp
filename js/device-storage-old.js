// Tizen Ad Loop Player - Handles large video downloads & async loading

const fileDir = "downloads/subDir";
var localAds = []; // Tracks local ad filenames
let adsFromServer = []; // Tracks ads from MQTT
let adLoopTimeouts = []; // 🔁 To track all timeouts
let currentVideo = null; // 🔇 To track currently playing video
let lastAdSignature = ""; // For checking ad updates
var p1, p2;
var iterator = 0;

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
  adsFromServer = ads;

  const filenames = ads.map((ad) => getFileName(ad?.url, ad?.ad_id));
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
    playAllContentInLoop(filenames, ads, rcs);
    // document.getElementById("ad_player").innerHTML = ""; // Clear previous content
  } catch (err) {
    console.error("❌ Error in ad handling:", err.message || err);
  }
}

function getFileName(url, ad_id) {
  const originalName = url.substring(url.lastIndexOf("/") + 1).split("?")[0];
  const dotIndex = originalName.lastIndexOf(".");
  if (dotIndex === -1) {
    return ad_id ? `${originalName}_${ad_id}` : originalName;
  }
  const nameWithoutExt = originalName.substring(0, dotIndex);
  const extension = originalName.substring(dotIndex);
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
              trackDownloadProgress(fileName, url, percent);
              addInfoLog(`Downloading ${fileName}: ${percent}%`);
            },
            onpaused: (id) => {
              addInfoLog(`Paused: ${fileName}`);
            },
            oncanceled: (id) => {
              addInfoLog(`Canceled: ${fileName}`);
              resolve();
            },
            oncompleted: (id, path) => {
              addInfoLog(`Download complete: ${fileName}`);
              addDownloadedFile(fileName);
              trackDownloadProgress(fileName, url, 100);
              resolve();
            },
            onfailed: (id, error) => {
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
function showImage(file) {
  try {
    var imgElement = document.getElementById("image-player");
    var videoElement1 = document.getElementById("av-player");
    var videoElement2 = document.getElementById("av-player2");

    // Hide videos
    videoElement1.classList.remove("vid");
    videoElement2.classList.remove("vid");

    // Show image
    console.log("image_url " + sources + "/" + file);
    imgElement.src = sources + "/" + file;
    imgElement.style.display = "block";

    // Wait for 5 seconds then move to next item
    const timeout = setTimeout(() => {
      imgElement.style.display = "none";
      increaseIterator(localAds);
      play(localAds);
    }, 10000);

    adLoopTimeouts.push(timeout);
  } catch (err) {
    addErrorLog(" Error preparing or Image file:", err.message || err);
  }
}

let currentAbortController = null;

async function playAllContentInLoop(filenames, ads, rcs) {
  console.log("🧹 Cleaning previous timeouts and DOM...");
  addInfoLog("Re-Start the Loop.....");
  console.log("loaded ads list in localAds ...", localAds);
  console.log("loaded ads in filenames :", filenames);
  if (localAds.length !== filenames.length) {
    localAds = filenames;
  }
  play(filenames);
}

function play(pl) {
  if (!pl || pl.length === 0) {
    addErrorLog("No content to play.");
    console.error("No Content To Play.", pl);
    return;
  }
  var currentFile = pl[iterator % pl.length];
  console.log("Now playing: " + currentFile);

  if (isVideo(currentFile)) {
    document.getElementById("image-player").style.display = "none";
    document.getElementById("av-player").classList.add("vid");
    document.getElementById("av-player2").classList.add("vid");

    console.log("play url " + sources + "/" + currentFile);

    try {
      p1.open(sources + "/" + currentFile);
      p1.setListener(listener1);

      // p1.setDisplayRotation(90); // Rotate for portrait
      p1.setDisplayRotation("PLAYER_DISPLAY_ROTATION_90"); // To play portrait content
      p1.setDisplayRect(0, 0, 1080, 1824); // Full portrait display
      p1.prepare(); // ❗ May throw
      p1.play();
    } catch (err) {
      console.error("🎥 Error preparing or playing video:", err.message || err);
      addErrorLog("🎥 Error preparing or playing video:", err.message || err);
      increaseIterator(localAds);
      play(localAds); // try next item
    }
  } else {
    showImage(currentFile);
  }
}

var listener1 = {
  onbufferingstart: function () {
    console.log("Buffering start.");
  },
  onbufferingprogress: function (percent) {
    console.log("Buffering progress data : " + percent);
  },
  onbufferingcomplete: function () {
    console.log("Buffering complete.");
  },
  onstreamcompleted: function () {
    console.log("Stream Completed");
    p1.stop();
    increaseIterator(localAds);
    var nextFile = localAds[iterator % localAds.length];
    if (isVideo(nextFile)) {
      try {
        console.log("playing url " + sources + "/" + nextFile);
        p2.open(sources + "/" + nextFile);
        p2.setListener(listener2);
        p2.setDisplayRotation("PLAYER_DISPLAY_ROTATION_90"); // To play portrait content
        // p2.setDisplayRotation(90); // Rotate for portrait
        p2.setDisplayRect(0, 0, 1080, 1824); // Full portrait display
        p2.prepare();
        p2.play();
      } catch (err) {
        console.error(
          "🎥 Error preparing or playing video:",
          err.message || err
        );
        addErrorLog("🎥 Error preparing or playing video:", err.message || err);
        increaseIterator(localAds);
        play(localAds); // try next item
      }
    } else {
      showImage(nextFile);
    }
  },
  onerror: function (eventType) {
    console.error("event type error: " + eventType);
    addErrorLog("event type error: " + eventType);
    increaseIterator(localAds);
    play(localAds); // try next item
  },
};

var listener2 = {
  onbufferingstart: function () {
    console.log("Buffering start.");
  },
  onbufferingprogress: function (percent) {
    console.log("Buffering progress data : " + percent);
  },
  onbufferingcomplete: function () {
    console.log("Buffering complete.");
  },
  onstreamcompleted: function () {
    console.log("Stream Completed");
    p2.stop();
    increaseIterator(localAds);
    var nextFile = localAds[iterator % localAds.length];
    if (isVideo(nextFile)) {
      try {
        p1.open(sources + "/" + nextFile);
        p1.setListener(listener1);
        // p1.setDisplayRotation(90); // Rotate for portrait
        p1.setDisplayRotation("PLAYER_DISPLAY_ROTATION_90"); // To play portrait content
        p1.setDisplayRect(0, 0, 1080, 1824); // Full portrait display
        p1.prepare();
        p1.play();
      } catch (err) {
        console.error(
          "🎥 Error preparing or playing video:",
          err.message || err
        );
        addErrorLog("🎥 Error preparing or playing video:", err.message || err);
        increaseIterator(localAds);
        play(localAds); // try next item
      }
    } else {
      showImage(nextFile);
    }
  },
  onerror: function (eventType) {
    console.error("event type error: " + eventType);
    addErrorLog("event type error: " + eventType);
    increaseIterator(localAds);
    play(localAds); // try next item
  },
};

window.addEventListener("unload", () => {
  adLoopTimeouts.forEach(clearTimeout);
});
