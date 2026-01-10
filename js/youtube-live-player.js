// YouTube Live Player Module for Tizen TV
// Handles YouTube live stream playback with fallback to regular video player

let youtubePlayer = null;
let isYoutubeLiveMode = false;
let youtubePlayerReady = false;
let currentYoutubeUrl = "";

// Configuration
const YOUTUBE_CONFIG = {
  // Test YouTube live stream URL - your testing link
  testLiveUrl: "https://www.youtube.com/live/1wECsnGZcfc?si=3V_BjgrcYGzIbEzK",
  embedBaseUrl: "https://www.youtube.com/embed/",
  autoplay: 1,
  mute: 0,
  controls: 0,
  showinfo: 0,
  rel: 0,
  modestbranding: 1,
  iv_load_policy: 3,
};

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
 * Initialize YouTube Live Player
 */
function initializeYouTubeLivePlayer() {
  logInfo("🔴 Initializing YouTube Live Player");

  youtubePlayer = document.getElementById("youtube-player");

  if (!youtubePlayer) {
    logError("YouTube player element not found");
    return false;
  }

  // Add event listeners for iframe
  youtubePlayer.addEventListener("load", () => {
    youtubePlayerReady = true;
    logInfo("🔴 YouTube player iframe loaded");
  });

  youtubePlayer.addEventListener("error", (error) => {
    logError("YouTube player error:", error);
    fallbackToRegularPlayer();
  });

  return true;
}

/**
 * Play YouTube Live Stream
 */
function playYouTubeLive(url, signal, currentAd) {
  return new Promise((resolve, reject) => {
    logInfo("🔴 Starting YouTube Live playback:", url);

    try {
      const videoId = extractYouTubeVideoId(url);

      if (!videoId) {
        logError("Invalid YouTube URL:", url);
        fallbackToRegularPlayer();
        resolve();
        return;
      }

      // Hide other players
      hideAllPlayers();

      // Build embed URL
      const embedUrl = buildYouTubeEmbedUrl(videoId);
      currentYoutubeUrl = embedUrl;

      // Set iframe source
      youtubePlayer.src = embedUrl;
      youtubePlayer.style.display = "block";

      logInfo("🔴 YouTube Live player started with URL:", embedUrl);

      // Set timeout for live stream duration (if specified)
      const duration = currentAd?.duration || 30; // Default 30 seconds for testing
      const timeout = setTimeout(() => {
        if (!signal.aborted) {
          logInfo("🔴 YouTube Live playback duration completed");
          stopYouTubeLive();
          resolve();
        }
      }, duration * 1000);

      // Handle abort signal
      signal.addEventListener("abort", () => {
        clearTimeout(timeout);
        stopYouTubeLive();
        resolve();
      });

      // Mark as ready
      isYoutubeLiveMode = true;
    } catch (error) {
      logError("Error starting YouTube Live:", error);
      fallbackToRegularPlayer();
      resolve();
    }
  });
}

/**
 * Stop YouTube Live Player
 */
function stopYouTubeLive() {
  logInfo("🔴 Stopping YouTube Live player");

  if (youtubePlayer) {
    youtubePlayer.src = "about:blank";
    youtubePlayer.style.display = "none";
  }

  isYoutubeLiveMode = false;
  youtubePlayerReady = false;
  currentYoutubeUrl = "";
}

/**
 * Hide all video players
 */
function hideAllPlayers() {
  // Hide regular video players
  document.getElementById("av-player").classList.remove("vid");
  document.getElementById("av-player2").classList.remove("vid");

  // Hide image players
  document.getElementById("image-player1").style.display = "none";
  document.getElementById("image-player2").style.display = "none";

  // Hide YouTube player initially
  if (youtubePlayer) {
    youtubePlayer.style.display = "none";
  }
}

/**
 * Fallback to regular video player
 */
function fallbackToRegularPlayer() {
  logInfo("🔴 Falling back to regular video player");
  stopYouTubeLive();

  // Show regular players
  document.getElementById("av-player").classList.add("vid");
  document.getElementById("av-player2").classList.add("vid");
}

/**
 * Check if URL is a YouTube live stream
 */
function isYouTubeUrl(url) {
  return (
    url &&
    (url.includes("youtube.com") ||
      url.includes("youtu.be") ||
      url.toLowerCase().includes("youtube"))
  );
}

/**
 * Test YouTube Live Player with default URL
 */
function testYouTubeLivePlayer(customUrl = null, duration = 10) {
  const testUrl = customUrl || YOUTUBE_CONFIG.testLiveUrl;
  logInfo("🔴 Testing YouTube Live Player with stream:", testUrl);

  const testSignal = new AbortController().signal;
  const testAd = { duration: duration }; // Duration in seconds

  return playYouTubeLive(testUrl, testSignal, testAd);
}

/**
 * Test with your custom YouTube URL
 * Usage: testCustomYouTube("https://www.youtube.com/watch?v=YOUR_VIDEO_ID", 30)
 */
function testCustomYouTube(url, duration = 30) {
  logInfo("🔴 Testing custom YouTube URL:", url);
  return testYouTubeLivePlayer(url, duration);
}

/**
 * Debug URL parsing
 */
function debugYouTubeUrl(url) {
  logInfo("🔍 Debugging YouTube URL:", url);
  const videoId = extractYouTubeVideoId(url);
  logInfo("🔍 Extracted video ID:", videoId);

  if (videoId) {
    const embedUrl = buildYouTubeEmbedUrl(videoId);
    logInfo("🔍 Generated embed URL:", embedUrl);
  }

  return videoId;
}

// Initialize when DOM is ready
if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    initializeYouTubeLivePlayer();
  });
}

// Export functions for global access
window.initializeYouTubeLivePlayer = initializeYouTubeLivePlayer;
window.playYouTubeLive = playYouTubeLive;
window.stopYouTubeLive = stopYouTubeLive;
window.isYouTubeUrl = isYouTubeUrl;
window.testYouTubeLivePlayer = testYouTubeLivePlayer;
window.testCustomYouTube = testCustomYouTube;
window.debugYouTubeUrl = debugYouTubeUrl;
window.hideAllPlayers = hideAllPlayers;

logInfo("🔴 YouTube Live Player module loaded");
