const fileDir = "downloads/subDir";
let localAds = []; // Tracks local ad filenames
let adsFromServer = []; // Tracks ads from MQTT

// ✅ Create directory first (safe to call multiple times)
var successCallback = function (fileDir) {
  console.log("New directory has been created: " + fileDir);
};
var errorCallback = function (error) {
  console.log(error);
};
tizen.filesystem.createDirectory(fileDir, successCallback, errorCallback);

async function handleMQTTAds(payload) {
  const ads = payload.ads;
  const rcs = payload.rcs;

  console.log("📥 Received ads:", ads);
  adsFromServer = ads;

  const filenames = ads.map((ad) => getFileName(ad.url));
  localAds = filenames;

  try {
    // Step 1: Clean old ads
    await cleanUpOldAds(filenames);
    console.log("🧹 Cleanup done!");

    // Step 2: Download new content
    const downloadTasks = filenames.map((name, index) =>
      checkAndDownloadContent(ads[index].url, name)
    );
    await Promise.all(downloadTasks);
    console.log("✅ All content downloaded, starting playback...", rcs);

    // Step 3: Start playback
    playAllContentInLoop(filenames, ads, rcs);
  } catch (err) {
    console.error("❌ Error in ad handling:", err.message || err);
  }
}

// test

// ✅ Extract filename from URL
function getFileName(url) {
  return url.substring(url.lastIndexOf("/") + 1).split("?")[0];
}

async function checkAndDownloadContent(url, fileName) {
  return new Promise((resolve, reject) => {
    tizen.filesystem.resolve(
      fileDir,
      (dir) => {
        try {
          dir.resolve(fileName); // If no exception, file exists
          console.log("✅ Already downloaded:", fileName);
          resolve();
        } catch (e) {
          console.log("⬇️ Downloading:", fileName);
          const request = new tizen.DownloadRequest(url, fileDir, fileName);
          const downloadId = tizen.download.start(request);

          tizen.download.setListener(downloadId, {
            onprogress: (id, receivedSize, totalSize) =>
              console.log("⬇️ Progress:", id, receivedSize + "/" + totalSize),
            onpaused: (id) => console.log("⏸️ Paused:", id),
            oncanceled: (id) => {
              console.log("❌ Canceled:", id);
              resolve(); // You may want to reject instead
            },
            oncompleted: (id, path) => {
              console.log("✅ Completed:", path);
              resolve();
            },
            onfailed: (id, error) => {
              console.log("❌ Failed:", id, error);
              resolve(); // Or reject if needed
            },
          });
        }
      },
      (err) => {
        console.error("❌ Resolve failed:", err.message);
        reject(err);
      },
      "rw"
    );
  });
}

// ✅ Clean up old files that are not in the new list

