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
  console.log("🎬 Starting playback of all content in loop...", filenames);
  let index = 0;
  let container = document.getElementById("ad_player");

  // Call the function like this
  startAdSlide("ad_snippet", rcs, 2); // container ID, text ID, speed

  function next() {
    if (!filenames || filenames.length === 0) {
      console.warn("⚠️ No files to play.");
      return;
    }
    if (index >= filenames.length) index = 0;
    let fileName = filenames[index];
    let ext = fileName.split(".").pop().toLowerCase();

    tizen.filesystem.resolve(
      fileDir + "/" + fileName,
      function (file) {
        let fileUri = file.toURI();

        // Clear previous content
        container.innerHTML = "";

        if (["mp4", "webm", "mov"].includes(ext)) {
          console.log("🎥 Playing video:", fileUri);
          // 🎥 Render Video
          var video = document.createElement("video");
          video.src = fileUri;
          video.autoplay = true;
          video.muted = true;
          video.class = "ad_video";
          video.controls = false;
          video.style.width = "100vw";
          video.style.height = "95vh";
          video.style.objectFit = "fill"; // Try "cover" if you want to crop but cover full area

          container.appendChild(video);
          video.play();
          video.onended = function () {
            index++;
            container.removeChild(video); // Remove video after playback
            next();
          };
        } else if (["jpg", "jpeg", "png", "gif"].includes(ext)) {
          console.log("🖼️ Displaying image:", fileUri);
          // 🖼️ Render Image
          var img = document.createElement("img");
          img.src = fileUri;
          // img.style.width = "auto";
          img.class = "ad_image";
          img.style.width = "auto";
          img.style.height = "95vh";
          img.style.objectFit = "cover";
          // img.style.height = "100%";
          container.appendChild(img);
          setTimeout(function () {
            index++;
            container.removeChild(img); // Remove image after 5 seconds
            next();
          }, 10000); // Display image for 5 seconds
        } else {
          console.warn("⚠️ Unsupported format:", ext);
          index++;
          container.innerHTML = ""; // Clear container
          next();
        }
      },
      function (err) {
        console.error("❌ Error loading file:", fileName, err.message);
        index++;
        next();
      },
      "r"
    );
  }

  next();
}

// function playAllContentInLoop(filenames, ads, rcs) {
//   console.log("🎬 Starting playback of all content...", filenames);
//   let index = 0;
//   let container = document.getElementById("ad_player");

//   // Call the function like this
//   startAdSlide("ad_snippet", rcs, 2);

//   if (!container) {
//     console.error("❌ ad_player container not found.");
//     return;
//   }

//   container.style.overflow = "hidden";
//   container.style.backgroundColor = "black";

//   // Create two buffers for alternating content
//   let buffers = [document.createElement("div"), document.createElement("div")];
//   buffers.forEach((buffer, i) => {
//     buffer.style.cssText = `
//       position: absolute;
//       top: 0; left: 0;
//       width: 100%; height: 100%;
//       display: flex;
//       justify-content: center;
//       align-items: center;
//       opacity: 0;
//       transition: opacity 0.3s ease;
//       z-index: ${i + 1};
//       background-color: black;
//     `;
//     container.appendChild(buffer);
//   });

//   let currentBuffer = 0;

//   function next() {
//     if (!filenames || filenames.length === 0) {
//       console.warn("⚠️ No files provided.");
//       return;
//     }

//     if (index >= filenames.length) index = 0;
//     const fileName = filenames[index];
//     const ext = fileName.split(".").pop().toLowerCase();

//     console.log("➡️ Loading file:", fileName);

//     tizen.filesystem.resolve(
//       fileDir + "/" + fileName,
//       function (file) {
//         const fileUri = file.toURI();
//         const buf = buffers[currentBuffer];
//         const nextBuf = buffers[1 - currentBuffer];

//         // Stop and cleanup video from the next buffer
//         const oldVideo = nextBuf.querySelector("video");
//         if (oldVideo) {
//           oldVideo.pause();
//           oldVideo.src = "";
//           oldVideo.load(); // Unload the video
//         }

//         // Reset current buffer
//         buf.innerHTML = "";
//         nextBuf.style.opacity = "0"; // Hide previous buffer

//         if (["mp4", "webm", "mov"].includes(ext)) {
//           const video = document.createElement("video");
//           video.src = fileUri;
//           video.autoplay = true;
//           video.muted = true;
//           video.controls = false;
//           video.style.width = "100%";
//           video.style.height = "100vh";
//           video.style.objectFit = "contain";
//           video.style.backgroundColor = "black";
//           video.loop = false;

//           video.onerror = () => {
//             console.warn("🚫 Failed to play video:", fileName);
//             index++;
//             next(); // Skip to next
//           };

//           video.onloadeddata = () => {
//             console.log("🎥 Playing video:", fileUri);
//             buf.appendChild(video);
//             buf.style.opacity = "1";
//           };

//           video.onended = () => {
//             buf.style.opacity = "0";
//             currentBuffer = 1 - currentBuffer;
//             index++;
//             next();
//           };
//         } else if (["jpg", "jpeg", "png", "gif"].includes(ext)) {
//           const img = document.createElement("img");
//           img.src = fileUri;
//           img.style.width = "auto";
//           img.style.height = "100vh";
//           img.style.objectFit = "cover";

//           img.onload = () => {
//             console.log("🖼️ Showing image:", fileUri);
//             buf.appendChild(img);
//             buf.style.opacity = "1";
//             setTimeout(() => {
//               buf.style.opacity = "0";
//               currentBuffer = 1 - currentBuffer;
//               index++;
//               next();
//             }, 10000); // Show image for 10 seconds
//           };

//           img.onerror = () => {
//             console.warn("🚫 Failed to load image:", fileName);
//             index++;
//             next();
//           };
//         } else {
//           console.warn("⚠️ Unsupported file type:", ext);
//           index++;
//           next();
//         }
//       },
//       function (err) {
//         console.error("❌ Failed to resolve file:", fileName, err.message);
//         index++;
//         next();
//       },
//       "r"
//     );
//   }

//   next();
// }

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
