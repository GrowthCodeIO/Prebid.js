import adapterManager from '../../../src/adapterManager.js';
import growthCodeAnalyticsAdapter, { storage } from '../../../modules/growthCodeAnalyticsAdapter.js';
import { expect } from 'chai';
import * as events from '../../../src/events.js';
import { EVENTS } from '../../../src/constants.js';
import { generateUUID } from '../../../src/utils.js';
import * as ajax from '../../../src/ajax.js';

describe('growthCode analytics adapter', () => {
  let sandbox;
  let ajaxCalls;

  before(() => {
    sandbox = sinon.createSandbox();
    ajaxCalls = [];
    sandbox.stub(ajax, 'ajax').callsFake((...args) => ajaxCalls.push(args));
  });

  after(() => {
    sandbox.restore();
  });

  beforeEach(() => {
    ajaxCalls = [];
    sinon.stub(events, 'getEvents').returns([]);
    storage.setDataInLocalStorage('gcid', 'test-gcid-123');
    growthCodeAnalyticsAdapter.enableAnalytics({
      provider: 'growthCodeAnalytics',
      options: { pid: 'TEST01' }
    });
  });

  afterEach(() => {
    ['gcid', 'gcABbucket', 'gc_h1', 'gc_h3', 'gc_hs'].forEach(k => storage.removeDataFromLocalStorage(k));
    growthCodeAnalyticsAdapter.disableAnalytics();
    events.getEvents.restore();
  });

  function lastCall() {
    return ajaxCalls[ajaxCalls.length - 1];
  }

  it('registers itself with the adapter manager', () => {
    const adapter = adapterManager.getAnalyticsAdapter('growthCodeAnalytics');
    expect(adapter).to.exist;
    expect(adapter.adapter).to.equal(growthCodeAnalyticsAdapter);
  });

  it('tolerates undefined or empty config', () => {
    growthCodeAnalyticsAdapter.enableAnalytics(undefined);
    growthCodeAnalyticsAdapter.enableAnalytics({});
  });

  it('sends bid won events with the correct AnalyticsPayload structure', () => {
    const bid = {
      auctionId: generateUUID(),
      bidderCode: 'appnexus',
      currency: 'USD',
      cpm: 1.50,
      adUnitCode: 'div-gpt-ad-1',
      adId: 'abc123',
      responseTimestamp: 1700000000000,
      userIdAsEids: [{ source: 'growthcode.io', uids: [{ id: 'gc-uid-1' }] }],
      meta: { advertiserDomains: ['example.com'] }
    };

    events.emit(EVENTS.BID_WON, bid);

    expect(ajaxCalls.length).to.be.greaterThan(0);

    const [url, , bodyStr] = lastCall();
    const body = JSON.parse(bodyStr);

    expect(url).to.include('gcid=test-gcid-123');
    expect(url).to.include('pid=TEST01');

    expect(body.analytics_source).to.equal('prebid_module');
    expect(body.gc_session_id).to.be.a('string');
    expect(body.gc_event_id).to.be.a('string');
    expect(body.ssp_count).to.equal(1);
    expect(body.eids).to.deep.equal(['growthcode.io']);
    expect(body.live_intent).to.equal(false);

    expect(body.events).to.have.length(1);
    const e = body.events[0];
    expect(e.event).to.equal('winningBid');
    expect(e.bidder).to.equal('appnexus');
    expect(e.currency).to.equal('USD');
    expect(e.cpm).to.equal(1.50);
    expect(e.auction_id).to.equal(bid.auctionId);
    expect(e.ad_unit_code).to.equal('div-gpt-ad-1');
    expect(e.ad_id).to.equal('abc123');
    expect(e.advertiser_domains).to.deep.equal(['example.com']);
    expect(e.timestamp).to.equal(bid.responseTimestamp);
    expect(e).to.not.have.property('_eids');
    expect(e).to.not.have.property('time_stamp');
  });

  it('fires bid won even when trackEvents is not configured', () => {
    events.emit(EVENTS.BID_WON, {
      auctionId: generateUUID(),
      bidderCode: 'appnexus',
      cpm: 1.0,
      currency: 'USD',
      adUnitCode: 'div-1',
      adId: 'ad0',
      meta: {}
    });
    expect(ajaxCalls.length).to.equal(1);
  });

  it('sets live_intent true when liveintent.com is in eids', () => {
    events.emit(EVENTS.BID_WON, {
      auctionId: generateUUID(),
      bidderCode: 'appnexus',
      cpm: 1.0,
      currency: 'USD',
      adUnitCode: 'div-1',
      adId: 'ad1',
      userIdAsEids: [{ source: 'liveintent.com' }, { source: 'growthcode.io' }],
      meta: {}
    });

    const body = JSON.parse(lastCall()[2]);
    expect(body.live_intent).to.equal(true);
    expect(body.ssp_count).to.equal(2);
  });

  it('sets have_hem true when HEM keys are in localStorage', () => {
    storage.setDataInLocalStorage('gc_h1', 'md5hash');
    storage.setDataInLocalStorage('gc_h3', 'sha256hash');

    events.emit(EVENTS.BID_WON, {
      auctionId: generateUUID(),
      bidderCode: 'rubicon',
      cpm: 2.0,
      currency: 'USD',
      adUnitCode: 'div-1',
      adId: 'ad2',
      meta: {}
    });

    const body = JSON.parse(lastCall()[2]);
    expect(body.have_hem).to.equal(true);
  });

  it('includes bucket_id from localStorage', () => {
    storage.setDataInLocalStorage('gcABbucket', 'bucket-D');

    events.emit(EVENTS.BID_WON, {
      auctionId: generateUUID(),
      bidderCode: 'appnexus',
      cpm: 1.0,
      currency: 'USD',
      adUnitCode: 'div-1',
      adId: 'ad3',
      meta: {}
    });

    const body = JSON.parse(lastCall()[2]);
    expect(body.bucket_id).to.equal('bucket-D');
  });

  it('does not send a request when gcid is missing', () => {
    storage.removeDataFromLocalStorage('gcid');

    events.emit(EVENTS.BID_WON, {
      auctionId: generateUUID(),
      bidderCode: 'appnexus',
      cpm: 1.0,
      currency: 'USD',
      adUnitCode: 'div-1',
      adId: 'ad4',
      meta: {}
    });

    expect(ajaxCalls.length).to.equal(0);
  });

  it('does not send requests for non-bidWon events when trackEvents is empty', () => {
    events.emit(EVENTS.AUCTION_END, { auctionId: generateUUID() });
    events.emit(EVENTS.BID_RESPONSE, { bidderCode: 'appnexus', cpm: 1.0 });
    events.emit(EVENTS.AUCTION_INIT, { auctionId: generateUUID() });
    expect(ajaxCalls.length).to.equal(0);
  });

  it('handles missing meta.advertiserDomains gracefully', () => {
    events.emit(EVENTS.BID_WON, {
      auctionId: generateUUID(),
      bidderCode: 'appnexus',
      cpm: 1.0,
      currency: 'USD',
      adUnitCode: 'div-1',
      adId: 'ad5',
      meta: null
    });

    const body = JSON.parse(lastCall()[2]);
    expect(body.events[0].advertiser_domains).to.deep.equal([]);
  });
});
