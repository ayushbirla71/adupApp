// window.onload = function () {
//   console.log("Main screen");
//   window.SN = SpatialNavigation;
//   SN.init();
//   //register_number_keys();

//   if (localStorage.getItem("token") && localStorage.getItem("group_id")) {
//     setTimeout(function () {
//       $(".login_loader").hide();
//     }, 1000);

//     // localStorage.setItem("token", newToken);
//     var ads = JSON.parse(localStorage.getItem("ads")); // optional if needed
//     var device_id = localStorage.setItem("device_id");
//     var group_id = localStorage.getItem("group_id");
//     console.log("ads", ads);

//     $(".joinGroup-container").hide();
//     $(".main-container").hide();
//     $(".ad-player-container").show();
//     $(".ad-player-container").addClass("active");
//     $(".joinGroup-container").removeClass("active");
//     // Focus on the first OTP input field
//     SN.focus("#ad_player");
//     var contentHTML = generateImageAds(ads[0]);

//     // Append content to the element
//     var $element = $("#ad_player");
//     $element.html("");
//     // $element.html(contentHTML);
//     connectMQTT({
//       device_id: device_id,
//       group_id: group_id,
//     });
//   } else {
//     manage_spatial_navigation("joinGroup-container");
//     setTimeout(function () {
//       $(".login_loader").hide();
//     }, 1000);

//     $(".ad-player-container").addClass("active");
//     SN.focus("#groupId");
//   }

//   // document.getElementById('emailId').value = "user@auf.tv";
//   // document.getElementById('password').value = "auftv";

//   // SN.focus("#login_container");

//   // When something press from remote keys
//   $(window).keydown(function (evt) {
//     console.log("key event", evt.keyCode);
//     switch (evt.keyCode) {
//       case 10009: //Back/Return
//         if (
//           (!$("#groupId").is(":focus") &&
//             !$("#joinGroupButton").is(":focus")) ||
//           $(".joinGroup-container").hasClass("active") ||
//           $(".joinGroup-container").is(":visible") ||
//           $(".ad-player-container").hasClass("active")
//         ) {
//           window.close(); // Attempts to close the window
//         }
//         break;

//       default:
//         console.log("Remote keyCode: ", evt.keyCode);
//     }
//   });
// };

// function set_focus(containerId, itemId) {
//   console.log("set focus");
//   var restrictVal = "self-first";
//   if (containerId == "EXIT" || containerId == "RETRY_CANCEL")
//     restrictVal = "self-only";

//   SN.remove(containerId);
//   SN.add({
//     id: containerId,
//     selector: "#" + containerId + " .focusable",
//     restrict: restrictVal,
//     defaultElement: "#" + itemId,
//     enterTo: "last-focused",
//   });
//   SN.makeFocusable();
// }

// function manage_spatial_navigation(containerClass, favoriteStatus, vodId) {
//   switch (containerClass) {
//     case "joinGroup-container":
//       set_focus("joinGroupContainer", "groupId");
//       $("#groupId").on("sn:focused", function (e) {
//         console.log("set focus !");
//       });
//       $("#groupId").on("sn:enter-down", function (e) {
//         // window.location.href = "home.html";
//       });
//       $("#joinGroupButton").on("sn:focused", function (e) {
//         console.log("set focus !");
//       });
//       $("#joinGroupButton").on("sn:enter-down", function (e) {
//         // window.location.href = "home.html";
//         console.log("Join Group Button Clicked", e);
//         const groupId = $("#groupId").val();
//         console.log("Group ID:", groupId);
//         if (groupId) {
//           // localStorage.setItem("groupId", groupId);
//           joinGroup(groupId); // Call the joinGroup function with the group ID
//         } else {
//           alert("Please enter a valid Group ID.");
//         }
//       });
//       break;

//     case "ad-player-container":
//       set_focus("ad_player", "groupId");

//       $("#groupId").on("sn:focused", function (e) {
//         console.log("set focus !");
//       });

//       break;

