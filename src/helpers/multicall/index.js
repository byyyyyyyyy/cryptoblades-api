const { Interface } = require('@ethersproject/abi');
const MultiCallAbi = require('./abis/multicall.json');

const addresses = {
  56: '0x1ee38d535d541c55c9dae27b12edf090c608e6fb',
  128: '0xCeBFbFb4Bd0d28E5a2662193e35E534ca6465f73'
};

async function multicall(web3, address, abi, calls) {
  const multi = new web3.eth.Contract(MultiCallAbi, address);
  const itf = new Interface(abi);

  const calldata = calls.map((call) => [
    call.address.toLowerCase(),
    itf.encodeFunctionData(call.name, call.params),
  ]);
  const { returnData } = await multi.methods.aggregate(calldata).call();
  const res = returnData.map((call, i) => itf.decodeFunctionResult(calls[i].name, call));

  return res;
}

module.exports = multicall;
