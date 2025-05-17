function remove_add_active_class(className) {
    console.log("remove add active class");
    if ($("body").find(".active").length > 0) {
        $("body").find(".active").each(function () {
            if ($(this).className != className) $(this).removeClass("active");
        });
    }
    $("." + className).addClass("active");
}


//This function is used for display two digit number from 1-9
function min_two_digits(number) {
    return (number < 10 ? '0' : '') + number;
}

function change_screens(className) {
    console.log("change screens...");
    $(".home_container, .show_container, .account_qr_container, .favorite_container, .detail_container, .watch_later_container, .most_watched_container, .search_container, .content_partner_container, .about_container, .contact_container,.account_container, .video_container, .content_partner_detail_container,.redeem_ppv_container,.redeem_ppv_details_container,.watch_ppv_container").removeClass("active").hide();
    var secondScreenArray = ["detail_container", "show_container"];
    if (className && $("." + className).css("display") == "none") {
        $("#loader").hide();
        if (secondScreenArray.includes(className)) $(".navbar_sidebar ").hide();
        $("." + className).addClass("active").show();
    }
    else $("#loader").show();
}

function show_user_rating() {
    $("#showRating li").html("");
    for (var j = 1; j <= 5; j++) {
        if (j <= SELECTED_ITEM_DATA['my_rate']) $("#showRating li").append('<img class="star-fill" src="./images/star_focus.png" alt="">');
        else $("#showRating li").append('<img class="star-empty" src="./images/star.png" alt="">');
    }
}

function time_convert(d) {
    d = Number(d);
    var h = Math.floor(d / 3600);
    var m = Math.floor(d % 3600 / 60);
    var s = Math.floor(d % 3600 % 60);

    var hours = h > 0 ? h + (h == 1 ? " hour " : " hour ") : "";
    var minutes = m > 0 ? m + (m == 1 ? " min " : " min ") : "";
    var seconds = s > 0 ? s + (s == 1 ? " sec" : " sec") : "";
    return hours + minutes + seconds;
}

// var leftmove,rightmove;
function controlLeftArrowKeys() {
    var leftmove;
    var input = document.getElementById($(":focus").attr("id"));

    var currentpos = input.selectionStart; //getting current postion of cursor 
    if (input.value.length > 0 && currentpos > 0) {
        leftmove = currentpos - 1;
        setCaretPosition(input, leftmove);
    }
}
function controlrightArrowKeys() {
    var rightmove;
    var input = document.getElementById($(":focus").attr("id"));
    var currentpos = input.selectionStart;  //getting current postion of cursor
    if (input.value.length >= 0 && currentpos >= 0) {
        rightmove = currentpos + 1;
        setCaretPosition(input, rightmove);
    }
}

function setCaretPosition(ctrl, pos) {
    // Modern browsers
    if (ctrl.setSelectionRange) {
        ctrl.focus();
        ctrl.setSelectionRange(pos, pos);
        // IE8 and below
    } else if (ctrl.createTextRange) {
        var range = ctrl.createTextRange();
        range.collapse(true);
        range.moveEnd('character', pos);
        range.moveStart('character', pos);
        range.select();
    }
}


function controlCounter() {
    let count = 0;
    console.log("controlCounter", count);
    return function () {
        if (count == 0 && (MENU_INDEX == 6 || MENU_INDEX == 7)) {
            console.log("count22222", count);
            // updateWatchStatus();
            if (MENU_INDEX == 6) updateWatchStatus();
            else if (MENU_INDEX == 7) updatePPVWatchStatus();
            count += 1;
        }
    }
}
function secondcontrolCounter() {
    let count = 0;
    console.log("secondcontrolCounter", count);
    return function () {
        if ((count == 1 || count == 0)) {
            $(".subscription_msg").show();
            manage_spatial_navigation("MSG");
            SN.focus("#msgButton");
            count += 2;
        }
    }
}

function likeDislikeCount(count) {
    count = Number(count);
    if (count == '') return 0;
    else return Math.abs(count) > 999 ? Math.sign(count) * ((Math.abs(count) / 1000).toFixed(1)) + 'k' : Math.sign(count) * Math.abs(count);
}

function show_hide_popups(flag, message, modalName) {
    console.log(flag, modalName);
    $("#modal_msg_container").css("display", "none").removeClass("active");
    $(".empty_modal, .modal_subscription").css("display", "none");
    if (flag) {
        $("#modal_msg_container").css("display", "block").addClass("active");
        $("." + modalName).css("display", "block");
        if (modalName == "modal_subscription") {
            $(".popupMsg").text(message);
            SN.focus("okModal");
        }
    } else if (!flag) {
        $("." + modalName).css("display", "none");
    }
}

