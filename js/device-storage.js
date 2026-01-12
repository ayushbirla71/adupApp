// Tizen Ad Loop Player - Handles large video downloads & async loading

const fileDir = "downloads/subDir";
var localAds = []; // Tracks local ad filenames
let adsFromServer = []; // Tracks ads from MQTT
let adLoopTimeouts = []; // 🔁 To track all timeouts
let currentVideo = null; // 🔇 To track currently playing video
let lastAdSignature = ""; // For checking ad updates
let liveMonitorInterval = null;
let currentPlaybackMode = "normal"; // "normal" or "live"
// Active live content
let activeLiveContent = null;
// Global carousel state - tracks last played index for each carousel
let carouselState = {};

// Current playback queue
let currentContentQueue = [];
var p1, p2;
var iterator = 0;
// Remove global element references - get them when needed instead
// var imageElement1 = document.getElementById("image-player1");
// var imageElement2 = document.getElementById("image-player2");

//////updated ////

const YOUTUBE_CONFIG = {
  // Test YouTube live stream URL - your testing link
  testLiveUrl: "https://www.youtube.com/live/1wECsnGZcfc?si=3V_BjgrcYGzIbEzK",
  embedBaseUrl: "https://www.youtube.com/live/",
  autoplay: 1,
  mute: 0,
  controls: 0,
  showinfo: 0,
  rel: 0,
  modestbranding: 1,
  iv_load_policy: 3,
};


let useImage1 = true;
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

// Comment out regular players for YouTube live testing
// p1 = webapis.avplaystore.getPlayer();
// p2 = webapis.avplaystore.getPlayer();

// Initialize players only when not using YouTube live mode
function initializeRegularPlayers() {
  if (!window.isYoutubeLiveMode) {
    p1 = webapis.avplaystore.getPlayer();
    p2 = webapis.avplaystore.getPlayer();
    logInfo("🎥 Regular video players initialized");
  }
}


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

// Test function for YouTube live player
function testYouTubePlayback() {
  logInfo("🔴 Testing YouTube Live Player...");

  // Test YouTube URL - you can replace this with your testing link
  const testUrl =
    "https://www.youtube.com/live/lj-FQ6ynmek?si=Yvd0pgkhr5xlx4wj"; // LoFi Hip Hop 24/7

  const testSignal = new AbortController().signal;
  const testAd = { duration: 3600 }; // 15 seconds for testing

  if (window.playYouTubeLive) {
    return window.playYouTubeLive(testUrl, testSignal, testAd);
  } else {
    logError("YouTube Live Player not available");
    return Promise.resolve();
  }
}

// Make test function globally available
window.testYouTubePlayback = testYouTubePlayback;
window.initializeRegularPlayers = initializeRegularPlayers;

function increaseIterator(x) {
  iterator++;
  if (iterator >= x.length) {
    iterator = 0;
  }
  //console.log("Current iterator value: " + iterator);
}

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


/**
 * Check if content should play based on schedule
 * @param {Object} item - Content item with time_slots and weekdays
 * @returns {boolean}
 */
function shouldPlayContent(item) {
  if (!item) return false;
  console.log("Checking if content should play:", item);
  
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

/**
 * Filter content array based on scheduling rules
 * @param {Array} contentArray - Array of content items
 * @returns {Array} Filtered content that should play now
 */
function filterScheduledContent(contentArray) {
  if (!contentArray || contentArray.length === 0) return [];
  
  return contentArray.filter(item => shouldPlayContent(item));
}

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

/**
 * Detect content type from URL
 * @param {string} url - Content URL
 * @returns {string} Content type: 'video', 'image', 'm3u8', 'youtube', 'website'
 */
function detectContentType(url) {
  if (!url) return "unknown";

  const cleanUrl = url.split("?")[0].toLowerCase();

  // Streaming (HLS)
  if (cleanUrl.endsWith(".m3u8")) return "m3u8";

  // YouTube
  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    return "youtube";
  }

  // Video files
  if (
    cleanUrl.endsWith(".mp4") ||
    cleanUrl.endsWith(".mkv") ||
    cleanUrl.endsWith(".avi") ||
    cleanUrl.endsWith(".webm")
  ) {
    return "video";
  }

  // Image files
  if (
    cleanUrl.endsWith(".jpg") ||
    cleanUrl.endsWith(".jpeg") ||
    cleanUrl.endsWith(".png") ||
    cleanUrl.endsWith(".gif")
  ) {
    return "image";
  }

  // Website fallback
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return "website";
  }

  return "unknown";
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



