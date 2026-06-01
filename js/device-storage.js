/**
 * Tizen Multi-Zone Digital Signage Player
 * Supports independent zones, PoP tracking, M3U8 live retries, and Tizen-specific quirks.
 */

const fileDir = "downloads/subDir";
let activeZones = {};
let globalDownloads = new Set();

const YOUTUBE_CONFIG = {
  embedBaseUrl: "https://www.youtube.com/embed/",
  autoplay: 1,
  mute: 1,
  controls: 0,
  showinfo: 0,
  rel: 0,
  modestbranding: 1,
  iv_load_policy: 3,
};

// ==========================================
// 1. INITIALIZATION & FILESYSTEM
let sources = "";
tizen.filesystem.createDirectory(
  fileDir,
  (dir) => console.log("📁 Directory created:", dir),
  (err) => console.log("📁 Directory exists or error:", err.message),
);

tizen.filesystem.resolve(
  fileDir,
  (file) => {
    sources = file.toURI();
  },
  (err) => {
    console.warn("❌ Failed to resolve file:", fileDir);
  },
  "r",
);

// ⭐ FEATURE 2: Tizen Screen Rotation
function getRotationValue() {
  const orientationType = screen.orientation.type;
  switch (orientationType) {
    case "portrait-primary":
      return "PLAYER_DISPLAY_ROTATION_90";
    case "portrait-secondary":
      return "PLAYER_DISPLAY_ROTATION_180";
    case "landscape-primary":
      return "PLAYER_DISPLAY_ROTATION_NONE";
    case "landscape-secondary":
      return "PLAYER_DISPLAY_ROTATION_270";
    default:
      return "PLAYER_DISPLAY_ROTATION_NONE";
  }
}


// ==========================================
// 2. ZONE CONTROLLER CLASS
// ==========================================
class ZoneController {
  constructor(zoneConfig) {
    this.zoneId = zoneConfig.zone_id;
    this.rect = zoneConfig.rect;
    this.type = zoneConfig.type;
    this.zIndex = zoneConfig.z_index || 10;
    this.border_radius = zoneConfig.border_radius

    this.ads = zoneConfig.ads || [];
    this.carousels = zoneConfig.carousels || [];
    this.liveContents = zoneConfig.liveContents || [];

    this.iterator = 0;
    this.currentPlaybackMode = "normal";
    this.activeLiveContent = null;
    this.abortController = null;
    this.liveMonitorInterval = null;
    this.timeoutBox = null;
    this.widgetInterval = null; // Tracks ticking clocks
    this.m3u8RetryTimeouts = [];
    this.carouselState = {};

    this.websiteRefreshInterval = null;

    this.p1 = null;
    this.p2 = null;
    this.stg = null;
    this.useP1Next = true;

    this.initZoneDOM();
    if (this.type === "video_primary" || this.type === "video") {
      this.initVideoPlayers();
    }
  }

  initZoneDOM() {
    this.container = document.createElement("div");
    this.container.id = `zone_${this.zoneId}`;
    this.container.style.cssText = `position:absolute; left:${this.rect.x}px; transform: translateZ(0); border-radius:${this.border_radius}px; overflow:hidden; top:${this.rect.y}px; width:${this.rect.w}px; height:${this.rect.h}px; overflow:hidden; background-color:transparent; z-index:${this.zIndex};`;

    const playerCss = `position:absolute; top:0; left:0; width:100%; height:100%; display:none; z-index:15;`;

    this.p1Element = document.createElement("object");
    this.p1Element.type = "application/avplayer";
    this.p1Element.id = `av-player-1-${this.zoneId}`;
    this.p1Element.style.cssText = playerCss;

    this.p2Element = document.createElement("object");
    this.p2Element.type = "application/avplayer";
    this.p2Element.id = `av-player-2-${this.zoneId}`;
    this.p2Element.style.cssText = playerCss;

    this.stgElement = document.createElement("object");
    this.stgElement.type = "application/avplayer";
    this.stgElement.id = `hls-player-${this.zoneId}`;
    this.stgElement.style.cssText = playerCss;

    this.img1 = document.createElement("img");
    this.img2 = document.createElement("img");
    const imgCss = `position:absolute; top:0; left:0; width:100%; height:100%; display:none; object-fit:fit; z-index:20; background-color:black;`;
    this.img1.style.cssText = imgCss;
    this.img2.style.cssText = imgCss;
    this.useImage1 = true;

    this.iframeContainer = document.createElement("div");
    this.iframeContainer.style.cssText = `position:absolute; top:0; left:0; width:100%; height:100%; display:none; z-index:30; background-color:black;`;

    // ⭐ NEW: Native Widget Container
    this.widgetContainer = document.createElement("div");
    this.widgetContainer.style.cssText = `position:absolute; top:0; left:0; width:100%; height:100%; display:none; z-index:25; background-color:transparent; overflow:hidden;`;

    this.container.appendChild(this.p1Element);
    this.container.appendChild(this.p2Element);
    this.container.appendChild(this.stgElement);
    this.container.appendChild(this.img1);
    this.container.appendChild(this.img2);
    this.container.appendChild(this.iframeContainer);
    this.container.appendChild(this.widgetContainer);

    document.getElementById("ad_player")?.appendChild(this.container) ||
      document.body.appendChild(this.container);
  }

  initVideoPlayers() {
    try {
      this.p1 = webapis.avplaystore.getPlayer(this.p1Element.id);
      this.p2 = webapis.avplaystore.getPlayer(this.p2Element.id);
      this.stg = webapis.avplaystore.getPlayer(this.stgElement.id);
    } catch (e) {
      console.error(`❌ AVPlay error in zone ${this.zoneId}`, e);
    }
  }

  getAdjustedVideoHeight() {
    return localStorage.getItem("rcs_enabled") == "true"
      ? this.rect.h
      : this.rect.h;
  }

  async startPlayback() {
    const activeLive = this.checkActiveLiveContent();
    if (activeLive) {
      await this.handleLiveContentMode(activeLive);
    } else {
      const queue = this.buildPlaybackQueue();
      if (queue.length > 0) this.playLoop(queue);
    }
    this.startLiveContentMonitor();
  }

