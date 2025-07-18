// Tizen Ad Loop Player - Handles large video downloads & async loading

const fileDir = "downloads/subDir";
let localAds = []; // Tracks local ad filenames
let adsFromServer = []; // Tracks ads from MQTT
let adLoopTimeouts = []; // 🔁 To track all timeouts
let currentVideo = null; // 🔇 To track currently playing video
let lastAdSignature = ""; // For checking ad updates

// ✅ Ensure directory exists
tizen.filesystem.createDirectory(
  fileDir,
  (dir) => console.log("📁 Directory created:", dir),
  (err) => console.error("❌ Directory creation error:", err.message)
);

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
  localAds = filenames;

  try {
    await cleanUpOldAds(filenames);
    console.log("🧹 Cleanup done!");

    // Download all files first (sequential or parallel)
    for (let i = 0; i < filenames.length; i++) {
      await checkAndDownloadContent(ads[i].url, filenames[i]);
    }
    console.log("✅ All downloads complete, starting playback");

    playAllContentInLoop(filenames, ads, rcs);
    document.getElementById("ad_player").innerHTML = ""; // Clear previous content
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
          resolve();
        } catch (e) {
          console.log("⬇️ Downloading:", fileName);
          const request = new tizen.DownloadRequest(url, fileDir, fileName);
          const downloadId = tizen.download.start(request);

          tizen.download.setListener(downloadId, {
            onprogress: (id, received, total) =>
              console.log(`⬇️ ${fileName}: ${received}/${total}`),
            onpaused: (id) => console.log("⏸️ Paused:", id),
            oncanceled: (id) => resolve(),
            oncompleted: (id, path) => {
              console.log("✅ Completed:", path);
              resolve();
            },
            onfailed: (id, error) => {
              console.warn("❌ Failed to download:", fileName);
              resolve();
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
        resolve();
      },
      (err) => {
        console.error("❌ Delete failed:", name, err.message);
        reject(err);
      }
    );
  });
}

// async function playAllContentInLoop(filenames, ads, rcs) {
//   const container = document.getElementById("ad_player");
//   if (!container) {
//     console.error("❌ 'ad_player' container not found");
//     return;
//   }

//   console.log("🎬 Starting playback loop...", filenames);
//   adLoopTimeouts.forEach(clearTimeout);
//   adLoopTimeouts.length = 0;

//   if (currentVideo) {
//     try {
//       currentVideo.pause();
//       currentVideo.src = "";
//       currentVideo.load();
//       currentVideo.remove();
//     } catch (e) {
//       console.warn("⚠️ Error cleaning video:", e.message);
//     }
//     currentVideo = null;
//   }

//   container.innerHTML = "";
//   let index = 0;

//   const getMediaType = (filename) => {
//     const ext = filename.split(".").pop().toLowerCase();
//     if (["jpg", "jpeg", "png", "gif"].includes(ext)) return "image";
//     if (["mp4", "webm", "mov"].includes(ext)) return "video";
//     return null;
//   };

//   const resolveFile = (fileName) =>
//     new Promise((resolve, reject) => {
//       tizen.filesystem.resolve(
//         `${fileDir}/${fileName}`,
//         (file) => resolve(file.toURI()),
//         reject,
//         "r"
//       );
//     });

//   async function preloadAndShow(currentIndex) {
//     console.log("🔄 Preloading ad at index:", currentIndex);
//     if (currentIndex >= filenames.length) currentIndex = 0;

//     const currentFile = filenames[currentIndex];
//     const type = getMediaType(currentFile);
//     if (!type) {
//       console.warn("⛔ Unsupported format:", currentFile);
//       preloadAndShow(currentIndex + 1);
//       return;
//     }

//     try {
//       const uri = await resolveFile(currentFile);
//       if (!uri) {
//         console.warn("📛 Skipped (not resolved):", currentFile);
//         preloadAndShow(currentIndex + 1);
//         return;
//       }

//       const wrapper = document.createElement("div");
//       wrapper.className = "media-slide";
//       wrapper.style.cssText = `opacity:0;transition:opacity 1s ease-in-out;position:absolute;top:0;left:0;width:100vw;height:100vh;z-index:1;`;

//       if (type === "image") {
//         const img = new Image();
//         img.src = uri;
//         img.className = "ad_image";

//         wrapper.appendChild(img);
//         container.appendChild(wrapper);

