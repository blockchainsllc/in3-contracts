const deployment = require('../src/utils/deployment')


module.exports = async (deployer) => {

  await deployment.deployNodeRegistry("http://localhost:8545")

  // const deployBlockHashTx = await deployment.deployBlockHashRegistry()

  // await deployment.deployNodeRegistry(null, deployBlockHashTx.contractAddress)
};
