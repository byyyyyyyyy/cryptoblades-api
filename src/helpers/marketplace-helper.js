/* eslint-disable no-bitwise */
const EventEmitter = require('events');

const ethers = require('ethers');
const Web3 = require('web3');
const fs = require('fs-extra');

const updateABI = require('../tasks/update-abi');

const EXPECTED_PONG_BACK = parseInt(process.env.WEBSOCKET_PROVIDER_PONG_TIMEOUT, 10) || 15000;
const KEEP_ALIVE_CHECK_INTERVAL = parseInt(process.env.WEBSOCKET_PROVIDER_KEEP_ALIVE, 10) || 7500;

const helpers = {
  marketplaceAbiPath: './src/data/abi/NFTMarket.json',
  charactersAbiPath: './src/data/abi/Characters.json',
  weaponsAbiPath: './src/data/abi/Weapons.json',
  shieldsAbiPath: './src/data/abi/Shields.json',

  nftMarketPlace: [],
  weapons: [],
  characters: [],
  shields: [],

  getAbiFromAddress: (nftAddress) => {
    if (helpers.isCharacter(nftAddress)) {
      return fs.readJSONSync(helpers.charactersAbiPath).abi;
    }

    if (helpers.isWeapon(nftAddress)) {
      return fs.readJSONSync(helpers.weaponsAbiPath).abi;
    }

    if (helpers.isShield(nftAddress)) {
      return fs.readJSONSync(helpers.shieldsAbiPath).abi;
    }

    return [];
  },

  getAbiFromType: (nftType) => {
    if (nftType === 'character') {
      return fs.readJSONSync(helpers.charactersAbiPath).abi;
    }

    if (nftType === 'weapon') {
      return fs.readJSONSync(helpers.weaponsAbiPath).abi;
    }

    if (nftType === 'shield') {
      return fs.readJSONSync(helpers.shieldsAbiPath).abi;
    }

    return [];
  },

  keepAlive: (provider, onDisconnect) => {
    let pingTimeout = null;
    let keepAliveInterval = null;

    provider._websocket.on('open', () => {
      keepAliveInterval = setInterval(() => {
        provider._websocket.ping();

        // Use `WebSocket#terminate()`, which immediately destroys the connection,
        // instead of `WebSocket#close()`, which waits for the close timer.
        // Delay should be equal to the interval at which your server
        // sends out pings plus a conservative assumption of the latency.
        pingTimeout = setTimeout(() => {
          provider._websocket.terminate();
        }, EXPECTED_PONG_BACK);
      }, KEEP_ALIVE_CHECK_INTERVAL);
    });

    provider._websocket.on('close', (err) => {
      if (keepAliveInterval) clearInterval(keepAliveInterval);
      if (pingTimeout) clearTimeout(pingTimeout);
      onDisconnect(err);
    });

    provider._websocket.on('pong', () => {
      if (pingTimeout) clearInterval(pingTimeout);
    });
  },

  init: async (tag = '') => {
    await updateABI.task();

    if (!fs.existsSync(helpers.marketplaceAbiPath)
     || !fs.existsSync(helpers.charactersAbiPath)
     || !fs.existsSync(helpers.weaponsAbiPath)
     || !fs.existsSync(helpers.shieldsAbiPath)) {
      console.error(`[MARKET${tag ? `:${tag}` : ''}]`, 'Could not find some or all ABIs; scraper aborted.');
      return false;
    }

    return true;
  },

  provider: [],
  providerEmitter: [],
  getProvider: (chain, wsp) => {
    if (helpers.provider[chain] !== undefined) {
      return helpers.provider[chain];
    }

    const buildProvider = () => {
      helpers.provider[chain] = new ethers.providers.WebSocketProvider(
        wsp,
      );

      helpers.providerEmitter[chain] = new EventEmitter();

      helpers.keepAlive(helpers.provider[chain], (err) => {
        console.error('====================================================');
        console.error('=================Provider restarted=================');
        console.error(err);
        console.error('=================Provider restarted=================');
        console.error('====================================================');

        buildProvider();
        helpers.providerEmitter[chain].emit('reconnected');
      });
    };

    buildProvider();

    return helpers.provider;
  },

  getWeb3: () => new Web3(process.env.WEBSOCKET_PROVIDER_URL),

  getContract: (chain, address, abiPath, wsp) => new ethers.Contract(
    address,
    fs.readJSONSync(abiPath).abi,
    helpers.getProvider(chain, wsp),
  ),

  getNftMarketPlace: (chain, address, rpc) => {
    if (helpers.nftMarketPlace[chain] !== undefined) {
      return helpers.nftMarketPlace[chain];
    }

    const web3 = new Web3(rpc);
    const Market = new web3.eth.Contract(
      fs.readJSONSync(helpers.marketplaceAbiPath).abi,
      address,
    );

    helpers.nftMarketPlace[chain] = Market;

    return helpers.nftMarketPlace[chain];
  },

  getWeapons: (chain, address, wsp) => {
    if (helpers.weapons[chain] !== undefined) {
      return helpers.weapons[chain];
    }

    helpers.weapons[chain] = helpers.getContract(chain, address, helpers.weaponsAbiPath, wsp);

    helpers.providerEmitter[chain].on('reconnected', () => {
      helpers.weapons[chain] = helpers.weapons[chain].connect(helpers.getProvider(chain, wsp));
      helpers.providerEmitter[chain].emit('reconnected:weapons');
    });

    return helpers.weapon[chain];
  },

  getCharacters: (chain, address, wsp) => {
    if (helpers.characters[chain] !== undefined) {
      return helpers.characters[chain];
    }

    helpers.characters[chain] = helpers.getContract(chain, address, helpers.charactersAbiPath, wsp);

    helpers.providerEmitter[chain].on('reconnected', () => {
      helpers.characters[chain] = helpers.characters[chain].connect(helpers.getProvider(chain, wsp));
      helpers.providerEmitter[chain].emit('reconnected:characters');
    });

    return helpers.characters[chain];
  },

  getShields: (chain, address, wsp) => {
    if (helpers.shields !== undefined) {
      return helpers.shields[chain];
    }

    helpers.shields[chain] = helpers.getContract(chain, address, helpers.shieldsAbiPath, wsp);

    helpers.providerEmitter[chain].on('reconnected', () => {
      helpers.shields[chain] = helpers.shields[chain].connect(helpers.getProvider(chain, wsp));
      helpers.providerEmitter[chain].emit('reconnected:shields');
    });

    return helpers.shields[chain];
  },

  WeaponElement: {
    Fire: 0, Earth: 1, Lightning: 2, Water: 3,
  },

  traitNumberToName: (traitNum) => {
    switch (traitNum) {
      case helpers.WeaponElement.Fire: return 'Fire';
      case helpers.WeaponElement.Earth: return 'Earth';
      case helpers.WeaponElement.Lightning: return 'Lightning';
      case helpers.WeaponElement.Water: return 'Water';
      default: return '';
    }
  },

  getStatPatternFromProperties: (properties) => (properties >> 5) & 0x7f,
  getElementFromProperties: (properties) => (properties >> 3) & 0x3,
  getStarsFromProperties: (properties) => (properties) & 0x7,
  getStat1Trait: (statPattern) => (statPattern % 5),
  getStat2Trait: (statPattern) => (Math.floor(statPattern / 5) % 5),
  getStat3Trait: (statPattern) => (Math.floor(Math.floor(statPattern / 5) / 5) % 5),

  realPrice: (price) => +ethers.utils.formatEther(price),

  getCollection: (nftAddress) => {
    if (helpers.isCharacter(nftAddress)) {
      return '$marketCharacters';
    }

    if (helpers.isWeapon(nftAddress)) {
      return '$marketWeapons';
    }

    if (helpers.isShield(nftAddress)) {
      return '$marketShields';
    }

    console.error('[MARKET]', `Unknown contract address (cannot get DB): ${nftAddress}`);

    return null;
  },

  getFinalPriceCall: (marketAddress, items) => ({
    abi: fs.readJSONSync(helpers.marketplaceAbiPath).abi,
    calls: items.map((item) => ({
      address: marketAddress,
      name: 'getFinalPrice',
      params: [item.address, item.nftId],
    })),
  }),

  getNFTDataCall: (type, nftAddress, nftIds) => ({
    abi: helpers.getAbiFromType(type),
    calls: nftIds.map((nftId) => ({
      address: nftAddress,
      name: 'get',
      params: [nftId],
    })),
  }),

  getNFTData: async (type, nftAddress, chain, wsp, nftId, rawPrice, sellerAddress) => {
    let data;

    if (type === 'character') {
      data = await helpers.getCharacters(chain, nftAddress, wsp).get(nftId);
    }

    if (type === 'weapon') {
      data = await helpers.getWeapons(chain, nftAddress, wsp).get(nftId);
    }

    if (type === 'shield') {
      data = await helpers.getShields(chain, nftAddress, wsp).get(nftId);
    }

    return helpers.processNFTData(type, nftId, chain, rawPrice, sellerAddress, data);
  },

  processNFTData: (type, nftId, chain, rawPrice, sellerAddress, data) => {
    const price = helpers.realPrice(rawPrice);
    const timestamp = Date.now();

    if (type === 'character') {
      const character = data;
      const charLevel = parseInt(character[1], 10);
      const charElement = helpers.traitNumberToName(+character[2]);

      const ret = {
        charId: nftId, charLevel, charElement, price, timestamp, sellerAddress, network: chain,
      };

      return ret;
    }

    if (type === 'weapon') {
      const weapon = data;
      const properties = weapon._properties;

      const weaponElement = helpers.traitNumberToName(helpers.getElementFromProperties(properties));
      const weaponStars = helpers.getStarsFromProperties(properties);

      const statPattern = helpers.getStatPatternFromProperties(properties);
      const stat1Element = helpers.traitNumberToName(helpers.getStat1Trait(statPattern));
      const stat2Element = helpers.traitNumberToName(helpers.getStat2Trait(statPattern));
      const stat3Element = helpers.traitNumberToName(helpers.getStat3Trait(statPattern));

      const stat1Value = weapon._stat1;
      const stat2Value = weapon._stat2;
      const stat3Value = weapon._stat3;

      const ret = {
        weaponId: nftId,
        weaponStars,
        weaponElement,
        stat1Element,
        stat2Element,
        stat3Element,
        stat1Value,
        stat2Value,
        stat3Value,
        price,
        timestamp,
        sellerAddress,
        network: chain,
      };

      return ret;
    }

    if (type === 'shield') {
      const shield = data;
      const properties = shield._properties;

      const shieldElement = helpers.traitNumberToName(helpers.getElementFromProperties(properties));
      const shieldStars = helpers.getStarsFromProperties(properties);

      const statPattern = helpers.getStatPatternFromProperties(properties);
      const stat1Element = helpers.traitNumberToName(helpers.getStat1Trait(statPattern));
      const stat2Element = helpers.traitNumberToName(helpers.getStat2Trait(statPattern));
      const stat3Element = helpers.traitNumberToName(helpers.getStat3Trait(statPattern));

      const stat1Value = shield._stat1;
      const stat2Value = shield._stat2;
      const stat3Value = shield._stat3;

      return {
        shieldId: nftId,
        shieldStars,
        shieldElement,
        stat1Element,
        stat2Element,
        stat3Element,
        stat1Value,
        stat2Value,
        stat3Value,
        price,
        timestamp,
        sellerAddress,
        network: chain,
      };
    }

    return {};
  },

  isUserBanned: async (seller) => helpers.getNftMarketPlace().methods.isUserBanned(seller).call(),
};

module.exports = helpers;