/**
 * Play YouTube video using iFrame API
 * @param {Object} liveItem - Live content item
 */
// function playYouTubeStream(liveItem) {
//   console.log('📺 Playing YouTube stream:', liveItem.url);

//   // Extract YouTube video ID
//   const videoId = extractYouTubeVideoId(liveItem.url);
//   if (!videoId) {
//     console.error('❌ Invalid YouTube URL');
//     return;
//   }

//   // Get or create YouTube iframe
//   let iframe = document.getElementById('youtube-player');
//   if (!iframe) {
//     iframe = document.createElement('iframe');
//     iframe.id = 'youtube-player';
//     iframe.style.cssText = 'width: 100vw; height: 95vh; position: absolute; top: 0; left: 0; z-index: 100; border: none;';
//     iframe.allow = 'autoplay; encrypted-media';
//     document.getElementById('ad_player').appendChild(iframe);
//   }

//   iframe.style.display = 'block';
//   iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0&showinfo=0&rel=0&modestbranding=1`;

//   console.log('✅ YouTube player loaded');
// }

function playYouTubeStream(liveItem) {
  console.log("📺 Playing YouTube live:", liveItem.url);

  // const videoId = extractYouTubeVideoId(liveItem.url);
  const videoId = extractYouTubeVideoId(YOUTUBE_CONFIG.testLiveUrl);
  if (!videoId) {
    console.error("❌ Invalid YouTube LIVE URL");
    return;
  }

  console.log("videoId:", videoId);

  let iframe = document.getElementById("youtube-player");
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "youtube-player";
    iframe.style.cssText =
      "width:100vw;height:95vh;position:absolute;top:0;left:0;z-index:100;border:none;";
    iframe.allow = "autoplay; encrypted-media";
    iframe.allowFullscreen = true;
    document.getElementById("ad_player").appendChild(iframe);
  }

  // const autoplay = liveItem.config?.autoplay ? 1 : 0;
  // const mute = liveItem.config?.mute ? 1 : 0;

   // Build embed URL
      const embedUrl = buildYouTubeEmbedUrl(videoId);


      iframe.src = embedUrl;
      console.log("embedUrl:", embedUrl);
      iframe.style.display = "block";

  console.log("✅ YouTube LIVE player loaded");
}


/**
 * Build YouTube embed URL with parameters
 */
function buildYouTubeEmbedUrl(videoId) {
  const params = new URLSearchParams({
    autoplay: YOUTUBE_CONFIG.autoplay,
    mute: YOUTUBE_CONFIG.mute,
    controls: YOUTUBE_CONFIG.controls,
    showinfo: YOUTUBE_CONFIG.showinfo,
    rel: YOUTUBE_CONFIG.rel,
    modestbranding: YOUTUBE_CONFIG.modestbranding,
    iv_load_policy: YOUTUBE_CONFIG.iv_load_policy,
    enablejsapi: 1,
    origin: window.location.origin,
  });

  return `${YOUTUBE_CONFIG.embedBaseUrl}${videoId}?${params.toString()}`;
}

/**
 * Extract YouTube video ID from URL
 * @param {string} url - YouTube URL
 * @returns {string|null} Video ID
 */
// function extractYouTubeVideoId(url) {
//   const patterns = [
//     /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
//     /youtube\.com\/embed\/([^&\n?#]+)/
//   ];

