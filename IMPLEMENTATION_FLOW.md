# 📋 New Content Structure Implementation Flow

## Overview
This document outlines the implementation plan for the new MQTT payload structure that includes:
- **content.ads** - Regular advertisements with scheduling (downloadable)
- **content.carousels** - Carousel groups with round-robin item selection (downloadable)
- **content.live_contents** - Priority live content that interrupts normal playback (streaming URLs - NOT downloadable)

## 🎯 Key Requirements

### Content Types & Players
1. **Downloadable Content** (Ads + Carousels):
   - MP4/Video files → Tizen AVPlayer
   - Images (JPG/PNG) → Image Player
   - **Download ALL at once** when MQTT message arrives

2. **Live Streaming Content** (Live Contents):
   - M3U8/HLS URLs → HLS Video Player (HTML5 video with HLS.js)
   - YouTube URLs → YouTube iFrame Player
   - Website URLs → iFrame Player
   - **DO NOT download** - play directly from URL
   - **Interrupts normal playback** when active

### Download Strategy
- ✅ Download all ads + all carousel items **upfront** when MQTT arrives
- ✅ Loop **never breaks** for downloading
- ❌ Live content is **NOT downloaded** - streamed directly

---

## 🎯 Implementation Phases

### PHASE 1: Payload Parsing & Data Extraction

**File: `js/ads.js`**

#### 1.1 Update MQTT Message Handler (lines 73-145)
```javascript
// Extract new content structure
const content = data.content || {};
const ads = content.ads || data.ads || []; // Backward compatible
const carousels = content.carousels || [];
const liveContents = content.live_contents || [];

// Pass to processAds
processAds(client, ads, data.rcs, true, data.placeholder_enabled, 
           data.rcs_enabled, data.logo_enabled, carousels, liveContents);
```

#### 1.2 Modify `processAds()` Function (lines 250-278)
```javascript
function processAds(client, ads, rcs, placeholderUpdate, placeholder_enabled, 
                    rcs_enabled, logo_enabled, carousels, liveContents) {
  // Filter ads
  ads = ads.filter(ad => ad.url && ad.url !== "null" && ad.url !== "undefined");
  
  // Pass new structure to handleMQTTAds
  handleMQTTAds({
    ads: ads,
    carousels: carousels || [],
    liveContents: liveContents || [],
    rcs: rcs || "",
    placeholderUpdate: placeholderUpdate,
    placeholder_enabled: placeholder_enabled,
    rcs_enabled: rcs_enabled,
    logo_enabled: logo_enabled,
  });
}
```

---

### PHASE 2: Content Scheduling & Filtering

**File: `js/device-storage.js` (new functions)**

#### 2.1 Time Slot Validation
```javascript
/**
 * Check if current time is within any of the provided time slots
 * @param {Array} timeSlots - Array of {start: "HH:MM", end: "HH:MM"}
 * @returns {boolean}
 */
function isWithinTimeSlot(timeSlots) {
  if (!timeSlots || timeSlots.length === 0) return true;
  
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeMinutes = currentHour * 60 + currentMinute;
  
  return timeSlots.some(slot => {
    const [startHour, startMin] = slot.start.split(':').map(Number);
    const [endHour, endMin] = slot.end.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    return currentTimeMinutes >= startMinutes && currentTimeMinutes <= endMinutes;
  });
}
```

#### 2.2 Weekday Validation
```javascript
/**
 * Check if today is in the allowed weekdays
 * @param {Array} weekdays - Array of weekday numbers (0=Sunday, 1=Monday, etc.)
 * @returns {boolean}
 */
function isValidWeekday(weekdays) {
  if (!weekdays || weekdays.length === 0) return true;
  
  const today = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.
  return weekdays.includes(today);
}
```

#### 2.3 Combined Content Validation
```javascript
/**
 * Check if content should play based on schedule
 * @param {Object} item - Content item with time_slots and weekdays
 * @returns {boolean}
 */
function shouldPlayContent(item) {
  if (!item) return false;
  
  // Check time slots
  if (item.time_slots && !isWithinTimeSlot(item.time_slots)) {
    return false;
  }
  
  // Check weekdays
  if (item.weekdays && !isValidWeekday(item.weekdays)) {
    return false;
  }
  
  return true;
}
```

#### 2.4 Content Filtering Function
```javascript
/**
 * Filter content array based on scheduling rules
 * @param {Array} contentArray - Array of content items
 * @returns {Array} Filtered content that should play now
 */
function filterScheduledContent(contentArray) {
  if (!contentArray || contentArray.length === 0) return [];
  
  return contentArray.filter(item => shouldPlayContent(item));
}
```

---

### PHASE 3: Carousel Management

**File: `js/device-storage.js` (new carousel logic)**

#### 3.1 Carousel State Manager
```javascript
// Global carousel state - tracks last played index for each carousel
let carouselState = {};

/**
 * Initialize carousel state from localStorage
 */
function initCarouselState() {
  const saved = localStorage.getItem('carousel_state');
  if (saved) {
    try {
      carouselState = JSON.parse(saved);
      console.log('📊 Loaded carousel state:', carouselState);
    } catch (e) {
      console.error('Failed to parse carousel state:', e);
      carouselState = {};
    }
  }
}

/**
 * Save carousel state to localStorage
 */
function saveCarouselState() {
  localStorage.setItem('carousel_state', JSON.stringify(carouselState));
}
```

