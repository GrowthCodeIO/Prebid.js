/**
 * This module adds GrowthCode EIDs to Bid Requests by reading the EID blob
 * from localStorage (populated by gc_superscript via /v4/sync).
 * @module modules/growthCodeRtdProvider
 */
import { submodule } from '../src/hook.js';
import { getStorageManager } from '../src/storageManager.js';
import { logMessage, logError, mergeDeep } from '../src/utils.js';
import { MODULE_TYPE_RTD } from '../src/activities/modules.js';

const MODULE_NAME = 'growthCodeRtd';
const LOG_PREFIX = 'GrowthCodeRtd: ';
const EID_BLOB_KEY = 'gceb';
// Event dispatched by gc_superscript once it has written the EID blob.
const EID_READY_EVENT = 'growthCodeEIDArrayPresentEvent';
// Max time (ms) to wait for the blob on a cold load. Must be <= auctionDelay.
const DEFAULT_WAIT_MS = 1000;
const POLL_INTERVAL_MS = 50;

export const storage = getStorageManager({ moduleType: MODULE_TYPE_RTD, moduleName: MODULE_NAME });

export const growthCodeRtdProvider = {
  name: MODULE_NAME,
  init: init,
  getBidRequestData: alterBidRequests,
};

/**
 * Parse json if possible, else return null
 * @param data
 * @returns {any|null}
 */
function tryParse(data) {
  try {
    return JSON.parse(data);
  } catch (err) {
    logError(err);
    return null;
  }
}

/**
 * Init The RTD Module
 * @param config
 * @param userConsent
 * @returns {boolean}
 */
function init(config, userConsent) {
  if (config == null) {
    return false;
  }

  return true;
}

/**
 * Read the EID blob from localStorage and merge any valid EIDs into
 * ortb2.user.ext.eids for all bidders.
 * @param reqBidsConfigObj
 * @returns {boolean} true if EIDs were injected, false if nothing usable was found
 */
function injectEids(reqBidsConfigObj) {
  const eidBlob = storage.getDataFromLocalStorage(EID_BLOB_KEY, null);
  if (eidBlob === null) {
    return false;
  }
  const parsed = tryParse(eidBlob);
  if (!parsed || !Array.isArray(parsed)) {
    return false;
  }
  const validEids = parsed.filter(eid => eid.source && eid.uids);
  if (validEids.length === 0) {
    return false;
  }
  mergeDeep(reqBidsConfigObj.ortb2Fragments.global, {
    user: {
      ext: {
        eids: validEids
      }
    }
  });
  logMessage(LOG_PREFIX + 'Injected ' + validEids.length + ' EIDs into bidstream');
  return true;
}

/**
 * Inject EIDs into ortb2.user.ext.eids for all bidders.
 *
 * Warm path: the EID blob is already in localStorage (2nd+ page load) — inject
 * synchronously and release the auction.
 *
 * Cold path: the blob has not been written yet by gc_superscript. Rather than
 * releasing the auction immediately (and missing the EIDs), wait for the
 * `growthCodeEIDArrayPresentEvent`, a localStorage poll, or a timeout —
 * whichever comes first — then inject and release. This spends the auctionDelay
 * budget, so it only helps when the provider is configured with
 * `waitForIt: true` and a non-zero `auctionDelay`.
 * @param reqBidsConfigObj
 * @param callback
 * @param config
 * @param userConsent
 */
function alterBidRequests(reqBidsConfigObj, callback, config, userConsent) {
  // Warm path — blob already present.
  if (injectEids(reqBidsConfigObj)) {
    callback();
    return;
  }

  // Cold path — wait for gc_superscript to write the blob.
  const waitMs = (config && config.params && config.params.eidWaitMs) || DEFAULT_WAIT_MS;

  let settled = false;
  let pollTimer;
  let maxTimer;

  const finish = () => {
    if (settled) {
      return;
    }
    settled = true;
    if (pollTimer) {
      clearInterval(pollTimer);
    }
    if (maxTimer) {
      clearTimeout(maxTimer);
    }
    window.removeEventListener(EID_READY_EVENT, onReady);
    injectEids(reqBidsConfigObj);
    callback();
  };

  const onReady = () => finish();

  window.addEventListener(EID_READY_EVENT, onReady);
  pollTimer = setInterval(() => {
    if (storage.getDataFromLocalStorage(EID_BLOB_KEY, null) !== null) {
      finish();
    }
  }, POLL_INTERVAL_MS);
  maxTimer = setTimeout(finish, waitMs);

  // Cover the race where the blob landed between the warm check and listener setup.
  if (storage.getDataFromLocalStorage(EID_BLOB_KEY, null) !== null) {
    finish();
  }
}

submodule('realTimeData', growthCodeRtdProvider);
