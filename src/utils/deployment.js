const fs = require('fs')
const Web3 = require("web3")

const deployBlockHashRegistry = async (web3, privateKey) => {

    //const web3 = new Web3(url ? url : "http://localhost:8545")

    const ethAcc = await web3.eth.accounts.privateKeyToAccount(privateKey ? privateKey : "0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7");

    const bin = JSON.parse(fs.readFileSync('build/contracts/BlockhashRegistry.json', 'utf8'))

    const nonce = await web3.eth.getTransactionCount(ethAcc.address)
    const transactionParams = {
        from: ethAcc.address,
        data: bin.bytecode,
        gas: 7000000,
        nonce: nonce,
        gasPrice: await web3.eth.getGasPrice(),
        to: ''
    }

    const signedTx = await web3.eth.accounts.signTransaction(transactionParams, ethAcc.privateKey);
    const tx = await (web3.eth.sendSignedTransaction(signedTx.rawTransaction));
    return tx
}

const deployNodeRegistry = async (web3, blockHashRegistryAddress, privateKey) => {

    const ethAcc = await web3.eth.accounts.privateKeyToAccount(privateKey ? privateKey : "0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7");

    const bin = JSON.parse(fs.readFileSync('build/contracts/NodeRegistry.json', 'utf8'))

    const bhAddress = blockHashRegistryAddress ? blockHashRegistryAddress : (await deployBlockHashRegistry(web3, ethAcc.privateKey)).contractAddress

    const blockBefore = await web3.eth.getBlock('latest')

    const nonce = await web3.eth.getTransactionCount(ethAcc.address)
    const transactionParams = {
        from: ethAcc.address,
        data: bin.bytecode + web3.eth.abi.encodeParameters(['address'], [bhAddress]).substr(2),
        gas: blockBefore.gasLimit,
        nonce: nonce,
        gasPrice: await web3.eth.getGasPrice(),
        to: ''

    }

    const signedTx = await web3.eth.accounts.signTransaction(transactionParams, ethAcc.privateKey);

    const tx = await (web3.eth.sendSignedTransaction(signedTx.rawTransaction));
    return tx
}

module.exports = { deployNodeRegistry, deployBlockHashRegistry }