#### 3.2 Carousel Item Picker
```javascript
/**
 * Get next item from carousel using round-robin selection
 * @param {Object} carousel - Carousel object with items array
 * @returns {Object} Next carousel item to play
 */
function getNextCarouselItem(carousel) {
  if (!carousel || !carousel.items || carousel.items.length === 0) {
    return null;
  }

  const carouselId = carousel.carousel_id;

  // Get last played index (default to -1 so first item is 0)
  const lastIndex = carouselState[carouselId]?.lastPlayedIndex ?? -1;

  // Calculate next index (round-robin)
  const nextIndex = (lastIndex + 1) % carousel.items.length;

  // Update state
  carouselState[carouselId] = {
    lastPlayedIndex: nextIndex,
    totalItems: carousel.items.length,
    carouselName: carousel.name,
    lastUpdated: new Date().toISOString()
  };

  // Save to localStorage
  saveCarouselState();

  const selectedItem = carousel.items[nextIndex];
  console.log(`🎠 Carousel "${carousel.name}": Selected item ${nextIndex + 1}/${carousel.items.length} - ${selectedItem.name}`);

  return selectedItem;
}
```

#### 3.3 Carousel Processor
```javascript
/**
 * Process all carousels and pick one item from each
 * @param {Array} carousels - Array of carousel objects
 * @returns {Array} Array of selected carousel items
 */
function processCarousels(carousels) {
  if (!carousels || carousels.length === 0) {
    console.log('📭 No carousels to process');
    return [];
  }

  // Filter carousels by schedule
  const validCarousels = filterScheduledContent(carousels);
  console.log(`🎠 Valid carousels: ${validCarousels.length}/${carousels.length}`);

  // Pick one item from each valid carousel
  const selectedItems = validCarousels
    .map(carousel => getNextCarouselItem(carousel))
    .filter(item => item !== null);

  console.log(`✅ Selected ${selectedItems.length} carousel items`);
  return selectedItems;
}
```

---

### PHASE 4: Content Type Detection & Player Selection

**File: `js/device-storage.js` (new content type logic)**

#### 4.1 Content Type Detector
```javascript
/**
 * Detect content type from URL
 * @param {string} url - Content URL
 * @returns {string} Content type: 'video', 'image', 'm3u8', 'youtube', 'website'
 */
function detectContentType(url) {
  if (!url) return 'unknown';

  const urlLower = url.toLowerCase();

  // Check for streaming formats
  if (urlLower.includes('.m3u8') || urlLower.includes('m3u8')) {
    return 'm3u8';
  }

  // Check for YouTube
  if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
    return 'youtube';
  }

  // Check for video files
  if (urlLower.endsWith('.mp4') || urlLower.endsWith('.mkv') ||
      urlLower.endsWith('.avi') || urlLower.endsWith('.webm')) {
    return 'video';
  }

  // Check for image files
  if (urlLower.endsWith('.jpg') || urlLower.endsWith('.jpeg') ||
      urlLower.endsWith('.png') || urlLower.endsWith('.gif')) {
    return 'image';
  }

  // Check for website URLs
  if (urlLower.startsWith('http://') || urlLower.startsWith('https://')) {
    return 'website';
  }

  return 'unknown';
}

/**
 * Check if content is downloadable
 * @param {Object} item - Content item
 * @returns {boolean}
 */
function isDownloadableContent(item) {
  const type = detectContentType(item.url);
  return type === 'video' || type === 'image';
}

/**
 * Check if content is streaming/live
 * @param {Object} item - Content item
 * @returns {boolean}
 */
function isStreamingContent(item) {
  const type = detectContentType(item.url);
  return type === 'm3u8' || type === 'youtube' || type === 'website';
}
```

---

### PHASE 5: Live Content Priority System

**File: `js/device-storage.js` (new live content logic)**

#### 5.1 Live Content Checker
```javascript
/**
 * Check if any live content is currently active
 * @param {Array} liveContents - Array of live content items
 * @returns {Object|null} Active live content or null
 */
function checkActiveLiveContent(liveContents) {
  if (!liveContents || liveContents.length === 0) {
    return null;
  }

  // Find first active live content
  for (const liveItem of liveContents) {
    if (shouldPlayContent(liveItem)) {
      console.log('🔴 LIVE CONTENT ACTIVE:', liveItem.name || liveItem.ad_id);
      return liveItem;
    }
  }

  return null;
}
```

#### 5.2 Live Content Handler (NO DOWNLOAD)
```javascript
/**
 * Handle live content playback mode
 * @param {Array} liveItems - Array of live content items to play
 * @param {Array} allLiveContents - All live content for monitoring
 */
async function handleLiveContentMode(liveItems, allLiveContents) {
  console.log('🔴 Entering LIVE CONTENT MODE');
  currentPlaybackMode = "live";

  // ⚠️ DO NOT DOWNLOAD - Live content is streamed directly
  console.log('📡 Live content will be streamed (not downloaded)');

  // Stop current playback
  stopCurrentPlayback();

  // Play live content directly from URL
  console.log('▶️ Starting live content streaming');
  playLiveContentStream(liveItems[0]); // Play first active live content

  // Start monitoring for when live content ends
  startLiveContentMonitor(allLiveContents);
}
```

