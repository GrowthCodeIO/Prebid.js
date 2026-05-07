## GrowthCode Real-time Data Submodule

The [GrowthCode](https://growthcode.io) real-time data module in Prebid enables publishers to fully 
leverage the potential of their first-party audiences and contextual data. 

This module reads the EID blob from localStorage (populated by the GrowthCode 
pixel via `/v4/sync`) and injects all resolved universal IDs into the Prebid 
`ortb2.user.eids` array. Supported IDs include GCID, UID2, ID5, Criteo, 
Xandr, TradeDesk, Panorama, and 25+ additional providers.

## Building Prebid with GrowthCode Support

Compile the GrowthCode RTD module into your Prebid build:

`gulp serve --modules=userId,rtdModule,appnexusBidAdapter,growthCodeRtdProvider,sharedIdSystem,criteoBidAdapter`

Please visit https://growthcode.io/ for more information.

```
pbjs.setConfig(
    ...
    realTimeData: {
         auctionDelay: 1000,
          dataProviders: [
          {
            name: 'growthCodeRtd',
            waitForIt: true,
            params: {
              pid: 'TEST01',
            }
          }
       ]
    }
    ...
}
```

### Parameter Descriptions for the GrowthCode Configuration Section

| Name                             | Type    | Description                                                               | Notes                       |
|:---------------------------------|:--------|:--------------------------------------------------------------------------|:----------------------------|
| name                             | String  | Real time data module name                                                | Always 'growthCodeRtd'             |
| waitForIt                        | Boolean | Required to ensure that the auction is delayed until prefetch is complete | Optional. Defaults to false |
| params                           | Object  |                                                                           |                             |
| params.pid                       | String  | This is the Partner ID value obtained from GrowthCode                     | `TEST01`                    |

### How It Works

1. The GrowthCode pixel (`gc_superscript`) calls `/v4/sync` and writes the EID blob to `localStorage['gceb']`
2. At auction time, this RTD module reads `gceb` from localStorage
3. Parsed EIDs are injected into `ortb2.user.eids` for all bidders
4. No server call is needed — all data is already available locally

## Testing

To view an example of GrowthCode backends:

`gulp serve --modules=userId,rtdModule,appnexusBidAdapter,growthCodeRtdProvider,sharedIdSystem,criteoBidAdapter`

and then point your browser at:

`http://localhost:9999/integrationExamples/gpt/growthcode.html`