//         requestAnimationFrame(() => (wrapper.style.opacity = 1));
//         if (filenames.length > 1) {
//           console.log("📸 Single image ad, no loop needed");
//           const timeout = setTimeout(() => {
//             fadeOutAndRemove(wrapper);
//             preloadAndShow(currentIndex + 1);
//           }, 10000);
//           adLoopTimeouts.push(timeout);
//         }
//       } else if (type === "video") {
//         const video = document.createElement("video");
//         video.src = uri;
//         video.preload = "auto";
//         video.load();
//         video.autoplay = false;
//         video.muted = false;
//         video.volume = 1.0;
//         video.controls = false;
//         video.style.cssText = "width:100vw;height:95vh;object-fit:fill;";
//         wrapper.appendChild(video);
//         container.appendChild(wrapper);

//         currentVideo = video;

//         requestAnimationFrame(() => {
//           wrapper.style.opacity = 1;
//           setTimeout(() => {
//             video.play().catch((err) => {
//               console.warn("▶️ Video play failed:", err.message);
//               fadeOutAndRemove(wrapper);
//               preloadAndShow(currentIndex + 1);
//             });
//           }, 300);
//         });

//         video.onended = () => {
//           fadeOutAndRemove(wrapper);
//           preloadAndShow(currentIndex + 1);
//         };
//       }
//     } catch (error) {
//       console.error("❌ Error loading:", error.message);
//       preloadAndShow(currentIndex + 1);
//     }
//   }

//   function fadeOutAndRemove(el) {
//     el.style.opacity = 0;
//     const timeout = setTimeout(() => {
//       if (el && el.parentNode === container) {
//         container.removeChild(el);
//       }
//     }, 1000);
//     adLoopTimeouts.push(timeout);
//   }

//   preloadAndShow(index);
// }

// let currentAbortController = null;

// async function playAllContentInLoop(filenames, ads, rcs) {
//   // Abort previous playback
//   if (currentAbortController) {
//     currentAbortController.abort();
//     currentAbortController = null;
//   }

//   // Create new abort signal
//   const abortController = new AbortController();
//   const signal = abortController.signal;
//   currentAbortController = abortController;

//   const container = document.getElementById("ad_player");
//   const fileDir = "downloads/subDir";
//   let adLoopTimeouts = [];
//   let currentVideo = null;

//   if (!container) {
//     console.error("❌ 'ad_player' container not found");
//     return;
//   }

//   console.log("🎬 Starting playback loop...", filenames);

//   adLoopTimeouts.forEach(clearTimeout);
//   adLoopTimeouts = [];

//   if (currentVideo) {
//     try {
//       currentVideo.pause();
//       currentVideo.src = "";
//       currentVideo.load();
//       currentVideo.onended = null;
//       currentVideo.onerror = null;
//       currentVideo.remove();
//     } catch (e) {
//       console.warn("⚠️ Error cleaning video:", e.message);
//     }
//     currentVideo = null;
//   }

//   [...container.querySelectorAll(".media-slide")].forEach((el) =>
//     container.removeChild(el)
//   );

//   const getMediaType = (filename) => {
//     const ext = filename.split(".").pop().toLowerCase();
//     if (["jpg", "jpeg", "png", "gif"].includes(ext)) return "image";
//     if (["mp4", "webm", "mov"].includes(ext)) return "video";
//     return null;
//   };

//   const resolveFile = (fileName) =>
//     new Promise((resolve, reject) => {
//       tizen.filesystem.resolve(
//         `${fileDir}/${fileName}`,
//         (file) => resolve(file.toURI()),
//         (err) => reject(new Error("File resolve failed: " + fileName)),
//         "r"
//       );
//     });

//   const fadeOutAndRemove = (el) => {
//     el.style.opacity = 0;
//     const timeout = setTimeout(() => {
//       if (el && el.parentNode === container) {
//         container.removeChild(el);
//       }
//     }, 1000);
//     adLoopTimeouts.push(timeout);
//   };

//   async function preloadAndShow(currentIndex, retryCount = 0) {
//     if (signal.aborted) {
//       console.log("⏹️ Playback aborted");
//       return;
//     }

//     if (currentIndex >= filenames.length) currentIndex = 0;
//     const currentFile = filenames[currentIndex];
//     const type = getMediaType(currentFile);

//     console.log("🔄 Preloading ad at index:", currentIndex, "-", currentFile);