#### 5.3 Live Content Player
```javascript
/**
 * Play live streaming content
 * @param {Object} liveItem - Live content item
 */
function playLiveContentStream(liveItem) {
  const contentType = detectContentType(liveItem.url);

  console.log(`🔴 Playing live content: ${contentType} - ${liveItem.url}`);

  // Hide all other players
  hideAllPlayers();

  switch (contentType) {
    case 'm3u8':
      playM3U8Stream(liveItem);
      break;
    case 'youtube':
      playYouTubeStream(liveItem);
      break;
    case 'website':
      playWebsiteStream(liveItem);
      break;
    default:
      console.error('❌ Unsupported live content type:', contentType);
  }
}
```

#### 5.4 M3U8/HLS Player
```javascript
/**
 * Play M3U8/HLS stream using HTML5 video + HLS.js
 * @param {Object} liveItem - Live content item
 */
function playM3U8Stream(liveItem) {
  console.log('📡 Playing M3U8 stream:', liveItem.url);

  // Get or create HLS video player
  let videoPlayer = document.getElementById('hls-player');
  if (!videoPlayer) {
    videoPlayer = document.createElement('video');
    videoPlayer.id = 'hls-player';
    videoPlayer.style.cssText = 'width: 100vw; height: 95vh; object-fit: fill; position: absolute; top: 0; left: 0; z-index: 100;';
    videoPlayer.controls = false;
    videoPlayer.autoplay = true;
    document.getElementById('ad_player').appendChild(videoPlayer);
  }

  videoPlayer.style.display = 'block';

  // Use HLS.js for M3U8 playback
  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(liveItem.url);
    hls.attachMedia(videoPlayer);
    hls.on(Hls.Events.MANIFEST_PARSED, function() {
      videoPlayer.play();
      console.log('✅ HLS stream started');
    });
    hls.on(Hls.Events.ERROR, function(event, data) {
      console.error('❌ HLS error:', data);
    });

    // Store HLS instance for cleanup
    window.currentHlsPlayer = hls;
  } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
    // Native HLS support (Safari, some smart TVs)
    videoPlayer.src = liveItem.url;
    videoPlayer.play();
    console.log('✅ Native HLS playback started');
  } else {
    console.error('❌ HLS not supported on this device');
  }
}
```

#### 5.5 YouTube Player
```javascript
/**
 * Play YouTube video using iFrame API
 * @param {Object} liveItem - Live content item
 */
function playYouTubeStream(liveItem) {
  console.log('📺 Playing YouTube stream:', liveItem.url);

  // Extract YouTube video ID
  const videoId = extractYouTubeVideoId(liveItem.url);
  if (!videoId) {
    console.error('❌ Invalid YouTube URL');
    return;
  }

  // Get or create YouTube iframe
  let iframe = document.getElementById('youtube-player');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'youtube-player';
    iframe.style.cssText = 'width: 100vw; height: 95vh; position: absolute; top: 0; left: 0; z-index: 100; border: none;';
    iframe.allow = 'autoplay; encrypted-media';
    document.getElementById('ad_player').appendChild(iframe);
  }

  iframe.style.display = 'block';
  iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0&showinfo=0&rel=0&modestbranding=1`;

  console.log('✅ YouTube player loaded');
}

/**
 * Extract YouTube video ID from URL
 * @param {string} url - YouTube URL
 * @returns {string|null} Video ID
 */
function extractYouTubeVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}
```

#### 5.6 Website/iFrame Player
```javascript
/**
 * Play website content using iFrame
 * @param {Object} liveItem - Live content item
 */
function playWebsiteStream(liveItem) {
  console.log('🌐 Playing website:', liveItem.url);

  // Get or create website iframe
  let iframe = document.getElementById('website-player');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'website-player';
    iframe.style.cssText = 'width: 100vw; height: 95vh; position: absolute; top: 0; left: 0; z-index: 100; border: none;';
    iframe.allow = 'autoplay; encrypted-media; fullscreen';
    document.getElementById('ad_player').appendChild(iframe);
  }

  iframe.style.display = 'block';
  iframe.src = liveItem.url;

  console.log('✅ Website loaded in iframe');
}
```

#### 5.7 Player Visibility Manager
```javascript
/**
 * Hide all players
 */
function hideAllPlayers() {
  // Hide AVPlayers
  const avPlayer1 = document.getElementById('av-player');
  const avPlayer2 = document.getElementById('av-player2');
  if (avPlayer1) avPlayer1.classList.remove('vid');
  if (avPlayer2) avPlayer2.classList.remove('vid');

  // Hide image players
  const imgPlayer1 = document.getElementById('image-player1');
  const imgPlayer2 = document.getElementById('image-player2');
  if (imgPlayer1) imgPlayer1.style.display = 'none';
  if (imgPlayer2) imgPlayer2.style.display = 'none';

  // Hide streaming players
  const hlsPlayer = document.getElementById('hls-player');
  const youtubePlayer = document.getElementById('youtube-player');
  const websitePlayer = document.getElementById('website-player');

  if (hlsPlayer) hlsPlayer.style.display = 'none';
  if (youtubePlayer) youtubePlayer.style.display = 'none';
  if (websitePlayer) websitePlayer.style.display = 'none';

  // Cleanup HLS instance
  if (window.currentHlsPlayer) {
    window.currentHlsPlayer.destroy();
    window.currentHlsPlayer = null;
  }
}

