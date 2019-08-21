const devPk = '0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7'
const crypto = require('crypto')
const in3common = require('in3-common')

/** creates a random private key and transfers some ether to this address */
const createAccount = async (seed, eth = toBN('50000000000000000000')) => {
    const pkBuffer = seed
        ? seed.startsWith('0x')
            ? Buffer.from(seed.substr(2).padStart(64, '0'), 'hex')
            : Buffer.from(seed.padStart(64, '0'), 'hex')
        : crypto.randomBytes(32)

    const pk = '0x' + pkBuffer.toString('hex')
    //  const adr = in3common.util.getAddress(pk)

    const account = web3.eth.accounts.privateKeyToAccount(pk);

    const standardAccount = web3.eth.accounts.privateKeyToAccount("0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7");

    if (eth) {
        const nonce = await web3.eth.getTransactionCount(standardAccount.address)

        const transactionParams = {
            from: standardAccount.address,
            value: eth,
            gas: 22000,
            nonce: nonce,
            gasPrice: await web3.eth.getGasPrice(),
            to: account.address

        }

        const signedTx = await web3.eth.accounts.signTransaction(transactionParams, standardAccount.privateKey);
        await (web3.eth.sendSignedTransaction(signedTx.rawTransaction));
    }
    return pk
}

const handleTx = async (txParams, privatekey) => {

    let transactionParams = {}
    const ethAccount = web3.eth.accounts.privateKeyToAccount(privatekey);

    transactionParams.nonce = txParams.nonce ? txParams.nonce : await web3.eth.getTransactionCount(ethAccount.address)
    transactionParams.from = ethAccount.address
    transactionParams.value = txParams.value ? txParams.value : 0
    transactionParams.data = txParams.data ? txParams.data : ''
    transactionParams.gasPrice = txParams.gasPrice ? txParams.gasPrice : await web3.eth.getGasPrice()
    transactionParams.gas = txParams.gas ? txParams.gas : 7000000
    transactionParams.to = txParams.to ? txParams.to : 0x0

    const signedTx = await web3.eth.accounts.signTransaction(transactionParams, ethAccount.privateKey);
    return (web3.eth.sendSignedTransaction(signedTx.rawTransaction));
}

module.exports = { createAccount, handleTx }