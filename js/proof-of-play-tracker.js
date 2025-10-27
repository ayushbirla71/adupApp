// Proof of Play Tracking System
// Tracks ad playback events and integrates with existing video/image players

class ProofOfPlayTracker {
  constructor() {
    this.activePlaybacks = new Map(); // Track currently playing ads
    this.completedPlaybacks = [];
    this.isEnabled = true;
    
    this.init();
  }

  init() {
    logInfo('ProofOfPlayTracker initialized');
    
    // Record app start event
    this.recordEvent('APP_STARTED', { reason: 'USER_LAUNCH' });
  }

  // Start tracking an ad playback
  startTracking(adData, mediaType = 'video') {
    if (!this.isEnabled || !adData) {
      return null;
    }

    const trackingId = generateUUID();
    const startTime = new Date().toISOString();
    
    const playbackRecord = {
      trackingId: trackingId,
      adId: adData.ad_id || adData.adId || generateUUID(),
      scheduleId: adData.schedule_id || adData.scheduleId || null,
      mediaType: mediaType,
      fileName: adData.fileName || adData.url || 'unknown',
      startTime: startTime,
      endTime: null,
      durationPlayedMs: 0,
      expectedDurationMs: adData.duration ? adData.duration * 1000 : null,
      status: 'playing',
      events: []
    };

    this.activePlaybacks.set(trackingId, playbackRecord);
    
    logInfo('Started tracking ad playback:', {
      trackingId,
      adId: playbackRecord.adId,
      mediaType,
      fileName: playbackRecord.fileName
    });

    return trackingId;
  }

  // Add an event to a tracked playback
  addPlaybackEvent(trackingId, eventType, eventData = {}) {
    const playback = this.activePlaybacks.get(trackingId);
    if (!playback) {
      logWarn('Cannot add event to unknown tracking ID:', trackingId);
      return;
    }

    const event = {
      timestamp: new Date().toISOString(),
      eventType: eventType,
      data: eventData
    };

    playback.events.push(event);
    
    logInfo('Added playback event:', {
      trackingId,
      eventType,
      adId: playback.adId
    });
  }

  // End tracking an ad playback
  endTracking(trackingId, reason = 'completed') {
    const playback = this.activePlaybacks.get(trackingId);
    if (!playback) {
      logWarn('Cannot end tracking for unknown tracking ID:', trackingId);
      return null;
    }

    const endTime = new Date().toISOString();
    const startTime = new Date(playback.startTime);
    const durationPlayedMs = Date.now() - startTime.getTime();

    playback.endTime = endTime;
    playback.durationPlayedMs = durationPlayedMs;
    playback.status = reason;

    // Move to completed playbacks
    this.activePlaybacks.delete(trackingId);
    this.completedPlaybacks.push(playback);

    logInfo('Ended tracking ad playback:', {
      trackingId,
      adId: playback.adId,
      durationPlayedMs,
      reason
    });

    // Record proof of play in data manager
    this.recordProofOfPlay(playback);

    return playback;
  }

  // Record proof of play in the data manager
  async recordProofOfPlay(playback) {
    if (!window.dataManager) {
      logWarn('DataManager not available, cannot record proof of play');
      return;
    }

    try {
      const proofData = {
        adId: playback.adId,
        scheduleId: playback.scheduleId,
        startTime: playback.startTime,
        endTime: playback.endTime,
        durationPlayedMs: playback.durationPlayedMs
      };

      await window.dataManager.recordProofOfPlay(proofData);
      logInfo('Proof of play recorded successfully:', playback.adId);
    } catch (error) {
      logError('Failed to record proof of play:', error);
    }
  }

  // Record general events
  async recordEvent(eventType, payload = {}) {
    if (!window.dataManager) {
      logWarn('DataManager not available, cannot record event');
      return;
    }

    try {
      await window.dataManager.recordEvent({
        eventType: eventType,
        payload: payload
      });
      logInfo('Event recorded:', eventType);
    } catch (error) {
      logError('Failed to record event:', error);
    }
  }