/**
 * Show normal players (AVPlayer/Image)
 */
function showNormalPlayers() {
  hideAllPlayers();
  // Normal players will be shown by playVideo/playImage functions
}
```

#### 5.8 Live Content Monitor
```javascript
let liveMonitorInterval = null;
let currentPlaybackMode = "normal"; // "normal" or "live"

/**
 * Monitor live content and switch modes as needed
 * @param {Array} liveContents - All live content items
 * @param {Array} ads - All ads for resuming normal mode
 * @param {Array} carousels - All carousels for resuming normal mode
 */
function startLiveContentMonitor(liveContents, ads = [], carousels = []) {
  // Clear existing monitor
  if (liveMonitorInterval) {
    clearInterval(liveMonitorInterval);
  }

  console.log('👁️ Starting live content monitor');

  liveMonitorInterval = setInterval(() => {
    const activeLive = checkActiveLiveContent(liveContents);

    if (currentPlaybackMode === "live" && !activeLive) {
      // Live content ended, switch back to normal
      console.log('✅ Live content ended - Resuming normal playback');
      currentPlaybackMode = "normal";

      // Rebuild queue and restart normal playback
      const queue = buildPlaybackQueue(ads, carousels);
      if (queue.length > 0) {
        restartNormalPlayback(queue);
      }

    } else if (currentPlaybackMode === "normal" && activeLive) {
      // New live content started, interrupt normal playback
      console.log('🔴 Live content started - Interrupting normal playback');
      handleLiveContentMode([activeLive], liveContents);
    }
  }, 10000); // Check every 10 seconds
}

/**
 * Stop live content monitor
 */
function stopLiveContentMonitor() {
  if (liveMonitorInterval) {
    clearInterval(liveMonitorInterval);
    liveMonitorInterval = null;
    console.log('🛑 Live content monitor stopped');
  }
}
```

---

### PHASE 6: Unified Playback Queue Builder & Upfront Download

**File: `js/device-storage.js`**

#### 6.1 Extract All Downloadable Content
```javascript
/**
 * Extract ALL downloadable content from ads and carousels
 * @param {Array} ads - Array of ad items
 * @param {Array} carousels - Array of carousel objects
 * @returns {Array} All downloadable items (not filtered by schedule)
 */
function extractAllDownloadableContent(ads, carousels) {
  const downloadableItems = [];

  // Add all ads
  ads.forEach(ad => {
    if (isDownloadableContent(ad)) {
      downloadableItems.push(ad);
    }
  });

  // Add ALL items from ALL carousels
  carousels.forEach(carousel => {
    if (carousel.items && carousel.items.length > 0) {
      carousel.items.forEach(item => {
        if (isDownloadableContent(item)) {
          downloadableItems.push(item);
        }
      });
    }
  });

  console.log(`📦 Total downloadable items: ${downloadableItems.length}`);
  return downloadableItems;
}

/**
 * Download all content upfront (called when MQTT message arrives)
 * @param {Array} ads - All ads
 * @param {Array} carousels - All carousels
 */
async function downloadAllContentUpfront(ads, carousels) {
  console.log('📥 Starting upfront download of ALL content...');

  const allDownloadable = extractAllDownloadableContent(ads, carousels);

  if (allDownloadable.length === 0) {
    console.log('📭 No downloadable content found');
    return [];
  }

  const filenames = allDownloadable.map(item => getFileName(item));

  // Download all files
  for (let i = 0; i < filenames.length; i++) {
    try {
      await checkAndDownloadContent(allDownloadable[i].url, filenames[i]);
    } catch (err) {
      console.error(`❌ Failed to download ${filenames[i]}:`, err);
    }
  }

  console.log(`✅ Upfront download complete: ${filenames.length} files`);
  return filenames;
}
```

#### 6.2 Playback Queue Builder (Schedule-Filtered)
```javascript
/**
 * Build unified playback queue from ads and carousels
 * @param {Array} ads - Array of ad items
 * @param {Array} carousels - Array of carousel objects
 * @returns {Array} Unified playback queue
 */
function buildPlaybackQueue(ads, carousels) {
  console.log('🔨 Building playback queue...');

  // Step 1: Filter ads by schedule
  const validAds = filterScheduledContent(ads);
  console.log(`📺 Valid ads: ${validAds.length}/${ads.length}`);

  // Step 2: Process carousels (filter + pick one item from each)
  const carouselItems = processCarousels(carousels);

  // Step 3: Combine ads + carousel items
  const queue = [...validAds, ...carouselItems];

  console.log(`📋 Playback Queue: ${validAds.length} ads + ${carouselItems.length} carousel items = ${queue.length} total`);

  return queue;
}
```

#### 6.3 Modified handleMQTTAds Function (WITH UPFRONT DOWNLOAD)
```javascript
/**
 * Handle ads from MQTT payload with new content structure
 * @param {Object} payload - MQTT payload with ads, carousels, live_contents
 */
