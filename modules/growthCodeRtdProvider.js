/**
 * This module adds GrowthCode EIDs to Bid Requests by reading the EID blob
 * from localStorage (populated by gc_superscript via /v4/sync).
 * @module modules/growthCodeRtdProvider
 */
import { submodule } from '../src/hook.js'
import { getStorageManager } from '../src/storageManager.js';
import { logMessage, logError, mergeDeep } from '../src/utils.js';
import { MODULE_TYPE_RTD } from '../src/activities/modules.js';

const MODULE_NAME = 'growthCodeRtd';
const LOG_PREFIX = 'GrowthCodeRtd: ';
const EID_BLOB_KEY = 'gceb';

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
  logMessage(LOG_PREFIX + 'Init');

  if (config == null) {
    return false;
  }

  return true;
}

/**
 * Inject EIDs into ortb2.user.eids for all bidders
 * @param reqBidsConfigObj
 * @param callback
 * @param config
 * @param userConsent
 */
function alterBidRequests(reqBidsConfigObj, callback, config, userConsent) {
  const eidBlob = storage.getDataFromLocalStorage(EID_BLOB_KEY, null);
  if (eidBlob !== null) {
    const parsed = tryParse(eidBlob);
    if (parsed && Array.isArray(parsed)) {
      const validEids = parsed.filter(eid => eid.source && eid.uids);
      if (validEids.length > 0) {
        mergeDeep(reqBidsConfigObj.ortb2Fragments.global, {
          user: {
            ext: {
              eids: validEids
            }
          }
        });
        logMessage(LOG_PREFIX + 'Injected ' + validEids.length + ' EIDs into bidstream');
      }
    }
  }
  callback();
}

submodule('realTimeData', growthCodeRtdProvider);
