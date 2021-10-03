const fs = require('fs-extra');
const Web3 = require('web3');

const helpers = {
  data: null,
  supportedChains: null,
  addressToChain: null,
  addressToNftType: null,
  dataPath: './app-config.json',

  getSupportedChains() {
    return helpers.supportedChains;
  },
  getChainData(chain) {
    return helpers.data[chain];
  },
  getChainName(chain) {
    return helpers.data[chain].name;
  },
  getChainOfAddress(address) {
    return helpers.addressToChain[address];
  },
  getNetworkValueOfChain(chain) {
    return helpers.data[chain].dbValue;
  },
  getNftTypeOfAddress(address) {
    return helpers.addressToNftType[address];
  },
  getMarketAddress(chain) {
    return helpers.data[chain].VUE_APP_MARKET_CONTRACT_ADDRESS;
  },
  getCharacterAddress(chain) {
    return helpers.data[chain].VUE_APP_CHARACTER_CONTRACT_ADDRESS;
  },
  getWeaponAddress(chain) {
    return helpers.data[chain].VUE_APP_WEAPON_CONTRACT_ADDRESS;
  },
  getShieldAddress(chain) {
    return helpers.data[chain].VUE_APP_SHIELD_CONTRACT_ADDRESS;
  },
  getRPC(chain) {
    return helpers.data[chain].rpcUrls[0];
  },
  getWSP(chain) {
    return helpers.data[chain].websocketProvider;
  },
  getWeb3(chain) {
    return new Web3(helpers.data[chain].rpcUrls[0]);
  },
  getMulticallAddress(chain) {
    return helpers.data[chain].VUE_APP_MULTICALL_CONTRACT_ADDRESS;
  },
  getCollection: (nftAddress) => {
    const type = helpers.getNftTypeOfAddress(nftAddress);

    if (type === 'character') {
      return '$marketCharacters';
    }

    if (type === 'weapon') {
      return '$marketWeapons';
    }

    if (type === 'shield') {
      return '$marketShields';
    }

    console.error('[ChainHelper]', `Unknown contract address (cannot get DB): ${nftAddress}`);

    return null;
  },
  getIdKey: (nftAddress) => {
    const type = helpers.getNftTypeOfAddress(nftAddress);

    if (type === 'character') {
      return 'charId';
    }

    if (type === 'weapon') {
      return 'weaponId';
    }

    if (type === 'shield') {
      return 'shieldId';
    }

    return '';
  },
  init: async () => {
    if (helpers.data !== null) {
      return true;
    }

    if (!fs.existsSync(helpers.dataPath)) {
      console.error('[Chain Helper]', 'Could not find configuration.');
      return false;
    }

    helpers.data = {};
    helpers.supportedChains = [];
    helpers.addressToChain = {};
    helpers.addressToNftType = {};

    const result = fs.readJSONSync(helpers.dataPath);
    const env = result.environment;

    helpers.supportedChains = result.supportedChains;
    if (process.env.SUPPORTED_CHAINS_OVERRIDE !== undefined && process.env.SUPPORTED_CHAINS_OVERRIDE !== '') {
      helpers.supportedChains = JSON.parse(process.env.SUPPORTED_CHAINS_OVERRIDE);
    }
    console.log('[Chain Helper]', `Loading chains for ${env}`);
    for (let i = 0; i < helpers.supportedChains.length; i += 1) {
      helpers.load(helpers.supportedChains[i], result.environments[env].chains[helpers.supportedChains[i]]);
    }
    console.log('[Chain Helper]', `Loaded ${Object.keys(helpers.data).length} chains`);
    return true;
  },
  load: (tag, chainData) => {
    console.log('[Chain Helper]', `Loaded chain ${tag}`);
    helpers.data[tag] = chainData;

    if (process.env.RPC_OVERRIDE !== undefined && process.env.RPC_OVERRIDE !== '') {
      const overrride = JSON.parse(process.env.RPC_OVERRIDE);
      if (overrride[tag] !== undefined && overrride[tag].rpcUrls !== undefined) {
        helpers.data[tag].rpcUrls = overrride[tag].rpcUrls;
      }
      if (overrride[tag] !== undefined && overrride[tag].websocketProvider !== undefined) {
        helpers.data[tag].websocketProvider = overrride[tag].websocketProvider;
      }
    }

    helpers.addressToChain[chainData.VUE_APP_MARKET_CONTRACT_ADDRESS] = tag;
    helpers.addressToChain[chainData.VUE_APP_CHARACTER_CONTRACT_ADDRESS] = tag;
    helpers.addressToChain[chainData.VUE_APP_WEAPON_CONTRACT_ADDRESS] = tag;
    helpers.addressToChain[chainData.VUE_APP_SHIELD_CONTRACT_ADDRESS] = tag;
    helpers.addressToChain[chainData.VUE_APP_MULTICALL_CONTRACT_ADDRESS] = tag;

    helpers.addressToNftType[chainData.VUE_APP_CHARACTER_CONTRACT_ADDRESS] = 'character';
    helpers.addressToNftType[chainData.VUE_APP_WEAPON_CONTRACT_ADDRESS] = 'weapon';
    helpers.addressToNftType[chainData.VUE_APP_SHIELD_CONTRACT_ADDRESS] = 'shield';
  },
};

module.exports = helpers;
