/**
 * growthCodeAnalyticsAdapter.js - GrowthCode Analytics Adapter
 */
import { ajax } from '../src/ajax.js';
import adapter from '../libraries/analyticsAdapter/AnalyticsAdapter.js';
import adapterManager from '../src/adapterManager.js';
import * as utils from '../src/utils.js';
import { EVENTS } from '../src/constants.js';
import { getStorageManager } from '../src/storageManager.js';
import { getRefererInfo } from '../src/refererDetection.js';
import { logError, logInfo } from '../src/utils.js';
import { MODULE_TYPE_ANALYTICS } from '../src/activities/modules.js';

const MODULE_NAME = 'growthCodeAnalytics';
const DEFAULT_PID = 'INVALID_PID';
const ENDPOINT_URL = 'https://ids.api.gcprivacy.id/v4/analytics';
const ANALYTICS_SOURCE = 'prebid_module';

export const storage = getStorageManager({ moduleType: MODULE_TYPE_ANALYTICS, moduleName: MODULE_NAME });

const sessionId = utils.generateUUID();

let trackEvents = [];
let pid = DEFAULT_PID;
let url = ENDPOINT_URL;

let bidWonQueue = [];
let batchQueue = [];

const analyticsType = 'endpoint';

const growthCodeAnalyticsAdapter = Object.assign(adapter({ url: url, analyticsType }), {
  track({ eventType, args }) {
    // bidWon is sent immediately, on its own, regardless of trackEvents config --
    // existing/tested behavior, independent of the batched events below.
    if (eventType === EVENTS.BID_WON) {
      queueBidWon(args ? { ...args } : {});
    }

    if (!trackEvents.includes(eventType)) return;

    switch (eventType) {
      case EVENTS.BID_REQUESTED:
        queueBidRequested(args || {});
        break;

      case EVENTS.BID_RESPONSE:
        queueBidResponse(args || {});
        break;

      case EVENTS.NO_BID:
        queueNoBid(args || {});
        break;

      case EVENTS.BID_TIMEOUT:
        queueBidTimeout(args || []);
        break;

      case EVENTS.AUCTION_END:
        // Auction end is the batch boundary: queue a summary row, then flush
        // everything accumulated since the last flush in a single request.
        queueAuctionEnd(args || {});
        flushBatchQueue();
        break;

      default:
        break;
    }
  }
});

growthCodeAnalyticsAdapter.originEnableAnalytics = growthCodeAnalyticsAdapter.enableAnalytics;

growthCodeAnalyticsAdapter.enableAnalytics = function(conf = {}) {
  trackEvents = [];
  if (typeof conf.options === 'object') {
    if (conf.options.pid) {
      pid = conf.options.pid;
      url = conf.options.url ? conf.options.url : ENDPOINT_URL;
    } else {
      logError(MODULE_NAME + ' Not a valid PartnerID');
      return;
    }
    if (conf.options.trackEvents) {
      trackEvents = conf.options.trackEvents;
    }
  } else {
    logError(MODULE_NAME + ' Invalid configuration');
    return;
  }

  growthCodeAnalyticsAdapter.originEnableAnalytics(conf);
};

function pushRow(queue, row) {
  queue.push({
    _eids: row._eids || [],
    timestamp: row.timestamp || Date.now(),
    event: row.event,
    bidder: row.bidder || '',
    currency: row.currency || '',
    cpm: row.cpm || 0,
    auction_id: row.auction_id || '',
    ad_unit_code: row.ad_unit_code || '',
    ad_id: row.ad_id || '',
    advertiser_domains: row.advertiser_domains || []
  });
}