  // Get statistics
  getStats() {
    return {
      activePlaybacks: this.activePlaybacks.size,
      completedPlaybacks: this.completedPlaybacks.length,
      isEnabled: this.isEnabled
    };
  }

  // Enable/disable tracking
  setEnabled(enabled) {
    this.isEnabled = enabled;
    logInfo('Proof of play tracking', enabled ? 'enabled' : 'disabled');
  }

  // Clean up old completed playbacks (keep last 100)
  cleanup() {
    if (this.completedPlaybacks.length > 100) {
      const removed = this.completedPlaybacks.splice(0, this.completedPlaybacks.length - 100);
      logInfo('Cleaned up old playback records:', removed.length);
    }
  }
}

// Enhanced video playback wrapper with proof of play tracking
class TrackedVideoPlayer {
  static async playVideo(file, signal, currentAd, originalPlayVideoFn) {
    let trackingId = null;
    
    try {
      // Start tracking
      if (window.proofOfPlayTracker && currentAd) {
        trackingId = window.proofOfPlayTracker.startTracking(currentAd, 'video');
      }

      // Create a promise wrapper around the original playVideo function
      const playbackPromise = new Promise((resolve, reject) => {
        // Call the original playVideo function with enhanced callbacks
        const enhancedResolve = () => {
          if (trackingId) {
            window.proofOfPlayTracker.endTracking(trackingId, 'completed');
          }
          resolve();
        };

        const enhancedReject = (error) => {
          if (trackingId) {
            window.proofOfPlayTracker.endTracking(trackingId, 'error');
            window.proofOfPlayTracker.addPlaybackEvent(trackingId, 'ERROR', { error: error.message });
          }
          reject(error);
        };

        // Monitor signal for abortion
        if (signal && signal.aborted) {
          if (trackingId) {
            window.proofOfPlayTracker.endTracking(trackingId, 'aborted');
          }
          resolve();
          return;
        }

        // Add abort listener
        if (signal) {
          signal.addEventListener('abort', () => {
            if (trackingId) {
              window.proofOfPlayTracker.endTracking(trackingId, 'aborted');
            }
          });
        }

        // Call original function with enhanced callbacks
        originalPlayVideoFn(file, signal, currentAd)
          .then(enhancedResolve)
          .catch(enhancedReject);
      });

      // Add buffering and play events
      if (trackingId) {
        window.proofOfPlayTracker.addPlaybackEvent(trackingId, 'PLAYBACK_STARTED', {
          fileName: file,
          expectedDuration: currentAd?.duration
        });
      }

      await playbackPromise;

    } catch (error) {
      logError('Enhanced video playback failed:', error);
      if (trackingId) {
        window.proofOfPlayTracker.endTracking(trackingId, 'error');
      }
      throw error;
    }
  }
}

// Enhanced image playback wrapper with proof of play tracking
class TrackedImagePlayer {
  static async playImage(file, signal, currentAd, originalPlayImageFn) {
    let trackingId = null;
    
    try {
      // Start tracking
      if (window.proofOfPlayTracker && currentAd) {
        trackingId = window.proofOfPlayTracker.startTracking(currentAd, 'image');
      }

      // Add display event
      if (trackingId) {
        window.proofOfPlayTracker.addPlaybackEvent(trackingId, 'IMAGE_DISPLAY_STARTED', {
          fileName: file
        });
      }

      // Call original function
      await originalPlayImageFn(file, signal);

      // End tracking
      if (trackingId) {
        window.proofOfPlayTracker.endTracking(trackingId, 'completed');
      }

    } catch (error) {
      logError('Enhanced image playback failed:', error);
      if (trackingId) {
        window.proofOfPlayTracker.endTracking(trackingId, 'error');
      }
      throw error;
    }
  }
}

// Global instance
window.proofOfPlayTracker = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.proofOfPlayTracker = new ProofOfPlayTracker();
  
  // Record content download events
  window.proofOfPlayTracker.recordEvent('CONTENT_DOWNLOAD_STARTED', {
    timestamp: new Date().toISOString()
  });
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ProofOfPlayTracker,
    TrackedVideoPlayer,
    TrackedImagePlayer
  };
}
