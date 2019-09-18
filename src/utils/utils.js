const devPk = '0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7'
const crypto = require('crypto')
const in3Common = require('in3-common')
const ethUtil = require('ethereumjs-util')

/** creates a random private key and transfers some ether to this address */
const createAccount = async (seed, eth = in3Common.util.toBN('50000000000000000000')) => {
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



const signForRegister = (url, props, timeout, weight, owner, pk) => {

    const msgHash = ethUtil.keccak(
        Buffer.concat([
            in3Common.serialize.bytes(url),
            in3Common.serialize.uint64(props),
            in3Common.serialize.uint64(timeout),
            in3Common.serialize.uint64(weight),
            in3Common.serialize.address(owner)
        ])
    )
    const msgHash2 = ethUtil.keccak(in3Common.util.toHex("\x19Ethereum Signed Message:\n32") + in3Common.util.toHex(msgHash).substr(2))
    const s = ethUtil.ecsign((msgHash2), in3Common.serialize.bytes32(pk))

    return {
        ...s,
        address: in3Common.util.getAddress(pk),
        msgHash: in3Common.util.toHex(msgHash2, 32),
        signature: in3Common.util.toHex(s.r) + in3Common.util.toHex(s.s).substr(2) + in3Common.util.toHex(s.v).substr(2),
        r: in3Common.util.toHex(s.r),
        s: in3Common.util.toHex(s.s),
        v: s.v
    }
}
const bytes32 = in3Common.serialize.bytes32

const signBlock = (b, registryId, pk, blockHash) => {
    const msgHash = ethUtil.keccak(Buffer.concat([bytes32(blockHash || b.hash), bytes32(b.number), bytes32(registryId)]))
    const s = ethUtil.ecsign(msgHash, in3Common.serialize.bytes32(pk))
    return {
        ...s,
        block: in3Common.util.toNumber(b.number),
        blockHash: blockHash || b.hash,
        address: in3Common.util.getAddress(pk),
        msgHash: in3Common.util.toHex(msgHash, 32),
        r: in3Common.util.toHex(s.r),
        s: in3Common.util.toHex(s.s),
        v: s.v
    }
}

const createConvictHash = (blockhash, signer, v, r, s) => {
    return ethUtil.keccak(Buffer.concat([bytes32(blockhash), in3Common.serialize.address(signer), in3Common.util.toBuffer(v, 1), bytes32(r), bytes32(s)]))
}

const increaseTime = async (web3, secondsToIncrease) => {
    return new Promise((resolve, reject) => {
        web3.currentProvider.send(
            {
                jsonrpc: '2.0',
                method: 'evm_increaseTime',
                params: [secondsToIncrease],
                id: 1
            },
            (e, r) => {
                if (e) reject(e)
                else {
                    resolve(r.result)
                }
            })
    })
}

const signHash = (pk, msgHash) => {
    const s = ethUtil.ecsign(in3Common.util.toBuffer(msgHash, 32), in3Common.util.toBuffer(pk, 32))

    return {
        ...s,
        address: getAddress(pk),
        msgHash: toHex(msgHash, 32),
        r: toHex(s.r),
        s: toHex(s.s),
        v: s.v,
        signatureBytes: toHex(s.r) + toHex(s.s).substr(2) + toHex(s.v).substr(2)
    }
}




module.exports = { createAccount, handleTx, signForRegister, signBlock, createConvictHash, increaseTime, signHash }