  buildPlaybackQueue() {
    const carouselItems = this.carousels
      .map((c) => this.getNextCarouselItem(c))
      .filter(Boolean);
    return [...this.ads, ...carouselItems];
  }


//  async playLoop(queue) {
//     if (this.abortController) this.abortController.abort();
//     this.abortController = new AbortController();
//     const signal = this.abortController.signal;
//     this.currentPlaybackMode = "normal";

//     while (!signal.aborted) {
//       if (this.iterator !== 0 && this.iterator % queue.length === 0) {
//         queue = this.buildPlaybackQueue();
//       }

//       if (queue.length === 0) {
//         await new Promise((r) => setTimeout(r, 5000));
//         continue;
//       }

//       const item = queue[this.iterator % queue.length];
      
//       // ⭐ CRITICAL FIX: Check if this is the ONLY item assigned to the zone
//       const isSingleItem = queue.length === 1;

//       if (shouldPlayContent(item)) {
//         const type = detectContentType(item);
//         const fileName = getFileName(item);

//         if (type === "video" && this.type === "image_only") {
//           await new Promise((r) => setTimeout(r, 1000));
//         } else {
//           try {
//             // ⭐ Pass the isSingleItem flag down to the players!
//             if (type === "widget") await this.playWidget(signal, item, isSingleItem);
//             else if (type === "video") await this.playVideo(fileName, signal, item);
//             else await this.playImage(fileName, signal, item, isSingleItem);
//           } catch (e) {
//             await new Promise((r) => setTimeout(r, 1000));
//           }
//         }
//       } else {
//         await new Promise((r) => setTimeout(r, 1000));
//       }
//       this.iterator++;
//     }
//   }



async playLoop(queue) {
    if (this.abortController) this.abortController.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    this.currentPlaybackMode = "normal";

    while (!signal.aborted) {
      // ⭐ CRITICAL FIX: If we reach the end of the queue (or if the queue only has 1 item and we just played it), REBUILD the queue so carousels can advance!
      if (this.iterator > 0 && (this.iterator % queue.length === 0 || queue.length === 1)) {
        queue = this.buildPlaybackQueue();
      }

      if (queue.length === 0) {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }

      const item = queue[this.iterator % queue.length];
      
      // ⭐ FIX: Determine if the CURRENT queue has only one item. 
      // If it's a carousel, we DO want it to cycle, so we trick it into thinking it's not a single item if there's a carousel present.
      const isSingleItem = queue.length === 1 && this.carousels.length === 0;

      if (shouldPlayContent(item)) {
        const type = detectContentType(item);
        const fileName = getFileName(item);

        if (type === "video" && this.type === "image_only") {
          await new Promise((r) => setTimeout(r, 1000));
        } else {
          try {
            if (type === "widget") await this.playWidget(signal, item, isSingleItem);
            else if (type === "video") await this.playVideo(fileName, signal, item);
            else await this.playImage(fileName, signal, item, isSingleItem);
          } catch (e) {
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      } else {
        await new Promise((r) => setTimeout(r, 1000));
      }
      this.iterator++;
    }
  }

  // ==========================================
  // ⭐ NATIVE WIDGET ENGINE
  // ==========================================
  playWidget(signal, item, isSingleItem = false) {
    return new Promise((resolve) => {
      let trackingId = null;
      if (window.proofOfPlayTracker && item) {
        trackingId = window.proofOfPlayTracker.startTracking(item, "widget");
        window.proofOfPlayTracker.addPlaybackEvent(trackingId, "WIDGET_DISPLAY_STARTED", { zone: this.zoneId });
      }

      // Cleanup Environment
      if (this.timeoutBox) clearTimeout(this.timeoutBox);
      if (this.widgetInterval) clearInterval(this.widgetInterval);
      
      if (this.p1Element) this.p1Element.style.display = "none";
      if (this.p2Element) this.p2Element.style.display = "none";
      try {
        if (this.p1 && this.p1.getState() !== "IDLE" && this.p1.getState() !== "NONE") this.p1.stop();
        if (this.p2 && this.p2.getState() !== "IDLE" && this.p2.getState() !== "NONE") this.p2.stop();
      } catch(e){}
      this.img1.style.display = "none";
      this.img2.style.display = "none";

      const config = item.config || {};
      
      // BULLETPROOF ASPECT RATIO CALCULATION
      let widgetW = this.rect.w;
      let widgetH = this.rect.h;

      const isTicker = item.widget_type === "sliding_text" || item.widget_type === "ticker";

      // Ignore aspect ratios for Tickers so they always span the full zone width!
      if (item.aspect_ratio && !isTicker) {
          const parts = item.aspect_ratio.split(':');
          if (parts.length === 2) {
              const targetRatio = parseFloat(parts[0]) / parseFloat(parts[1]);
              const zoneRatio = widgetW / widgetH;

              if (zoneRatio > targetRatio) {
                  widgetH = this.rect.h;
                  widgetW = Math.round(widgetH * targetRatio);
              } else {
                  widgetW = this.rect.w;
                  widgetH = Math.round(widgetW / targetRatio);
              }
          }
      }

      // Outer container
      this.widgetContainer.style.backgroundColor = config.background || "transparent";
      this.widgetContainer.style.display = "flex";
      this.widgetContainer.style.justifyContent = "center";
      this.widgetContainer.style.alignItems = "center";
      this.widgetContainer.innerHTML = ""; 

      const innerWrapper = `<div style="position:relative; width:${widgetW}px; height:${widgetH}px; display:flex; justify-content:center; align-items:center; overflow:hidden;">`;
      const closeWrapper = `</div>`;

      let widgetHTML = "";

      console.log("widget_type .........",item.widget_type)

      // 1. DIGITAL CLOCK
      if (item.widget_type === "clock_digital") {
          const tz = config.timezone || "Asia/Kolkata"; 
          const use12h = config.format === "12h";
          
          widgetHTML = `${innerWrapper}<div id="clock_${this.zoneId}" style="width:100%; color:${config.color || '#ffffff'}; font-size:${config.fontSize || '32px'}; font-weight:bold; font-family:sans-serif; text-align:center;"></div>${closeWrapper}`;
          
          const updateClock = () => {
              const el = document.getElementById(`clock_${this.zoneId}`);
              if (el) el.innerText = new Date().toLocaleTimeString('en-US', { timeZone: tz, hour12: use12h });
          };
          setTimeout(updateClock, 0); 
          this.widgetInterval = setInterval(updateClock, 1000);
      } 
      
      // 2. ANALOG CLOCK
      else if (item.widget_type === "clock_analog") {
          const tz = config.timezone || "Asia/Kolkata";
          const c = config.color || '#ffffff';
          
          widgetHTML = `
            ${innerWrapper}
                <div style="position:relative; width:100%; height:100%; border-radius:50%; border:4px solid ${c}; box-sizing:border-box;">
                   <div style="position:absolute; top:50%; left:50%; width:12px; height:12px; background:${c}; border-radius:50%; transform:translate(-50%, -50%); z-index:4;"></div>
                   <div id="hr_${this.zoneId}" style="position:absolute; top:50%; left:50%; width:6px; height:25%; background:${c}; transform-origin:bottom center; transform: translate(-50%, -100%) rotate(0deg); z-index:2; border-radius:4px;"></div>
                   <div id="mn_${this.zoneId}" style="position:absolute; top:50%; left:50%; width:4px; height:38%; background:${c}; transform-origin:bottom center; transform: translate(-50%, -100%) rotate(0deg); z-index:1; border-radius:4px;"></div>
                   <div id="sc_${this.zoneId}" style="position:absolute; top:50%; left:50%; width:2px; height:42%; background:#ff3b30; transform-origin:bottom center; transform: translate(-50%, -100%) rotate(0deg); z-index:3;"></div>
                </div>
            ${closeWrapper}`;
            
          const updateAnalogClock = () => {
              const now = new Date(new Date().toLocaleString("en-US", {timeZone: tz}));
              const sec = now.getSeconds();
              const min = now.getMinutes();
              const hr = now.getHours();
              
              const hrEl = document.getElementById(`hr_${this.zoneId}`);
              const mnEl = document.getElementById(`mn_${this.zoneId}`);
              const scEl = document.getElementById(`sc_${this.zoneId}`);
              
              if (scEl) scEl.style.transform = `translate(-50%, -100%) rotate(${sec * 6}deg)`;
              if (mnEl) mnEl.style.transform = `translate(-50%, -100%) rotate(${(min * 6) + (sec * 0.1)}deg)`;
              if (hrEl) hrEl.style.transform = `translate(-50%, -100%) rotate(${(hr * 30) + (min * 0.5)}deg)`;
          };
          setTimeout(updateAnalogClock, 0);
          this.widgetInterval = setInterval(updateAnalogClock, 1000);
      }

      // 3. CALENDAR
      else if (item.widget_type === "calendar") {
          const tz = config.timezone || "Asia/Kolkata";
          const optsDay = tz ? { timeZone: tz, weekday: 'long' } : { weekday: 'long' };
          const optsMonth = tz ? { timeZone: tz, month: 'long' } : { month: 'long' };
          
          // ⭐ CRITICAL FIX: Calculate absolute pixels to fill ~95% of the zone dynamically
          // Use Math.min to guarantee it never overflows horizontally if the zone is tall and skinny
          let calBase = Math.min(widgetW, widgetH) * 0.95; 
          let mainFontSize = Math.floor(calBase * 0.45) + "px"; // Massive font for the day number
          let subFontSize = Math.floor(calBase * 0.15) + "px";  // Smaller font for Month/Year/Day
          
          widgetHTML = `${innerWrapper}<div id="cal_${this.zoneId}" style="display:flex; flex-direction:column; justify-content:center; align-items:center; width:100%; height:100%; color:${config.color || '#ffffff'}; font-family:sans-serif; text-align:center; font-weight:bold;"></div>${closeWrapper}`;
          
          const updateCalendar = () => {
              const el = document.getElementById(`cal_${this.zoneId}`);
              if (el) {
                  const now = new Date();
                  const dayName = now.toLocaleDateString('en-US', optsDay);
                  const monthName = now.toLocaleDateString('en-US', optsMonth);
                  const dateNum = tz ? new Intl.DateTimeFormat('en-US', { timeZone: tz, day: 'numeric' }).format(now) : now.getDate();
                  const year = tz ? new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric' }).format(now) : now.getFullYear();

                  el.innerHTML = `
                      <div style="font-size:${subFontSize}; text-transform:uppercase; letter-spacing:2px; opacity:0.8; line-height:1.2;">${monthName} ${year}</div>
                      <div style="font-size:${mainFontSize}; line-height:1.1;">${dateNum}</div>
                      <div style="font-size:${subFontSize}; font-weight:300; line-height:1.2;">${dayName}</div>
                  `;
              }
          };
          setTimeout(updateCalendar, 0);
          this.widgetInterval = setInterval(updateCalendar, 60000); 
      }

    else if (item.widget_type === "countdown_timer") {
          console.log("l...... Timeer............")

          const endTime = config.endTime ? new Date(config.endTime).getTime() : new Date().getTime() + 86400000;
          const format = config.format || "hh:mm:ss";
          const runningText = config.runningText || "";
          const endedText = config.endedText || "Ended";
          const c = config.color || "#ffffff";
          
          // Adjust max allowed size since we are stacking two lines of text now
          let requestedSize = config.fontSize ? parseFloat(config.fontSize.toString().replace(/[^0-9.]/g, '')) : 32;
          let maxAllowedSize = widgetH * 0.6; // Reduced to 60% of zone height to safely fit two lines
          let timeFontSize = Math.min(requestedSize, maxAllowedSize);
          let textFontSize = Math.max(12, timeFontSize * 0.4); // Top text is 40% of the time size

          // Use Flexbox column to center everything perfectly
          widgetHTML = `
            ${innerWrapper}
            <div id="cd_${this.zoneId}" style="width:100%; height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; color:${c}; font-family:sans-serif; text-align:center;">
            </div>
            ${closeWrapper}
          `;
          
          const updateCountdown = () => {
              const el = document.getElementById(`cd_${this.zoneId}`);
              if (!el) return;
              
              const now = new Date().getTime();
              const diff = Math.max(0, endTime - now);
              
              // Handle Ended State
              if (diff <= 0) {
                  el.innerHTML = `<div style="font-size:${timeFontSize}px; font-weight:900; text-transform:uppercase;">${endedText}</div>`;
                  return;
              }
              
              const d = Math.floor(diff / (1000 * 60 * 60 * 24));
              const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
              const m = Math.floor((diff / 1000 / 60) % 60);
              const s = Math.floor((diff / 1000) % 60);
              const pad = (n) => n.toString().padStart(2, '0');
              
              let timeStr = "";
              if (format === "dd:hh:mm:ss") timeStr = `${pad(d)}:${pad(h)}:${pad(m)}:${pad(s)}`;
              else if (format === "hh:mm:ss") timeStr = `${pad(d * 24 + h)}:${pad(m)}:${pad(s)}`; // Rolls days into hours
              else if (format === "mm:ss") timeStr = `${pad(d * 24 * 60 + h * 60 + m)}:${pad(s)}`; // Rolls hours into mins
              else timeStr = `${pad(h)}:${pad(m)}:${pad(s)}`; // Safe fallback
              
              // Build the stacked HTML with different styling for top and bottom
              let contentHtml = "";
              
              if (runningText) {
                  // Top text: smaller, uppercase, slightly faded, with a little bottom margin
                  contentHtml += `<div style="font-size:${textFontSize}px; opacity:0.8; text-transform:uppercase; letter-spacing:2px; margin-bottom:4px; font-weight:600;">${runningText}</div>`;
              }
              
              // Bottom text (Time): massive, bold, tabular-nums prevents wiggling
              contentHtml += `<div style="font-size:${timeFontSize}px; font-weight:900; line-height:1.1; font-variant-numeric:tabular-nums;">${timeStr}</div>`;
              
              el.innerHTML = contentHtml;
          };
          
          setTimeout(updateCountdown, 0);
          this.widgetInterval = setInterval(updateCountdown, 1000);
      }

      // 4. LOGO
      else if (item.widget_type === "logo") {
          const fit = config.fit || "contain";
          const localImgSrc = sources + "/" + getFileName(item);
          const fallbackUrl = config.url || item.url;
          
          widgetHTML = `
              ${innerWrapper}
                  <img src="${localImgSrc}" style="width:100%; height:100%; object-fit:${fit};" onerror="this.onerror=null; this.src='${fallbackUrl}';">
              ${closeWrapper}`;
      } 
      
      // 5. EMOJI
      else if (item.widget_type === "emoji") {
          widgetHTML = `
              ${innerWrapper}
                  <div style="font-size:${config.size || 48}px; text-align:center; line-height:1;">
                      ${config.emoji || '👋'}
                  </div>
              ${closeWrapper}`;
      }

      // ==========================================
      // ⭐ 8. HEADING WIDGET (NEW)
      // ==========================================
      else if (item.widget_type === "heading" || item.widget_type === "heading_v1") {
          const text = config.text || "";
          const color = config.color || "#ffffff";
          const fontSize = config.fontSize || "32px";
          const textAlign = config.textAlign || "center";
          const background = config.background || "transparent";
          const fontWeight = config.fontWeight || "bold";
          const maxLines = config.maxLines || 1;
          const overflowMode = config.overflow || "wrap";

          // Handle advanced text wrapping and overflow logic natively
          let overflowStyles = "";
          if (overflowMode === "ellipsis") {
              overflowStyles = `
                  display: -webkit-box; 
                  -webkit-line-clamp: ${maxLines}; 
                  -webkit-box-orient: vertical; 
                  overflow: hidden; 
                  text-overflow: ellipsis; 
                  white-space: normal;
              `;
          } else if (overflowMode === "hidden") {
              overflowStyles = `
                  overflow: hidden; 
                  white-space: nowrap;
              `;
          } else {
              // Default: wrap
              overflowStyles = `
                  white-space: normal; 
                  word-wrap: break-word;
              `;
          }

          // Build the final HTML with a flex container to center the text block vertically if needed
          widgetHTML = `
              ${innerWrapper}
                  <div style="width: 100%; height: 100%; background: ${background}; display: flex; flex-direction: column; justify-content: center; padding: 10px; box-sizing: border-box;">
                      <div style="color: ${color}; font-size: ${fontSize}; font-weight: ${fontWeight}; text-align: ${textAlign}; ${overflowStyles}">
                          ${text}
                      </div>
                  </div>
              ${closeWrapper}`;
      }

      // 6. SEAMLESS CONTINUOUS SCROLLING TEXT (TICKER)
      else if (isTicker) {
          const direction = config.direction === 'right' ? 'right' : 'left';
          const animName = `scroll_${this.zoneId}_${Date.now()}`;
          
          let requestedSize = config.fontSize ? parseFloat(config.fontSize.toString().replace(/[^0-9.]/g, '')) : 24;
          let maxAllowedSize = widgetH * 0.9;
          let finalFontSize = Math.min(requestedSize, maxAllowedSize) + 'px';

          const tickerText = (config.text || 'No text provided') + '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;';

          const keyframes = direction === 'left'
              ? `@keyframes ${animName} { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`
              : `@keyframes ${animName} { 0% { transform: translateX(-50%); } 100% { transform: translateX(0); } }`;

          widgetHTML = `
              <style>
                  ${keyframes}
                  .ticker-track-${this.zoneId} {
                      display: flex;
                      width: max-content;
                      animation: ${animName} ${config.speed || 15}s linear infinite;
                  }
                  .ticker-item-${this.zoneId} {
                      white-space: nowrap;
                      color: ${config.color || '#ffffff'};
                      font-size: ${finalFontSize};
                      font-weight: bold;
                      line-height: 1;
                      padding-right: 50px;
                      min-width: ${widgetW}px;
                      display: flex;
                      align-items: center;
                  }
              </style>
              ${innerWrapper}
                  <div style="width: 100%; height: 100%; overflow: hidden; display: flex; align-items: center;">
                      <div class="ticker-track-${this.zoneId}">
                          <div class="ticker-item-${this.zoneId}">${tickerText}</div>
                          <div class="ticker-item-${this.zoneId}">${tickerText}</div>
                      </div>
                  </div>
              ${closeWrapper}`;
      } else {
          widgetHTML = `${innerWrapper}<div style="color:red;">Unknown Widget</div>${closeWrapper}`;
      }

      // Inject HTML into DOM
      this.widgetContainer.innerHTML = widgetHTML;
      this.widgetContainer.style.display = "flex";

      const finishWidget = () => {
          if (this.widgetInterval) clearInterval(this.widgetInterval);
          this.widgetContainer.innerHTML = "";
          this.widgetContainer.style.display = "none";
      };

      if (!isSingleItem) {
          this.timeoutBox = setTimeout(() => {
            if (!signal.aborted) {
              finishWidget();
              if (trackingId) window.proofOfPlayTracker.endTracking(trackingId, "completed");
              resolve();
            }
          }, item.duration * 1000 || 15000);
      }

      signal.addEventListener("abort", () => {
        finishWidget();
        resolve();
      });
    });
  }
  // playImage(file, signal, item) {
  //   return new Promise((resolve) => {
  //     let trackingId = null;
  //     if (window.proofOfPlayTracker && item) {
  //       trackingId = window.proofOfPlayTracker.startTracking(item, "image");
  //       window.proofOfPlayTracker.addPlaybackEvent(
  //         trackingId,
  //         "IMAGE_DISPLAY_STARTED",
  //         { fileName: file, zone: this.zoneId },
  //       );
  //     }

  //     if (this.timeoutBox) clearTimeout(this.timeoutBox);

  //     // Cleanup widgets and video
  //     if (this.widgetContainer) this.widgetContainer.style.display = "none";
  //     if (this.widgetInterval) clearInterval(this.widgetInterval);
  //     if (this.p1Element) this.p1Element.style.display = "none";
  //     if (this.p2Element) this.p2Element.style.display = "none";

  //     try {
  //       if (
  //         this.p1 &&
  //         this.p1.getState() !== "IDLE" &&
  //         this.p1.getState() !== "NONE"
  //       )
  //         this.p1.stop();
  //       if (
  //         this.p2 &&
  //         this.p2.getState() !== "IDLE" &&
  //         this.p2.getState() !== "NONE"
  //       )
  //         this.p2.stop();
  //     } catch (e) {}

  //     let currentImg = this.useImage1 ? this.img1 : this.img2;
  //     let prevImg = this.useImage1 ? this.img2 : this.img1;

  //     currentImg.onerror = () => {
  //       currentImg.style.display = "none";
  //       if (trackingId)
  //         window.proofOfPlayTracker.endTracking(trackingId, "error");
  //       resolve();
  //     };

  //     currentImg.src = sources + "/" + file;
  //     currentImg.style.display = "block";
  //     prevImg.style.display = "none";
  //     this.useImage1 = !this.useImage1;

  //     this.timeoutBox = setTimeout(
  //       () => {
  //         if (!signal.aborted) {
  //           if (trackingId)
  //             window.proofOfPlayTracker.endTracking(trackingId, "completed");
  //           resolve();
  //         }
  //       },
  //       item.duration * 1000 || 10000,
  //     );
  //   });
  // }

  // ⭐ Accept isSingleItem parameter
  playImage(file, signal, item, isSingleItem = false) {
    return new Promise((resolve) => {
      let trackingId = null;
      if (window.proofOfPlayTracker && item) {
        trackingId = window.proofOfPlayTracker.startTracking(item, "image");
        window.proofOfPlayTracker.addPlaybackEvent(trackingId, "IMAGE_DISPLAY_STARTED", { fileName: file, zone: this.zoneId });
      }

      if (this.timeoutBox) clearTimeout(this.timeoutBox);
      
      if (this.widgetContainer) this.widgetContainer.style.display = "none";
      if (this.widgetInterval) clearInterval(this.widgetInterval);
      if (this.p1Element) this.p1Element.style.display = "none";
      if (this.p2Element) this.p2Element.style.display = "none";

      try {
        if (this.p1 && this.p1.getState() !== "IDLE" && this.p1.getState() !== "NONE") this.p1.stop();
        if (this.p2 && this.p2.getState() !== "IDLE" && this.p2.getState() !== "NONE") this.p2.stop();
      } catch(e){}

      let currentImg = this.useImage1 ? this.img1 : this.img2;
      let prevImg = this.useImage1 ? this.img2 : this.img1;

      currentImg.onerror = () => {
        currentImg.style.display = "none";
        if (trackingId) window.proofOfPlayTracker.endTracking(trackingId, "error");
        resolve();
      };

      currentImg.src = sources + "/" + file;
      currentImg.style.display = "block";
      prevImg.style.display = "none";
      this.useImage1 = !this.useImage1;

      // ⭐ CRITICAL FIX: If it's a full-time image, DO NOT set a timeout!
      if (!isSingleItem) {
          this.timeoutBox = setTimeout(() => {
            if (!signal.aborted) {
              if (trackingId) window.proofOfPlayTracker.endTracking(trackingId, "completed");
              resolve();
            }
          }, item.duration * 1000 || 10000);
      }

      signal.addEventListener("abort", () => {
        resolve();
      });
    });
  }

  playVideo(file, signal, item) {
    return new Promise((resolve) => {
      if (!this.p1) return resolve();
      let aborted = false;
      let trackingId = null;

      if (window.proofOfPlayTracker && item) {
        trackingId = window.proofOfPlayTracker.startTracking(item, "video");
        window.proofOfPlayTracker.addPlaybackEvent(trackingId, "PLAYBACK_STARTED", { fileName: file, zone: this.zoneId });
      }
      if (this.widgetContainer) this.widgetContainer.style.display = "none";

      // 1. Assign Active & Background Players based on what's available
      let activePlayer = this.p1;
      let activeElement = this.p1Element;
      let bgPlayer = null;
      let bgElement = null;

      // Only Ping-Pong if this zone has 2 decoders!
      if (this.p2) {
          activePlayer = this.useP1Next ? this.p1 : this.p2;
          activeElement = this.useP1Next ? this.p1Element : this.p2Element;
          bgPlayer = this.useP1Next ? this.p2 : this.p1;
          bgElement = this.useP1Next ? this.p2Element : this.p1Element;
          this.useP1Next = !this.useP1Next;
      }

      let timeoutFallback;

      const dynamicListener = {
        onbufferingcomplete: () => {
          if (trackingId) window.proofOfPlayTracker.addPlaybackEvent(trackingId, "BUFFERING_COMPLETE");
        },
        onstreamcompleted: () => {
          if (!aborted) {
            if (trackingId) window.proofOfPlayTracker.addPlaybackEvent(trackingId, "STREAM_COMPLETED");

            // CRITICAL FIX: FREEZE THE FINAL FRAME ON SCREEN
            try { activePlayer.setVideoStillMode("true"); } catch(e){}
            try { activePlayer.stop(); } catch(e){}

            // DO NOT HIDE activeElement! Leave it on screen to prevent the 500ms black flash.
            clearTimeout(timeoutFallback);
            if (trackingId) window.proofOfPlayTracker.endTracking(trackingId, "completed");
            resolve();
          }
        },
        onerror: (errType) => {
          if (trackingId) window.proofOfPlayTracker.endTracking(trackingId, "error");
          try { activePlayer.stop(); } catch(e){}
          if (activeElement) activeElement.style.display = "none";
          clearTimeout(timeoutFallback);
          resolve();
        }
      };

      try {
        // Prepare the new video in the background
        activePlayer.open(sources + "/" + file);
        activePlayer.setListener(dynamicListener);

        try { activePlayer.setDisplayMethod("PLAYER_DISPLAY_MODE_CUSTOM"); } catch(e) {}
        activePlayer.setDisplayRotation(getRotationValue());

        let height = this.getAdjustedVideoHeight();
        // activePlayer.setDisplayRect(this.rect.x, this.rect.y, this.rect.w, height);
        activePlayer.setDisplayRect(this.rect.x, this.rect.y, this.rect.w, this.rect.h);

        activePlayer.prepareAsync(() => {
          this.img1.style.display = "none";
          this.img2.style.display = "none";

          // 2. POP NEW VIDEO TO FRONT
          if (activeElement) {
              activeElement.style.zIndex = "16";
              activeElement.classList.add("vid");
              activeElement.style.display = "block";
          }

          // 3. HIDE AND STOP THE OLD VIDEO (This creates the seamless cut)
          if (bgElement) {
              bgElement.style.zIndex = "14";
              bgElement.classList.remove("vid");
              bgElement.style.display = "none";
          }
          if (bgPlayer) {
              try { bgPlayer.stop(); } catch(e){}
          }

          // Turn off Still Mode so the new video actually plays
          try { activePlayer.setVideoStillMode("false"); } catch(e){}
          activePlayer.play();

          timeoutFallback = setTimeout(() => {
            try { activePlayer.setVideoStillMode("true"); } catch(e){}
            try { activePlayer.stop(); } catch(e){}
            resolve();
          }, item.duration * 1000 || 15000);

        }, () => {
          if (trackingId) window.proofOfPlayTracker.endTracking(trackingId, "error");
          if (activeElement) activeElement.style.display = "none";
          resolve();
        });

      } catch (err) {
        if (trackingId) window.proofOfPlayTracker.endTracking(trackingId, "error");
        if (activeElement) activeElement.style.display = "none";
        resolve();
      }

      signal.addEventListener("abort", () => {
        aborted = true;
        try { activePlayer.stop(); } catch(e){}
        if (activeElement) activeElement.style.display = "none";
        resolve();
      });
    });
  }


  // --- LIVE MODE ---
  checkActiveLiveContent() {
    if (!this.liveContents.length) return null;
    return this.liveContents.find((item) => shouldPlayContent(item)) || null;
  }

  startLiveContentMonitor() {
    if (this.liveMonitorInterval) clearInterval(this.liveMonitorInterval);
    this.liveMonitorInterval = setInterval(() => {
      const activeLive = this.checkActiveLiveContent();
      if (this.currentPlaybackMode === "live" && !activeLive) {
        this.iframeContainer.innerHTML = "";
        this.iframeContainer.style.display = "none";
        try {
          this.stg.stop();
        } catch (e) {}
        if (this.stgElement) this.stgElement.style.display = "none";
        this.startPlayback();
      } else if (this.currentPlaybackMode === "normal" && activeLive) {
        this.handleLiveContentMode(activeLive);
      }
    }, 10000);
  }

async handleLiveContentMode(liveItem) {
    this.currentPlaybackMode = "live";
    this.activeLiveContent = liveItem;
    if (this.abortController) this.abortController.abort();

    // Cleanup widgets
    if (this.widgetContainer) this.widgetContainer.style.display = "none";
    if (this.widgetInterval) clearInterval(this.widgetInterval);

    if (this.websiteRefreshInterval) clearInterval(this.websiteRefreshInterval);

    try { if (this.p1) this.p1.stop(); } catch(e){}
    try { if (this.p2) this.p2.stop(); } catch(e){}

    if (this.p1Element) this.p1Element.style.display = "none";
    if (this.p2Element) this.p2Element.style.display = "none";
    this.img1.style.display = "none";
    this.img2.style.display = "none";

    const type = detectContentType(liveItem);
    
    // ⭐ CRITICAL FIX: Use p1 instead of stg!
    if (type === "m3u8" && this.p1) {
       this.playM3U8Stream(liveItem, 0);
    } else if (type === "youtube") {
       this.playYouTubeZone(liveItem);
    } else if (type === "website") {
       this.playWebsiteZone(liveItem);
    }
  }

  playM3U8Stream(liveItem, retryCount = 0) {
    const MAX_RETRY = 999;
    const RETRY_DELAY = 5000;
    
    // ⭐ Assign our guaranteed hardware player
    let activePlayer = this.p1;
    let activeElement = this.p1Element;

    try { activePlayer.stop(); } catch (e) {}

    const dynamicListener = {
      onerror: (errType) => {
        console.error("❌ Live Stream Error:", errType);
        if (activeElement) {
            activeElement.classList.remove("vid");
            activeElement.style.display = "none";
        }
        if (retryCount < MAX_RETRY && this.currentPlaybackMode === "live") {
          let to = setTimeout(() => this.playM3U8Stream(liveItem, retryCount + 1), RETRY_DELAY);
          this.m3u8RetryTimeouts.push(to);
        }
      }
    };

    activePlayer.setListener(dynamicListener);

    try {
      activePlayer.open(liveItem.url);
      
      try { activePlayer.setDisplayRotation(getRotationValue()); } catch(e){ console.error("Rotation err", e); }
      try { activePlayer.setDisplayMethod("PLAYER_DISPLAY_MODE_CUSTOM"); } catch(e){}

      let height = this.getAdjustedVideoHeight();
      // try { activePlayer.setDisplayRect(this.rect.x, this.rect.y, this.rect.w, height); } catch(e){}
 try { activePlayer.setDisplayRect(this.rect.x, this.rect.y, this.rect.w, this.rect.h); } catch(e){}

      activePlayer.prepareAsync(
        () => {
          if (activeElement) {
            // Force pixel dimensions so the live stream doesn't shrink into a tiny box
            activeElement.style.width = this.rect.w + "px";
            activeElement.style.height = height + "px";
            activeElement.style.zIndex = "16";
            activeElement.classList.add("vid");
            activeElement.style.display = "block";
          }
          
          // Double-tap the layout boundaries right before hitting play
          try { activePlayer.setDisplayRect(this.rect.x, this.rect.y, this.rect.w, height); } catch(e){}

          // Turn off frozen frames for live TV
          try { activePlayer.setVideoStillMode("false"); } catch(e){}
          
          activePlayer.play();
          console.log("▶️ Live Stream playing perfectly on P1!");
        },
        (err) => {
          console.error("❌ Live Stream Prepare Error:", err);
          if (retryCount < MAX_RETRY && this.currentPlaybackMode === "live") {
            let to = setTimeout(() => this.playM3U8Stream(liveItem, retryCount + 1), RETRY_DELAY);
            this.m3u8RetryTimeouts.push(to);
          }
        },
      );
    } catch (e) {
        console.error("❌ Live Stream Setup Error:", e);
    }
  }

  playYouTubeZone(liveItem) {
    const videoId = extractYouTubeVideoId(liveItem.url);
    if (!videoId) return;
    this.iframeContainer.innerHTML = `<iframe style="width:100%; height:100%; border:none;" src="${YOUTUBE_CONFIG.embedBaseUrl}${videoId}?autoplay=1&mute=1&controls=0&modestbranding=1" allow="autoplay"></iframe>`;
    this.iframeContainer.style.display = "block";
  }

playWebsiteZone(liveItem) {
  console.log("web site data......", liveItem)
    // Clear any existing interval just in case
    if (this.websiteRefreshInterval) clearInterval(this.websiteRefreshInterval);

    const iframeId = `iframe_${this.zoneId}`;
    this.iframeContainer.innerHTML = `<iframe id="${iframeId}" style="width:100%; height:100%; border:none;" src="${liveItem.url}"></iframe>`;
    this.iframeContainer.style.display = "block";

    // ⭐ If the website is STATIC, force an iframe refresh every 3 seconds
    if (liveItem.website_type === "STATIC") {
        this.websiteRefreshInterval = setInterval(() => {
            const iframe = document.getElementById(iframeId);
            if (iframe) {
                // Determine if the original URL already has query parameters
                const separator = liveItem.url.includes('?') ? '&' : '?';
                
                // Append a unique timestamp. This prevents Tizen from using the cached page!
                iframe.src = `${liveItem.url}${separator}cb=${new Date().getTime()}`;
            }
        }, 5000); // 3000ms = 3 seconds
    }
  }

  getNextCarouselItem(carousel) {
    if (!carousel || !carousel.items || carousel.items.length === 0)
      return null;
    const lastIndex =
      this.carouselState[carousel.carousel_id]?.lastPlayedIndex ?? -1;
    const nextIndex = (lastIndex + 1) % carousel.items.length;
    this.carouselState[carousel.carousel_id] = { lastPlayedIndex: nextIndex };
    return carousel.items[nextIndex];
  }

  destroy() {
    if (this.abortController) this.abortController.abort();
    if (this.liveMonitorInterval) clearInterval(this.liveMonitorInterval);
    if (this.timeoutBox) clearTimeout(this.timeoutBox);
    if (this.widgetInterval) clearInterval(this.widgetInterval); // Clean up clock/calendar
    
    if (this.websiteRefreshInterval) clearInterval(this.websiteRefreshInterval);
    
    this.m3u8RetryTimeouts.forEach(clearTimeout);

    if (this.p1) {
      try {
        this.p1.stop();
        this.p1.close();
      } catch (e) {}
    }
    if (this.p2) {
      try {
        this.p2.stop();
        this.p2.close();
      } catch (e) {}
    }
    if (this.stg) {
      try {
        this.stg.stop();
        this.stg.close();
      } catch (e) {}
    }

    if (this.p1Element) this.p1Element.style.display = "none";
    if (this.p2Element) this.p2Element.style.display = "none";
    if (this.stgElement) this.stgElement.style.display = "none";

    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}


// ==========================================
// 2. ZONE CONTROLLER CLASS
// ==========================================
// class ZoneController {
//   constructor(zoneConfig) {
//     this.zoneId = zoneConfig.zone_id;
//     this.rect = zoneConfig.rect || { x: zoneConfig.x, y: zoneConfig.y, w: zoneConfig.width, h: zoneConfig.height };
//     this.type = zoneConfig.type;
//     this.zIndex = zoneConfig.z_index || 10;
//     this.border_radius = zoneConfig.border_radius || 0; 

//     this.ads = zoneConfig.ads || [];
//     this.carousels = zoneConfig.carousels || [];
//     this.liveContents = zoneConfig.liveContents || [];

//     this.iterator = 0;
//     this.currentPlaybackMode = "normal";
//     this.activeLiveContent = null;
//     this.abortController = null;
//     this.liveMonitorInterval = null;
//     this.timeoutBox = null;
//     this.widgetInterval = null; 
//     this.m3u8RetryTimeouts = [];
//     this.carouselState = {};

//     // Only ONE player per zone
//     this.p1 = null;

//     this.initZoneDOM();
//     if (this.type === "video_primary" || this.type === "video") {
//       this.initVideoPlayers();
//     }
//   }

//   initZoneDOM() {
//     this.container = document.createElement("div");
//     this.container.id = `zone_${this.zoneId}`;
    
//     // GPU composite hack + Border Radius
//     this.container.style.cssText = `position:absolute; left:${this.rect.x}px; transform: translateZ(0); border-radius:${this.border_radius}px; overflow:hidden; top:${this.rect.y}px; width:${this.rect.w}px; height:${this.rect.h}px; background-color:transparent; z-index:${this.zIndex};`;

//     const childCss = `position:absolute; top:0; left:0; width:100%; height:100%; display:none; border-radius:${this.border_radius}px; overflow:hidden; z-index:15;`;

//     // Only one AVPlayer object created
//     this.p1Element = document.createElement("object");
//     this.p1Element.type = "application/avplayer";
//     this.p1Element.id = `av-player-1-${this.zoneId}`;
//     this.p1Element.style.cssText = childCss;

//     this.img1 = document.createElement("img");
//     this.img2 = document.createElement("img");
//     const imgCss = `position:absolute; top:0; left:0; width:100%; height:100%; display:none; object-fit:fill; z-index:20; background-color:black; border-radius:${this.border_radius}px; overflow:hidden;`;
//     this.img1.style.cssText = imgCss;
//     this.img2.style.cssText = imgCss;
//     this.useImage1 = true;

//     this.iframeContainer = document.createElement("div");
//     this.iframeContainer.style.cssText = `position:absolute; top:0; left:0; width:100%; height:100%; display:none; z-index:30; background-color:black; border-radius:${this.border_radius}px; overflow:hidden;`;

//     this.widgetContainer = document.createElement("div");
//     this.widgetContainer.style.cssText = `position:absolute; top:0; left:0; width:100%; height:100%; display:none; z-index:25; background-color:transparent; overflow:hidden; border-radius:${this.border_radius}px;`;

//     this.container.appendChild(this.p1Element);
//     this.container.appendChild(this.img1);
//     this.container.appendChild(this.img2);
//     this.container.appendChild(this.iframeContainer);
//     this.container.appendChild(this.widgetContainer);

//     document.getElementById("ad_player")?.appendChild(this.container) || document.body.appendChild(this.container);
//   }

//   initVideoPlayers() {
//     try {
//       this.p1 = webapis.avplaystore.getPlayer(this.p1Element.id);
//     } catch (e) {
//       console.error(`❌ AVPlay error in zone ${this.zoneId}`, e);
//     }
//   }

//   getAdjustedVideoHeight() {
//     return localStorage.getItem("rcs_enabled") == "true" ? this.rect.h - 40 : this.rect.h;
//   }

//   async startPlayback() {
//     const activeLive = this.checkActiveLiveContent();
//     if (activeLive) {
//       await this.handleLiveContentMode(activeLive);
//     } else {
//       const queue = this.buildPlaybackQueue();
//       if (queue.length > 0) this.playLoop(queue);
//     }
//     this.startLiveContentMonitor();
//   }

//   buildPlaybackQueue() {
//     const carouselItems = this.carousels.map((c) => this.getNextCarouselItem(c)).filter(Boolean);
//     return [...this.ads, ...carouselItems];
//   }

//   async playLoop(queue) {
//     if (this.abortController) this.abortController.abort();
//     this.abortController = new AbortController();
//     const signal = this.abortController.signal;
//     this.currentPlaybackMode = "normal";

//     while (!signal.aborted) {
//       if (this.iterator !== 0 && this.iterator % queue.length === 0) {
//         queue = this.buildPlaybackQueue();
//       }

//       if (queue.length === 0) {
//         await new Promise((r) => setTimeout(r, 5000));
//         continue;
//       }

//       const item = queue[this.iterator % queue.length];
//       const isSingleItem = queue.length === 1;

//       if (shouldPlayContent(item)) {
//         const type = detectContentType(item);
//         const fileName = getFileName(item);

//         if (type === "video" && this.type === "image_only") {
//           await new Promise((r) => setTimeout(r, 1000));
//         } else {
//           try {
//             if (type === "widget") await this.playWidget(signal, item, isSingleItem);
//             else if (type === "video") await this.playVideo(fileName, signal, item);
//             else await this.playImage(fileName, signal, item, isSingleItem);
//           } catch (e) {
//             await new Promise((r) => setTimeout(r, 1000));
//           }
//         }
//       } else {
//         await new Promise((r) => setTimeout(r, 1000));
//       }
//       this.iterator++;
//     }
//   }

//   // --- WIDGET ENGINE (Standard) ---
//   playWidget(signal, item, isSingleItem = false) {
//     return new Promise((resolve) => {
//       let trackingId = null;
//       if (window.proofOfPlayTracker && item) {
//         trackingId = window.proofOfPlayTracker.startTracking(item, "widget");
//         window.proofOfPlayTracker.addPlaybackEvent(trackingId, "WIDGET_DISPLAY_STARTED", { zone: this.zoneId });
//       }

//       if (this.timeoutBox) clearTimeout(this.timeoutBox);
//       if (this.widgetInterval) clearInterval(this.widgetInterval);
      
//       if (this.p1Element) this.p1Element.style.display = "none";
//       try {
//         if (this.p1 && this.p1.getState() !== "IDLE" && this.p1.getState() !== "NONE") this.p1.stop();
//       } catch(e){}
//       this.img1.style.display = "none";
//       this.img2.style.display = "none";

//       const config = item.config || {};
//       let widgetW = this.rect.w;
//       let widgetH = this.rect.h;
//       const isTicker = item.widget_type === "sliding_text" || item.widget_type === "ticker";

//       if (item.aspect_ratio && !isTicker) {
//           const parts = item.aspect_ratio.split(':');
//           if (parts.length === 2) {
//               const targetRatio = parseFloat(parts[0]) / parseFloat(parts[1]);
//               const zoneRatio = widgetW / widgetH;

//               if (zoneRatio > targetRatio) {
//                   widgetH = this.rect.h;
//                   widgetW = Math.round(widgetH * targetRatio);
//               } else {
//                   widgetW = this.rect.w;
//                   widgetH = Math.round(widgetW / targetRatio);
//               }
//           }
//       }

//       this.widgetContainer.style.backgroundColor = config.background || "transparent";
//       this.widgetContainer.style.display = "flex";
//       this.widgetContainer.style.justifyContent = "center";
//       this.widgetContainer.style.alignItems = "center";
//       this.widgetContainer.innerHTML = ""; 

//       const innerWrapper = `<div style="position:relative; width:${widgetW}px; height:${widgetH}px; display:flex; justify-content:center; align-items:center; overflow:hidden;">`;
//       const closeWrapper = `</div>`;

//       let widgetHTML = "";

//       // [Insert Clock/Calendar HTML Logic Here exactly as it was]
//       if (item.widget_type === "clock_digital") {
//           const tz = config.timezone || "Asia/Kolkata"; 
//           const use12h = config.format === "12h";
//           widgetHTML = `${innerWrapper}<div id="clock_${this.zoneId}" style="width:100%; color:${config.color || '#ffffff'}; font-size:${config.fontSize || '32px'}; font-weight:bold; font-family:sans-serif; text-align:center;"></div>${closeWrapper}`;
//           const updateClock = () => {
//               const el = document.getElementById(`clock_${this.zoneId}`);
//               if (el) el.innerText = new Date().toLocaleTimeString('en-US', { timeZone: tz, hour12: use12h });
//           };
//           setTimeout(updateClock, 0); 
//           this.widgetInterval = setInterval(updateClock, 1000);
//       } else if (item.widget_type === "clock_analog") {
//           const tz = config.timezone || "Asia/Kolkata";
//           const c = config.color || '#ffffff';
//           widgetHTML = `
//             ${innerWrapper}
//                 <div style="position:relative; width:100%; height:100%; border-radius:50%; border:4px solid ${c}; box-sizing:border-box;">
//                    <div style="position:absolute; top:50%; left:50%; width:12px; height:12px; background:${c}; border-radius:50%; transform:translate(-50%, -50%); z-index:4;"></div>
//                    <div id="hr_${this.zoneId}" style="position:absolute; top:50%; left:50%; width:6px; height:25%; background:${c}; transform-origin:bottom center; transform: translate(-50%, -100%) rotate(0deg); z-index:2; border-radius:4px;"></div>
//                    <div id="mn_${this.zoneId}" style="position:absolute; top:50%; left:50%; width:4px; height:38%; background:${c}; transform-origin:bottom center; transform: translate(-50%, -100%) rotate(0deg); z-index:1; border-radius:4px;"></div>
//                    <div id="sc_${this.zoneId}" style="position:absolute; top:50%; left:50%; width:2px; height:42%; background:#ff3b30; transform-origin:bottom center; transform: translate(-50%, -100%) rotate(0deg); z-index:3;"></div>
//                 </div>
//             ${closeWrapper}`;
//           const updateAnalogClock = () => {
//               const now = new Date(new Date().toLocaleString("en-US", {timeZone: tz}));
//               const sec = now.getSeconds(); const min = now.getMinutes(); const hr = now.getHours();
//               const hrEl = document.getElementById(`hr_${this.zoneId}`);
//               const mnEl = document.getElementById(`mn_${this.zoneId}`);
//               const scEl = document.getElementById(`sc_${this.zoneId}`);
//               if (scEl) scEl.style.transform = `translate(-50%, -100%) rotate(${sec * 6}deg)`;
//               if (mnEl) mnEl.style.transform = `translate(-50%, -100%) rotate(${(min * 6) + (sec * 0.1)}deg)`;
//               if (hrEl) hrEl.style.transform = `translate(-50%, -100%) rotate(${(hr * 30) + (min * 0.5)}deg)`;
//           };
//           setTimeout(updateAnalogClock, 0);
//           this.widgetInterval = setInterval(updateAnalogClock, 1000);
//       } else if (item.widget_type === "calendar") {
//           const tz = config.timezone || "Asia/Kolkata";
//           const optsDay = tz ? { timeZone: tz, weekday: 'long' } : { weekday: 'long' };
//           const optsMonth = tz ? { timeZone: tz, month: 'long' } : { month: 'long' };
//           let calBase = Math.min(widgetW, widgetH) * 0.95; 
//           let mainFontSize = Math.floor(calBase * 0.45) + "px"; 
//           let subFontSize = Math.floor(calBase * 0.15) + "px";  
//           widgetHTML = `${innerWrapper}<div id="cal_${this.zoneId}" style="display:flex; flex-direction:column; justify-content:center; align-items:center; width:100%; height:100%; color:${config.color || '#ffffff'}; font-family:sans-serif; text-align:center; font-weight:bold;"></div>${closeWrapper}`;
//           const updateCalendar = () => {
//               const el = document.getElementById(`cal_${this.zoneId}`);
//               if (el) {
//                   const now = new Date();
//                   const dayName = now.toLocaleDateString('en-US', optsDay);
//                   const monthName = now.toLocaleDateString('en-US', optsMonth);
//                   const dateNum = tz ? new Intl.DateTimeFormat('en-US', { timeZone: tz, day: 'numeric' }).format(now) : now.getDate();
//                   const year = tz ? new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric' }).format(now) : now.getFullYear();
//                   el.innerHTML = `
//                       <div style="font-size:${subFontSize}; text-transform:uppercase; letter-spacing:2px; opacity:0.8; line-height:1.2;">${monthName} ${year}</div>
//                       <div style="font-size:${mainFontSize}; line-height:1.1;">${dateNum}</div>
//                       <div style="font-size:${subFontSize}; font-weight:300; line-height:1.2;">${dayName}</div>
//                   `;
//               }
//           };
//           setTimeout(updateCalendar, 0);
//           this.widgetInterval = setInterval(updateCalendar, 60000); 
//       } else if (item.widget_type === "logo") {
//           const fit = config.fit || "contain";
//           const localImgSrc = sources + "/" + getFileName(item);
//           const fallbackUrl = config.url || item.url;
//           widgetHTML = `${innerWrapper}<img src="${localImgSrc}" style="width:100%; height:100%; object-fit:${fit};" onerror="this.onerror=null; this.src='${fallbackUrl}';">${closeWrapper}`;
//       } else if (item.widget_type === "emoji") {
//           widgetHTML = `${innerWrapper}<div style="font-size:${config.size || 48}px; text-align:center; line-height:1;">${config.emoji || '👋'}</div>${closeWrapper}`;
//       } else if (isTicker) {
//           const direction = config.direction === 'right' ? 'right' : 'left';
//           const animName = `scroll_${this.zoneId}_${Date.now()}`;
//           let requestedSize = config.fontSize ? parseFloat(config.fontSize.toString().replace(/[^0-9.]/g, '')) : 24;
//           let maxAllowedSize = widgetH * 0.9;
//           let finalFontSize = Math.min(requestedSize, maxAllowedSize) + 'px';
//           const tickerText = (config.text || 'No text provided') + '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;';
//           const keyframes = direction === 'left' ? `@keyframes ${animName} { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }` : `@keyframes ${animName} { 0% { transform: translateX(-50%); } 100% { transform: translateX(0); } }`;
//           widgetHTML = `
//               <style>
//                   ${keyframes}
//                   .ticker-track-${this.zoneId} { display: flex; width: max-content; animation: ${animName} ${config.speed || 15}s linear infinite; }
//                   .ticker-item-${this.zoneId} { white-space: nowrap; color: ${config.color || '#ffffff'}; font-size: ${finalFontSize}; font-weight: bold; line-height: 1; padding-right: 50px; min-width: ${widgetW}px; display: flex; align-items: center; }
//               </style>
//               ${innerWrapper}
//                   <div style="width: 100%; height: 100%; overflow: hidden; display: flex; align-items: center;">
//                       <div class="ticker-track-${this.zoneId}">
//                           <div class="ticker-item-${this.zoneId}">${tickerText}</div>
//                           <div class="ticker-item-${this.zoneId}">${tickerText}</div>
//                       </div>
//                   </div>
//               ${closeWrapper}`;
//       } else {
//           widgetHTML = `${innerWrapper}<div style="color:red;">Unknown Widget</div>${closeWrapper}`;
//       }

//       this.widgetContainer.innerHTML = widgetHTML;
//       this.widgetContainer.style.display = "flex";

//       const finishWidget = () => {
//           if (this.widgetInterval) clearInterval(this.widgetInterval);
//           this.widgetContainer.innerHTML = "";
//           this.widgetContainer.style.display = "none";
//       };

//       if (!isSingleItem) {
//           this.timeoutBox = setTimeout(() => {
//             if (!signal.aborted) {
//               finishWidget();
//               if (trackingId) window.proofOfPlayTracker.endTracking(trackingId, "completed");
//               resolve();
//             }
//           }, item.duration * 1000 || 15000);
//       }

//       signal.addEventListener("abort", () => {
//         finishWidget();
//         resolve();
//       });
//     });
//   }

//   playImage(file, signal, item, isSingleItem = false) {
//     return new Promise((resolve) => {
//       let trackingId = null;
//       if (window.proofOfPlayTracker && item) {
//         trackingId = window.proofOfPlayTracker.startTracking(item, "image");
//         window.proofOfPlayTracker.addPlaybackEvent(trackingId, "IMAGE_DISPLAY_STARTED", { fileName: file, zone: this.zoneId });
//       }

//       if (this.timeoutBox) clearTimeout(this.timeoutBox);
      
//       if (this.widgetContainer) this.widgetContainer.style.display = "none";
//       if (this.widgetInterval) clearInterval(this.widgetInterval);
//       if (this.p1Element) this.p1Element.style.display = "none";

//       try {
//         if (this.p1 && this.p1.getState() !== "IDLE" && this.p1.getState() !== "NONE") this.p1.stop();
//       } catch(e){}

//       let currentImg = this.useImage1 ? this.img1 : this.img2;
//       let prevImg = this.useImage1 ? this.img2 : this.img1;

//       currentImg.onerror = () => {
//         currentImg.style.display = "none";
//         if (trackingId) window.proofOfPlayTracker.endTracking(trackingId, "error");
//         resolve();
//       };

//       currentImg.src = sources + "/" + file;
//       currentImg.style.display = "block";
//       prevImg.style.display = "none";
//       this.useImage1 = !this.useImage1;

//       if (!isSingleItem) {
//           this.timeoutBox = setTimeout(() => {
//             if (!signal.aborted) {
//               if (trackingId) window.proofOfPlayTracker.endTracking(trackingId, "completed");
//               resolve();
//             }
//           }, item.duration * 1000 || 10000);
//       }

//       signal.addEventListener("abort", () => { resolve(); });
//     });
//   }

//   playVideo(file, signal, item) {
//     return new Promise((resolve) => {
//       if (!this.p1) return resolve();
//       let aborted = false;
//       let trackingId = null;

//       if (window.proofOfPlayTracker && item) {
//         trackingId = window.proofOfPlayTracker.startTracking(item, "video");
//         window.proofOfPlayTracker.addPlaybackEvent(trackingId, "PLAYBACK_STARTED", { fileName: file, zone: this.zoneId });
//       }
      
//       if (this.widgetContainer) this.widgetContainer.style.display = "none";
//       if (this.timeoutBox) clearTimeout(this.timeoutBox);

//       // ALWAYS USE P1
//       const activePlayer = this.p1;
//       const activeElement = this.p1Element;

//       // Ensure old state is stopped safely before loading new
//       try {
//          if(activePlayer.getState() !== "IDLE" && activePlayer.getState() !== "NONE") {
//              activePlayer.stop();
//          }
//       } catch (e) {}

//       const dynamicListener = {
//         onbufferingcomplete: () => {
//           if (trackingId) window.proofOfPlayTracker.addPlaybackEvent(trackingId, "BUFFERING_COMPLETE");
//         },
//         onstreamcompleted: () => {
//           if (!aborted) {
//             if (trackingId) window.proofOfPlayTracker.addPlaybackEvent(trackingId, "STREAM_COMPLETED");

//             try { activePlayer.setVideoStillMode("true"); } catch(e){}
//             try { activePlayer.stop(); } catch(e){}

//             // Hide the video element immediately so the next content can take over seamlessly
//             if (activeElement) activeElement.style.display = "none";
//             if (trackingId) window.proofOfPlayTracker.endTracking(trackingId, "completed");
//             resolve();
//           }
//         },
//         onerror: (errType) => {
//           if (trackingId) window.proofOfPlayTracker.endTracking(trackingId, "error");
//           try { activePlayer.stop(); } catch(e){}
//           if (activeElement) activeElement.style.display = "none";
//           resolve();
//         }
//       };

//       try {
//         activePlayer.open(sources + "/" + file);
//         activePlayer.setListener(dynamicListener);

//         try { activePlayer.setDisplayMethod("PLAYER_DISPLAY_MODE_CUSTOM"); } catch(e) {}
//         activePlayer.setDisplayRotation(getRotationValue());

//         activePlayer.setDisplayRect(this.rect.x, this.rect.y, this.rect.w, this.rect.h);

//         activePlayer.prepareAsync(() => {
//           // Hide images
//           this.img1.style.display = "none";
//           this.img2.style.display = "none";

//           if (activeElement) {
//               activeElement.style.zIndex = "16";
//               activeElement.style.display = "block";
//           }

//           try { activePlayer.setVideoStillMode("false"); } catch(e){}
//           activePlayer.play();

//           // Force timeout just in case streamcompleted fails
//           this.timeoutBox = setTimeout(() => {
//             try { activePlayer.setVideoStillMode("true"); } catch(e){}
//             try { activePlayer.stop(); } catch(e){}
//             if (activeElement) activeElement.style.display = "none";
//             resolve();
//           }, item.duration * 1000 || 15000);

//         }, () => {
//           if (trackingId) window.proofOfPlayTracker.endTracking(trackingId, "error");
//           if (activeElement) activeElement.style.display = "none";
//           resolve();
//         });

//       } catch (err) {
//         if (trackingId) window.proofOfPlayTracker.endTracking(trackingId, "error");
//         if (activeElement) activeElement.style.display = "none";
//         resolve();
//       }

//       signal.addEventListener("abort", () => {
//         aborted = true;
//         try { activePlayer.stop(); } catch(e){}
//         if (activeElement) activeElement.style.display = "none";
//         resolve();
//       });
//     });
//   }


//   // --- LIVE MODE ---
//   checkActiveLiveContent() {
//     if (!this.liveContents.length) return null;
//     return this.liveContents.find((item) => shouldPlayContent(item)) || null;
//   }

//   startLiveContentMonitor() {
//     if (this.liveMonitorInterval) clearInterval(this.liveMonitorInterval);
//     this.liveMonitorInterval = setInterval(() => {
//       const activeLive = this.checkActiveLiveContent();
//       if (this.currentPlaybackMode === "live" && !activeLive) {
//         this.iframeContainer.innerHTML = "";
//         this.iframeContainer.style.display = "none";
//         try { this.p1.stop(); } catch (e) {}
//         if (this.p1Element) this.p1Element.style.display = "none";
//         this.startPlayback();
//       } else if (this.currentPlaybackMode === "normal" && activeLive) {
//         this.handleLiveContentMode(activeLive);
//       }
//     }, 10000);
//   }

//   async handleLiveContentMode(liveItem) {
//     this.currentPlaybackMode = "live";
//     this.activeLiveContent = liveItem;
//     if (this.abortController) this.abortController.abort();

//     if (this.widgetContainer) this.widgetContainer.style.display = "none";
//     if (this.widgetInterval) clearInterval(this.widgetInterval);

//     try { if (this.p1) this.p1.stop(); } catch(e){}

//     if (this.p1Element) this.p1Element.style.display = "none";
//     this.img1.style.display = "none";
//     this.img2.style.display = "none";

//     const type = detectContentType(liveItem);
    
//     // ⭐ ALWAYS USE P1 FOR LIVE M3U8 NOW
//     if (type === "m3u8" && this.p1) {
//        this.playM3U8Stream(liveItem, 0);
//     } else if (type === "youtube") {
//        this.playYouTubeZone(liveItem);
//     } else if (type === "website") {
//        this.playWebsiteZone(liveItem);
//     }
//   }

//   playM3U8Stream(liveItem, retryCount = 0) {
//     const MAX_RETRY = 999;
//     const RETRY_DELAY = 5000;
    
//     const activePlayer = this.p1;
//     const activeElement = this.p1Element;

//     try { activePlayer.stop(); } catch (e) {}

//     const dynamicListener = {
//       onerror: (errType) => {
//         console.error("❌ Live Stream Error:", errType);
//         if (activeElement) {
//             activeElement.style.display = "none";
//         }
//         if (retryCount < MAX_RETRY && this.currentPlaybackMode === "live") {
//           let to = setTimeout(() => this.playM3U8Stream(liveItem, retryCount + 1), RETRY_DELAY);
//           this.m3u8RetryTimeouts.push(to);
//         }
//       }
//     };

//     activePlayer.setListener(dynamicListener);

//     try {
//       activePlayer.open(liveItem.url);
      
//       try { activePlayer.setDisplayRotation(getRotationValue()); } catch(e){ }
//       try { activePlayer.setDisplayMethod("PLAYER_DISPLAY_MODE_CUSTOM"); } catch(e){}

//       let height = this.getAdjustedVideoHeight();
//       try { activePlayer.setDisplayRect(this.rect.x, this.rect.y, this.rect.w, height); } catch(e){}

//       activePlayer.prepareAsync(
//         () => {
//           if (activeElement) {
//             activeElement.style.width = this.rect.w + "px";
//             activeElement.style.height = height + "px";
//             activeElement.style.zIndex = "16";
//             activeElement.style.display = "block";
//           }
          
//           try { activePlayer.setDisplayRect(this.rect.x, this.rect.y, this.rect.w, height); } catch(e){}
//           try { activePlayer.setVideoStillMode("false"); } catch(e){}
          
//           activePlayer.play();
//           console.log("▶️ Live Stream playing perfectly on P1!");
//         },
//         (err) => {
//           console.error("❌ Live Stream Prepare Error:", err);
//           if (retryCount < MAX_RETRY && this.currentPlaybackMode === "live") {
//             let to = setTimeout(() => this.playM3U8Stream(liveItem, retryCount + 1), RETRY_DELAY);
//             this.m3u8RetryTimeouts.push(to);
//           }
//         },
//       );
//     } catch (e) {
//         console.error("❌ Live Stream Setup Error:", e);
//     }
//   }

//   playYouTubeZone(liveItem) {
//     const videoId = extractYouTubeVideoId(liveItem.url);
//     if (!videoId) return;
//     this.iframeContainer.innerHTML = `<iframe style="width:100%; height:100%; border:none;" src="${YOUTUBE_CONFIG.embedBaseUrl}${videoId}?autoplay=1&mute=1&controls=0&modestbranding=1" allow="autoplay"></iframe>`;
//     this.iframeContainer.style.display = "block";
//   }

//   playWebsiteZone(liveItem) {
//     this.iframeContainer.innerHTML = `<iframe style="width:100%; height:100%; border:none;" src="${liveItem.url}"></iframe>`;
//     this.iframeContainer.style.display = "block";
//   }

//   getNextCarouselItem(carousel) {
//     if (!carousel || !carousel.items || carousel.items.length === 0) return null;
//     const lastIndex = this.carouselState[carousel.carousel_id]?.lastPlayedIndex ?? -1;
//     const nextIndex = (lastIndex + 1) % carousel.items.length;
//     this.carouselState[carousel.carousel_id] = { lastPlayedIndex: nextIndex };
//     return carousel.items[nextIndex];
//   }

//   destroy() {
//     if (this.abortController) this.abortController.abort();
//     if (this.liveMonitorInterval) clearInterval(this.liveMonitorInterval);
//     if (this.timeoutBox) clearTimeout(this.timeoutBox);
//     if (this.widgetInterval) clearInterval(this.widgetInterval); 
//     this.m3u8RetryTimeouts.forEach(clearTimeout);

//     // Only clean up p1 since others are gone
//     if (this.p1) {
//       try {
//         this.p1.stop();
//         this.p1.close();
//       } catch (e) {}
//     }

//     if (this.p1Element) this.p1Element.style.display = "none";

//     if (this.container && this.container.parentNode) {
//       this.container.parentNode.removeChild(this.container);
//     }
//   }
// }


// ==========================================
// 3. GLOBAL HANDLERS & HELPERS
// ==========================================

async function handleMQTTAds(payload) {
  // ⭐ FEATURE 3: Saving Layout Globals & Starting RCS Ticker
  localStorage.setItem("placeholder_enabled", payload.placeholder_enabled);
  localStorage.setItem("rcs_enabled", payload.rcs_enabled);
  localStorage.setItem("logo_enabled", payload.logo_enabled);

  if (typeof startAdSlide === "function") {
    startAdSlide(
      "ad_snippet",
      payload.rcs,
      1,
      payload.rcs_enabled,
      payload.logo_enabled,
    );
  }

  // 1. Gather all required content and filenames
  let allDownloadableUrls = [];
  let expectedFileNames = [];

  payload.zones.forEach((zone) => {
    [...zone.ads, ...zone.carousels.flatMap((c) => c.items)].forEach((item) => {
      if (isDownloadableContent(item)) {
        allDownloadableUrls.push(item);
        expectedFileNames.push(getFileName(item));
      }
    });
  });

  // Remove duplicate filenames just in case multiple zones use the same file
  expectedFileNames = [...new Set(expectedFileNames)];

  // 2. ⭐ FEATURE 7: Delete old files NOT in the new payload
  console.log("🧹 Starting cleanup of old files...");
  try {
    await cleanUpOldAds(expectedFileNames);
    console.log("✅ Cleanup complete.");
  } catch (err) {
    console.error("❌ Cleanup failed:", err);
  }

  // 3. Clear memory cache so we physically check the hard drive again
  globalDownloads.clear();

  // 4. Download missing files
  console.log("📥 Starting downloads...");
  for (let item of allDownloadableUrls) {
    const fileName = getFileName(item);
    const downloadUrl = item.url || (item.config && item.config.url);

    // Check if we already processed this file in this loop to avoid double-downloading
    if (!globalDownloads.has(fileName)) {
      globalDownloads.add(fileName);
      try {
        await checkAndDownloadContent(downloadUrl, fileName);
      } catch (e) {
        console.error("Download failed:", fileName);
      }
    }
  }
  console.log("✅ All downloads processed.");

  // 5. Teardown and Rebuild Zones
  Object.values(activeZones).forEach((zone) => zone.destroy());
  activeZones = {};

const bgColor = payload.background_color || "#000000"; 
  
  // Paint the entire TV screen background
  document.body.style.backgroundColor = bgColor;
  
  // Paint your specific ad player container
  const adPlayerContainer = document.getElementById("ad_player");
  if (adPlayerContainer) {
      adPlayerContainer.style.backgroundColor = bgColor;
  }

  payload.zones.forEach((zoneConfig) => {
    const zone = new ZoneController(zoneConfig);
    activeZones[zoneConfig.zone_id] = zone;
    zone.startPlayback();
  });
}

function checkAndDownloadContent(url, fileName) {
  return new Promise((resolve) => {
    tizen.filesystem.resolve(
      fileDir,
      (dir) => {
        try {
          dir.resolve(fileName);
          if (typeof addDownloadedFile === "function")
            addDownloadedFile(fileName);
          if (typeof trackDownloadProgress === "function")
            trackDownloadProgress(fileName, url, 100);
          resolve(); // Already exists
        } catch (e) {
          if (typeof trackDownloadProgress === "function")
            trackDownloadProgress(fileName, url, 0);

          const request = new tizen.DownloadRequest(url, fileDir, fileName);

          // ⭐ FEATURE 4: Custom Headers
          request.httpHeader = {
            "x-player-width": window.DEVICE_WIDTH || "1920",
          };

          const downloadId = tizen.download.start(request);
          tizen.download.setListener(downloadId, {
            onprogress: (id, received, total) => {
              const percent = Math.floor((received / total) * 100);
              if (typeof trackDownloadProgress === "function")
                trackDownloadProgress(fileName, url, percent);
              if (typeof addInfoLog === "function")
                addInfoLog(`Downloading ${fileName}: ${percent}%`);
            },
            oncompleted: () => {
              if (typeof addDownloadedFile === "function")
                addDownloadedFile(fileName);
              if (typeof trackDownloadProgress === "function")
                trackDownloadProgress(fileName, url, 100);
              resolve();
            },
            onfailed: (id, err) => {
              if (typeof addErrorLog === "function")
                addErrorLog(`Download fail: ${err.message}`);
              resolve();
            },
            oncanceled: () => resolve(),
          });
        }
      },
      () => resolve(),
      "rw",
    );
  });
}


function getFileName(item) {
  console.log("item.,.........>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>", item)

  if (item.is_widget && item.widget_type === "logo") {
    const url = item.url || item.config.url || "";
    const originalName = url.substring(url.lastIndexOf("/") + 1).split("?")[0];
    return `logo_${item.ad_id}_${originalName}`;
  }

  if (item.is_widget) return `widget_${item.widget_type}_${item.ad_id}`; // Safe fallback for widgets

  let url = item.url || "";
  let ad_id = item.ad_id;
  const originalName = url.substring(url.lastIndexOf("/") + 1).split("?")[0];
  const dotIndex = originalName.lastIndexOf(".");

  if (dotIndex === -1) {
    return ad_id
      ? `${originalName}_${ad_id}.${item.file_extension}`
      : originalName + "." + item.file_extension;
  }

  const nameWithoutExt = originalName.substring(0, dotIndex);
  const extension =
    originalName.substring(dotIndex) || item.file_extension || "mp4";

  if (nameWithoutExt.startsWith("placeholder")) {
    return `${nameWithoutExt}_${item?.timestamp || new Date().getTime()}${extension}`;
  }

  return ad_id ? `${nameWithoutExt}_${ad_id}${extension}` : originalName;
}

// --- STANDARD SCHEDULING HELPERS ---
function shouldPlayContent(item) {
  if (!item) return false;
  if (item.time_slots && !isWithinTimeSlot(item.time_slots)) return false;
  if (item.weekdays && !isValidWeekday(item.weekdays)) return false;
  return true;
}

function isWithinTimeSlot(timeSlots) {
  if (!timeSlots || timeSlots.length === 0) return true;
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();

  return timeSlots.some((slot) => {
    const [startH, startM] = slot.start.split(":").map(Number);
    const [endH, endM] = slot.end.split(":").map(Number);
    const startMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;

    if (startMins < endMins)
      return currentMins >= startMins && currentMins < endMins;
    return currentMins >= startMins || currentMins < endMins;
  });
}

function isValidWeekday(weekdays) {
  return (
    !weekdays || weekdays.length === 0 || weekdays.includes(new Date().getDay())
  );
}

function isVideo(fileName) {
  return (
    fileName.endsWith(".mp4") ||
    fileName.endsWith(".mkv") ||
    fileName.endsWith(".avi")
  );
}

function detectContentType(item) {
  if (!item) return "unknown";
  if (item.is_widget) return "widget"; // Detect widgets immediately

  const url = item.url || "";
  const cleanUrl = url.split("?")[0].toLowerCase();

  if (cleanUrl.endsWith(".m3u8")) return "m3u8";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (
    cleanUrl.endsWith(".mp4") ||
    cleanUrl.endsWith(".jpg") ||
    cleanUrl.endsWith(".jpeg") ||
    cleanUrl.endsWith(".png")
  )
    return isVideo(cleanUrl) ? "video" : "image";
  return "website";
}


function isDownloadableContent(item) {
  const type = detectContentType(item);
  if (type === "video" || type === "image") return true;
  // ⭐ NEW: Allow logo widgets to be added to the download queue!
  if (item.is_widget && item.widget_type === "logo" && (item.url || item.config?.url)) return true;
  return false;
}

function extractYouTubeVideoId(url) {
  let match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|live\/))([\w-]{11})/,
  );
  return match ? match[1] : null;
}

// ⭐ FEATURE 7: Clean up old files to save Tizen Storage
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
          (err) => reject(err),
        );
      },
      (err) => reject(err),
      "rw",
    );
  });
}

function deleteFileFromDir(dir, name) {
  return new Promise((resolve, reject) => {
    dir.deleteFile(
      `${fileDir}/${name}`,
      () => {
        console.log("🗑️ Deleted old file:", name);
        if (typeof addInfoLog === "function")
          addInfoLog(`Deleted file: ${name}`);
        resolve();
      },
      (err) => {
        console.error("❌ Delete failed:", name, err.message);
        if (typeof addErrorLog === "function")
          addErrorLog(`Failed to delete ${name}: ${err.message}`);
        reject(err);
      },
    );
  });
}

// Cleanup on exit
window.addEventListener("unload", () => {
  Object.values(activeZones).forEach((zone) => zone.destroy());
});