//   for (const pattern of patterns) {
//     const match = url.match(pattern);
//     if (match && match[1]) {
//       return match[1];
//     }
//   }

//   return null;
// }

/**
 * Extract YouTube video ID from various URL formats
 */
function extractYouTubeVideoId(url) {
  // Handle different YouTube URL formats
  let videoId = null;

  // Standard watch URL: youtube.com/watch?v=VIDEO_ID
  let regExp =
    /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  let match = url.match(regExp);
  if (match && match[7].length === 11) {
    videoId = match[7];
  }

  // Live URL format: youtube.com/live/VIDEO_ID (with optional parameters)
  if (!videoId) {
    regExp = /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/;
    match = url.match(regExp);
    if (match && match[1]) {
      videoId = match[1];
    }
  }

  // Handle live URLs with parameters: youtube.com/live/VIDEO_ID?si=...
  if (!videoId) {
    regExp = /youtube\.com\/live\/([a-zA-Z0-9_-]+)/;
    match = url.match(regExp);
    if (match && match[1]) {
      // Use the full extracted ID (YouTube live IDs can be different lengths)
      videoId = match[1];
    }
  }

  // Short URL: youtu.be/VIDEO_ID
  if (!videoId) {
    regExp = /youtu\.be\/([a-zA-Z0-9_-]{11})/;
    match = url.match(regExp);
    if (match && match[1]) {
      videoId = match[1];
    }
  }

  // Debug logging
  if (videoId) {
    logInfo("🔴 Extracted video ID:", videoId, "from URL:", url);
  } else {
    logError("🔴 Failed to extract video ID from URL:", url);
  }

  return videoId;
}




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
  console.log('ALL DOWNLOADABLE: ', allDownloadable);

  if (allDownloadable.length === 0) {
    console.log('📭 No downloadable content found');
    return [];
  }

  const filenames = allDownloadable.map(item => getFileName(item));

    await cleanUpOldAds(filenames);
    logCleanup("Cleanup done!");
    console.log("Filenames: Cleaned up old ads");
    console.log("Filenames: ", filenames);

  // Download all files
  for (let i = 0; i < filenames.length; i++) {
    try {
      console.log(`📥 Downloading ${filenames[i]}...`);
      await checkAndDownloadContent(allDownloadable[i].url, filenames[i]);
    } catch (err) {
      console.error(`❌ Failed to download ${filenames[i]}:`, err);
    }
  }

  console.log(`✅ Upfront download complete: ${filenames.length} files`);
  return filenames;
}


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

// 📥 Handle ads from MQTT payload
// async function handleMQTTAds(payload) {
//   const ads = payload.ads;
//   const rcs = payload.rcs;
//   const placeholder_enabled = payload.placeholder_enabled;
//   const rcs_enabled = payload.rcs_enabled;
//   const logo_enabled = payload.logo_enabled;

//   let old_placeholder_enabled = localStorage.getItem("placeholder_enabled");
//   let old_rcs_enabled = localStorage.getItem("rcs_enabled");
//   let old_logo_enabled = localStorage.getItem("logo_enabled");
//   console.log("📥 Received ads:", ads);

//   if (placeholder_enabled !== old_placeholder_enabled) {
//     localStorage.setItem("placeholder_enabled", placeholder_enabled);
//   }
//   if (rcs_enabled !== old_rcs_enabled) {
//     localStorage.setItem("rcs_enabled", rcs_enabled);
//   }
//   if (logo_enabled !== old_logo_enabled) {
//     localStorage.setItem("logo_enabled", logo_enabled);
//   }

//   const filenames = ads.map((ad) => getFileName(ad));
//   const newSignature = filenames.join(",");

//   console.log("rcs_enabled", rcs_enabled);
//   console.log("logo_enabled", logo_enabled);
//   console.log("placeholder_enabled", placeholder_enabled);
//   startAdSlide("ad_snippet", rcs, 1, rcs_enabled, logo_enabled);

//   console.log("placeholderUpdate:", payload.placeholderUpdate);