//     default:
//       console.log("containerClass", containerClass);
//   }
// }

window.onload = function () {
  console.log("Main screen");
  window.SN = SpatialNavigation;
  SN.init();

  // const newToken = "your_token_here"; // Set this appropriately
  console.log("tokensss", localStorage.getItem("token")?.trim());

  if (localStorage.getItem("token")?.trim()) {
    setTimeout(function () {
      $(".login_loader").hide();
    }, 1000);

    // localStorage.setItem("token", newToken);
    const ads = JSON.parse(localStorage.getItem("ads") || "[]"); // fallback to empty array if null
    const device_id = localStorage.getItem("device_id");
    const group_id = localStorage.getItem("group_id");

    console.log("ads", ads);

    $(".joinGroup-container").hide();
    $(".main-container").hide();
    $(".ad-player-container").show().addClass("active");
    $(".joinGroup-container").removeClass("active");

    SN.focus("#ad_player");

    if (ads && Array.isArray(ads) && ads.length > 0) {
      const contentHTML = generateImageAds(ads[0]);
      const $element = $("#ad_player");
      $element.html(""); // Optionally clear
      // $element.html(contentHTML); // Uncomment if needed
    }

    connectMQTT({
      device_id: device_id,
      group_id: group_id,
    });
  } else {
    manage_spatial_navigation("joinGroup-container");

    setTimeout(function () {
      $(".login_loader").hide();
    }, 1000);

    $(".ad-player-container").addClass("active");
    SN.focus("#groupId");
  }

  $(window).keydown(function (evt) {
    console.log("key event", evt.keyCode);
    switch (evt.keyCode) {
      case 10009: // Back/Return
        if (
          (!$("#groupId").is(":focus") &&
            !$("#joinGroupButton").is(":focus")) ||
          $(".joinGroup-container").hasClass("active")
        ) {
          showToast(
            "info",
            "Device Id : " + localStorage.getItem("device_id"),
            15000
          );
        }
        if (
          (!$("#groupId").is(":focus") &&
            !$("#joinGroupButton").is(":focus")) ||
          $(".joinGroup-container").hasClass("active") ||
          $(".joinGroup-container").is(":visible") ||
          $(".ad-player-container").hasClass("active")
        ) {
          // NOTE: window.close may not work unless window was opened via JS
          console.log("Attempting to close window");
          // window.close();
        }
        break;

      default:
        console.log("Remote keyCode: ", evt.keyCode);
    }
  });
};

function set_focus(containerId, itemId) {
  console.log("set focus");
  let restrictVal = "self-first";
  if (containerId === "EXIT" || containerId === "RETRY_CANCEL")
    restrictVal = "self-only";

  SN.remove(containerId);
  SN.add({
    id: containerId,
    selector: "#" + containerId + " .focusable",
    restrict: restrictVal,
    defaultElement: "#" + itemId,
    enterTo: "last-focused",
  });
  SN.makeFocusable();
}

function manage_spatial_navigation(containerClass, favoriteStatus, vodId) {
  switch (containerClass) {
    case "joinGroup-container":
      set_focus("joinGroupContainer", "groupId");

      $("#groupId").on("sn:focused", function () {
        console.log("Group ID field focused");
      });

      $("#groupId").on("sn:enter-down", function () {
        // Navigate or perform action
      });

      $("#joinGroupButton").on("sn:focused", function () {
        console.log("Join Group Button focused");
      });

      $("#joinGroupButton").on("sn:enter-down", function () {
        console.log("Join Group Button Clicked");

        const groupId = $("#groupId").val();
        console.log("Group ID:", groupId);

        if (groupId) {
          joinGroup(groupId); // Ensure this function is defined elsewhere
        } else {
          alert("Please enter a valid Group ID.");
        }
      });
      break;

    case "ad-player-container":
      set_focus("ad_player", "groupId");

      $("#groupId").on("sn:focused", function () {
        console.log("set focus !");
      });
      break;

    default:
      console.log("Unknown containerClass:", containerClass);
  }
}