//     if (!type) {
//       console.warn("⛔ Unsupported format:", currentFile);
//       if (retryCount >= filenames.length) {
//         console.error("🛑 No supported files to display.");
//         return;
//       }
//       return await preloadAndShow(currentIndex + 1, retryCount + 1);
//     }

//     try {
//       const uri = await resolveFile(currentFile);
//       if (!uri) {
//         console.warn("📛 Skipped (not resolved):", currentFile);
//         return await preloadAndShow(currentIndex + 1, retryCount + 1);
//       }

//       const wrapper = document.createElement("div");
//       wrapper.className = "media-slide";
//       wrapper.style.cssText = `
//         opacity: 0;
//         transition: opacity 1s ease-in-out;
//         position: absolute;
//         top: 0;
//         left: 0;
//         width: 100vw;
//         height: 100vh;
//         z-index: 1;
//       `;

//       if (type === "image") {
//         const img = new Image();
//         img.onload = () => {
//           if (signal.aborted) return;
//           wrapper.appendChild(img);
//           container.appendChild(wrapper);
//           requestAnimationFrame(() => (wrapper.style.opacity = 1));

//           if (filenames.length > 1) {
//             const timeout = setTimeout(() => {
//               if (signal.aborted) return;
//               fadeOutAndRemove(wrapper);
//               preloadAndShow(currentIndex + 1);
//             }, 10000);
//             adLoopTimeouts.push(timeout);
//           }
//         };
//         img.onerror = () => {
//           console.warn("❌ Failed to load image:", currentFile);
//           preloadAndShow(currentIndex + 1, retryCount + 1);
//         };
//         img.className = "ad_image";
//         img.src = uri;
//       } else if (type === "video") {
//         const video = document.createElement("video");
//         video.src = uri;
//         video.preload = "auto";
//         video.load();
//         video.autoplay = false;
//         video.muted = false;
//         video.volume = 1.0;
//         video.controls = false;
//         video.style.cssText = "width:100vw;height:95vh;object-fit:fill;";
//         wrapper.appendChild(video);
//         container.appendChild(wrapper);

//         currentVideo = video;

//         requestAnimationFrame(() => {
//           if (signal.aborted) return;
//           wrapper.style.opacity = 1;
//           setTimeout(() => {
//             if (signal.aborted) return;
//             video.play().catch((err) => {
//               console.warn("▶️ Video play failed:", err.message);
//               fadeOutAndRemove(wrapper);
//               preloadAndShow(currentIndex + 1, retryCount + 1);
//             });
//           }, 300);
//         });

//         video.onended = () => {
//           if (signal.aborted) return;
//           fadeOutAndRemove(wrapper);
//           preloadAndShow(currentIndex + 1);
//         };

//         video.onerror = () => {
//           if (signal.aborted) return;
//           console.warn("🎥 Video error:", currentFile);
//           fadeOutAndRemove(wrapper);
//           preloadAndShow(currentIndex + 1, retryCount + 1);
//         };
//       }
//     } catch (error) {
//       if (signal.aborted) return;
//       console.error("❌ Error loading:", error.message);
//       return await preloadAndShow(currentIndex + 1, retryCount + 1);
//     }
//   }

//   preloadAndShow(0);
// }

let currentAbortController = null;