//   if (newSignature === lastAdSignature && !payload.placeholderUpdate) {
//     console.log("📭 No ad changes. Skipping update.");
//     return;
//   }

//   lastAdSignature = newSignature;

//   try {
//     await cleanUpOldAds(filenames);
//     logCleanup("Cleanup done!");

//     // Download all files first (sequential or parallel)
//     for (let i = 0; i < filenames.length; i++) {
//       await checkAndDownloadContent(ads[i].url, filenames[i]);
//     }
//     logDownload("All downloads complete, starting playback");
//     localAds = filenames;
//     stopCurrentPlayback(); // 💥 Stop current playback first
//     adsFromServer = ads;
//     playAllContentInLoop(filenames, ads, rcs);
//     // document.getElementById("ad_player").innerHTML = ""; // Clear previous content
//   } catch (err) {
//     logError("Error in ad handling:", err.message || err);
//   }
// }



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

function getFileName(adsData) {
  let url = adsData.url;
  let ad_id = adsData.ad_id;

  const originalName = url.substring(url.lastIndexOf("/") + 1).split("?")[0];
  const dotIndex = originalName.lastIndexOf(".");

  if (dotIndex === -1) {
    console.log("no extension found", originalName);
    return ad_id
      ? `${originalName}_${ad_id}.${adsData.file_extension}`
      : originalName + "." + adsData.file_extension;
  }

  const nameWithoutExt = originalName.substring(0, dotIndex);
  const extension =
    originalName.substring(dotIndex) || adsData.file_extension || "mp4";

  if (nameWithoutExt.startsWith("placeholder")) {
    //console.log("data in placehoder", adsData);
    return `${nameWithoutExt}_${adsData?.timestamp}${extension}`;
  }

  console.log("final name", `${nameWithoutExt}_${ad_id}${extension}`);
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
          // Set custom HTTP headers (e.g., Authorization, Content-Type)
          request.httpHeader = {
            "x-player-width": window.DEVICE_WIDTH,
          };
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

  // Abort all active proof of play tracking sessions
  if (window.proofOfPlayTracker) {
    window.proofOfPlayTracker.abortAllActiveTracking("new_content_loaded");
  }

  try {
    p1.stop();
  } catch (e) {
    console.warn("Error stopping p1:", e);
  }

  try {
    p2.stop();
  } catch (e) {
    console.warn("Error stopping p2:", e);
  }

  adLoopTimeouts.forEach(clearTimeout);
  adLoopTimeouts = [];

  const imageElement1 = document.getElementById("image-player1");
  const imageElement2 = document.getElementById("image-player2");
  if (imageElement1) imageElement1.style.display = "none";
  if (imageElement2) imageElement2.style.display = "none";
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
    // $(".login_loader").hide();
    const imageElement1 = document.getElementById("image-player1");
    const imageElement2 = document.getElementById("image-player2");

    if (!imageElement1 || !imageElement2) {
      console.error("❌ Image elements not found in DOM");
      addErrorLog("Image elements not found in DOM");
      resolve();
      return;
    }

    let imgElement = useImage1 ? imageElement1 : imageElement2;
    let otherImgElement = useImage1 ? imageElement2 : imageElement1;
    var videoElement1 = document.getElementById("av-player");
    var videoElement2 = document.getElementById("av-player2");

    // Hide videos
    videoElement1.classList.remove("vid");
    videoElement2.classList.remove("vid");
    imgElement.style.display = "block";
    otherImgElement.style.display = "none";
    // Show image

    imgElement.onerror = function () {
      imgElement.style.display = "none";
      // $(".login_loader").show();
      resolve();
      console.error("❌ Error loading image:", file);
    };
    //console.log("image_url " + sources + "/" + file);
    //console.log("🖼️ Displaying image:", adsFromServer[iterator]);
    let image_url = sources + "/" + file;
    // if (file.startsWith("placeholder")) {
    //   image_url = image_url + "?v=" + new Date().getTime(); // cache buster
    // }
    imgElement.src = image_url; // ✅ use updated URL
  } catch (err) {
    addErrorLog(" Error preparing or Image file:", err.message || err);
    resolve();
  }
}