async function handleMQTTAds(payload) {
  const ads = payload.ads || [];
  const carousels = payload.carousels || [];
  const liveContents = payload.liveContents || [];
  const rcs = payload.rcs;
  const placeholder_enabled = payload.placeholder_enabled;
  const rcs_enabled = payload.rcs_enabled;
  const logo_enabled = payload.logo_enabled;

  // Update localStorage
  let old_placeholder_enabled = localStorage.getItem("placeholder_enabled");
  let old_rcs_enabled = localStorage.getItem("rcs_enabled");
  let old_logo_enabled = localStorage.getItem("logo_enabled");

  if (placeholder_enabled !== old_placeholder_enabled) {
    localStorage.setItem("placeholder_enabled", placeholder_enabled);
  }
  if (rcs_enabled !== old_rcs_enabled) {
    localStorage.setItem("rcs_enabled", rcs_enabled);
  }
  if (logo_enabled !== old_logo_enabled) {
    localStorage.setItem("logo_enabled", logo_enabled);
  }

  // Update RCS and logo
  startAdSlide("ad_snippet", rcs, 1, rcs_enabled, logo_enabled);

  // STEP 1: Download ALL content upfront (ads + all carousel items)
  console.log('📥 STEP 1: Downloading ALL content upfront...');
  await downloadAllContentUpfront(ads, carousels);
  console.log('✅ All content downloaded!');

  // STEP 2: Check for active live content
  const activeLive = checkActiveLiveContent(liveContents);
  if (activeLive) {
    console.log("🔴 LIVE CONTENT DETECTED - Switching to live mode");
    await handleLiveContentMode([activeLive], liveContents, ads, carousels);
    return;
  }

  // STEP 3: Normal mode - Build playback queue (schedule-filtered)
  console.log('📺 Normal playback mode');
  const playbackQueue = buildPlaybackQueue(ads, carousels);

  if (playbackQueue.length === 0) {
    console.log("📭 No content to play");
    return;
  }

  // STEP 4: Start playback (no download needed - already done!)
  const filenames = playbackQueue.map((item) => getFileName(item));

  localAds = filenames;
  stopCurrentPlayback();
  adsFromServer = playbackQueue;
  playAllContentInLoop(filenames, playbackQueue, rcs);

  // STEP 5: Start live content monitor
  startLiveContentMonitor(liveContents, ads, carousels);
}
```

---

### PHASE 7: Modified Playback Loop (No Download During Loop)

**File: `js/device-storage.js`**

#### 7.1 Update playAllContentInLoop Function
```javascript
/**
 * Play all content in loop (NO DOWNLOAD - files already downloaded)
 * @param {Array} filenames - Array of filenames to play
 * @param {Array} contentItems - Array of content item objects
 * @param {string} rcs - RCS message
 */
async function playAllContentInLoop(filenames, contentItems, rcs) {
  console.log(`🔁 Starting playback loop`);
  console.log(`📋 Content items: ${filenames.length}`);

  iterator = 0;

  // Abort existing controller
  if (currentAbortController) {
    console.log("🛑 Aborting previous loop...");
    currentAbortController.abort();
    await new Promise((res) => managedSetTimeout(res, 50));
  }

  currentAbortController = new AbortController();
  const signal = currentAbortController.signal;

  if (!filenames || filenames.length === 0) {
    console.error("❌ No content to play.");
    return;
  }

  // Playback loop - NEVER BREAKS for downloading
  while (!signal.aborted) {
    const currentFile = filenames[iterator % filenames.length];
    const currentItem = contentItems[iterator % contentItems.length];

    try {
      // Play downloaded content (video or image)
      if (isVideo(currentFile)) {
        await playVideoWithTracking(currentFile, signal, currentItem, filenames);
      } else {
        await playImageWithTracking(currentFile, signal, currentItem, filenames);
      }
    } catch (err) {
      console.error("❌ Error during media playback:", err.message || err);
    }

    increaseIterator(filenames);
  }

  console.log("🛑 Playback loop terminated.");
}
```

---

### PHASE 8: HTML Structure - Add New Players

**File: `index.html`**

#### 8.1 Add Streaming Players to HTML
```html
<!-- Ad Player Section -->
<div class="ad-player-container">
  <div class="ad-player-container-box">
    <div class="ad-player" id="ad_player">
      <!-- Existing AVPlayers for downloaded content -->
      <object id="av-player" type="application/avplayer" class=""></object>
      <object id="av-player2" type="application/avplayer" class=""></object>

      <!-- Existing Image Players -->
      <img
        id="image-player1"
        style="display: none; width: 100%; height: 100%; object-fit: fill"
      />
      <img
        id="image-player2"
        style="display: none; width: 100%; height: 100%; object-fit: fill"
      />

      <!-- NEW: HLS/M3U8 Player -->
      <video
        id="hls-player"
        style="display: none; width: 100vw; height: 95vh; object-fit: fill; position: absolute; top: 0; left: 0; z-index: 100;"
        autoplay
      ></video>

      <!-- NEW: YouTube Player -->
      <iframe
        id="youtube-player"
        style="display: none; width: 100vw; height: 95vh; position: absolute; top: 0; left: 0; z-index: 100; border: none;"
        allow="autoplay; encrypted-media"
      ></iframe>

      <!-- NEW: Website Player -->
      <iframe
        id="website-player"
        style="display: none; width: 100vw; height: 95vh; position: absolute; top: 0; left: 0; z-index: 100; border: none;"
        allow="autoplay; encrypted-media; fullscreen"
      ></iframe>
    </div>

    <div id="ad_snippet" class="ad-snippet">
      <div id="sliding_text" class="sliding-text"></div>
    </div>
  </div>
