const PQueue = require('p-queue');
const pRetry = require('p-retry');

const marketplaceHelper = require('../helpers/marketplace-helper');
const multicall = require('../helpers/multicall');

const { DB } = require('../db');

const chainHelper = require('../helpers/chain-helper');

exports.duration = process.env.NODE_ENV === 'production' ? 86400 : 600;

const ITEMS_PER_PAGE = parseInt(process.env.MARKETPLACE_ITEMS_PAGE, 10) || 2500;
const MAX_ITEMS_PER_UPDATE = parseInt(process.env.MAX_UPDATE, 10) || 500;

const chainIteration = async (chain) => {
  const chainName = chainHelper.getChainName(chain);

  console.log(
    `[${chain}-${chainName}:Update-Market]`,
  );

  const tokenAddresses = [
    chainHelper.getCharacterAddress(chain),
    chainHelper.getWeaponAddress(chain),
    chainHelper.getShieldAddress(chain),
  ];

  const processed = {};
  const toProcess = {};

  const queue = new PQueue({ concurrency: 50 });

  const createOrUpdateBatch = async (nftAddress, items) => {
    const collection = chainHelper.getCollection(nftAddress);
    const idKey = chainHelper.getIdKey(nftAddress);
    const net = chainHelper.getNetworkValueOfChain(chain);
    const type = chainHelper.getNftTypeOfAddress(nftAddress);

    if (!collection || !idKey || !net || !type) return;

    const multicallData = marketplaceHelper.getNFTDataCall(type, nftAddress, items.map((item) => item.nftId));

    const data = await pRetry(() => multicall(chainHelper.getWeb3(chain), chainHelper.getMulticallAddress(chain), multicallData.abi, multicallData.calls), { retries: 5 });

    const bulk = DB[collection].initializeUnorderedBulkOp();

    items.forEach((item, i) => {
      bulk
        .find({ [idKey]: item.nftId, network: net })
        .upsert()
        .replaceOne(
          marketplaceHelper.processNFTData(type, item.nftId, net, item.price, item.seller, data[i]),
        );
    });

    const bulkResult = await pRetry(() => bulk.execute(), { retries: 5 });

    processed[nftAddress] += bulkResult.nUpserted + bulkResult.nModified;
  };

  const checkToProcess = (address, maxLength) => {
    if (toProcess[address].length > maxLength) {
      const items = [...toProcess[address]];
      toProcess[address] = [];
      queue.add(() => createOrUpdateBatch(address, items));
    }
  };

  tokenAddresses.forEach((address) => {
    toProcess[address] = [];
    processed[address] = 0;

    const runQueue = (start) => async () => {
      const results = await pRetry(() => marketplaceHelper
        .getNftMarketPlace(chain, chainHelper.getMarketAddress(chain), chainHelper.getRPC(chain))
        .methods
        .getListingSlice(address, start, ITEMS_PER_PAGE).call(),
      { retries: 5 });

      console.log(
        `[${chainName}-MARKET:Update-Market]`,
        chainHelper.getNftTypeOfAddress(address),
        processed[address],
        start,
        results.returnedCount,
        ITEMS_PER_PAGE,
      );

      for (let i = 0; results.returnedCount > i; i += 1) {
        toProcess[address].push({
          nftId: results.ids[i],
          price: results.prices[i],
          seller: results.sellers[i],
        });

        checkToProcess(address, MAX_ITEMS_PER_UPDATE);
      }

      if (results.returnedCount >= ITEMS_PER_PAGE) {
        queue.add(runQueue(start + ITEMS_PER_PAGE * 5));
      } else {
        checkToProcess(address, 0);
      }
    };

    for (let i = 0; i < 5; i += 1) {
      queue.add(runQueue(ITEMS_PER_PAGE * i));
    }
  });

  await queue.onIdle();

  tokenAddresses.forEach((address) => {
    checkToProcess(address, 0);
  });

  await queue.onIdle();

  tokenAddresses.forEach((address) => {
    console.log(
      `[${chainName}-MARKET:Update-Market]`,
      `Processed ${processed[address]} ${chainHelper.getNftTypeOfAddress(address)}`,
    );
  });
};

exports.task = async () => {
  if (!await chainHelper.init()) {
    return;
  }

  if (!await marketplaceHelper.init(':Update-Market')) {
    return;
  }

  const chains = chainHelper.getSupportedChains();
  const iterations = [];

  for (let i = 0; i < chains.length; i += 1) {
    iterations.push(chainIteration(chains[i]));
  }

  await Promise.all(iterations);
};