async function playAllContentInLoop(filenames, ads, rcs) {
  // Abort previous execution
  if (currentAbortController) {
    console.log("🛑 Aborting previous playback loop...");
    currentAbortController.abort();
  }

  currentAbortController = new AbortController();
  const signal = currentAbortController.signal;

  const container = document.getElementById("ad_player");
  const fileDir = "downloads/subDir";
  let adLoopTimeouts = [];
  let currentVideo = null;

  if (!container) {
    console.error("❌ 'ad_player' container not found");
    return;
  }

  console.log("🧹 Cleaning previous timeouts and DOM...");
  adLoopTimeouts.forEach(clearTimeout);
  adLoopTimeouts = [];

  if (currentVideo) {
    try {
      currentVideo.pause();
      currentVideo.src = "";
      currentVideo.load();
      currentVideo.onended = null;
      currentVideo.onerror = null;
      currentVideo.remove();
      console.log("🎥 Previous video cleaned up");
    } catch (e) {
      console.warn("⚠️ Error cleaning video:", e.message);
    }
    currentVideo = null;
  }

  [...container.querySelectorAll(".media-slide")].forEach((el) => {
    container.removeChild(el);
  });

  const getMediaType = (filename) => {
    const ext = filename.split(".").pop().toLowerCase();
    if (["jpg", "jpeg", "png", "gif"].includes(ext)) return "image";
    if (["mp4", "webm", "mov"].includes(ext)) return "video";
    return null;
  };

  const resolveFile = (fileName) =>
    new Promise((resolve, reject) => {
      tizen.filesystem.resolve(
        `${fileDir}/${fileName}`,
        (file) => {
          console.log("📁 Resolved file:", fileName);
          resolve(file.toURI());
        },
        (err) => {
          console.warn("❌ Failed to resolve file:", fileName);
          resolve(null); // Skip on fail
        },
        "r"
      );
    });

  const fadeOutAndRemove = (el) => {
    console.log("🌫️ Fading out current media...");
    el.style.opacity = 0;
    const timeout = setTimeout(() => {
      if (el && el.parentNode === container) {
        container.removeChild(el);
        console.log("🗑️ Removed element from DOM");
      }
    }, 1000);
    adLoopTimeouts.push(timeout);
  };

  let index = 0;

  console.log("▶️ Starting ad playback loop...");

  while (!signal.aborted) {
    if (index >= filenames.length) index = 0;
    const currentFile = filenames[index];
    const type = getMediaType(currentFile);

    console.log(
      `📦 Processing file [${index}]: ${currentFile} (type: ${type})`
    );

    if (!type) {
      console.warn("⛔ Unsupported format, skipping:", currentFile);
      index++;
      continue;
    }

    const uri = await resolveFile(currentFile);
    if (signal.aborted) break;

    if (!uri) {
      console.warn("🚫 Could not resolve URI, skipping:", currentFile);
      index++;
      continue;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "media-slide";
    wrapper.style.cssText = `
      opacity: 0;
      transition: opacity 1s ease-in-out;
      position: absolute;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 1;
    `;

    if (type === "image") {
      const img = new Image();
      img.onload = () => {
        if (signal.aborted) return;
        console.log("🖼️ Image loaded:", currentFile);

        wrapper.appendChild(img);
        container.appendChild(wrapper);
        requestAnimationFrame(() => (wrapper.style.opacity = 1));

        const timeout = setTimeout(() => {
          if (!signal.aborted) {
            console.log("⏱️ Image display complete. Moving to next...");
            fadeOutAndRemove(wrapper);
          }
        }, 10000); // 10s per image

        adLoopTimeouts.push(timeout);
      };
      img.onerror = () => {
        console.warn("🧨 Image load error:", currentFile);
      };
      img.className = "ad_image";
      img.src = uri;

      await new Promise((resolve) => setTimeout(resolve, 10000));
    } else if (type === "video") {
      console.log("🎥 Preparing video:", currentFile);
      const video = document.createElement("video");
      video.src = uri;
      video.preload = "auto";
      video.load();
      video.autoplay = false;
      video.muted = false;
      video.volume = 1.0;
      video.controls = false;
      video.style.cssText = "width:100vw;height:95vh;object-fit:fill;";
      wrapper.appendChild(video);
      container.appendChild(wrapper);

      currentVideo = video;

      requestAnimationFrame(() => {
        if (signal.aborted) return;
        wrapper.style.opacity = 1;
        setTimeout(() => {
          if (signal.aborted) return;
          video
            .play()
            .then(() => {
              console.log("▶️ Video started:", currentFile);
            })
            .catch((err) => {
              console.warn("⛔ Video play failed:", err.message);
              fadeOutAndRemove(wrapper);
            });
        }, 300);
      });

      await new Promise((resolve) => {
        const onDone = () => {
          video.onended = null;
          video.onerror = null;
          if (!signal.aborted) {
            fadeOutAndRemove(wrapper);
            console.log("🏁 Video ended:", currentFile);
          }
          resolve();
        };
        video.onended = onDone;
        video.onerror = () => {
          console.warn("💥 Video error:", currentFile);
          onDone();
        };

        if (signal.aborted) {
          console.log("🛑 Playback aborted during video");
          onDone();
        }
      });
    }

    index++;
  }

  console.log("🛑 Playback loop terminated.");
}

window.addEventListener("unload", () => {
  if (currentVideo) {
    currentVideo.pause();
    currentVideo.src = "";
    currentVideo.load();
    currentVideo.remove();
  }
  adLoopTimeouts.forEach(clearTimeout);
});