</div>

<!-- Logo positioned independently outside RCS container -->
<img src="./icon.png" alt="Logo" class="rcs-logo" id="rcs_logo" />
```

#### 8.2 Add HLS.js Library to HTML
```html
<head>
  <!-- Existing libraries -->
  <script src="lib/navigation/jquery.min.js"></script>
  <script src="lib/navigation/lodash.min.js"></script>

  <!-- NEW: Add HLS.js for M3U8 streaming -->
  <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>

  <!-- Existing app scripts -->
  <script src="js/common.js" type="text/javascript"></script>
  <script src="js/ads.js" type="text/javascript"></script>
  ...
</head>
```

---

### PHASE 9: State Management

**File: `js/device-storage.js`**

#### 9.1 Global State Variables
```javascript
// Playback mode state
let currentPlaybackMode = "normal"; // "normal" or "live"

// Active live content
let activeLiveContent = null;

// Carousel state (tracks last played index per carousel)
let carouselState = {};

// Live content monitor interval
let liveMonitorInterval = null;

// Current playback queue
let currentContentQueue = [];

// Last ad signature for change detection
let lastAdSignature = "";
```

#### 9.2 State Initialization
```javascript
/**
 * Initialize all state on app start
 */
function initContentState() {
  // Load carousel state from localStorage
  initCarouselState();

  // Reset playback mode
  currentPlaybackMode = "normal";
  activeLiveContent = null;

  console.log("✅ Content state initialized");
}

// Call on app start
initContentState();
```

---

### PHASE 10: Backward Compatibility

**File: `js/ads.js` & `js/device-storage.js`**

#### 10.1 Fallback Logic
```javascript
/**
 * Process MQTT payload with backward compatibility
 * @param {Object} data - MQTT payload
 */
function processMQTTPayload(data) {
  // New structure: data.content exists
  if (data.content) {
    console.log("📦 New content structure detected");
    return {
      ads: data.content.ads || [],
      carousels: data.content.carousels || [],
      liveContents: data.content.live_contents || []
    };
  }

  // Old structure: data.ads exists
  if (data.ads) {
    console.log("📦 Old ads structure detected (backward compatible)");
    return {
      ads: data.ads,
      carousels: [],
      liveContents: []
    };
  }

  // No content
  return {
    ads: [],
    carousels: [],
    liveContents: []
  };
}
```

---

## 📊 Playback Flow Diagrams

### Normal Mode Flow (UPDATED)
```
1. Receive MQTT Payload
2. ⬇️ DOWNLOAD ALL CONTENT UPFRONT (ads + all carousel items)
3. Check for Live Content → None
4. Filter Ads by Schedule → [Ad1, Ad2, Ad3]
5. Filter Carousels by Schedule → [Carousel1, Carousel2]
6. Pick Items from Carousels → [C1-Item2, C2-Item1]
7. Build Queue → [Ad1, Ad2, Ad3, C1-Item2, C2-Item1]
8. Start Playback Loop (NO DOWNLOAD - already done!)
9. Monitor for Live Content (every 10s)
```

### Live Mode Flow (UPDATED - NO DOWNLOAD)
```
1. Receive MQTT Payload
2. ⬇️ DOWNLOAD ALL CONTENT UPFRONT (ads + all carousel items)
3. Check for Live Content → Live1 Active!
4. Detect Content Type → M3U8/YouTube/Website
5. Stop Current Playback
6. ❌ DO NOT DOWNLOAD - Stream directly from URL
7. Show appropriate player (HLS/YouTube/iFrame)
8. Play Live Stream
9. Monitor Live Content Status (every 10s)
10. When Live Ends → Resume Normal Mode
```

### Player Selection Flow
```
Content Type Detection:
  .m3u8 URL → HLS Player (HTML5 video + HLS.js)
  youtube.com URL → YouTube iFrame Player
  http/https URL → Website iFrame Player
  .mp4/.mkv/.avi → Tizen AVPlayer (downloaded)
  .jpg/.png → Image Player (downloaded)

Player Visibility:
  Normal Mode → AVPlayer + Image Player visible
  Live Mode (M3U8) → HLS Player visible, others hidden
  Live Mode (YouTube) → YouTube iFrame visible, others hidden
  Live Mode (Website) → Website iFrame visible, others hidden
```

### Carousel Selection Flow
```
Loop 1:
  Carousel1 (4 items) → Last: -1 → Pick: Item 0
  Carousel2 (3 items) → Last: -1 → Pick: Item 0

Loop 2:
  Carousel1 (4 items) → Last: 0 → Pick: Item 1
  Carousel2 (3 items) → Last: 0 → Pick: Item 1

Loop 3:
  Carousel1 (4 items) → Last: 1 → Pick: Item 2
  Carousel2 (3 items) → Last: 1 → Pick: Item 2

Loop 4:
  Carousel1 (4 items) → Last: 2 → Pick: Item 3
  Carousel2 (3 items) → Last: 2 → Pick: Item 0 (round-robin)
