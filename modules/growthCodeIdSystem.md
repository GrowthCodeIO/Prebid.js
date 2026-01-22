## GrowthCode User ID Submodule

GrowthCode provides Id Enrichment for requests.

## Building Prebid with GrowthCode Support

First, make sure to add the GrowthCode submodule to your Prebid.js package with:

```
gulp build --modules=growthCodeIdSystem,userId
```

The following configuration parameters are available:

```javascript
pbjs.setConfig({
  userSync: {
    userIds: [{
      name: 'growthCodeId',
      params: {
          customerEids: 'customerEids',
          eidsFunction: () => ([
            {source: 'example.com', uids: [{id: 'func-id-123', atype: 1}]}
          ])
      }
    }]
  }
});
```

### Sample Eids
Below is an example of the EIDs stored in Local Store (customerEids)
```json
[
   {
      "source":"domain.com",
      "uids":[
         {
            "id":"8212212191539393121",
            "ext":{
               "stype":"ppuid"
            }
         }
      ]
   },
   {
      "source":"example.com",
      "uids":[
         {
            "id":"e06e9e5a-273c-46f8-aace-6f62cf13ea71",
            "ext":{
               "stype":"ppuid"
            }
         }
      ]
   }
]
```

## Testing

Run the module unit tests:

```
npx gulp test --nolint --file test/spec/modules/growthCodeIdSystem_spec.js
```

Run the userId integration tests (optional):

```
npx gulp test --nolint --file test/spec/modules/userId_spec.js
```
