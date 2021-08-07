/* eslint-disable no-bitwise */

const ethers = require('ethers');
const fs = require('fs-extra');

const updateABI = require('../tasks/update-abi');

const helpers = {
  getMarketplaceAddress: () => process.env.ADDRESS_MARKET || '0x90099dA42806b21128A094C713347C7885aF79e2',
  getCharactersAddress: () => process.env.ADDRESS_WEAPON || '0x7E091b0a220356B157131c831258A9C98aC8031A',
  getWeaponsAddress: () => process.env.ADDRESS_CHARACTER || '0xc6f252c2CdD4087e30608A35c022ce490B58179b',
  getShieldsAddress: () => process.env.ADDRESS_SHIELD || '0xf9E9F6019631bBE7db1B71Ec4262778eb6C3c520',

  marketplaceAbiPath: './src/data/abi/NFTMarket.json',
  charactersAbiPath: './src/data/abi/Weapons.json',
  weaponsAbiPath: './src/data/abi/Characters.json',
  shieldsAbiPath: './src/data/abi/Shields.json',

  nftMarketPlace: null,
  weapons: null,
  characters: null,
  shields: null,

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

  provider: null,
  getProvider: () => {
    if (helpers.provider) {
      return helpers.provider;
    }

    helpers.provider = new ethers.providers.WebSocketProvider(
      process.env.WEBSOCKET_PROVIDER_URL, // Edit this with your provider url
    );

    return helpers.provider;
  },

  getContract: (address, abiPath) => new ethers.Contract(
    address,
    fs.readJSONSync(abiPath).abi,
    helpers.getProvider(),
  ),

  getNftMarketPlace: () => {
    if (helpers.nftMarketPlace) {
      return helpers.nftMarketPlace;
    }

    helpers.nftMarketPlace = helpers.getContract(helpers.getMarketplaceAddress(), helpers.marketplaceAbiPath);

    return helpers.nftMarketPlace;
  },

  getWeapons: () => {
    if (helpers.weapons) {
      return helpers.weapons;
    }

    helpers.weapons = helpers.getContract(helpers.getWeaponsAddress(), helpers.weaponsAbiPath);

    return helpers.weapons;
  },

  getCharacters: () => {
    if (helpers.characters) {
      return helpers.characters;
    }

    helpers.characters = helpers.getContract(helpers.getCharactersAddress(), helpers.charactersAbiPath);

    return helpers.characters;
  },

  getShields: () => {
    if (helpers.shields) {
      return helpers.shields;
    }

    helpers.shields = helpers.getContract(helpers.getShieldsAddress(), helpers.shieldsAbiPath);

    return helpers.shields;
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

  getNFTData: async (nftAddress, nftId, rawPrice, sellerAddress) => {
    const price = helpers.realPrice(rawPrice);
    const timestamp = Date.now();

    if (helpers.isCharacter(nftAddress)) {
      const character = await helpers.getCharacters().get(nftId);
      const charLevel = parseInt(character[1], 10);
      const charElement = helpers.traitNumberToName(+character[2]);

      const ret = {
        charId: nftId.toNumber(), charLevel, charElement, price, timestamp, sellerAddress,
      };

      return ret;
    }

    if (helpers.isWeapon(nftAddress)) {
      const weapon = await helpers.getWeapons().get(nftId);
      const properties = weapon._properties;

      const weaponElement = helpers.getElementFromProperties(properties);
      const weaponStars = helpers.getStarsFromProperties(properties);

      const statPattern = helpers.getStatPatternFromProperties(properties);
      const stat1Element = helpers.traitNumberToName(helpers.getStat1Trait(statPattern));
      const stat2Element = helpers.traitNumberToName(helpers.getStat2Trait(statPattern));
      const stat3Element = helpers.traitNumberToName(helpers.getStat3Trait(statPattern));

      const stat1Value = weapon._stat1;
      const stat2Value = weapon._stat2;
      const stat3Value = weapon._stat3;

      const ret = {
        weaponId: nftId.toNumber(),
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
      };

      return ret;
    }

    if (helpers.isShield(nftAddress)) {
      const shield = await helpers.getShields().get(nftId);
      const properties = shield._properties;

      const shieldElement = helpers.getElementFromProperties(properties);
      const shieldStars = helpers.getStarsFromProperties(properties);

      const statPattern = helpers.getStatPatternFromProperties(properties);
      const stat1Element = helpers.traitNumberToName(helpers.getStat1Trait(statPattern));
      const stat2Element = helpers.traitNumberToName(helpers.getStat2Trait(statPattern));
      const stat3Element = helpers.traitNumberToName(helpers.getStat3Trait(statPattern));

      const stat1Value = shield._stat1;
      const stat2Value = shield._stat2;
      const stat3Value = shield._stat3;

      return {
        shieldId: nftId.toNumber(),
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
};

module.exports = helpers;
