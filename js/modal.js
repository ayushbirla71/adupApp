function hide_show_modal(action, name, message) {
    console.log(action, name, message);
    var modalName = $(".modal_container").attr("data-modal-name");
console.log(modalName);
    if (action == true && !modalName) {
        remove_add_active_class("modal_container");

        if (name == "EXIT") {
            $(".exit_modal").addClass("exit_modal_show");
            $('.mod_button_sel').text("NO");
            $('.mod_button_un_sel').text("YES");
            $(".mod_text_color").html(message);

        } else if (name == "RETRY_CANCEL") {
            $(".retry_modal").addClass("popup_new_box");
            $(".mod_text_color").html(message);
            $(".mod_name").html(APP_NAME);
            $('.mod_button_sel').text("RETRY");
            $('.mod_button_un_sel').text("CANCEL");

        } else if (name == "RETRY_EXIT") {
            $(".retry_modal").addClass("popup_new_box");
            $(".mod_text_color").html(message);
            $(".mod_name").html(APP_NAME);

            $('.mod_button_sel').text("RETRY");
            $('.mod_button_un_sel').text("EXIT");

        } else if (name == "LOGOUT") {
            $(".exit_modal").addClass("exit_modal_show");
            $('.mod_button_sel').text("NO");
            $('.mod_button_un_sel').text("YES");
            $(".mod_text_color").html(message);
        }

        $(".modal_container").attr("data-modal-name", name);
        manage_spatial_navigation(name);

        if (name == "EXIT") {
            SN.focus("exitModal");

            $(".exit_modal").one("transitionend", function () {
                console.log("modal transition");
            });

        } else {
            manage_spatial_navigation(name);
            SN.focus("retryModal");
        }
    } else if (action == false) {
        console.log("action=>", action, name);
        if (name == "EXIT") {
            $(".exit_modal").removeClass("exit_modal_show");
        } else if (name == "RETRY_CANCEL" || name == "RETRY_EXIT") {
            $(".retry_modal").removeClass("popup_new_box");
        } else if (name == "LOGOUT") {
            $(".exit_modal").removeClass("exit_modal_show");
        }

        if (TAB_INDEX == 14) closeVideo();
        else {
            if (localStorage.getItem("subscription_status") == "ACTIVE" && localStorage.getItem("days_left") != "0") {
                var containerArr = ["home_container", "search_container", "most_watched_container", "favorite_container", "watch_later_container", "content_partner_container", "redeem_ppv_container", "watch_ppv_container","about_container", "contact_container", "account_container", "detail_container", "content_partner_detail_container", "redeem_ppv_details_container", "account_qr_container", "show_container", "video_container"];
                $("." + containerArr[PAGE_INDEX]).addClass("active").show();
            }

            if (PAGE_INDEX > 17) {
                if (PAGE_INDEX == 16) SN.focus("#" + SECOND_PAGE_FOCUSED_ITEM);
                else if (PAGE_INDEX == 17) SN.focus("detail_container");
                if (PAGE_INDEX == 11) SN.focus("partner_detail_button");
                else if (PAGE_INDEX == 12) SN.focus("#play_now_button");
                if (PAGE_INDEX == 13) SN.focus("account_qr_container");
            } else if (PAGE_INDEX < 16) {
                if ((name == "EXIT" || name == "LOGOUT") && $(".account_container").hasClass("active")) SN.focus("logout_exit_buttons");
                else {
                    $(".menu_container").addClass("wide_menu_container");
                    $(".nav_items").addClass("wide_nav_container");
                    $("#menuLogo").attr("src", "");
                    $("#menuLogo").attr("src", "../images/logo.png");
                    SN.focus("#menu" + MENU_INDEX);
                }
            }
            
        }

        $(".modal_container").removeClass("active"); // this is only for home page
        $(".modal_container").attr("data-modal-name", "");

    }
}