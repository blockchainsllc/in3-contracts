const NodeRegistry = artifacts.require("NodeRegistry")
const utils = require('../src/utils/utils')
const deployment = require('../src/utils/deployment')
const in3Common = require("in3-common")
const fs = require('fs')
const Web3 = require('web3')

const ethUtil = require('ethereumjs-util')

const BlockhashRegistry = JSON.parse(fs.readFileSync('build/contracts/BlockhashRegistry.json'))

contract('NodeRegistry', async () => {

    it("should return the correct registryId", async () => {

        const txBH = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))

        const block = await web3.eth.getBlock("latest")

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider), txBH.contractAddress)

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        const calcReg = ethUtil.keccak(Buffer.concat([
            in3Common.serialize.address(tx.contractAddress),
            in3Common.serialize.bytes32(block.hash)
        ]))

        assert.strictEqual("0x" + calcReg.toString('hex'), await nodeRegistry.methods.registryId().call())

    })

    it("should return the correct blockRegistry", async () => {

        const txBH = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider), txBH.contractAddress)

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual(txBH.contractAddress, await nodeRegistry.methods.blockRegistry().call())

    })

    it("should return the correct timestamp of deployment", async () => {

        const txBH = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider), txBH.contractAddress)
        const block = await web3.eth.getBlock("latest")

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('' + (block.timestamp + 365 * 86400), await nodeRegistry.methods.timestampAdminKeyActive().call())

    })

    it("should return the correct unregisterKey", async () => {

        const pk = await utils.createAccount(null, '1000000000')

        const txBH = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider), txBH.contractAddress, pk)

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(ethAcc.address, await nodeRegistry.methods.unregisterKey().call())

    })

    it("should return the correct version", async () => {

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual(await nodeRegistry.methods.VERSION().call(), "12300020190709")
    })

    it("should be able to register a node", async () => {

        const pk = await utils.createAccount(null, '49000000000000000000')
        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3700, 2000).encodeABI()


        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)
        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3700')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3700'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

    })

    it("should enforce timeout of 1h during registering of a node", async () => {

        const pk = await utils.createAccount(null, '49000000000000000000')
        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const txDataFail = nodeRegistry.methods.registerNode("#1", 65000, 0, 2000).encodeABI()

        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txDataFail, value: '40000000000000000000' }, pk).catch(_ => false))

        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()

        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

    })


    it("should fail trying to register a node with the same url twice", async () => {

        const pk = await utils.createAccount(null, '49000000000000000000')
        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()

        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)
        const block = await web3.eth.getBlock("latest")

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const pk2 = await utils.createAccount(null, '49000000000000000000')
        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk2).catch(_ => false))
    })

    it("should fail trying to register a node with the same signer twice", async () => {

        const pk = await utils.createAccount(null, '89000000000000000000')
        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()

        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)
        const block = await web3.eth.getBlock("latest")

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const txDataTwo = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()
        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txDataTwo, value: '40000000000000000000' }, pk).catch(_ => false))
    })

    it("should remove a node with the signerKey", async () => {

        const deployKey = await utils.createAccount(null, '49000000000000000000')

        const pk = await utils.createAccount(null, '49000000000000000000')
        const pk2 = await utils.createAccount(null, '49000000000000000000')

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider), null, deployKey)

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)

        const block = await web3.eth.getBlock("latest")

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const txDataTwo = nodeRegistry.methods.registerNode("#2", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txDataTwo, value: '40000000000000000000' }, pk2)
        const blockTwo = await web3.eth.getBlock("latest")

        const registeredNodeTwo = await nodeRegistry.methods.nodes(1).call()

        const ethAccTwo = await web3.eth.accounts.privateKeyToAccount(pk2);

        assert.strictEqual(registeredNodeTwo.url, "#2")
        assert.strictEqual(registeredNodeTwo.deposit, "40000000000000000000")
        assert.strictEqual(registeredNodeTwo.timeout, '3600')
        assert.strictEqual(registeredNodeTwo.registerTime, '' + blockTwo.timestamp)
        assert.strictEqual(registeredNodeTwo.props, '65000')
        assert.strictEqual(registeredNodeTwo.signer, ethAccTwo.address)

        const calcHashTwo = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(blockTwo.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAccTwo.address),
                in3Common.serialize.bytes('#2')
            ]))

        assert.strictEqual(registeredNodeTwo.proofHash, "0x" + calcHashTwo.toString('hex'))
        assert.strictEqual('2', await nodeRegistry.methods.totalNodes().call())

        const txDataRemoval = nodeRegistry.methods.adminRemoveNodeFromRegistry(ethAcc.address).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txDataRemoval }, deployKey)
        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const lastNode = await nodeRegistry.methods.nodes(0).call()

        assert.deepEqual(lastNode, registeredNodeTwo)

    })

    it("should fail removing an non existing node", async () => {

        const deployKey = await utils.createAccount(null, '49000000000000000000')

        const pk = await utils.createAccount(null, '49000000000000000000')
        const pk2 = await utils.createAccount(null, '49000000000000000000')

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider), null, deployKey)

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)

        const block = await web3.eth.getBlock("latest")

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const txDataTwo = nodeRegistry.methods.registerNode("#2", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txDataTwo, value: '40000000000000000000' }, pk2)
        const blockTwo = await web3.eth.getBlock("latest")

        const registeredNodeTwo = await nodeRegistry.methods.nodes(1).call()

        const ethAccTwo = await web3.eth.accounts.privateKeyToAccount(pk2);

        assert.strictEqual(registeredNodeTwo.url, "#2")
        assert.strictEqual(registeredNodeTwo.deposit, "40000000000000000000")
        assert.strictEqual(registeredNodeTwo.timeout, '3600')
        assert.strictEqual(registeredNodeTwo.registerTime, '' + blockTwo.timestamp)
        assert.strictEqual(registeredNodeTwo.props, '65000')
        assert.strictEqual(registeredNodeTwo.signer, ethAccTwo.address)

        const calcHashTwo = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(blockTwo.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAccTwo.address),
                in3Common.serialize.bytes('#2')
            ]))

        assert.strictEqual(registeredNodeTwo.proofHash, "0x" + calcHashTwo.toString('hex'))
        assert.strictEqual('2', await nodeRegistry.methods.totalNodes().call())

        const nonExistingNode = await utils.createAccount()

        const nonExistingAccount = await web3.eth.accounts.privateKeyToAccount(nonExistingNode);

        const txDataRemoval = nodeRegistry.methods.adminRemoveNodeFromRegistry(nonExistingAccount.address).encodeABI()
        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txDataRemoval }, deployKey).catch(_ => false))


    })

    it("should fail removing a node with a non signerKey", async () => {

        const deployKey = await utils.createAccount(null, '49000000000000000000')

        const pk = await utils.createAccount(null, '49000000000000000000')
        const pk2 = await utils.createAccount(null, '49000000000000000000')

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider), null, deployKey)

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)

        const block = await web3.eth.getBlock("latest")

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const txDataTwo = nodeRegistry.methods.registerNode("#2", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txDataTwo, value: '40000000000000000000' }, pk2)
        const blockTwo = await web3.eth.getBlock("latest")

        const registeredNodeTwo = await nodeRegistry.methods.nodes(1).call()

        const ethAccTwo = await web3.eth.accounts.privateKeyToAccount(pk2);

        assert.strictEqual(registeredNodeTwo.url, "#2")
        assert.strictEqual(registeredNodeTwo.deposit, "40000000000000000000")
        assert.strictEqual(registeredNodeTwo.timeout, '3600')
        assert.strictEqual(registeredNodeTwo.registerTime, '' + blockTwo.timestamp)
        assert.strictEqual(registeredNodeTwo.props, '65000')
        assert.strictEqual(registeredNodeTwo.signer, ethAccTwo.address)

        const calcHashTwo = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(blockTwo.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAccTwo.address),
                in3Common.serialize.bytes('#2')
            ]))

        assert.strictEqual(registeredNodeTwo.proofHash, "0x" + calcHashTwo.toString('hex'))
        assert.strictEqual('2', await nodeRegistry.methods.totalNodes().call())

        const txDataRemoval = nodeRegistry.methods.adminRemoveNodeFromRegistry(ethAcc.address).encodeABI()
        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txDataRemoval }, pk).catch(_ => false))

    })

    it("should fail when trying to register with a too low deposit", async () => {

        const pk = await utils.createAccount(null, '49000000000000000000')
        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()

        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txData, value: '10000000' }, pk).catch(_ => false))
    })

    it("should fail when trying to register with a too high timeout", async () => {

        const pk = await utils.createAccount(null, '49000000000000000000')
        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const txData = nodeRegistry.methods.registerNode("#1", 65000, 321040000, 2000).encodeABI()

        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk).catch(_ => false))
    })

    it("should fail when trying to register with a too high deposit in the 1st year", async () => {

        const pk = await utils.createAccount(null, '51000000000000000000')
        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()

        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txData, value: '50000000000000000001' }, pk).catch(_ => false))
    })

    it("should unregister a node as node-owner", async () => {

        const deployKey = await utils.createAccount(null, '49000000000000000000')

        const pk = await utils.createAccount(null, '49000000000000000000')
        const pk2 = await utils.createAccount(null, '49000000000000000000')

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider), null, deployKey)

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)

        const block = await web3.eth.getBlock("latest")

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const txDataTwo = nodeRegistry.methods.registerNode("#2", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txDataTwo, value: '40000000000000000000' }, pk2)
        const blockTwo = await web3.eth.getBlock("latest")

        const registeredNodeTwo = await nodeRegistry.methods.nodes(1).call()

        const ethAccTwo = await web3.eth.accounts.privateKeyToAccount(pk2);

        assert.strictEqual(registeredNodeTwo.url, "#2")
        assert.strictEqual(registeredNodeTwo.deposit, "40000000000000000000")
        assert.strictEqual(registeredNodeTwo.timeout, '3600')
        assert.strictEqual(registeredNodeTwo.registerTime, '' + blockTwo.timestamp)
        assert.strictEqual(registeredNodeTwo.props, '65000')
        assert.strictEqual(registeredNodeTwo.signer, ethAccTwo.address)

        const calcHashTwo = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(blockTwo.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAccTwo.address),
                in3Common.serialize.bytes('#2')
            ]))

        assert.strictEqual(registeredNodeTwo.proofHash, "0x" + calcHashTwo.toString('hex'))
        assert.strictEqual('2', await nodeRegistry.methods.totalNodes().call())

        const txDataRemoval = nodeRegistry.methods.unregisteringNode(ethAcc.address).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txDataRemoval }, pk)
        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const lastNode = await nodeRegistry.methods.nodes(0).call()

        assert.deepEqual(lastNode, registeredNodeTwo)

    })

    it("should fail unregistering a node as non-node-owner", async () => {

        const deployKey = await utils.createAccount(null, '49000000000000000000')

        const pk = await utils.createAccount(null, '49000000000000000000')
        const pk2 = await utils.createAccount(null, '49000000000000000000')

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider), null, deployKey)

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)

        const block = await web3.eth.getBlock("latest")

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const txDataTwo = nodeRegistry.methods.registerNode("#2", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txDataTwo, value: '40000000000000000000' }, pk2)
        const blockTwo = await web3.eth.getBlock("latest")

        const registeredNodeTwo = await nodeRegistry.methods.nodes(1).call()

        const ethAccTwo = await web3.eth.accounts.privateKeyToAccount(pk2);

        assert.strictEqual(registeredNodeTwo.url, "#2")
        assert.strictEqual(registeredNodeTwo.deposit, "40000000000000000000")
        assert.strictEqual(registeredNodeTwo.timeout, '3600')
        assert.strictEqual(registeredNodeTwo.registerTime, '' + blockTwo.timestamp)
        assert.strictEqual(registeredNodeTwo.props, '65000')
        assert.strictEqual(registeredNodeTwo.signer, ethAccTwo.address)

        const calcHashTwo = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(blockTwo.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAccTwo.address),
                in3Common.serialize.bytes('#2')
            ]))

        assert.strictEqual(registeredNodeTwo.proofHash, "0x" + calcHashTwo.toString('hex'))
        assert.strictEqual('2', await nodeRegistry.methods.totalNodes().call())

        const txDataRemoval = nodeRegistry.methods.unregisteringNode(ethAcc.address).encodeABI()
        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txDataRemoval }, pk2).catch(_ => false))
    })

    it("should fail unregistering a non existing node", async () => {

        const deployKey = await utils.createAccount(null, '49000000000000000000')

        const pk = await utils.createAccount(null, '49000000000000000000')
        const pk2 = await utils.createAccount(null, '49000000000000000000')

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider), null, deployKey)

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)

        const block = await web3.eth.getBlock("latest")

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const txDataTwo = nodeRegistry.methods.registerNode("#2", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txDataTwo, value: '40000000000000000000' }, pk2)
        const blockTwo = await web3.eth.getBlock("latest")

        const registeredNodeTwo = await nodeRegistry.methods.nodes(1).call()

        const ethAccTwo = await web3.eth.accounts.privateKeyToAccount(pk2);

        assert.strictEqual(registeredNodeTwo.url, "#2")
        assert.strictEqual(registeredNodeTwo.deposit, "40000000000000000000")
        assert.strictEqual(registeredNodeTwo.timeout, '3600')
        assert.strictEqual(registeredNodeTwo.registerTime, '' + blockTwo.timestamp)
        assert.strictEqual(registeredNodeTwo.props, '65000')
        assert.strictEqual(registeredNodeTwo.signer, ethAccTwo.address)

        const calcHashTwo = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(blockTwo.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAccTwo.address),
                in3Common.serialize.bytes('#2')
            ]))

        assert.strictEqual(registeredNodeTwo.proofHash, "0x" + calcHashTwo.toString('hex'))
        assert.strictEqual('2', await nodeRegistry.methods.totalNodes().call())

        const nonExistingNode = await utils.createAccount()

        const nonExistingAccount = await web3.eth.accounts.privateKeyToAccount(nonExistingNode);

        const txDataRemoval = nodeRegistry.methods.unregisteringNode(nonExistingAccount.address).encodeABI()
        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txDataRemoval }, nonExistingAccount).catch(_ => false))
    })

    it("should transfer the ownership of a node", async () => {

        const pk = await utils.createAccount(null, '49000000000000000000')
        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()


        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)
        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const signerInfoBefore = await nodeRegistry.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)

        const newOwner = await utils.createAccount()
        const nonExistingAccount = await web3.eth.accounts.privateKeyToAccount(newOwner);

        const txDataTransfer = nodeRegistry.methods.transferOwnership(ethAcc.address, nonExistingAccount.address).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txDataTransfer }, pk)

        const signerInfoAfter = await nodeRegistry.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)
        assert.strictEqual(signerInfoAfter.owner, nonExistingAccount.address)
    })

    it("should fail trying to change owner to 0x0", async () => {

        const pk = await utils.createAccount(null, '49000000000000000000')
        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()


        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)
        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const signerInfoBefore = await nodeRegistry.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)


        const txDataTransfer = nodeRegistry.methods.transferOwnership(ethAcc.address, "0x0000000000000000000000000000000000000000").encodeABI()
        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txDataTransfer }, pk).catch(_ => false))

    })

    it("should fail trying to transfer the ownership while not being the owner", async () => {

        const pk = await utils.createAccount(null, '49000000000000000000')
        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()


        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)
        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const signerInfoBefore = await nodeRegistry.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)

        const newOwner = await utils.createAccount()
        const nonExistingAccount = await web3.eth.accounts.privateKeyToAccount(newOwner);

        const txDataTransfer = nodeRegistry.methods.transferOwnership(ethAcc.address, nonExistingAccount.address).encodeABI()
        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txDataTransfer }, newOwner).catch(_ => false))

    })

    it("should update a node and also changing his url", async () => {

        const pk = await utils.createAccount(null, '5900000000000000000')
        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '4000000000000000000' }, pk)

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        const registeredNode = await nodeRegistry.methods.nodes(0).call()
        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "4000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)
        assert.strictEqual(registeredNode.weight, '2000')

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('4000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const txDataUpdate = nodeRegistry.methods.updateNode(ethAcc.address, "abc", 32000, 3600, 4000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txDataUpdate, value: "1000000000000000000" }, pk)

        const registeredNodeUpdated = await nodeRegistry.methods.nodes(0).call()

        assert.strictEqual(registeredNodeUpdated.url, "abc")
        assert.strictEqual(registeredNodeUpdated.deposit, "5000000000000000000")
        assert.strictEqual(registeredNodeUpdated.timeout, '3600')
        assert.strictEqual(registeredNodeUpdated.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNodeUpdated.props, '32000')
        assert.strictEqual(registeredNodeUpdated.signer, ethAcc.address)
        assert.strictEqual(registeredNodeUpdated.weight, '4000')

        const calcHashUpdated = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('5000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('32000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('abc')
            ]))

        assert.strictEqual(registeredNodeUpdated.proofHash, "0x" + calcHashUpdated.toString('hex'))

    })

    it("should update a node increasing timeout and deposit", async () => {

        const pk = await utils.createAccount(null, '49000000000000000000')
        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        const registeredNode = await nodeRegistry.methods.nodes(0).call()
        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)
        assert.strictEqual(registeredNode.weight, '2000')

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const txDataUpdate = nodeRegistry.methods.updateNode(ethAcc.address, "#1", 65000, 6000, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txDataUpdate, value: '10000' }, pk)

        const registeredNodeUpdated = await nodeRegistry.methods.nodes(0).call()

        assert.strictEqual(registeredNodeUpdated.url, "#1")
        assert.strictEqual(registeredNodeUpdated.deposit, "40000000000000010000")
        assert.strictEqual(registeredNodeUpdated.timeout, '6000')
        assert.strictEqual(registeredNodeUpdated.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNodeUpdated.props, '65000')
        assert.strictEqual(registeredNodeUpdated.signer, ethAcc.address)
        assert.strictEqual(registeredNodeUpdated.weight, '2000')

        const calcHashUpdated = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000010000')),
                in3Common.serialize.uint64('6000'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNodeUpdated.proofHash, "0x" + calcHashUpdated.toString('hex'))

    })

    it("should fail updating a node as non node owner", async () => {

        const pk = await utils.createAccount(null, '49000000000000000000')
        const nonOwer = await utils.createAccount(null, '49000000000000000000')

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        const registeredNode = await nodeRegistry.methods.nodes(0).call()
        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)
        assert.strictEqual(registeredNode.weight, '2000')

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const txDataUpdate = nodeRegistry.methods.updateNode(ethAcc.address, "#2", 32000, 3600, 4000).encodeABI()
        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txDataUpdate }, nonOwer).catch(_ => false))

    })

    it("should fail updating a non existing node", async () => {

        const pk = await utils.createAccount(null, '49000000000000000000')
        const nonOwer = await utils.createAccount(null, '49000000000000000000')

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);
        const notExistingNode = await web3.eth.accounts.privateKeyToAccount(nonOwer);


        const registeredNode = await nodeRegistry.methods.nodes(0).call()
        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)
        assert.strictEqual(registeredNode.weight, '2000')

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const txDataUpdate = nodeRegistry.methods.updateNode(notExistingNode.address, "#2", 32000, 0, 4000).encodeABI()
        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txDataUpdate }, nonOwer).catch(_ => false))

    })

    it("should fail updating a node when the new url is already taken", async () => {

        const pk = await utils.createAccount(null, '49000000000000000000')
        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        const registeredNode = await nodeRegistry.methods.nodes(0).call()
        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)
        assert.strictEqual(registeredNode.weight, '2000')

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const pk2 = await utils.createAccount(null, '49000000000000000000')

        const txDataTwo = nodeRegistry.methods.registerNode("#2", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txDataTwo, value: '40000000000000000000' }, pk2)
        const blockTwo = await web3.eth.getBlock("latest")

        const registeredNodeTwo = await nodeRegistry.methods.nodes(1).call()

        const ethAccTwo = await web3.eth.accounts.privateKeyToAccount(pk2);

        assert.strictEqual(registeredNodeTwo.url, "#2")
        assert.strictEqual(registeredNodeTwo.deposit, "40000000000000000000")
        assert.strictEqual(registeredNodeTwo.timeout, '3600')
        assert.strictEqual(registeredNodeTwo.registerTime, '' + blockTwo.timestamp)
        assert.strictEqual(registeredNodeTwo.props, '65000')
        assert.strictEqual(registeredNodeTwo.signer, ethAccTwo.address)

        const calcHashTwo = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(blockTwo.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAccTwo.address),
                in3Common.serialize.bytes('#2')
            ]))

        assert.strictEqual(registeredNodeTwo.proofHash, "0x" + calcHashTwo.toString('hex'))
        assert.strictEqual('2', await nodeRegistry.methods.totalNodes().call())


        const txDataUpdate = nodeRegistry.methods.updateNode(ethAcc.address, "#2", 32000, 3600, 4000).encodeABI()

        let failed = false
        try {

            await utils.handleTx({ to: tx.contractAddress, data: txDataUpdate }, pk)
        } catch (e) {
            failed = true
        }

        assert.isTrue(failed)
    })

    it("should be able to register a node for a different signer", async () => {

        const pk = await utils.createAccount(null, '49000000000000000000')
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        const signerPK = await utils.createAccount()

        const signerAcc = await web3.eth.accounts.privateKeyToAccount(signerPK);

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const signature = utils.signForRegister("#1", 65000, 3700, 2000, ethAcc.address, signerPK)

        const txData = nodeRegistry.methods.registerNodeFor("#1", 65000, 3700, signerAcc.address, 2000, signature.v, signature.r, signature.s).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)
        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        const block = await web3.eth.getBlock("latest")

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3700')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, signerAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3700'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(signerAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))
    })

    it("should fail registering for a different signer using a timeout that is too high", async () => {

        const pk = await utils.createAccount(null, '49000000000000000000')
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        const signerPK = await utils.createAccount()

        const signerAcc = await web3.eth.accounts.privateKeyToAccount(signerPK);

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const signature = utils.signForRegister("#1", 65000, 321040000, 2000, ethAcc.address, signerPK)


        const txData = nodeRegistry.methods.registerNodeFor("#1", 65000, 321040000, signerAcc.address, 2000, signature.v, signature.r, signature.s).encodeABI()
        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk).catch(_ => false))

    })

    it("should fail registering with a wrong signature", async () => {

        const pk = await utils.createAccount(null, '49000000000000000000')
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        const signerPK = await utils.createAccount()

        const signerAcc = await web3.eth.accounts.privateKeyToAccount(signerPK);

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const signature = utils.signForRegister("#2", 65000, 3700, 2000, ethAcc.address, signerPK)


        const txData = nodeRegistry.methods.registerNodeFor("#1", 65000, 3700, signerAcc.address, 2000, signature.v, signature.r, signature.s).encodeABI()
        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk).catch(_ => false))
    })

    it("should update a registeredNodeFor-node and also changing his url ", async () => {

        const pk = await utils.createAccount(null, '49000000000000000000')
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        const signerPK = await utils.createAccount()

        const signerAcc = await web3.eth.accounts.privateKeyToAccount(signerPK);

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const signature = utils.signForRegister("#1", 65000, 3700, 2000, ethAcc.address, signerPK)

        const txData = nodeRegistry.methods.registerNodeFor("#1", 65000, 3700, signerAcc.address, 2000, signature.v, signature.r, signature.s).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistry.methods.nodes(0).call()
        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3700')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, signerAcc.address)
        assert.strictEqual(registeredNode.weight, '2000')

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3700'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(signerAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const txDataUpdateFail = nodeRegistry.methods.updateNode(signerAcc.address, "abc", 32000, 3600, 4000).encodeABI()
        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txDataUpdateFail }, pk).catch(_ => false))

        const txDataUpdate = nodeRegistry.methods.updateNode(signerAcc.address, "abc", 32000, 3700, 4000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txDataUpdate }, pk)
        const registeredNodeUpdated = await nodeRegistry.methods.nodes(0).call()

        assert.strictEqual(registeredNodeUpdated.url, "abc")
        assert.strictEqual(registeredNodeUpdated.deposit, "40000000000000000000")
        assert.strictEqual(registeredNodeUpdated.timeout, '3700')
        assert.strictEqual(registeredNodeUpdated.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNodeUpdated.props, '32000')
        assert.strictEqual(registeredNodeUpdated.signer, signerAcc.address)
        assert.strictEqual(registeredNodeUpdated.weight, '4000')

        const calcHashUpdated = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3700'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('32000', 16),
                in3Common.serialize.address(signerAcc.address),
                in3Common.serialize.bytes('abc')
            ]))

        assert.strictEqual(registeredNodeUpdated.proofHash, "0x" + calcHashUpdated.toString('hex'))

    })

    it("should successfully convict and revealConvict and a block within 256 blocks", async () => {

        const pk = await utils.createAccount(null, '49000000000000000000')
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        const signerPK = await utils.createAccount()

        const signerAcc = await web3.eth.accounts.privateKeyToAccount(signerPK);

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())
        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)

        const block = await web3.eth.getBlock("latest")

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))
        const signerInfoBefore = await nodeRegistry.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.stage, '1')
        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)
        assert.strictEqual(signerInfoBefore.depositAmount, '0')


        const b = new in3Common.Block(block)
        const signedBlock = utils.signBlock(b, await nodeRegistry.methods.registryId().call(), pk, "0x0000000000000000000000000000000000000000000000000000000000001234")

        // convicting
        const convictHash = utils.createConvictHash(signedBlock.blockHash, signerAcc.address, signedBlock.v, signedBlock.r, signedBlock.s)


        const convictData = nodeRegistry.methods.convict("0x" + convictHash.toString('hex')).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: convictData }, signerPK)

        // creating some blocks
        await utils.createAccount(null, '1')
        await utils.createAccount(null, '1')

        const balanceSenderBefore = await web3.eth.getBalance(signerAcc.address)

        const revealConvictData = nodeRegistry.methods.revealConvict(ethAcc.address, signedBlock.blockHash, signedBlock.block, signedBlock.v, signedBlock.r, signedBlock.s).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: revealConvictData }, signerPK)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())
        const signerInfoAfter = await nodeRegistry.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoAfter.stage, '2')
        assert.strictEqual(signerInfoAfter.owner, ethAcc.address)
        assert.strictEqual(signerInfoAfter.depositAmount, '0')
        const balanceSenderAfter = await web3.eth.getBalance(signerAcc.address)

        const halfDeposit = in3Common.util.toBN(registeredNode.deposit).div(in3Common.util.toBN('2'))

        assert.strictEqual(in3Common.util.toBN(balanceSenderBefore).add(halfDeposit).toString('hex'), in3Common.util.toBN(balanceSenderAfter).toString('hex'))
    })

    it("should fail when calling revealConvict too early", async () => {

        const pk = await utils.createAccount(null, '49000000000000000000')
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        const signerPK = await utils.createAccount()

        const signerAcc = await web3.eth.accounts.privateKeyToAccount(signerPK);

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())
        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)

        const block = await web3.eth.getBlock("latest")

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))
        const signerInfoBefore = await nodeRegistry.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.stage, '1')
        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)
        assert.strictEqual(signerInfoBefore.depositAmount, '0')


        const b = new in3Common.Block(block)
        const signedBlock = utils.signBlock(b, await nodeRegistry.methods.registryId().call(), pk, "0x0000000000000000000000000000000000000000000000000000000000001234")

        // convicting
        const convictHash = utils.createConvictHash(signedBlock.blockHash, signerAcc.address, signedBlock.v, signedBlock.r, signedBlock.s)
        const convictData = nodeRegistry.methods.convict("0x" + convictHash.toString('hex')).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: convictData }, signerPK)

        const revealConvictData = nodeRegistry.methods.revealConvict(ethAcc.address, signedBlock.blockHash, signedBlock.block, signedBlock.v, signedBlock.r, signedBlock.s).encodeABI()
        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: revealConvictData }, signerPK).catch(_ => false))

    })

    it("should fail revealConvicting when the hash is not correct", async () => {

        const pk = await utils.createAccount(null, '49000000000000000000')
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        const signerPK = await utils.createAccount()

        const signerAcc = await web3.eth.accounts.privateKeyToAccount(signerPK);

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())
        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)

        const block = await web3.eth.getBlock("latest")

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))
        const signerInfoBefore = await nodeRegistry.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.stage, '1')
        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)
        assert.strictEqual(signerInfoBefore.depositAmount, '0')


        const b = new in3Common.Block(block)
        const signedBlock = utils.signBlock(b, await nodeRegistry.methods.registryId().call(), pk, "0x0000000000000000000000000000000000000000000000000000000000001234")

        // convicting
        const convictHash = utils.createConvictHash(signedBlock.blockHash, signerAcc.address, signedBlock.v, signedBlock.s, signedBlock.s)
        const convictData = nodeRegistry.methods.convict("0x" + convictHash.toString('hex')).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: convictData }, signerPK)

        // creating some blocks
        await utils.createAccount(null, '1')
        await utils.createAccount(null, '1')

        const revealConvictData = nodeRegistry.methods.revealConvict(ethAcc.address, signedBlock.blockHash, signedBlock.block, signedBlock.v, signedBlock.r, signedBlock.s).encodeABI()
        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: revealConvictData }, signerPK).catch(_ => false))
    })

    it("should fail revealConvicting when signed blockhash was correct", async () => {

        const pk = await utils.createAccount(null, '49000000000000000000')
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        const signerPK = await utils.createAccount()

        const signerAcc = await web3.eth.accounts.privateKeyToAccount(signerPK);

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())
        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)

        const block = await web3.eth.getBlock("latest")

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))
        const signerInfoBefore = await nodeRegistry.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.stage, '1')
        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)
        assert.strictEqual(signerInfoBefore.depositAmount, '0')


        const b = new in3Common.Block(block)
        const signedBlock = utils.signBlock(b, await nodeRegistry.methods.registryId().call(), pk, block.hash)

        // convicting
        const convictHash = utils.createConvictHash(signedBlock.blockHash, signerAcc.address, signedBlock.v, signedBlock.r, signedBlock.s)
        const convictData = nodeRegistry.methods.convict("0x" + convictHash.toString('hex')).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: convictData }, signerPK)

        // creating some blocks
        await utils.createAccount(null, '1')
        await utils.createAccount(null, '1')

        const revealConvictData = nodeRegistry.methods.revealConvict(ethAcc.address, signedBlock.blockHash, signedBlock.block, signedBlock.v, signedBlock.r, signedBlock.s).encodeABI()
        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: revealConvictData }, signerPK).catch(_ => false))
    })


    it("should fail revealConvicting when the node did not sign the block", async () => {

        const pk = await utils.createAccount(null, '49000000000000000000')
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        const signerPK = await utils.createAccount()

        const signerAcc = await web3.eth.accounts.privateKeyToAccount(signerPK);

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())
        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)

        const block = await web3.eth.getBlock("latest")

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))
        const signerInfoBefore = await nodeRegistry.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.stage, '1')
        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)
        assert.strictEqual(signerInfoBefore.depositAmount, '0')


        const b = new in3Common.Block(block)
        const signedBlock = utils.signBlock(b, await nodeRegistry.methods.registryId().call(), signerPK, "0x0000000000000000000000000000000000000000000000000000000000001234")

        // convicting
        const convictHash = utils.createConvictHash(signedBlock.blockHash, signerAcc.address, signedBlock.v, signedBlock.r, signedBlock.s)
        const convictData = nodeRegistry.methods.convict("0x" + convictHash.toString('hex')).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: convictData }, signerPK)

        // creating some blocks
        await utils.createAccount(null, '1')
        await utils.createAccount(null, '1')

        const revealConvictData = nodeRegistry.methods.revealConvict(ethAcc.address, signedBlock.blockHash, signedBlock.block, signedBlock.v, signedBlock.r, signedBlock.s).encodeABI()
        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: revealConvictData }, signerPK).catch(_ => false))
    })

    it("should increase the # of blocks to at least 260", async () => {

        let currentBlockNumber = await web3.eth.getBlockNumber()

        while (currentBlockNumber < 260) {
            await utils.createAccount(null, '0')
            currentBlockNumber = await web3.eth.getBlockNumber()
        }

    })

    it("should fail when calling with a block older then 256 blocks and not found in the blockhash registry", async () => {

        const pk = await utils.createAccount(null, '49000000000000000000')
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        const signerPK = await utils.createAccount()

        const signerAcc = await web3.eth.accounts.privateKeyToAccount(signerPK);

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())
        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)

        const block = await web3.eth.getBlock("latest")

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))
        const signerInfoBefore = await nodeRegistry.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.stage, '1')
        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)
        assert.strictEqual(signerInfoBefore.depositAmount, '0')

        const earlyBlock = await web3.eth.getBlock(block.number - 300)

        const b = new in3Common.Block(earlyBlock)

        const signedBlock = utils.signBlock(b, await nodeRegistry.methods.registryId().call(), pk, "0x0000000000000000000000000000000000000000000000000000000000001234")

        // convicting
        const convictHash = utils.createConvictHash(signedBlock.blockHash, signerAcc.address, signedBlock.v, signedBlock.r, signedBlock.s)
        const convictData = nodeRegistry.methods.convict("0x" + convictHash.toString('hex')).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: convictData }, signerPK)

        // creating some blocks
        await utils.createAccount(null, '1')
        await utils.createAccount(null, '1')

        const revealConvictData = nodeRegistry.methods.revealConvict(ethAcc.address, signedBlock.blockHash, signedBlock.block, signedBlock.v, signedBlock.r, signedBlock.s).encodeABI()
        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: revealConvictData }, signerPK).catch(_ => false))
    })

    it("should successfully convict an older block that has been found within the blockhash registry", async () => {

        const pk = await utils.createAccount(null, '49000000000000000000')
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        const signerPK = await utils.createAccount()

        const signerAcc = await web3.eth.accounts.privateKeyToAccount(signerPK);

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())
        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)

        const block = await web3.eth.getBlock("latest")

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))
        const signerInfoBefore = await nodeRegistry.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.stage, '1')
        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)
        assert.strictEqual(signerInfoBefore.depositAmount, '0')

        const earlyBlock = await web3.eth.getBlock(block.number - 260)

        const b = new in3Common.Block(earlyBlock)

        const signedBlock = utils.signBlock(b, await nodeRegistry.methods.registryId().call(), pk, "0x0000000000000000000000000000000000000000000000000000000000001234")

        // convicting
        const convictHash = utils.createConvictHash(signedBlock.blockHash, signerAcc.address, signedBlock.v, signedBlock.r, signedBlock.s)
        const convictData = nodeRegistry.methods.convict("0x" + convictHash.toString('hex')).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: convictData }, signerPK)

        // sending convict twice to also test using a different index
        await utils.handleTx({ to: tx.contractAddress, data: convictData }, signerPK)

        const blockHashRegistryAddress = await nodeRegistry.methods.blockRegistry().call()

        const blockhashRegistry = new web3.eth.Contract(BlockhashRegistry.abi, blockHashRegistryAddress)
        const blockSnapshot = await web3.eth.getBlock("latest")

        const txDataSnapshot = blockhashRegistry.methods.saveBlockNumber(blockSnapshot.number - 240).encodeABI()
        await utils.handleTx({ to: blockHashRegistryAddress, data: txDataSnapshot }, signerPK)

        const ssBlock = await web3.eth.getBlock(blockSnapshot.number - 240)

        const diffBlocks = ssBlock.number - earlyBlock.number

        let blockheaderArray = [];

        blockheaderArray.push(new in3Common.Block(ssBlock).serializeHeader())

        const startNumber = ssBlock.number

        for (let i = 1; i < diffBlocks; i++) {
            const btemp = await web3.eth.getBlock(startNumber - i)
            blockheaderArray.push(new in3Common.Block(btemp).serializeHeader())
        }

        const txDataRecreate = blockhashRegistry.methods.recreateBlockheaders(startNumber, blockheaderArray).encodeABI()
        await utils.handleTx({ to: blockHashRegistryAddress, data: txDataRecreate }, signerPK)

        const revealConvictData = nodeRegistry.methods.revealConvict(ethAcc.address, signedBlock.blockHash, signedBlock.block, signedBlock.v, signedBlock.r, signedBlock.s).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: revealConvictData }, signerPK)
    })

    it("should fail convicting a node again after he was convicted", async () => {

        const pk = await utils.createAccount(null, '49000000000000000000')
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        const signerPK = await utils.createAccount()

        const signerAcc = await web3.eth.accounts.privateKeyToAccount(signerPK);

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())
        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)

        const block = await web3.eth.getBlock("latest")

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))
        const signerInfoBefore = await nodeRegistry.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.stage, '1')
        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)
        assert.strictEqual(signerInfoBefore.depositAmount, '0')


        const b = new in3Common.Block(block)
        const signedBlock = utils.signBlock(b, await nodeRegistry.methods.registryId().call(), pk, "0x0000000000000000000000000000000000000000000000000000000000001234")

        // convicting
        const convictHash = utils.createConvictHash(signedBlock.blockHash, signerAcc.address, signedBlock.v, signedBlock.r, signedBlock.s)
        const convictData = nodeRegistry.methods.convict("0x" + convictHash.toString('hex')).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: convictData }, signerPK)

        // creating some blocks
        await utils.createAccount(null, '1')
        await utils.createAccount(null, '1')

        const balanceSenderBefore = await web3.eth.getBalance(signerAcc.address)

        const revealConvictData = nodeRegistry.methods.revealConvict(ethAcc.address, signedBlock.blockHash, signedBlock.block, signedBlock.v, signedBlock.r, signedBlock.s).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: revealConvictData }, signerPK)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())
        const signerInfoAfter = await nodeRegistry.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoAfter.stage, '2')
        assert.strictEqual(signerInfoAfter.owner, ethAcc.address)
        assert.strictEqual(signerInfoAfter.depositAmount, '0')
        const balanceSenderAfter = await web3.eth.getBalance(signerAcc.address)

        const halfDeposit = in3Common.util.toBN(registeredNode.deposit).div(in3Common.util.toBN('2'))

        assert.strictEqual(in3Common.util.toBN(balanceSenderBefore).add(halfDeposit).toString('hex'), in3Common.util.toBN(balanceSenderAfter).toString('hex'))

        const convictSecond = await utils.createAccount()

        const convictSecondAcc = await web3.eth.accounts.privateKeyToAccount(convictSecond);
        // convicting
        const convictHashTwo = utils.createConvictHash(signedBlock.blockHash, convictSecondAcc.address, signedBlock.v, signedBlock.r, signedBlock.s)
        const convictDataTwo = nodeRegistry.methods.convict("0x" + convictHashTwo.toString('hex')).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: convictDataTwo }, convictSecond)

        await utils.createAccount(null, '1')
        await utils.createAccount(null, '1')

        const revealConvictDataTwo = nodeRegistry.methods.revealConvict(ethAcc.address, signedBlock.blockHash, signedBlock.block, signedBlock.v, signedBlock.r, signedBlock.s).encodeABI()


        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: revealConvictDataTwo }, convictSecond).catch(_ => {
            return false
        }))

    })

    it("should successfully convict and revealConvict a node that is already unregistered", async () => {

        const pk = await utils.createAccount(null, '49000000000000000000')
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        const signerPK = await utils.createAccount()

        const signerAcc = await web3.eth.accounts.privateKeyToAccount(signerPK);

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())
        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)

        const block = await web3.eth.getBlock("latest")

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))
        const signerInfoBefore = await nodeRegistry.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.stage, '1')
        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)
        assert.strictEqual(signerInfoBefore.depositAmount, '0')


        const b = new in3Common.Block(block)
        const signedBlock = utils.signBlock(b, await nodeRegistry.methods.registryId().call(), pk, "0x0000000000000000000000000000000000000000000000000000000000001234")

        // convicting
        const convictHash = utils.createConvictHash(signedBlock.blockHash, signerAcc.address, signedBlock.v, signedBlock.r, signedBlock.s)
        const convictData = nodeRegistry.methods.convict("0x" + convictHash.toString('hex')).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: convictData }, signerPK)

        const unregisterData = nodeRegistry.methods.unregisteringNode(ethAcc.address).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: unregisterData }, pk)

        // creating some blocks
        await utils.createAccount(null, '1')
        await utils.createAccount(null, '1')

        const balanceSenderBefore = await web3.eth.getBalance(signerAcc.address)

        const revealConvictData = nodeRegistry.methods.revealConvict(ethAcc.address, signedBlock.blockHash, signedBlock.block, signedBlock.v, signedBlock.r, signedBlock.s).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: revealConvictData }, signerPK)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())
        const signerInfoAfter = await nodeRegistry.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoAfter.stage, '2')
        assert.strictEqual(signerInfoAfter.owner, ethAcc.address)
        assert.strictEqual(signerInfoAfter.depositAmount, '0')
        const balanceSenderAfter = await web3.eth.getBalance(signerAcc.address)

        const halfDeposit = in3Common.util.toBN(registeredNode.deposit).div(in3Common.util.toBN('2'))

        assert.strictEqual(in3Common.util.toBN(balanceSenderBefore).add(halfDeposit).toString('hex'), in3Common.util.toBN(balanceSenderAfter).toString('hex'))
    })

    it("should fail returning the deposit of an active user", async () => {

        const deployKey = await utils.createAccount(null, '49000000000000000000')

        const pk = await utils.createAccount(null, '49000000000000000000')
        const pk2 = await utils.createAccount(null, '49000000000000000000')

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider), null, deployKey)

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)

        const block = await web3.eth.getBlock("latest")

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const returnData = nodeRegistry.methods.returnDeposit(ethAcc.address).encodeABI()
        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: returnData }, pk).catch(_ => false))


    })

    it("should successfully return the deposit after the timeout is over", async () => {

        const deployKey = await utils.createAccount(null, '49000000000000000000')

        const pk = await utils.createAccount(null, '49000000000000000000')
        const pk2 = await utils.createAccount(null, '49000000000000000000')

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider), null, deployKey)

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)

        const block = await web3.eth.getBlock("latest")

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const txDataTwo = nodeRegistry.methods.registerNode("#2", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txDataTwo, value: '40000000000000000000' }, pk2)
        const blockTwo = await web3.eth.getBlock("latest")

        const registeredNodeTwo = await nodeRegistry.methods.nodes(1).call()

        const ethAccTwo = await web3.eth.accounts.privateKeyToAccount(pk2);

        assert.strictEqual(registeredNodeTwo.url, "#2")
        assert.strictEqual(registeredNodeTwo.deposit, "40000000000000000000")
        assert.strictEqual(registeredNodeTwo.timeout, '3600')
        assert.strictEqual(registeredNodeTwo.registerTime, '' + blockTwo.timestamp)
        assert.strictEqual(registeredNodeTwo.props, '65000')
        assert.strictEqual(registeredNodeTwo.signer, ethAccTwo.address)

        const calcHashTwo = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(blockTwo.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAccTwo.address),
                in3Common.serialize.bytes('#2')
            ]))

        assert.strictEqual(registeredNodeTwo.proofHash, "0x" + calcHashTwo.toString('hex'))
        assert.strictEqual('2', await nodeRegistry.methods.totalNodes().call())

        const txDataRemoval = nodeRegistry.methods.unregisteringNode(ethAcc.address).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txDataRemoval }, pk)
        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const lastNode = await nodeRegistry.methods.nodes(0).call()

        assert.deepEqual(lastNode, registeredNodeTwo)

        await utils.increaseTime(web3, 3605)

        const txDataDepositReturn = nodeRegistry.methods.returnDeposit(ethAcc.address).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txDataDepositReturn }, pk)

    })

    it("should fail returning the deposit before the timeout is over", async () => {

        const deployKey = await utils.createAccount(null, '49000000000000000000')

        const pk = await utils.createAccount(null, '49000000000000000000')
        const pk2 = await utils.createAccount(null, '49000000000000000000')

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider), null, deployKey)

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)

        const block = await web3.eth.getBlock("latest")

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const txDataTwo = nodeRegistry.methods.registerNode("#2", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txDataTwo, value: '40000000000000000000' }, pk2)
        const blockTwo = await web3.eth.getBlock("latest")

        const registeredNodeTwo = await nodeRegistry.methods.nodes(1).call()

        const ethAccTwo = await web3.eth.accounts.privateKeyToAccount(pk2);

        assert.strictEqual(registeredNodeTwo.url, "#2")
        assert.strictEqual(registeredNodeTwo.deposit, "40000000000000000000")
        assert.strictEqual(registeredNodeTwo.timeout, '3600')
        assert.strictEqual(registeredNodeTwo.registerTime, '' + blockTwo.timestamp)
        assert.strictEqual(registeredNodeTwo.props, '65000')
        assert.strictEqual(registeredNodeTwo.signer, ethAccTwo.address)

        const calcHashTwo = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(blockTwo.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAccTwo.address),
                in3Common.serialize.bytes('#2')
            ]))

        assert.strictEqual(registeredNodeTwo.proofHash, "0x" + calcHashTwo.toString('hex'))
        assert.strictEqual('2', await nodeRegistry.methods.totalNodes().call())

        const txDataRemoval = nodeRegistry.methods.unregisteringNode(ethAcc.address).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txDataRemoval }, pk)
        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const lastNode = await nodeRegistry.methods.nodes(0).call()

        assert.deepEqual(lastNode, registeredNodeTwo)

        const txDataDepositReturn = nodeRegistry.methods.returnDeposit(ethAcc.address).encodeABI()
        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txDataDepositReturn }, pk).catch(_ => false))

    })

    it("should fail returning the deposit of a node as non owner", async () => {

        const deployKey = await utils.createAccount(null, '49000000000000000000')

        const pk = await utils.createAccount(null, '49000000000000000000')
        const pk2 = await utils.createAccount(null, '49000000000000000000')

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider), null, deployKey)

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)
        const block = await web3.eth.getBlock("latest")


        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const txDataTwo = nodeRegistry.methods.registerNode("#2", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txDataTwo, value: '40000000000000000000' }, pk2)
        const blockTwo = await web3.eth.getBlock("latest")

        const registeredNodeTwo = await nodeRegistry.methods.nodes(1).call()

        const ethAccTwo = await web3.eth.accounts.privateKeyToAccount(pk2);

        assert.strictEqual(registeredNodeTwo.url, "#2")
        assert.strictEqual(registeredNodeTwo.deposit, "40000000000000000000")
        assert.strictEqual(registeredNodeTwo.timeout, '3600')
        assert.strictEqual(registeredNodeTwo.registerTime, '' + blockTwo.timestamp)
        assert.strictEqual(registeredNodeTwo.props, '65000')
        assert.strictEqual(registeredNodeTwo.signer, ethAccTwo.address)

        const calcHashTwo = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(blockTwo.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAccTwo.address),
                in3Common.serialize.bytes('#2')
            ]))

        assert.strictEqual(registeredNodeTwo.proofHash, "0x" + calcHashTwo.toString('hex'))
        assert.strictEqual('2', await nodeRegistry.methods.totalNodes().call())

        const txDataRemoval = nodeRegistry.methods.unregisteringNode(ethAcc.address).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txDataRemoval }, pk)
        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const lastNode = await nodeRegistry.methods.nodes(0).call()

        assert.deepEqual(lastNode, registeredNodeTwo)

        const txDataDepositReturn = nodeRegistry.methods.returnDeposit(ethAcc.address).encodeABI()
        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txDataDepositReturn }, pk2).catch(_ => false))

    })

    it("should allow register nodes with more then 50 ether as deposit after 1 year", async () => {

        const pk = await utils.createAccount(null, '51000000000000000000')
        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        await utils.increaseTime(web3, 366 * 86400)

        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '50000000000000000001' }, pk)
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "50000000000000000001")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('50000000000000000001')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))
    })

    it("should fail removing a node with the signerKey after 1 year", async () => {

        const deployKey = await utils.createAccount(null, '49000000000000000000')

        const pk = await utils.createAccount(null, '49000000000000000000')
        const pk2 = await utils.createAccount(null, '49000000000000000000')

        const tx = await deployment.deployNodeRegistry(new Web3(web3.currentProvider), null, deployKey)

        const nodeRegistry = new web3.eth.Contract(NodeRegistry.abi, tx.contractAddress)

        assert.strictEqual('0', await nodeRegistry.methods.totalNodes().call())

        const txData = nodeRegistry.methods.registerNode("#1", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData, value: '40000000000000000000' }, pk)

        const block = await web3.eth.getBlock("latest")

        assert.strictEqual('1', await nodeRegistry.methods.totalNodes().call())

        const registeredNode = await nodeRegistry.methods.nodes(0).call()

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.timeout, '3600')
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const txDataTwo = nodeRegistry.methods.registerNode("#2", 65000, 3600, 2000).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txDataTwo, value: '40000000000000000000' }, pk2)
        const blockTwo = await web3.eth.getBlock("latest")

        const registeredNodeTwo = await nodeRegistry.methods.nodes(1).call()

        const ethAccTwo = await web3.eth.accounts.privateKeyToAccount(pk2);

        assert.strictEqual(registeredNodeTwo.url, "#2")
        assert.strictEqual(registeredNodeTwo.deposit, "40000000000000000000")
        assert.strictEqual(registeredNodeTwo.timeout, '3600')
        assert.strictEqual(registeredNodeTwo.registerTime, '' + blockTwo.timestamp)
        assert.strictEqual(registeredNodeTwo.props, '65000')
        assert.strictEqual(registeredNodeTwo.signer, ethAccTwo.address)

        const calcHashTwo = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64('3600'),
                in3Common.serialize.uint64(blockTwo.timestamp),
                in3Common.util.toBuffer('65000', 16),
                in3Common.serialize.address(ethAccTwo.address),
                in3Common.serialize.bytes('#2')
            ]))

        assert.strictEqual(registeredNodeTwo.proofHash, "0x" + calcHashTwo.toString('hex'))
        assert.strictEqual('2', await nodeRegistry.methods.totalNodes().call())

        await utils.increaseTime(web3, 366 * 86400)

        const txDataRemoval = nodeRegistry.methods.adminRemoveNodeFromRegistry(ethAcc.address).encodeABI()
        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txDataRemoval }, deployKey).catch(_ => false))

    })


})