```

---

## 🎯 Summary of Changes

### Files to Modify

1. **`index.html`** ⭐ NEW PLAYERS
   - Add HLS video player element
   - Add YouTube iframe player element
   - Add Website iframe player element
   - Add HLS.js library script tag

2. **`js/ads.js`**
   - Update MQTT message handler (lines 73-145)
   - Modify `processAds()` function (lines 250-278)
   - Add backward compatibility logic

3. **`js/device-storage.js`** ⭐⭐ MAJOR CHANGES
   - Add content type detection functions
   - Add schedule validation functions
   - Add carousel state management
   - Add carousel item picker
   - Add live content detection
   - Add upfront download function (download ALL at once)
   - Add playback queue builder
   - Modify `handleMQTTAds()` function (with upfront download)
   - Add live content mode handler (NO download)
   - Add M3U8/HLS player function
   - Add YouTube player function
   - Add Website iframe player function
   - Add player visibility manager
   - Add live content monitor
   - Update `playAllContentInLoop()` function (remove download logic)

4. **`js/deviceMqtt.js`**
   - Update device registration handler
   - Handle new content structure

5. **`js/main.js`**
   - Initialize carousel state on app start
   - Load content state from localStorage

---

## ✅ Key Features

| Feature | Description | Status |
|---------|-------------|--------|
| **Backward Compatible** | Old `ads` array still works | ✅ |
| **Schedule Filtering** | Time slots + weekdays validation | ✅ |
| **Carousel Round-Robin** | One unique item per carousel per loop | ✅ |
| **Live Content Priority** | Interrupts everything when active | ✅ |
| **Live Monitoring** | Auto-resume when live ends | ✅ |
| **Persistent State** | Carousel state saved in localStorage | ✅ |
| **Unified Queue** | Ads + carousel items play together | ✅ |
| **Upfront Downloads** | Download ALL content when MQTT arrives | ✅ |
| **No Loop Breaking** | Loop never breaks for downloading | ✅ |
| **Multi-Player Support** | AVPlayer, HLS, YouTube, Website | ✅ |
| **Streaming Content** | Live content NOT downloaded | ✅ |

---

## 🧪 Testing Scenarios

### Test 1: Normal Mode (Ads + Carousels) - Downloadable Content
```json
{
  "content": {
    "ads": [
      { "ad_id": "1", "url": "https://example.com/ad1.mp4", "time_slots": [{"start": "09:00", "end": "18:00"}] }
    ],
    "carousels": [
      {
        "carousel_id": "c1",
        "items": [
          { "ad_id": "2", "url": "https://example.com/item1.mp4" },
          { "ad_id": "3", "url": "https://example.com/item2.jpg" }
        ]
      }
    ],
    "live_contents": []
  }
}
```
**Expected:**
- ⬇️ Download ad1.mp4, item1.mp4, item2.jpg upfront
- ▶️ Play ad1.mp4, then one item from carousel (round-robin)
- 🔁 Loop never breaks

### Test 2: Live Content Active - M3U8 Stream
```json
{
  "content": {
    "ads": [{ "ad_id": "1", "url": "https://example.com/ad1.mp4" }],
    "carousels": [],
    "live_contents": [
      {
        "ad_id": "live1",
        "url": "https://example.com/stream.m3u8",
        "time_slots": [{"start": "14:00", "end": "15:00"}]
      }
    ]
  }
}
```
**Expected:**
- ⬇️ Download ad1.mp4 upfront
- 🔴 If current time is 14:30, play stream.m3u8 in HLS player
- ❌ Do NOT download stream
- ✅ When live ends, resume playing ad1.mp4

### Test 3: Live Content - YouTube
```json
{
  "content": {
    "ads": [],
    "carousels": [],
    "live_contents": [
      {
        "ad_id": "live2",
        "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "time_slots": [{"start": "10:00", "end": "11:00"}]
      }
    ]
  }
}
```
**Expected:**
- 📺 Show YouTube iframe player
- ▶️ Play YouTube video
- ❌ Do NOT download

### Test 4: Live Content - Website
```json
{
  "content": {
    "ads": [],
    "carousels": [],
    "live_contents": [
      {
        "ad_id": "live3",
        "url": "https://example.com/dashboard",
        "time_slots": [{"start": "08:00", "end": "20:00"}]
      }
    ]
  }
}
```
**Expected:**
- 🌐 Show website iframe
- ▶️ Display website content

### Test 5: Backward Compatibility
```json
{
  "ads": [
    { "ad_id": "1", "url": "https://example.com/ad1.mp4" }
  ]
}
```
**Expected:**
- ⬇️ Download ad1.mp4
- ▶️ Play ad1.mp4 using old structure

### Test 6: Mixed Content Types
```json
{
  "content": {
    "ads": [
      { "ad_id": "1", "url": "https://example.com/ad1.mp4" },
      { "ad_id": "2", "url": "https://example.com/ad2.jpg" }
    ],
    "carousels": [
      {
        "carousel_id": "c1",
        "items": [
          { "ad_id": "3", "url": "https://example.com/c1-item1.mp4" },
          { "ad_id": "4", "url": "https://example.com/c1-item2.png" },
          { "ad_id": "5", "url": "https://example.com/c1-item3.mp4" }
        ]
      },
      {
        "carousel_id": "c2",
        "items": [
          { "ad_id": "6", "url": "https://example.com/c2-item1.jpg" },
          { "ad_id": "7", "url": "https://example.com/c2-item2.mp4" }
        ]
      }
    ],
    "live_contents": []
  }
}
```
**Expected:**
- ⬇️ Download ALL 7 files upfront (2 ads + 5 carousel items)
- ▶️ Play: ad1.mp4 → ad2.jpg → c1-item1.mp4 → c2-item1.jpg
- 🔁 Next loop: ad1.mp4 → ad2.jpg → c1-item2.png → c2-item2.mp4
- 🔁 Next loop: ad1.mp4 → ad2.jpg → c1-item3.mp4 → c2-item1.jpg (round-robin)

---

## 📝 Implementation Checklist

### Phase 1: Payload Parsing
- [ ] Update MQTT message handler in `js/ads.js`
- [ ] Modify `processAds()` function
- [ ] Add backward compatibility logic

### Phase 2: Schedule Validation
- [ ] Add `isWithinTimeSlot()` function
- [ ] Add `isValidWeekday()` function
- [ ] Add `shouldPlayContent()` function
- [ ] Add `filterScheduledContent()` function

### Phase 3: Carousel Management
- [ ] Add carousel state initialization
- [ ] Add `getNextCarouselItem()` function
- [ ] Add `processCarousels()` function
- [ ] Add carousel state persistence

### Phase 4: Content Type Detection
- [ ] Add `detectContentType()` function
- [ ] Add `isDownloadableContent()` function
- [ ] Add `isStreamingContent()` function

### Phase 5: Live Content System
- [ ] Add `checkActiveLiveContent()` function
- [ ] Add `handleLiveContentMode()` function
- [ ] Add `playLiveContentStream()` function
- [ ] Add `playM3U8Stream()` function
- [ ] Add `playYouTubeStream()` function
- [ ] Add `extractYouTubeVideoId()` function
- [ ] Add `playWebsiteStream()` function
- [ ] Add `hideAllPlayers()` function
- [ ] Add `showNormalPlayers()` function
- [ ] Add live content monitor

### Phase 6: Upfront Download System
- [ ] Add `extractAllDownloadableContent()` function
- [ ] Add `downloadAllContentUpfront()` function
- [ ] Modify `handleMQTTAds()` to download upfront
- [ ] Add playback queue builder

### Phase 7: Modified Playback Loop
- [ ] Update `playAllContentInLoop()` to remove download logic
- [ ] Ensure loop never breaks for downloading

### Phase 8: HTML Structure
- [ ] Add HLS video player element to `index.html`
- [ ] Add YouTube iframe player element
- [ ] Add Website iframe player element
- [ ] Add HLS.js library script tag

### Phase 9: State Management
- [ ] Add global state variables
- [ ] Add state initialization function
- [ ] Initialize on app start

### Phase 10: Backward Compatibility
- [ ] Add `processMQTTPayload()` function
- [ ] Test with old payload structure

### Testing
- [ ] Test: Normal mode with ads + carousels
- [ ] Test: Live content - M3U8 stream
- [ ] Test: Live content - YouTube
- [ ] Test: Live content - Website
- [ ] Test: Backward compatibility
- [ ] Test: Mixed content types
- [ ] Test: Carousel rotation
- [ ] Test: Schedule filtering
- [ ] Test: Live content interruption
- [ ] Test: Live content resume to normal

---

## 🚀 Next Steps

1. ✅ Review this implementation flow
2. Confirm approach and logic with user
3. Begin implementation phase by phase:
   - Start with HTML structure (add new players)
   - Add content type detection
   - Add upfront download system
   - Add live content players
   - Modify playback loop
   - Add carousel management
   - Add schedule validation
   - Add live content monitoring
4. Test each phase independently
5. Integration testing with all scenarios
6. Deploy to production

---

## 🎯 Key Differences from Original Flow

| Aspect | Original Flow | Updated Flow |
|--------|---------------|--------------|
| **Download Timing** | During playback loop | Upfront when MQTT arrives |
| **Loop Breaking** | Breaks for downloads | Never breaks |
| **Live Content** | Downloaded | Streamed directly (NOT downloaded) |
| **Player Types** | AVPlayer + Image only | AVPlayer + Image + HLS + YouTube + iFrame |
| **Content Detection** | File extension only | URL-based type detection |
| **Carousel Downloads** | Only scheduled items | ALL items upfront |

---

## ⚠️ Important Notes

1. **HLS.js Library**: Must be included in `index.html` for M3U8 streaming
2. **Tizen Compatibility**: Test HLS.js on Tizen TV - may need alternative for native HLS support
3. **YouTube iFrame**: Requires internet connection and YouTube API access
4. **Website iFrame**: May have CORS issues with some websites
5. **Download All Upfront**: May take time if many carousel items - show loading indicator
6. **Storage Space**: Ensure sufficient storage for all downloaded content
7. **Live Content Priority**: Always interrupts normal playback immediately
8. **Carousel State**: Persisted in localStorage - survives app restarts

---

**Document Version:** 2.0 (UPDATED)
**Last Updated:** 2025-12-11
**Author:** Augment Agent
**Changes:** Added multi-player support, upfront download, streaming content handling

