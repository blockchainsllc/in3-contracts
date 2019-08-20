const deployment = require('/Users/mkuechler/Documents/in3-stuff/in3-contracts/src/utils/deployment.js')

module.exports = async (deployer) => {

  await deployment.deployNodeRegistry("http://localhost:8545")

  // const deployBlockHashTx = await deployment.deployBlockHashRegistry()

  // await deployment.deployNodeRegistry(null, deployBlockHashTx.contractAddress)
};