function cleanUpOldAds(newFilenames) {
  return new Promise(function (resolve, reject) {
    tizen.filesystem.resolve(
      fileDir,
      function (dir) {
        try {
          dir.listFiles(
            function (entries) {
              let deletePromises = [];

              entries.forEach(function (entry) {
                var name = entry.name;
                if (newFilenames.indexOf(name) === -1) {
                  // Push the delete promise to the array
                  deletePromises.push(deleteFileFromDir(dir, name));
                }
              });

              // Wait for all deletions to finish
              Promise.all(deletePromises)
                .then(function () {
                  console.log("✅ All files deleted.");
                  resolve(); // Resolve after all deletions are complete
                })
                .catch(function (error) {
                  console.error("❌ Error deleting some files:", error);
                  reject(error); // Reject if any deletion fails
                });
            },
            function (error) {
              console.error("❌ Failed to list files:", error.message);
              reject(error);
            }
          );
        } catch (err) {
          console.error("❌ Directory read error:", err.message);
          reject(err);
        }
      },
      function (err) {
        console.error("❌ Directory resolve failed:", err.message);
        reject(err);
      },
      "rw"
    );
  });
}
function playAllContentInLoop(filenames, ads, rcs) {
  console.log("🎬 Starting smooth playback loop...");
  const container = document.getElementById("ad_player");
  let index = 0;

  startAdSlide("ad_snippet", rcs, 2); // Start text animation

  const getMediaType = (filename) => {
    const ext = filename.split(".").pop().toLowerCase();
    if (["jpg", "jpeg", "png", "gif"].includes(ext)) return "image";
    if (["mp4", "webm", "mov"].includes(ext)) return "video";
    return null;
  };

  const resolveFile = (fileName) => {
    return new Promise((resolve, reject) => {
      tizen.filesystem.resolve(
        fileDir + "/" + fileName,
        (file) => resolve(file.toURI()),
        (err) => reject(err),
        "r"
      );
    });
  };

  async function preloadAndShow(currentIndex) {
    const currentFile = filenames[currentIndex];
    const currentType = getMediaType(currentFile);

    if (!currentType) {
      console.warn("Unsupported format:", currentFile);
      playNext();
      return;
    }

    try {
      const uri = await resolveFile(currentFile);

      // Preload next
      const nextIndex = (currentIndex + 1) % filenames.length;
      const nextFile = filenames[nextIndex];
      const nextType = getMediaType(nextFile);

      let preloadPromise = Promise.resolve();
      if (nextType === "video") {
        preloadPromise = resolveFile(nextFile).then((nextUri) => {
          const preloader = document.createElement("video");
          preloader.src = nextUri;
          preloader.preload = "auto";
          preloader.style.display = "none";
          document.body.appendChild(preloader);
          setTimeout(() => document.body.removeChild(preloader), 10000);
        });
      }

      // Create transition wrapper
      const wrapper = document.createElement("div");
      wrapper.className = "media-slide";
      wrapper.style.opacity = 0;
      wrapper.style.transition = "opacity 1s ease-in-out";
      wrapper.style.position = "absolute";
      wrapper.style.top = "0";
      wrapper.style.left = "0";
      wrapper.style.width = "100vw";
      wrapper.style.height = "100vh";
      wrapper.style.zIndex = 1;

      if (currentType === "image") {
        const img = new Image();
        img.src = uri;
        img.className = "ad_image";
        img.style.width = "100vw";
        img.style.height = "95vh";
        img.style.objectFit = "cover";
        wrapper.appendChild(img);
        container.appendChild(wrapper);

        await preloadPromise;
        requestAnimationFrame(() => (wrapper.style.opacity = 1));

        setTimeout(() => {
          fadeOutAndRemove(wrapper);
          playNext();
        }, 10000);
      } else if (currentType === "video") {
        const video = document.createElement("video");
        video.src = uri;
        video.autoplay = true;
        video.muted = false;
        video.volume = 1.0;
        video.controls = false;
        video.style.width = "100vw";
        video.style.height = "95vh";
        video.style.objectFit = "fill";
        wrapper.appendChild(video);
        container.appendChild(wrapper);

        await preloadPromise;
        requestAnimationFrame(() => (wrapper.style.opacity = 1));

        video.play().catch((err) => console.warn("Autoplay failed:", err.message));

        video.onended = () => {
          fadeOutAndRemove(wrapper);
          playNext();
        };
      }
    } catch (error) {
      console.error("❌ File error:", error.message);
      playNext();
    }
  }

  function fadeOutAndRemove(el) {
    el.style.opacity = 0;
    setTimeout(() => {
      if (el && el.parentNode === container) {
        container.removeChild(el);
      }
    }, 1000); // Matches fade transition
  }

  function playNext() {
    index = (index + 1) % filenames.length;
    preloadAndShow(index);
  }

  preloadAndShow(index); // Start loop
}


function deleteFileFromDir(dir, name) {
  return new Promise(function (resolve, reject) {
    dir.deleteFile(
      fileDir + "/" + name,
      function () {
        console.log("✅ Deleted:", name);
        resolve();
      },
      function (error) {
        console.error("❌ Error deleting file:", name, error.message);
        reject(error);
      }
    );
  });
}
