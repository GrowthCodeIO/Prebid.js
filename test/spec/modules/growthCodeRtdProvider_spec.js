import { config } from 'src/config.js';
import { growthCodeRtdProvider, storage } from '../../../modules/growthCodeRtdProvider.js';
import sinon from 'sinon';

const sampleConfig = {
  name: 'growthCodeRtd',
  waitForIt: true,
  params: {
    pid: 'TEST01',
  }
};

const sampleEids = [
  {
    source: 'growthcode.io',
    inserter: 'growthcode.io',
    uids: [{ id: 'gc-test-id-123', atype: 1 }]
  },
  {
    source: 'uidapi.com',
    inserter: 'growthcode.io',
    uids: [{ id: 'uid2-test-id-456', atype: 3 }]
  },
  {
    source: 'id5-sync.com',
    inserter: 'growthcode.io',
    uids: [{ id: 'id5-test-id-789', atype: 1 }]
  }
];

describe('growthCodeRtdProvider', function() {
  let getDataStub;

  beforeEach(function() {
    config.resetConfig();
    getDataStub = sinon.stub(storage, 'getDataFromLocalStorage');
  });

  afterEach(function () {
    getDataStub.restore();
  });

  describe('init', function() {
    it('returns false when config is null', function () {
      expect(growthCodeRtdProvider.init(null, null)).to.equal(false);
    });

    it('returns true with valid config', function () {
      expect(growthCodeRtdProvider.init(sampleConfig, null)).to.equal(true);
    });
  });

  describe('getBidRequestData', function() {
    it('reads gceb from localStorage and injects EIDs into ortb2.user.ext.eids', function (done) {
      growthCodeRtdProvider.init(sampleConfig, null);
      getDataStub.withArgs('gceb', null).returns(JSON.stringify(sampleEids));

      const bidConfig = {
        ortb2Fragments: {
          global: {
            user: {}
          }
        }
      };

      growthCodeRtdProvider.getBidRequestData(bidConfig, function () {
        const userEids = bidConfig.ortb2Fragments.global.user.ext.eids;
        expect(userEids).to.have.length(3);
        expect(userEids[0].source).to.equal('growthcode.io');
        expect(userEids[0].uids[0].id).to.equal('gc-test-id-123');
        expect(userEids[1].source).to.equal('uidapi.com');
        expect(userEids[2].source).to.equal('id5-sync.com');
        done();
      }, sampleConfig, null);
    });

    it('does not duplicate existing EIDs', function (done) {
      growthCodeRtdProvider.init(sampleConfig, null);
      getDataStub.withArgs('gceb', null).returns(JSON.stringify(sampleEids));

      const existingEid = {
        source: 'growthcode.io',
        inserter: 'growthcode.io',
        uids: [{ id: 'gc-test-id-123', atype: 1 }]
      };

      const bidConfig = {
        ortb2Fragments: {
          global: {
            user: {
              ext: {
                eids: [existingEid]
              }
            }
          }
        }
      };

      growthCodeRtdProvider.getBidRequestData(bidConfig, function () {
        const userEids = bidConfig.ortb2Fragments.global.user.ext.eids;
        expect(userEids).to.have.length(3);
        expect(userEids[0].source).to.equal('growthcode.io');
        expect(userEids[0].uids[0].id).to.equal('gc-test-id-123');
        done();
      }, sampleConfig, null);
    });

    it('calls callback when gceb is invalid JSON', function (done) {
      growthCodeRtdProvider.init(sampleConfig, null);
      getDataStub.withArgs('gceb', null).returns('not-valid-json');

      const bidConfig = { ortb2Fragments: { global: {} } };

      growthCodeRtdProvider.getBidRequestData(bidConfig, function () {
        expect(bidConfig.ortb2Fragments.global.user).to.be.undefined;
        done();
      }, sampleConfig, null);
    });

    it('filters out EIDs without source or uids', function (done) {
      growthCodeRtdProvider.init(sampleConfig, null);
      const mixedEids = [
        { source: 'growthcode.io', uids: [{ id: 'valid', atype: 1 }] },
        { source: '', uids: [{ id: 'no-source', atype: 1 }] },
        { source: 'missing-uids.com' },
      ];
      getDataStub.withArgs('gceb', null).returns(JSON.stringify(mixedEids));

      const bidConfig = { ortb2Fragments: { global: {} } };

      growthCodeRtdProvider.getBidRequestData(bidConfig, function () {
        const userEids = bidConfig.ortb2Fragments.global.user.ext.eids;
        expect(userEids).to.have.length(1);
        expect(userEids[0].source).to.equal('growthcode.io');
        done();
      }, sampleConfig, null);
    });
  });

  describe('getBidRequestData - cold start (gceb not yet written)', function() {
    let clock;

    beforeEach(function () {
      clock = sinon.useFakeTimers();
    });

    afterEach(function () {
      clock.restore();
    });

    it('waits and injects when growthCodeEIDArrayPresentEvent fires', function (done) {
      getDataStub.withArgs('gceb', null).returns(null); // absent at auction time

      const bidConfig = { ortb2Fragments: { global: {} } };

      growthCodeRtdProvider.getBidRequestData(bidConfig, function () {
        const userEids = bidConfig.ortb2Fragments.global.user.ext.eids;
        expect(userEids).to.have.length(3);
        expect(userEids[0].source).to.equal('growthcode.io');
        done();
      }, sampleConfig, null);

      // gc_superscript finishes /v4/sync, writes the blob and fires the event.
      getDataStub.withArgs('gceb', null).returns(JSON.stringify(sampleEids));
      window.dispatchEvent(new Event('growthCodeEIDArrayPresentEvent'));
    });

    it('injects when the blob appears via polling', function (done) {
      getDataStub.withArgs('gceb', null).returns(null);

      const bidConfig = { ortb2Fragments: { global: {} } };

      growthCodeRtdProvider.getBidRequestData(bidConfig, function () {
        const userEids = bidConfig.ortb2Fragments.global.user.ext.eids;
        expect(userEids).to.have.length(3);
        done();
      }, sampleConfig, null);

      // Blob written shortly after, with no event dispatched — poll should catch it.
      getDataStub.withArgs('gceb', null).returns(JSON.stringify(sampleEids));
      clock.tick(50);
    });

    it('releases the auction without eids after the wait times out', function (done) {
      getDataStub.withArgs('gceb', null).returns(null); // never written

      const bidConfig = { ortb2Fragments: { global: {} } };

      growthCodeRtdProvider.getBidRequestData(bidConfig, function () {
        expect(bidConfig.ortb2Fragments.global.user).to.be.undefined;
        done();
      }, sampleConfig, null);

      clock.tick(1000); // DEFAULT_WAIT_MS
    });

    it('honors a custom params.eidWaitMs timeout', function (done) {
      getDataStub.withArgs('gceb', null).returns(null);
      const cfg = { name: 'growthCodeRtd', waitForIt: true, params: { pid: 'TEST01', eidWaitMs: 300 } };

      const bidConfig = { ortb2Fragments: { global: {} } };
      let called = false;

      growthCodeRtdProvider.getBidRequestData(bidConfig, function () {
        called = true;
        done();
      }, cfg, null);

      clock.tick(299);
      expect(called).to.equal(false); // not yet
      clock.tick(1);
    });
  });
});