let timeoutBox = null;

function playImage(file, signal, currentAd) {
  return new Promise((resolve) => {
    if (timeoutBox) {
      clearTimeout(timeoutBox);
      timeoutBox = null;
    }
    document.getElementById("av-player").classList.remove("vid");
    document.getElementById("av-player2").classList.remove("vid");
    showImage(file, resolve); // your own image render logic

    timeoutBox = managedSetTimeout(() => {
      if (!signal.aborted) {
        logVideo("Image display complete:", file);
        resolve();
      }
    }, currentAd?.duration * 1000 || 10000); // 10 seconds per image

    // signal.addEventListener("abort", () => {
    //   clearTimeout(timeout);
    //   console.log("🛑 Aborted during image");
    //   resolve();
    // });
  });
}

let currentAbortController = null;

// async function playAllContentInLoop(filenames, ads, rcs) {
//   logCleanup("Cleaning previous timeouts and DOM...");
//   addInfoLog("🔁 Re-Start the Loop.....");
//   logInfo("Loaded ads list in localAds", localAds);
//   logInfo("Loaded ads in filenames", filenames);
//   iterator = 0;

//   // 🛑 Abort existing controller and wait for it to settle
//   if (currentAbortController) {
//     logInfo("Aborting previous loop...");
//     currentAbortController.abort();

//     // Wait a short time to let pending image/video resolves finish
//     await new Promise((res) => managedSetTimeout(res, 50));
//   }

//   currentAbortController = new AbortController();
//   const signal = currentAbortController.signal;

//   if (!filenames || filenames.length === 0) {
//     addErrorLog("❌ No content to play.");
//     return;
//   }

//   //   if (localAds.length !== filenames.length) {
//   //     localAds = filenames;
//   //     iterator = 0;
//   //   }

//   while (!signal.aborted) {
//     const currentFile = filenames[iterator % filenames.length];
//     const currentAd = ads[iterator % ads.length];
//     //console.log("▶️ Now playing: " + currentFile);
//     //console.log("playing index...." + iterator);
//     //console.log("Playing Index is " + (iterator % filenames.length));
//     // $(".login_loader").hide();

//     const imageElement1 = document.getElementById("image-player1");
//     const imageElement2 = document.getElementById("image-player2");
//     let imgElement = useImage1 ? imageElement1 : imageElement2;
//     let otherImgElement = useImage1 ? imageElement2 : imageElement1;
//     try {
//       if (isVideo(currentFile)) {
//         console.log(
//           "🎥 Displaying video:",
//           adsFromServer[iterator % adsFromServer.length]
//         );
//         let nexIndex = iterator + 1 >= filenames.length ? 0 : iterator + 1;
//         if (!isVideo(filenames[nexIndex]) && imgElement) {
//           //console.log("next content is show...");
//           //console.log("imagess", imgElement);
//           //console.log("image1", imageElement1);
//           //console.log("image2", imageElement2);
//           // imgElement.src = sources + "/" + filenames[nexIndex];
//         }
//         await playVideoWithTracking(currentFile, signal, currentAd, filenames);
//       } else {
//         await playImageWithTracking(currentFile, signal, currentAd, filenames);
//         // imgElement.style.display = "none";
//         //useImage1 = !useImage1;
//       }
//     } catch (err) {
//       console.error("❌ Error during media playback:", err.message || err);
//       addErrorLog("Media playback error: " + (err.message || err));
//     }
//     increaseIterator(filenames);
//   }

