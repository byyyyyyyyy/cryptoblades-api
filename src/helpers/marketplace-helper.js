/* eslint-disable no-bitwise */
const EventEmitter = require('events');

const ethers = require('ethers');
const Web3 = require('web3');
const fs = require('fs-extra');

const updateABI = require('../tasks/update-abi');

const chainHelper = require('../helpers/chain-helper');

const EXPECTED_PONG_BACK = parseInt(process.env.WEBSOCKET_PROVIDER_PONG_TIMEOUT, 10) || 15000;
const KEEP_ALIVE_CHECK_INTERVAL = parseInt(process.env.WEBSOCKET_PROVIDER_KEEP_ALIVE, 10) || 7500;

const helpers = {
  getMarketplaceAddress: () => process.env.ADDRESS_MARKET || '0x90099dA42806b21128A094C713347C7885aF79e2',
  getCharactersAddress: () => process.env.ADDRESS_CHARACTER || '0xc6f252c2CdD4087e30608A35c022ce490B58179b',
  getWeaponsAddress: () => process.env.ADDRESS_WEAPON || '0x7E091b0a220356B157131c831258A9C98aC8031A',
  getShieldsAddress: () => process.env.ADDRESS_SHIELD || '0xf9E9F6019631bBE7db1B71Ec4262778eb6C3c520',

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
  getProvider: (chain, rpc) => {
    if (helpers.provider[chain] !== undefined) {
      return helpers.provider[chain];
    }

    const buildProvider = () => {
      helpers.provider[chain] = new ethers.providers.WebSocketProvider(
        rpc
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

  getContract: (chain, address, abiPath) => new ethers.Contract(
    address,
    fs.readJSONSync(abiPath).abi,
    helpers.getProvider(chain),
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

  getWeapons: (chain, address) => {
    if (helpers.weapons[chain] !== undefined) {
      return helpers.weapons[chain];
    }

    helpers.weapons[chain] = helpers.getContract(chain, address, helpers.weaponsAbiPath);

    helpers.providerEmitter[chain].on('reconnected', () => {
      helpers.weapons[chain] = helpers.weapons[chain].connect(helpers.getProvider(chain));
      helpers.providerEmitter[chain].emit('reconnected:weapons');
    });

    return helpers.weapon[chain];
  },

  getCharacters: (chain, address) => {
    if (helpers.characters[chain] !== undefined) {
      return helpers.characters[chain];
    }

    helpers.characters[chain] = helpers.getContract(chain, address, helpers.charactersAbiPath);

    helpers.providerEmitter[chain].on('reconnected', () => {
      helpers.characters[chain] = helpers.characters[chain].connect(helpers.getProvider(chain));
      helpers.providerEmitter[chain].emit('reconnected:characters');
    });

    return helpers.characters[chain];
  },

  getShields: (chain, address) => {
    if (helpers.shields !== undefined) {
      return helpers.shields[chain];
    }

    helpers.shields[chain] = helpers.getContract(chain, address, helpers.shieldsAbiPath);

    helpers.providerEmitter[chain].on('reconnected', () => {
      helpers.shields[chain] = helpers.shields[chain].connect(helpers.getProvider(chain));
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
  isCharacter: (nftAddress) => nftAddress === helpers.getCharactersAddress(),
  isWeapon: (nftAddress) => nftAddress === helpers.getWeaponsAddress(),
  isShield: (nftAddress) => nftAddress === helpers.getShieldsAddress(),

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

  getNFTData: async (type, nftId, rawPrice, sellerAddress) => {
    let data;

    if (type === 'character') {
      data = await helpers.getCharacters().get(nftId);
    }

    if (type === 'weapon') {
      data = await helpers.getWeapons().get(nftId);
    }

    if (type === 'shield') {
      data = await helpers.getShields().get(nftId);
    }

    return helpers.processNFTData(type, nftId, rawPrice, sellerAddress, data);
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

  getIdKey: (nftAddress) => {
    if (helpers.isCharacter(nftAddress)) {
      return 'charId';
    }

    if (helpers.isWeapon(nftAddress)) {
      return 'weaponId';
    }

    if (helpers.isShield(nftAddress)) {
      return 'shieldId';
    }

    return '';
  },

  getTypeName: (nftAddress) => {
    if (helpers.isCharacter(nftAddress)) {
      return 'character';
    }

    if (helpers.isWeapon(nftAddress)) {
      return 'weapon';
    }

    if (helpers.isShield(nftAddress)) {
      return 'shield';
    }

    return '';
  },

  isUserBanned: async (seller) => helpers.getNftMarketPlace().methods.isUserBanned(seller).call(),
};

module.exports = helpers;