// Shared by the immediate bidWon send and the batched auctionEnd send: both
// send the same AnalyticsPayload shape, just with a different set of rows.
function sendPayload(queue) {
  const gcid = storage.getDataFromLocalStorage('gcid') || '';
  if (pid === DEFAULT_PID || queue.length === 0 || !gcid) return false;

  const allEids = [...new Set(queue.flatMap(e => e._eids))];
  const events = queue.map(({ _eids, ...entry }) => entry);

  const payload = {
    bucket_id: storage.getDataFromLocalStorage('gcABbucket') || '',
    gctest: false,
    ssp_count: allEids.length,
    live_intent: allEids.includes('liveintent.com'),
    pbjs_name: 'pbjs',
    gc_session_id: sessionId,
    gc_event_id: utils.generateUUID(),
    have_hem: !!(storage.getDataFromLocalStorage('gc_h1') && storage.getDataFromLocalStorage('gc_h3')),
    hem_source: storage.getDataFromLocalStorage('gc_hs') || '',
    eids: allEids,
    analytics_source: ANALYTICS_SOURCE,
    events
  };

  const requestUrl = url +
    '?gcid=' + encodeURIComponent(gcid) +
    '&pid=' + encodeURIComponent(pid) +
    '&u=' + encodeURIComponent(getRefererInfo().page || '');

  ajax(requestUrl, {
    success: () => logInfo(MODULE_NAME + ': analytics sent'),
    error: (err) => logInfo(MODULE_NAME + ': analytics error: ' + err)
  }, JSON.stringify(payload), { method: 'POST', withCredentials: true });

  return true;
}

function queueBidWon(bid) {
  const advertiserDomains = (bid.meta && Array.isArray(bid.meta.advertiserDomains))
    ? bid.meta.advertiserDomains : [];

  pushRow(bidWonQueue, {
    _eids: (bid.userIdAsEids || []).map(e => e.source),
    timestamp: bid.responseTimestamp || Date.now(),
    event: 'winningBid',
    bidder: bid.bidderCode || '',
    currency: bid.currency || '',
    cpm: bid.cpm || 0,
    auction_id: bid.auctionId || '',
    ad_unit_code: bid.adUnitCode || '',
    ad_id: bid.adId || '',
    advertiser_domains: advertiserDomains
  });

  if (sendPayload(bidWonQueue)) bidWonQueue = [];
}

// bidRequested carries one bidder request with multiple bids (one per ad
// unit) -- queue one row per bid, all folded into the single auctionEnd batch
// request rather than sent individually.
function queueBidRequested(bidderRequest) {
  const bids = bidderRequest.bids || [];
  bids.forEach(bid => {
    pushRow(batchQueue, {
      event: 'bidRequested',
      bidder: bid.bidder || bidderRequest.bidderCode || '',
      auction_id: bidderRequest.auctionId || '',
      ad_unit_code: bid.adUnitCode || ''
    });
  });
}

function queueBidResponse(bid) {
  const advertiserDomains = (bid.meta && Array.isArray(bid.meta.advertiserDomains))
    ? bid.meta.advertiserDomains : [];

  pushRow(batchQueue, {
    _eids: (bid.userIdAsEids || []).map(e => e.source),
    event: 'bidResponse',
    bidder: bid.bidderCode || '',
    currency: bid.currency || '',
    cpm: bid.cpm || 0,
    auction_id: bid.auctionId || '',
    ad_unit_code: bid.adUnitCode || '',
    ad_id: bid.adId || '',
    advertiser_domains: advertiserDomains
  });
}

function queueNoBid(bid) {
  pushRow(batchQueue, {
    event: 'noBid',
    bidder: bid.bidderCode || '',
    auction_id: bid.auctionId || '',
    ad_unit_code: bid.adUnitCode || ''
  });
}

// bidTimeout carries an array of timed-out bidder/ad-unit entries directly
// (not wrapped in an object) -- queue one row per entry.
function queueBidTimeout(timedOutBids) {
  (timedOutBids || []).forEach(bid => {
    pushRow(batchQueue, {
      event: 'bidTimeout',
      bidder: bid.bidder || '',
      auction_id: bid.auctionId || '',
      ad_unit_code: bid.adUnitCode || ''
    });
  });
}

// auctionEnd is an auction-level summary, not a per-bidder event -- the
// backend schema has no per-event field for it beyond a marker row.
function queueAuctionEnd(auction) {
  pushRow(batchQueue, {
    event: 'auctionEnd',
    auction_id: auction.auctionId || ''
  });
}

function flushBatchQueue() {
  if (sendPayload(batchQueue)) batchQueue = [];
}

adapterManager.registerAnalyticsAdapter({
  adapter: growthCodeAnalyticsAdapter,
  code: 'growthCodeAnalytics'
});

export default growthCodeAnalyticsAdapter;
