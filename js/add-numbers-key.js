function register_number_keys() {
  tizen.tvinputdevice.registerKey("0");
  tizen.tvinputdevice.registerKey("1");
  tizen.tvinputdevice.registerKey("2");
  tizen.tvinputdevice.registerKey("3");
  tizen.tvinputdevice.registerKey("4");
  tizen.tvinputdevice.registerKey("5");
  tizen.tvinputdevice.registerKey("6");
  tizen.tvinputdevice.registerKey("7");
  tizen.tvinputdevice.registerKey("8");
  tizen.tvinputdevice.registerKey("9");

  // Register special keys for YouTube testing
  tizen.tvinputdevice.registerKey("ColorF0Red");
  tizen.tvinputdevice.registerKey("ColorF1Green");
}

// // Key event handler for YouTube testing
// document.addEventListener("keydown", function (event) {
//   console.log("Key pressed:", event.keyCode);

//   switch (event.keyCode) {
//     case 403: // Red button - Test YouTube Live Player
//       event.preventDefault();
//       logInfo("🔴 Red button pressed - Testing YouTube Live Player");
//       if (window.testYouTubePlayback) {
//         window.testYouTubePlayback();
//       } else {
//         logError("YouTube test function not available");
//       }
//       break;

//     case 404: // Green button - Stop YouTube and return to regular player
//       event.preventDefault();
//       logInfo("🟢 Green button pressed - Stopping YouTube Player");
//       if (window.stopYouTubeLive) {
//         window.stopYouTubeLive();
//       }
//       if (window.initializeRegularPlayers) {
//         window.initializeRegularPlayers();
//       }
//       break;

//     case 48: // Number 0 - Quick YouTube test
//       event.preventDefault();
//       logInfo("🔴 Number 0 pressed - Quick YouTube test");
//       if (window.testYouTubePlayback) {
//         window.testYouTubePlayback();
//       }
//       break;
//   }
// });
