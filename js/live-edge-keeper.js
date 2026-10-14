/**
 * LiveEdgeKeeper - keeps a live HLS stream close to the live edge on Tizen AVPlay.
 *
 * Why: AVPlay does not expose the live edge. When the network or decoder stalls
 * it simply pauses and re-buffers, while the live edge keeps moving, so the
 * delay grows permanently. The keeper therefore measures drift as "time lost
 * to stalls since the last join" and re-joins the stream when that adds up
 * (a re-join always starts near the live edge).
 *
 * Re-join is seamless ("hot swap"): the new stream is prepared on the zone's
 * spare AVPlay (p2), shown once it is really playing, and only then is the old
 * one stopped. If the spare cannot be prepared (some TVs cannot run two HLS
 * decoders) it falls back to a hard re-join on the same player.
 *
 * One keeper per ZoneController. Only the video_primary zone owns AVPlay
 * players, so at most two decoders are ever used (see CLAUDE.md, section 8).
 *
 * Tunables live in window.LIVE_EDGE_CONFIG (config.js); these are the defaults.
 */
(function () {
  "use strict";

  var DEFAULTS = {
    singleStallMs: 2000, // one stall at least this long -> resync
    totalStallMs: 4000, // stalls since the last join add up to this -> resync
    freezeMs: 8000, // playback time not advancing for this long -> resync
    periodicResyncMs: 20 * 60 * 1000, // safety re-join even without stalls
    minResyncGapMs: 30000, // never resync more often than this
    backoffWindowMs: 5 * 60 * 1000, // window used to detect resync loops
    maxResyncsInWindow: 3, // more than this inside the window -> back off
    backoffResyncGapMs: 60000, // gap between resyncs while backing off
    spareReadyTimeoutMs: 10000, // spare player must be playing within this
    maxSwapFailures: 2, // then stop trying hot swap, use hard re-join
    retryDelayMs: 5000, // retry after an error / completed stream
    maxRetries: 999,
    watchdogIntervalMs: 2000,
    minTimeEventsForFreeze: 3, // some firmwares send no time events for live
    bufferForPlaySec: 0, // experiment: >0 shortens AVPlay's initial buffer
  };

  function now() {
    return Date.now();
  }

  function LiveEdgeKeeper(zone) {
    this.zone = zone;
    this.cfg = Object.assign({}, DEFAULTS, window.LIVE_EDGE_CONFIG || {});

    this.slots = [];
    if (zone.p1) {
      this.slots.push({ name: "p1", player: zone.p1, element: zone.p1Element });
    }
    if (zone.p2) {
      this.slots.push({ name: "p2", player: zone.p2, element: zone.p2Element });
    }

    this.running = false;
    this.gen = 0; // bumped on every start / hard join / stop: invalidates old callbacks
    this.liveItem = null;
    this.active = null; // slot currently on screen
    this.pending = null; // { slot, timer } while a hot swap is in flight

    this.watchdog = null;
    this.retryTimer = null;
    this.retryCount = 0;

    this.lastResyncAt = 0;
    this.resyncTimes = [];
    this.swapFailures = 0;
    this.lastNotifyAt = {};

    this._resetStats();
  }

  LiveEdgeKeeper.prototype.isRunning = function () {
    return this.running;
  };

  LiveEdgeKeeper.prototype.log = function (msg) {
    console.log("[LiveEdge:" + this.zone.zoneId + "] " + msg);
  };

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Joins the stream (hard join on the first player). Returns false if no player. */
  LiveEdgeKeeper.prototype.start = function (liveItem) {
    if (!this.slots.length || !liveItem || !liveItem.url) return false;

    this._stopTimers();
    this._cancelPending();
    this.gen++;

    this.running = true;
    this.liveItem = liveItem;
    this.active = this.slots[0];
    this.retryCount = 0;
    this.swapFailures = 0;
    this.resyncTimes = [];
    this.lastResyncAt = 0;

    this._startWatchdog();
    this._hardJoin("initial");
    return true;
  };

  /** Stops playback and every timer. Safe to call repeatedly. */
  LiveEdgeKeeper.prototype.stop = function () {
    this.running = false;
    this.gen++;
    this._stopTimers();
    this._cancelPending();
    for (var i = 0; i < this.slots.length; i++) {
      this._silence(this.slots[i]);
    }
    this.liveItem = null;
  };

  /** Seamless re-join at the live edge. */
  LiveEdgeKeeper.prototype.resync = function (reason) {
    if (!this.running || this.pending) return;

    var self = this;
    var spare = null;
    for (var i = 0; i < this.slots.length; i++) {
      if (this.slots[i] !== this.active) spare = this.slots[i];
    }

    if (!spare || this.swapFailures >= this.cfg.maxSwapFailures) {
      this.log("resync (hard re-join): " + reason);
      this._hardJoin("resync: " + reason);
      return;
    }

    this.log("resync (hot swap): " + reason);
    var gen = this.gen;
    this.pending = { slot: spare, timer: null };
    this.pending.timer = setTimeout(function () {
      if (gen !== self.gen) return;
      self._failSwap("spare player not playing in time");
    }, this.cfg.spareReadyTimeoutMs);

    // Alternate 16 / 17 so z-order never grows over days of resyncs.
    var activeZ = parseInt(this.active.element.style.zIndex, 10) || 16;
    this._prepareSlot(
      spare,
      gen,
      activeZ === 17 ? 16 : 17,
      function () {
        /* playing started; the swap completes on its first time event */
      },
      function (kind, err) {
        self._failSwap(kind + " " + err);
      },
    );
  };

  // ---------------------------------------------------------------------------
  // Joining
  // ---------------------------------------------------------------------------

  LiveEdgeKeeper.prototype._hardJoin = function (reason) {
    if (!this.running) return;
    var self = this;

    this._cancelPending();
    this.gen++;
    var gen = this.gen;
    this._resetStats();

    var slot = this.active || this.slots[0];
    this.active = slot;
    for (var i = 0; i < this.slots.length; i++) {
      if (this.slots[i] !== slot) this._silence(this.slots[i]);
    }

    this.log("join (" + reason + ")");
    this._prepareSlot(
      slot,
      gen,
      16,
      function () {
        /* retry count is reset on the first time event */
      },
      function (kind, err) {
        self._notify(
          "Live Stream " + (kind === "prepare" ? "Prepare" : "Setup") + " Error",
          "Failed to start live stream (" + kind + "): " + err,
          { url: self.liveItem ? self.liveItem.url : "", error: String(err) },
        );
        self._hideSlot(slot);
        self._scheduleRetry(kind + " failed");
      },
    );
  };

  /**
   * Opens the live URL on one AVPlay slot and starts playing once prepared.
   * onReady runs after play() was called, onFail(kind, err) on any failure.
   */
  LiveEdgeKeeper.prototype._prepareSlot = function (slot, gen, zIndex, onReady, onFail) {
    var self = this;
    var player = slot.player;
    var zone = this.zone;
    var settled = false;

    function fail(kind, err) {
      if (settled) return;
      settled = true;
      if (gen !== self.gen || !self.running) return;
      onFail(kind, err);
    }

    try {
      try {
        player.stop();
      } catch (e) {}

      player.setListener(this._makeListener(slot, gen));
      player.open(this.liveItem.url);

      try {
        player.setDisplayRotation(getRotationValue());
      } catch (e) {}
      try {
        player.setDisplayMethod("PLAYER_DISPLAY_MODE_CUSTOM");
      } catch (e) {}
      try {
        player.setDisplayRect(zone.rect.x, zone.rect.y, zone.rect.w, zone.rect.h);
      } catch (e) {}

      if (this.cfg.bufferForPlaySec > 0) {
        try {
          player.setBufferingParam(
            "PLAYER_BUFFER_FOR_PLAY",
            "PLAYER_BUFFER_SIZE_IN_SECOND",
            this.cfg.bufferForPlaySec,
          );
        } catch (e) {}
      }

      player.prepareAsync(
        function () {
          if (settled) return;
          settled = true;
          if (gen !== self.gen || !self.running) {
            try {
              player.stop();
            } catch (e) {}
            return;
          }
          self._showSlot(slot, zIndex);
          try {
            player.setVideoStillMode("false"); // no frozen frames for live
          } catch (e) {}
          try {
            player.play();
            onReady(slot);
          } catch (e) {
            settled = false;
            fail("setup", e && e.message ? e.message : e);
          }
        },
        function (err) {
          fail("prepare", err);
        },
      );
    } catch (e) {
      fail("setup", e && e.message ? e.message : e);
    }
  };

  LiveEdgeKeeper.prototype._makeListener = function (slot, gen) {
    var self = this;

    function guard(fn) {
      return function () {
        if (gen !== self.gen || !self.running) return;
        try {
          fn.apply(self, arguments);
        } catch (e) {
          console.error("[LiveEdge] listener error", e);
        }
      };
    }

    return {
      onbufferingstart: guard(function () {
        this._onBufferingStart(slot);
      }),
      onbufferingprogress: function () {},
      onbufferingcomplete: guard(function () {
        this._onBufferingComplete(slot);
      }),
      oncurrentplaytime: guard(function (t) {
        this._onTime(slot, t);
      }),
      onstreamcompleted: guard(function () {
        this._onCompleted(slot);
      }),
      onevent: function () {},
      onerror: guard(function (err) {
        this._onError(slot, err);
      }),
    };
  };

  // ---------------------------------------------------------------------------
  // AVPlay events
  // ---------------------------------------------------------------------------

  LiveEdgeKeeper.prototype._onBufferingStart = function (slot) {
    if (slot !== this.active) return;
    // The first buffering is the join itself, not a stall.
    if (this.playing && !this.stallStartAt) this.stallStartAt = now();
  };

  LiveEdgeKeeper.prototype._onBufferingComplete = function (slot) {
    if (this.pending && slot === this.pending.slot) return; // swap completes on its time event
    if (slot !== this.active) return;

    if (!this.playing) {
      this._markPlaying();
      return;
    }
    if (!this.stallStartAt) return;

    var duration = now() - this.stallStartAt;
    this.stallStartAt = 0;
    this.totalStallMs += duration;
    this.log("stall " + duration + "ms (total " + this.totalStallMs + "ms)");

    if (duration >= this.cfg.singleStallMs || this.totalStallMs >= this.cfg.totalStallMs) {
      this._maybeResync("stalled " + duration + "ms, total " + this.totalStallMs + "ms");
    }
  };

  LiveEdgeKeeper.prototype._onTime = function (slot, t) {
    if (this.pending && slot === this.pending.slot) {
      if (t > 0) this._finalizeSwap();
      return;
    }
    if (slot !== this.active) return;

    if (t !== this.lastTimeValue) {
      this.lastTimeValue = t;
      this.lastTimeAt = now();
      this.timeEvents++;
    }
    if (!this.playing) this._markPlaying();
  };

  LiveEdgeKeeper.prototype._onCompleted = function (slot) {
    if (slot !== this.active) return;
    // A live stream should never "complete": the publisher stopped or the
    // playlist ended. Keep trying; the schedule decides when live is over.
    this._scheduleRetry("stream completed");
  };

  LiveEdgeKeeper.prototype._onError = function (slot, err) {
    if (this.pending && slot === this.pending.slot) {
      this._failSwap("spare error " + err);
      return;
    }
    if (slot !== this.active) return;

    console.error("[LiveEdge] stream error:", err);
    this._notify(
      "Live Stream Playback Error",
      "M3U8 live stream error (" + err + ") for URL: " + (this.liveItem ? this.liveItem.url : ""),
      { url: this.liveItem ? this.liveItem.url : "", errorType: String(err), retryCount: this.retryCount },
    );
    this._hideSlot(slot);
    this._scheduleRetry("error " + err);
  };

  // ---------------------------------------------------------------------------
  // Hot swap
  // ---------------------------------------------------------------------------

  LiveEdgeKeeper.prototype._finalizeSwap = function () {
    var pending = this.pending;
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending = null;

    var old = this.active;
    this.active = pending.slot;
    this._silence(old);

    this._resetStats();
    this._markPlaying();
    this.swapFailures = 0;
    this.log("hot swap complete, now on " + this.active.name);
  };

  LiveEdgeKeeper.prototype._failSwap = function (why) {
    var pending = this.pending;
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending = null;
    this._silence(pending.slot);

    this.swapFailures++;
    console.warn("[LiveEdge] hot swap failed (" + why + "), falling back to hard re-join");
    this._hardJoin("hot swap failed: " + why);
  };

  LiveEdgeKeeper.prototype._cancelPending = function () {
    if (!this.pending) return;
    clearTimeout(this.pending.timer);
    this.pending = null;
  };

  // ---------------------------------------------------------------------------
  // Drift decisions
  // ---------------------------------------------------------------------------

  /** Applies the minimum gap and loop back-off. Returns whether a resync started. */
  LiveEdgeKeeper.prototype._maybeResync = function (reason) {
    if (!this.running || this.pending) return false;

    var t = now();
    var windowMs = this.cfg.backoffWindowMs;
    this.resyncTimes = this.resyncTimes.filter(function (x) {
      return t - x < windowMs;
    });

    var backingOff = this.resyncTimes.length >= this.cfg.maxResyncsInWindow;
    var minGap = backingOff ? this.cfg.backoffResyncGapMs : this.cfg.minResyncGapMs;
    if (t - this.lastResyncAt < minGap) return false;

    if (backingOff) {
      this._notify(
        "Live Stream Repeated Resync",
        "Live stream needed " + this.resyncTimes.length + " resyncs in " + Math.round(windowMs / 60000) +
          " min. Network or source is unstable.",
        { reason: reason },
        "STREAM_RESYNC",
        "warning",
        10 * 60 * 1000,
      );
    }

    this.lastResyncAt = t;
    this.resyncTimes.push(t);
    this.resync(reason);
    return true;
  };

  LiveEdgeKeeper.prototype._tick = function () {
    if (!this.running || this.pending || !this.playing) return;

    var t = now();
    if (
      !this.stallStartAt &&
      this.timeEvents >= this.cfg.minTimeEventsForFreeze &&
      t - this.lastTimeAt > this.cfg.freezeMs
    ) {
      this._maybeResync("frozen for " + (t - this.lastTimeAt) + "ms");
      return;
    }
    if (t - this.joinedAt > this.cfg.periodicResyncMs) {
      this._maybeResync("periodic");
    }
  };

  LiveEdgeKeeper.prototype._scheduleRetry = function (reason) {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.retryCount >= this.cfg.maxRetries) return;
    this.retryCount++;

    var self = this;
    var gen = this.gen;
    this.retryTimer = setTimeout(function () {
      self.retryTimer = null;
      // Checked when the timer fires, not when it was scheduled.
      if (gen !== self.gen || !self.running || self.zone.currentPlaybackMode !== "live") return;
      self._hardJoin("retry after " + reason);
    }, this.cfg.retryDelayMs);
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  LiveEdgeKeeper.prototype._resetStats = function () {
    var t = now();
    this.playing = false;
    this.joinedAt = t;
    this.stallStartAt = 0;
    this.totalStallMs = 0;
    this.lastTimeValue = -1;
    this.lastTimeAt = t;
    this.timeEvents = 0;
  };

  LiveEdgeKeeper.prototype._markPlaying = function () {
    this.playing = true;
    this.joinedAt = now();
    this.lastTimeAt = this.joinedAt;
    this.retryCount = 0;
  };

  LiveEdgeKeeper.prototype._startWatchdog = function () {
    var self = this;
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = setInterval(function () {
      try {
        self._tick();
      } catch (e) {
        console.error("[LiveEdge] watchdog error", e);
      }
    }, this.cfg.watchdogIntervalMs);
  };

  LiveEdgeKeeper.prototype._stopTimers = function () {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  };

  LiveEdgeKeeper.prototype._showSlot = function (slot, zIndex) {
    var el = slot.element;
    if (!el) return;
    var zone = this.zone;
    var height = zone.getAdjustedVideoHeight();
    // Force pixel dimensions so the live stream doesn't shrink into a tiny box
    el.style.width = zone.rect.w + "px";
    el.style.height = height + "px";
    el.style.zIndex = String(zIndex);
    el.classList.add("vid");
    el.style.display = "block";
    try {
      slot.player.setDisplayRect(zone.rect.x, zone.rect.y, zone.rect.w, height);
    } catch (e) {}
  };

  LiveEdgeKeeper.prototype._hideSlot = function (slot) {
    if (!slot || !slot.element) return;
    slot.element.classList.remove("vid");
    slot.element.style.display = "none";
  };

  /** Detaches our listener, stops the player and hides its element. */
  LiveEdgeKeeper.prototype._silence = function (slot) {
    if (!slot) return;
    try {
      slot.player.setListener({});
    } catch (e) {}
    try {
      slot.player.stop();
    } catch (e) {}
    this._hideSlot(slot);
  };

  /** Rate-limited uplink notification (one per title per interval). */
  LiveEdgeKeeper.prototype._notify = function (title, message, data, type, severity, intervalMs) {
    var t = now();
    var minGap = intervalMs || 60 * 1000;
    if (this.lastNotifyAt[title] && t - this.lastNotifyAt[title] < minGap) return;
    this.lastNotifyAt[title] = t;

    if (typeof window.triggerDeviceNotification === "function") {
      var payload = data || {};
      payload.zone = this.zone.zoneId;
      window.triggerDeviceNotification(
        type || "STREAM_ERROR",
        title,
        message,
        payload,
        severity || "error",
      );
    }
  };

  window.LiveEdgeKeeper = LiveEdgeKeeper;
})();