//   console.log("🛑 Playback loop terminated.");
// }

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
function getRotationValue() {
  const orientationType = screen.orientation.type;
  console.log("orrrr", orientationType);

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

// Wrapper functions with proof of play tracking
async function playVideoWithTracking(file, signal, currentAd, filenames) {
  let trackingId = null;

  try {
    // Start tracking
    if (window.proofOfPlayTracker && currentAd) {
      trackingId = window.proofOfPlayTracker.startTracking(currentAd, "video");
    }

    // Add playback started event
    if (trackingId) {
      window.proofOfPlayTracker.addPlaybackEvent(
        trackingId,
        "PLAYBACK_STARTED",
        {
          fileName: file,
          expectedDuration: currentAd?.duration,
        }
      );
    }

    // Call original playVideo function
    await playVideo(file, signal, currentAd, trackingId, filenames);

    // End tracking on successful completion
    if (trackingId) {
      window.proofOfPlayTracker.endTracking(trackingId, "completed");
    }
  } catch (error) {
    logError("Enhanced video playback failed:", error);
    if (trackingId) {
      window.proofOfPlayTracker.endTracking(trackingId, "error");
    }
    throw error;
  }
}

async function playImageWithTracking(file, signal, currentAd, filenames) {
  let trackingId = null;

  try {
    // Start tracking
    if (window.proofOfPlayTracker && currentAd) {
      trackingId = window.proofOfPlayTracker.startTracking(currentAd, "image");
    }

    // Add display event
    if (trackingId) {
      window.proofOfPlayTracker.addPlaybackEvent(
        trackingId,
        "IMAGE_DISPLAY_STARTED",
        {
          fileName: file,
        }
      );
    }

    // Call original playImage function
    await playImage(file, signal, currentAd);

    // End tracking
    if (trackingId) {
      window.proofOfPlayTracker.endTracking(trackingId, "completed");
    }
  } catch (error) {
    logError("Enhanced image playback failed:", error);
    if (trackingId) {
      window.proofOfPlayTracker.endTracking(trackingId, "error");
    }
    throw error;
  }
}

function playVideo(file, signal, currentAd, trackingId = null, filenames) {
  return new Promise((resolve, reject) => {
    let aborted = false;
    let hasStarted = false;
    let timeoutFallback = null;

    try {
      // Check if this is a YouTube live stream URL
      if (window.isYouTubeUrl && window.isYouTubeUrl(file)) {
        logInfo("🔴 Detected YouTube URL, using YouTube Live Player:", file);
        return window
          .playYouTubeLive(file, signal, currentAd)
          .then(resolve)
          .catch(reject);
      }

      // Initialize regular players if not already done
      if (!p1 || !p2) {
        initializeRegularPlayers();
      }

      const player = useP1Next ? p1 : p2;
      const otherPlayer = useP1Next ? p2 : p1;

      useP1Next = !useP1Next;
      try {
        otherPlayer.stop?.();
      } catch {}
      try {
        player.stop?.();
      } catch (error) {
        //console.log("player close....", error?.message);
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
        //console.log("The media has finished preparing");
        player.setVideoStillMode("false");
        const imageElement1 = document.getElementById("image-player1");
        document.getElementById("image-player1").style.display = "none";
        document.getElementById("image-player2").style.display = "none";
        document.getElementById("av-player").classList.add("vid");
        document.getElementById("av-player2").classList.add("vid");
        player.play();
        const currentFile = filenames[iterator % filenames.length];
        let nexIndex = iterator + 1 >= filenames.length ? 0 : iterator + 1;
        if (!isVideo(filenames[nexIndex]) && imageElement1) {
          imageElement1.src = sources + "/" + filenames[nexIndex];
        }
        //console.log("🎞️ Playing video:", file);
        let state = player.getState();
        //console.log("[Player][seekBackward] state 1: ", state);
      };

      let errorCallback = function () {
        //console.log("The media has failed to prepare");
        addErrorLog("Video playback error: Failed to prepare media");
        player.stop();
        clearTimeout(timeoutFallback);
        resolve();
      };

      const dynamicListener = {
        onbufferingstart: () => {
          //console.log("⏳ Buffering start.");
        },
        onbufferingprogress: function (percent) {
          //console.log("Buffering progress data : " + percent);
        },
        onbufferingcomplete: function () {
          //console.log("✅ Buffering complete");
          hasStarted = true;

          // Add tracking event for buffering complete
          if (trackingId && window.proofOfPlayTracker) {
            window.proofOfPlayTracker.addPlaybackEvent(
              trackingId,
              "BUFFERING_COMPLETE"
            );
          }
        },
        oncurrentplaytime: function (currentTime) {
          let state = player.getState();
          //console.log("[Player][seekBackward] state 2: ", state);
          if (state === "PLYING") {
            if (!timeoutFallback) {
              timeoutFallbackHandler();
            }
          }
          //console.log("Current playtime: " + currentTime);
        },
        onstreamcompleted: () => {
          if (!aborted) {
            //console.log("🎞️ Stream completed:", file);

            // Add tracking event for stream completion
            if (trackingId && window.proofOfPlayTracker) {
              window.proofOfPlayTracker.addPlaybackEvent(
                trackingId,
                "STREAM_COMPLETED"
              );
            }

            player.setVideoStillMode("true"); // Turn on still mode to keep last frame
            player.stop();
            clearTimeout(timeoutFallback);
            resolve();
          } else {
            console.log(
              "🛑 Aborted during stream completion, stopping player."
            );

            // Add tracking event for aborted completion
            if (trackingId && window.proofOfPlayTracker) {
              window.proofOfPlayTracker.addPlaybackEvent(
                trackingId,
                "STREAM_ABORTED"
              );
            }

            player.stop();
            clearTimeout(timeoutFallback);
            resolve();
          }
        },

        onevent: function (eventType, eventData) {
          //console.log("event type: " + eventType + ", data: " + eventData);
        },

        onerror: (errType) => {
          if (!aborted) {
            console.error("❌ Playback error:", errType);
            addErrorLog("Playback error: " + errType);

            // Add tracking event for playback error
            if (trackingId && window.proofOfPlayTracker) {
              window.proofOfPlayTracker.addPlaybackEvent(
                trackingId,
                "PLAYBACK_ERROR",
                {
                  errorType: errType,
                }
              );
            }

            player.stop();
            clearTimeout(timeoutFallback);
            resolve();
          } else {
            console.log("🛑 Aborted during error handling, stopping player.");

            // Add tracking event for aborted error handling
            if (trackingId && window.proofOfPlayTracker) {
              window.proofOfPlayTracker.addPlaybackEvent(
                trackingId,
                "ERROR_ABORTED",
                {
                  errorType: errType,
                }
              );
            }

            player.stop();
            clearTimeout(timeoutFallback);
            resolve();
          }
        },
      };

      player.open(sources + "/" + file);
      player.setListener(dynamicListener);
      // player.setDisplayRotation("PLAYER_DISPLAY_ROTATION_90");
      const rotation = getRotationValue();
      console.log("outpeee", rotation);
      player.setDisplayRotation(rotation);
      // player.setDisplayRect(0, 0, 1080, 1824);

      console.log("rcs_enabled", localStorage.getItem("rcs_enabled"));
      let height =
        localStorage.getItem("rcs_enabled") == "true"
          ? window.innerHeight - 40
          : window.innerHeight;
      player.setDisplayRect(0, 0, window.innerWidth, height);
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
  logCleanup("Unloading... cleaning up");

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
    logWarn("Player cleanup failed:", e);
  }

  // 4. Perform complete memory cleanup
  if (window.performMemoryCleanup) {
    window.performMemoryCleanup();
  }

  // 4. Clear image display
  const img1 = document.getElementById("image-player1");
  if (img1) {
    img1.src = "";
    img1.style.display = "none";
  }
  const img2 = document.getElementById("image-player2");
  if (img2) {
    img2.src = "";
    img2.style.display = "none";
  }

  // 5. Optional: remove listeners on players if any (safety)
  p1 && p1.setListener(null);
  p2 && p2.setListener(null);

  console.log("✅ Cleanup complete");
});
