const marketplaceHelper = require('../helpers/marketplace-helper');

const banned = require('../../banned.json');

const { DB } = require('../db');

const chainHelper = require('../helpers/chain-helper');

const chainIteration = async (chain) => {
  const chainName = chainHelper.getChainName(chain);

  console.log(
    `[${chain}-${chainName}:Listener]`,
  );

  const createOrUpdate = async (nftAddress, nftId, price, seller) => {
    if (banned.includes(seller)) return;
    if (await marketplaceHelper.isUserBanned(seller, chain, chainHelper.getMarketAddress(chain), chainHelper.getRPC(chain))) return;

    const collection = chainHelper.getCollection(nftAddress);
    const type = chainHelper.getNftTypeOfAddress(nftAddress);
    const wsp = chainHelper.getWSP(chain);
    const data = await marketplaceHelper.getNFTData(type, nftAddress, chain, wsp, nftId, price, seller);
    const idKey = chainHelper.getIdKey(nftAddress);
    const net = chainHelper.getNetworkValueOfChain(chain);

    if (!collection || !idKey || !net) return;

    data.network = net;

    await DB[collection].replaceOne({ [idKey]: nftId, network: net }, data, { upsert: true });
  };

  const remove = async (nftAddress, nftId) => {
    const collection = chainHelper.getCollection(nftAddress);
    const idKey = chainHelper.getIdKey(nftAddress);
    const net = chainHelper.getNetworkValueOfChain(chain);

    if (!collection || !idKey || !net) return;

    await DB[collection].deleteOne({ [idKey]: nftId, network: net });
  };

  const addTransaction = async (nftAddress, nftId) => {
    const collection = chainHelper.getCollection(nftAddress);
    const idKey = chainHelper.getIdKey(nftAddress);
    const net = chainHelper.getNetworkValueOfChain(chain);

    if (!collection || !idKey || !net) return;

    const currentMarketEntry = await DB[collection].findOne({ [idKey]: nftId, network: net });
    if (currentMarketEntry) {
      const type = chainHelper.getNftTypeOfAddress(nftAddress);
      const { _id, ...data } = currentMarketEntry;
      await DB.$marketSales.insert({ type, [type]: data });
    }
  };

  const onNewListing = async (seller, nftAddress, nftId, price, targetBuyer) => {
    createOrUpdate(nftAddress, nftId.toString(), price, seller).then(() => {
      console.log(`[${chain}-MARKET]`, `Add ${chainHelper.getNftTypeOfAddress(nftAddress)} ${nftId} from ${seller} for ${marketplaceHelper.realPrice(price)} for target ${targetBuyer}`);
    }).catch((err) => console.log(`[${chain}-MARKET ADD ERROR] ${err.message}-${nftAddress}`));
  };

  const onListingPriceChange = async (seller, nftAddress, nftId, price) => {
    createOrUpdate(nftAddress, nftId.toString(), price, seller).then(() => {
      console.log(`[${chain}-MARKET]`, `Change ${chainHelper.getNftTypeOfAddress(nftAddress)} ${nftId} from ${seller} for ${marketplaceHelper.realPrice(price)}`);
    }).catch((err) => console.log(`[${chain}-MARKET CHANGE ERROR] ${err.message}-${nftAddress}`));
  };

  const onCancelledListing = async (seller, nftAddress, nftId) => {
    remove(nftAddress, nftId.toString()).then(() => {
      console.log(`[${chain}-MARKET]`, `Cancel ${chainHelper.getNftTypeOfAddress(nftAddress)} ${nftId} from ${seller}`);
    }).catch((err) => console.log(`[${chain}-MARKET CANCEL ERROR] ${err.message}-${nftAddress}`));
  };

  const onPurchasedListing = async (buyer, seller, nftAddress, nftId) => {
    addTransaction(nftAddress, nftId.toString()).then(() => {
      remove(nftAddress, nftId.toString()).then(() => {
        console.log(`[${chain}-MARKET]`, `Sell ${chainHelper.getNftTypeOfAddress(nftAddress)} ${nftId} from ${seller} to ${buyer}`);
      }).catch((err) => console.log(`[${chain}-MARKET PURCHASE1 ERROR] ${err.message}-${nftAddress}`));
    }).catch((err) => console.log(`[${chain}-MARKET PURCHASE2 ERROR] ${err.message}-${nftAddress}`));
  };

  const setup = () => {
    const nftMarketPlace = marketplaceHelper.getNftMarketPlace(chain, chainHelper.getMarketAddress(chain), chainHelper.getRPC(chain));

    const events = {
      NewListing: {
        func: onNewListing,
        argsArr: (res) => ([res.seller, res.nftAddress, res.nftID, res.price, res.targetBuyer]),
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
        console.error(`[${chain}-MARKET]`, err);
      });
    let interval = 0;

    const checkActive = async () => {
      if (!nftMarketPlace.currentProvider.connected) {
        console.log(`${chain} disconnected`);
        marketplaceHelper.resetMarketPlace(chain);
        clearInterval(interval);
        await new Promise((resolve) => setTimeout(resolve, 120000));
        if (process.env.WEBSOCKET_RECONNECT === 'y') {
          console.log(`${chain} reconnecting`);
          setup();
        } else {
          console.log(`${chain} will not reconnect`);
        }
      }
    };

    interval = setInterval(checkActive, 10000);
  };

  setup();
  marketplaceHelper.getProvider(chain, chainHelper.getWSP(chain)); // Make sure providerEmitter exists for the chain
  marketplaceHelper.providerEmitter[chain].on('reconnected:nftMarketPlace', setup);
};

const listen = async () => {
  if (!await chainHelper.init()) {
    return;
  }

  if (!await marketplaceHelper.init(':Listen-Market')) {
    return;
  }

  const chains = chainHelper.getSupportedChains();
  const iterations = [];

  for (let i = 0; i < chains.length; i += 1) {
    iterations.push(chainIteration(chains[i]));
  }

  await Promise.all(iterations).catch(console.log);
};

module.exports = {
  listen,
};

const callbackfunction = async () => {
  console.log('Should disconnect existing connectinos');
};

process.on('exit', callbackfunction);
