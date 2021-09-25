const marketplaceHelper = require('../helpers/marketplace-helper');

const banned = require('../../banned.json');

const { DB } = require('../db');

const chainHelper = require('../helpers/chain-helper');

const listen = async () => {

  if (!await marketplaceHelper.init()) {
    return;
  }

  if (!await chainHelper.init()) {
    return;
  }

  let chains = chainHelper.getSupportedChains();

  for(var chain in chains) {
    const chainName = chainHelper.getChainName(chains[chain]);

    console.log(
      '[' + chains[chain] + '-' + chainName + ':Listener]'
    );

    const createOrUpdate = async (nftAddress, nftId, price, seller) => {
      if (banned.includes(seller)) return;
      if (await marketplaceHelper.isUserBanned(seller)) return;

      const collection = chainHelper.getCollection(nftAddress);
      const type = chainHelper.getNftTypeOfAddress(nftAddress);
      const data = await marketplaceHelper.getNFTData(type, nftId, price, seller);
      const idKey = chainHelper.getIdKey(nftAddress);
      const net = chainHelper.getNetworkValueOfChain(nftAddress);

      if (!collection || !idKey || !net) return;

      await DB[collection].replaceOne({ [idKey]: nftId, network: net }, data, { upsert: true });
    };

    const remove = async (nftAddress, nftId) => {
      const collection = chainHelper.getCollection(nftAddress);
      const idKey = chainHelper.getIdKey(nftAddress);
      const net = chainHelper.getNetworkValueOfChain(nftAddress);

      if (!collection || !idKey || !net) return;

      await DB[collection].deleteOne({ [idKey]: nftId, network: net });
    };

   const addTransaction = async (nftAddress, nftId) => {
      const collection = chainHelper.getCollection(nftAddress);
      const idKey = chainHelper.getIdKey(nftAddress);
      const net = chainHelper.getNetworkValueOfChain(nftAddress);

      if (!collection || !idKey || !net) return;

      const currentMarketEntry = await DB[collection].findOne({ [idKey]: nftId, network: net });
      if (currentMarketEntry) {
        const type = chainHelper.getTypeName(nftAddress);
        const { _id, ...data } = currentMarketEntry;
        await DB.$marketSales.insert({ type, [type]: data });
      }
    };

    const onNewListing = async (seller, nftAddress, nftId, price) => {
      createOrUpdate(nftAddress, nftId.toString(), price, seller).then(() => {
       console.log('[' + chains[chain] + '-MARKET]', `Add ${chainHelper.getTypeName(nftAddress)} ${nftId} from ${seller} for ${marketplaceHelper.realPrice(price)}`);
     }).catch((err) => console.log(`[${chains[chain]}-MARKET ADD ERROR] ${err.message}`));
    };

   const onListingPriceChange = async (seller, nftAddress, nftId, price) => {
      createOrUpdate(nftAddress, nftId.toString(), price, seller).then(() => {
       console.log('[' + chains[chain] + '-MARKET]', `Change ${chainHelper.getTypeName(nftAddress)} ${nftId} from ${seller} for ${marketplaceHelper.realPrice(price)}`);
     }).catch((err) => console.log(`[${chains[chain]}-MARKET CHANGE ERROR] ${err.message}`));
    };

   const onCancelledListing = async (seller, nftAddress, nftId) => {
     remove(nftAddress, nftId.toString()).then(() => {
       console.log('[' + chains[chain] + '-MARKET]', `Cancel ${chainHelper.getTypeName(nftAddress)} ${nftId} from ${seller}`);
     }).catch((err) => console.log(`[${chains[chain]}-MARKET CANCEL ERROR] ${err.message}`));
   };

   const onPurchasedListing = async (buyer, seller, nftAddress, nftId) => {
     addTransaction(nftAddress, nftId.toString()).then(() => {
       remove(nftAddress, nftId.toString()).then(() => {
         console.log('[' + chains[chain] + 'MARKET]', `Sell ${chainHelper.getTypeName(nftAddress)} ${nftId} from ${seller} to ${buyer}`);
       }).catch((err) => console.log(`[${chains[chain]}-MARKET PURCHASE1 ERROR] ${err.message}`));
     }).catch((err) => console.log(`[${chains[chain]}-MARKET PURCHASE2 ERROR] ${err.message}`));
   };

   const setup = () => {
     const nftMarketPlace = chainHelper.getMarketAddress(chains[chain]);

      const events = {
        NewListing: {
         func: onNewListing,
         argsArr: (res) => ([res.seller, res.nftAddress, res.nftID, res.price]),
       },

       ListingPriceChange: {
         func: onListingPriceChange,
         argsArr: (res) => ([res.seller, res.nftAddress, res.nftID, res.newPrice]),
       },

        CancelledListing: {
          func: onCancelledListing,
         argsArr: (res) => ([res.seller, res.nftAddress, res.nftID]),
        },

        PurchasedListing: {
         func: onPurchasedListing,
         argsArr: (res) => ([res.buyer, res.seller, res.nftAddress, res.nftID]),
       },
      };

      nftMarketPlace.events.allEvents({ filter: {} })
       .on('data', (event) => {
         if (!events[event.event]) return;

         events[event.event].func(...events[event.event].argsArr(event.returnValues));
        }).on('error', (err) => {
          console.error('[' + chains[chain] + '-MARKET]', err);
        });
    };

    setup();

    marketplaceHelper.providerEmitter[chains[chain]].on('reconnected:nftMarketPlace', setup);
  }
};

module.exports = {
  listen,
};
