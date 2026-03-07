window.APP_NAME = "AD96 Player";
window.APP_VERSION = 105;
window.APP_BUILD = "1.0.5";

window.APP_BUILD_DATE = "2025-12-06";
// window.API_BASE_URL = "https://cms.ad96.in/api/";
window.LOGS_API_BASE_URL =
  "https://xrf24byn2f.execute-api.ap-south-1.amazonaws.com/";
window.BULK_LOGS_API_BASE_URL =
  "https://xrf24byn2f.execute-api.ap-south-1.amazonaws.com/";
// window.API_BASE_URL = "http://3.110.179.237:8081/api/";
window.API_BASE_URL = "http://13.232.17.134:8080/api/";
window.SECRETKEY =
  "2182zy64mc64nswkemzmcbvjlaie44bd8cdkhsg312c81187ab82bbe053df6b7aa55";

window.DEVICE_WIDTH = 1920;
window.DEVICE_HEIGHT = 1080;
window.DEVICE_WINDOW_WIDTH = 1920;
window.DEVICE_WINDOW_HEIGHT = 1080;
window.DEVICE_WINDOW_ORIENT = "landscape";
window.APP_ID = "com.adup.halliv";
window.APP_ID_ANDROID = "com.adup.halliv";
window.SNIPIT_TEXT_ITIMEOUT_ID = 10000; // 10 sec

window.FILE_DIRECTORY = "";

window.DOWNLOAD_PROGRESS = [];

// Environment Configuration
window.ENVIRONMENT = "dev"; // "dev" or "prod"
window.IS_DEVELOPMENT = window.ENVIRONMENT === "dev";

// Memory Management Configuration
window.MAX_LOG_ENTRIES = window.IS_DEVELOPMENT ? 100000 : 100; // More logs in dev mode
window.MAX_CONSOLE_LOGS = window.IS_DEVELOPMENT ? 50000 : 50; // More console logs in dev mode
window.MEMORY_CHECK_INTERVAL = 30000; // 30 seconds
window.LOG_CLEANUP_THRESHOLD = window.IS_DEVELOPMENT ? 90 : 80; // Higher threshold in dev mode
window.ENABLE_FULL_LOGGING = window.IS_DEVELOPMENT; // Full logging only in dev mode

// Feature Flags Configuration
window.FEATURE_FLAGS = {
  // Data Sync Features
  enableDataSync: true, // Enable/disable periodic data sync
  enableBulkSync: true, // Enable/disable bulk sync for large datasets
  enableArchiveSync: true, // Enable/disable offline archive creation

  // Data Collection Features
  enableTelemetry: true, // Enable/disable telemetry collection
  enableEventLogging: true, // Enable/disable event logging
  enableProofOfPlay: true, // Enable/disable proof of play tracking

  // Monitoring Features
  enableNetworkMonitoring: true, // Enable/disable network monitoring
  enableMemoryMonitoring: true, // Enable/disable memory monitoring
  enableResourceCleanup: true, // Enable/disable resource cleanup

  // Developer Tools (only available in dev mode)
  enableDevTools: window.IS_DEVELOPMENT, // Show developer tools in settings
  enableTestFeatures: window.IS_DEVELOPMENT, // Enable test features
  enableDebugLogging: window.IS_DEVELOPMENT, // Enable debug logging
};

// Ads and Carousel Configuration
window.LAST_ADS = [];
window.LAST_CAROUSELS = [];

// Sync Configuration
window.SYNC_CONFIG = {
  syncInterval: 6 * 60 * 1000, // 15 minutes
  telemetryInterval: 5 * 60 * 1000, // 5 minutes
  eventFlushInterval: 30000, // 30 seconds
  archiveCheckInterval: window.IS_DEVELOPMENT ? 1 * 60 * 1000 : 60 * 60 * 1000, // 1 min (dev) / 1 hour (prod)
  archiveInterval: 3 * 24 * 60 * 60 * 1000, // 3 days
  batchSize: 50, // Max records per normal sync
  bulkThreshold: 5000, // Use bulk sync if > 1000 records (was 50000 - too high!)
  maxBatchesPerSync: 20, // Maximum batches per sync cycle (safety limit to prevent infinite loops)
};

// Log Arrays with Memory Management
window.ERROR_LOGS = [];
window.INFO_LOGS = [];
window.DOWNLOADED_FILES = [];
window.DOWNLOAD_STATUS = [];
window.CONSOLE_LOG_COUNT = 0;

// Forward/Backward interval
window.MEDIA_FORWARD_INTERVAL = 15000;
window.MEDIA_REWIND_INTERVAL = 10000;
window.hide_progress_bar = "";
window.hide_programme_details = "";

//Error messages
window.REQUEST_TIMEOUT = 90; // In second
window.NET_CONNECTION_ERR =
  "Please check your Internet connection and try again.";
window.TIMEOUT_MSG = "Request Timeout";
window.DATA_PARSE_ERR = "Data Parse Error";
window.APP_EXIT_MSG = "Are you sure you want to exit application?";
window.PLAYER_ERR =
  "The content is currently unavailable. Please check back later.";
window.EMPTY_CATSET = "No content available";
window.TIME_STAMP = "";
window.NO_RECORD_MSG = "No record found.";
window.SOMETHING_WENT_WRONG = "Something went wrong.";
window.APP_LOGOUT_MSG = "Are you sure you want to logoff?";
window.APP_MESSAGE = [
  "You don't have active subscription Please visit HTTPS://WWW.HAITIANFLIX.COM?",
  "Something went wrong. Please contact with admin.",
];
