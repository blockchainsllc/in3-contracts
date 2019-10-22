const NodeRegistryLogic = artifacts.require("NodeRegistryLogic")
const NodeRegistryData = artifacts.require("NodeRegistryData")
const ERC20Wrapper = artifacts.require("ERC20Wrapper")

const utils = require('../src/utils/utils')
const deployment = require('../src/utils/deployment')
const in3Common = require("in3-common")
const fs = require('fs')
const Web3 = require('web3')

const ethUtil = require('ethereumjs-util')

const BlockhashRegistry = JSON.parse(fs.readFileSync('build/contracts/BlockhashRegistry.json'))

contract('NodeRegistry', async () => {


    it("should fail deploying when no blockhash-address is provided", async () => {

        const contracts = await deployment.deployContracts(web3)

        assert.isFalse(await deployment.deployNodeRegistryLogic(new Web3(web3.currentProvider), "0x0000000000000000000000000000000000000000", contracts.nodeRegistryData).catch(_ => false))
    })

    it("should fail deploying when no nodeRegistry-address is provided", async () => {

        const contracts = await deployment.deployContracts(web3)

        assert.isFalse(await deployment.deployNodeRegistryLogic(new Web3(web3.currentProvider), contracts.blockhashRegistry, "0x0000000000000000000000000000000000000000").catch(_ => false))
    })

    it("should return the correct registryId", async () => {

        const txBH = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))

        const block = await web3.eth.getBlock("latest")

        const tx = await deployment.deployNodeRegistryData(new Web3(web3.currentProvider))

        const nodeRegistry = new web3.eth.Contract(NodeRegistryData.abi, tx.contractAddress)

        const calcReg = ethUtil.keccak(Buffer.concat([
            in3Common.serialize.address(tx.contractAddress),
            in3Common.serialize.bytes32(block.hash)
        ]))

        assert.strictEqual("0x" + calcReg.toString('hex'), await nodeRegistry.methods.registryId().call())

    })

    it("should return the correct blockRegistry", async () => {
        const contracts = await deployment.deployContracts(web3)
        const nodeRegistry = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        assert.strictEqual(contracts.blockhashRegistry, await nodeRegistry.methods.blockRegistry().call())
    })

    it("should return the correct nodeRegistryData", async () => {
        const contracts = await deployment.deployContracts(web3)
        const nodeRegistry = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        assert.strictEqual(contracts.nodeRegistryData, await nodeRegistry.methods.nodeRegistryData().call())
    })

    it("should return the correct timestamp of deployment", async () => {

        const txBH = await deployment.deployBlockHashRegistry(web3)
        const txNodeRegistryData = await deployment.deployNodeRegistryData(web3)

        const tx = await deployment.deployNodeRegistryLogic(new Web3(web3.currentProvider), txBH.contractAddress, txNodeRegistryData.contractAddress)
        const block = await web3.eth.getBlock("latest")

        const nodeRegistry = new web3.eth.Contract(NodeRegistryLogic.abi, tx.contractAddress)

        assert.strictEqual('' + (block.timestamp + 365 * 86400), await nodeRegistry.methods.timestampAdminKeyActive().call())

    })

    it("should return the correct unregisterKey", async () => {
        const pk = await utils.createAccount(null, '1000000000')
        const contracts = await deployment.deployContracts(web3, pk)
        const nodeRegistry = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);
        assert.strictEqual(ethAcc.address, await nodeRegistry.methods.adminKey().call())
    })

    it("should return the correct version of nodeRegistryLogic", async () => {

        const contracts = await deployment.deployContracts(web3)
        const nodeRegistry = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)

        assert.strictEqual(await nodeRegistry.methods.VERSION().call(), "12300020190709")
    })

    it("should return the correct version of nodeRegistryData", async () => {

        const contracts = await deployment.deployContracts(web3)
        const nodeRegistry = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        assert.strictEqual(await nodeRegistry.methods.VERSION().call(), "12300020190709")
    })

    it("should be able to register a node", async () => {

        const pk = await utils.createAccount(null, '400000000000000000000')
        const contracts = await deployment.deployContracts(web3)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk).catch(_ => false))

        // approve erc20 tokens
        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())

        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

    })


    it("should fail trying to register a node with the same url twice", async () => {

        const pk = await utils.createAccount(null, '400000000000000000000')
        const contracts = await deployment.deployContracts(web3)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk).catch(_ => false))

        // approve erc20 tokens
        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())

        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const pk2 = await utils.createAccount(null, '400000000000000000000')
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk2)

        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk2)

        //   assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData }, pk2).catch(_ => false))
        let failed = false
        try {
            await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData }, pk2)
        } catch (e) {
            console.log(e)
            failed = true
        }
        assert.isTrue(failed)
    })

    it("should fail trying to register a node with the same signer twice", async () => {

        const pk = await utils.createAccount(null, '400000000000000000000')
        const contracts = await deployment.deployContracts(web3)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk).catch(_ => false))

        // approve erc20 tokens
        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())

        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const txDataTwo = nodeRegistryLogic.methods.registerNode("#2", 65000, 3600, "40000000000000000000").encodeABI()
        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataTwo }, pk).catch(_ => false))
    })



    it("should remove a node with the signerKey", async () => {
        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')
        const pk2 = await utils.createAccount(null, '400000000000000000000')

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        // approve 2nd 
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk2)
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk2)

        const txDataTwo = nodeRegistryLogic.methods.registerNode("#2", 65000, 64, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataTwo, }, pk2)

        assert.strictEqual('2', await nodeRegistryData.methods.totalNodes().call())
        const registeredNodeTwo = await nodeRegistryData.methods.nodes(1).call()

        const txDataRemoval = nodeRegistryLogic.methods.adminRemoveNodeFromRegistry(ethAcc.address).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataRemoval }, deployKey)
        const unregisterBlock = await web3.eth.getBlock('latest')

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())

        const lastNode = await nodeRegistryData.methods.nodes(0).call()

        assert.deepEqual(lastNode, registeredNodeTwo)

        const txDataRemovalTwo = nodeRegistryLogic.methods.adminRemoveNodeFromRegistry(web3.eth.accounts.privateKeyToAccount(pk2).address).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataRemovalTwo }, deployKey)

        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataRemovalTwo }, deployKey).catch(_ => false))

        const signerInfo = await nodeRegistryData.methods.signerIndex(ethAcc.address).call()

        const blockTime = unregisterBlock.timestamp
        const lockedTime = blockTime + 40 * 86400
        assert.strictEqual(signerInfo.owner, ethAcc.address)
        assert.strictEqual(signerInfo.stage, "3")
        assert.strictEqual(signerInfo.depositAmount, "40000000000000000000")
        assert.strictEqual(signerInfo.lockedTime, "" + lockedTime)

    })

    it("should fail removing an non existing node", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const nonExistingNode = await utils.createAccount()

        const nonExistingAccount = await web3.eth.accounts.privateKeyToAccount(nonExistingNode);

        const txDataRemoval = nodeRegistryLogic.methods.adminRemoveNodeFromRegistry(nonExistingAccount.address).encodeABI()
        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataRemoval }, deployKey).catch(_ => false))


    })


    it("should fail removing a node with a non signerKey", async () => {

        const pk = await utils.createAccount(null, '400000000000000000000')

        const contracts = await deployment.deployContracts(web3)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const nonExistingNode = await utils.createAccount()

        const nonExistingAccount = await web3.eth.accounts.privateKeyToAccount(nonExistingNode);

        const txDataRemoval = nodeRegistryLogic.methods.adminRemoveNodeFromRegistry(nonExistingAccount.address).encodeABI()
        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataRemoval }, pk).catch(_ => false))

    })


    it("should fail when trying to register with a too low deposit", async () => {

        const pk = await utils.createAccount(null, '400000000000000000000')

        const contracts = await deployment.deployContracts(web3)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '10000').encodeABI()
        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk).catch(_ => false))
    })

    it("should fail when trying to register with a too high deposit in the 1st year", async () => {

        const pk = await utils.createAccount(null, '51000000000000000000')

        const contracts = await deployment.deployContracts(web3)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '50000000000000000001' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "50000000000000000001")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '50000000000000000001').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '50000000000000000001').encodeABI()
        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk).catch(_ => false))
    })


    it("should unregister a node as node-owner", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')
        const pk2 = await utils.createAccount(null, '400000000000000000000')

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        // approve 2nd 
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk2)
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk2)

        const txDataTwo = nodeRegistryLogic.methods.registerNode("#2", 65000, 64, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataTwo, }, pk2)

        assert.strictEqual('2', await nodeRegistryData.methods.totalNodes().call())
        const registeredNodeTwo = await nodeRegistryData.methods.nodes(1).call()

        const txDataRemoval = nodeRegistryLogic.methods.unregisteringNode(ethAcc.address).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataRemoval }, pk)
        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())

        const lastNode = await nodeRegistryData.methods.nodes(0).call()

        assert.deepEqual(lastNode, registeredNodeTwo)

        const signerInfo = await nodeRegistryData.methods.signerIndex(ethAcc.address).call()

        const unregisterBlock = await web3.eth.getBlock('latest')
        const blockTime = unregisterBlock.timestamp
        const lockedTime = blockTime + 40 * 86400
        assert.strictEqual(signerInfo.owner, ethAcc.address)
        assert.strictEqual(signerInfo.stage, "3")
        assert.strictEqual(signerInfo.depositAmount, "40000000000000000000")
        assert.strictEqual(signerInfo.lockedTime, "" + lockedTime)

    })

    it("should fail unregistering a node as non-node-owner", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')
        const pk2 = await utils.createAccount(null, '400000000000000000000')

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const txDataRemoval = nodeRegistryLogic.methods.unregisteringNode(ethAcc.address).encodeABI()
        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataRemoval }, pk2).catch(_ => false))
    })


    it("should fail unregistering a non existing node", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')
        const pk2 = await utils.createAccount(null, '400000000000000000000')

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))
        const ethAccTwo = await web3.eth.accounts.privateKeyToAccount(pk2);

        const txDataRemoval = nodeRegistryLogic.methods.unregisteringNode(ethAccTwo.address).encodeABI()
        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataRemoval }, pk2).catch(_ => false))
    })


    it("should transfer the ownership of a node", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const signerInfoBefore = await nodeRegistryData.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)

        const newOwner = await utils.createAccount()
        const nonExistingAccount = await web3.eth.accounts.privateKeyToAccount(newOwner);

        const txDataTransfer = nodeRegistryLogic.methods.transferOwnership(ethAcc.address, nonExistingAccount.address).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataTransfer }, pk)

        const signerInfoAfter = await nodeRegistryData.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)
        assert.strictEqual(signerInfoAfter.owner, nonExistingAccount.address)
    })

    it("should fail transfering the ownership of a node when being in the wrong state", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const signerInfoBefore = await nodeRegistryData.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)

        const newOwner = await utils.createAccount()
        const nonExistingAccount = await web3.eth.accounts.privateKeyToAccount(newOwner);

        const txDataUnregister = nodeRegistryLogic.methods.unregisteringNode(ethAcc.address).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataUnregister }, pk)

        const txDataTransfer = nodeRegistryLogic.methods.transferOwnership(ethAcc.address, nonExistingAccount.address).encodeABI()
        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataTransfer }, pk).catch(_ => false))

    })



    it("should fail trying to change owner to 0x0", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const signerInfoBefore = await nodeRegistryData.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)

        const newOwner = await utils.createAccount()

        const txDataTransfer = nodeRegistryLogic.methods.transferOwnership(ethAcc.address, "0x0000000000000000000000000000000000000000").encodeABI()
        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataTransfer }, pk).catch(_ => false))

    })


    it("should fail trying to transfer the ownership while not being the owner", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const signerInfoBefore = await nodeRegistryData.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)

        const newOwner = await utils.createAccount()
        const nonExistingAccount = await web3.eth.accounts.privateKeyToAccount(newOwner);

        const txDataTransfer = nodeRegistryLogic.methods.transferOwnership(ethAcc.address, nonExistingAccount.address).encodeABI()
        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataTransfer }, newOwner).catch(_ => false))

    })

    it("should update a node and also changing his url", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const txDataUpdate = nodeRegistryLogic.methods.updateNode(ethAcc.address, "abc", 1, 1, 0).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataUpdate }, pk)

        const registeredNodeUpdated = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNodeUpdated.url, "abc")
        assert.strictEqual(registeredNodeUpdated.deposit, "40000000000000000000")
        assert.strictEqual(registeredNodeUpdated.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNodeUpdated.props, '1')
        assert.strictEqual(registeredNodeUpdated.signer, ethAcc.address)
        assert.strictEqual(registeredNodeUpdated.weight, '1')

        const calcHashUpdated = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('1', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('abc')
            ]))

        assert.strictEqual(registeredNodeUpdated.proofHash, "0x" + calcHashUpdated.toString('hex'))

    })


    it("should update a node increasing timeout and deposit", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const txDataUpdate = nodeRegistryLogic.methods.updateNode(ethAcc.address, "abc", 32000, 2000, "500").encodeABI()
        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataUpdate }, pk).catch(_ => false))

        const approveUpdate = erc20Token.methods.approve(contracts.nodeRegistryLogic, '500').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveUpdate, }, pk)
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataUpdate }, pk)
        const registeredNodeUpdated = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNodeUpdated.url, "abc")
        assert.strictEqual(registeredNodeUpdated.deposit, "40000000000000000500")
        assert.strictEqual(registeredNodeUpdated.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNodeUpdated.props, '32000')
        assert.strictEqual(registeredNodeUpdated.signer, ethAcc.address)
        assert.strictEqual(registeredNodeUpdated.weight, '2000')

        const calcHashUpdated = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000500')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('32000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('abc')
            ]))

        assert.strictEqual(registeredNodeUpdated.proofHash, "0x" + calcHashUpdated.toString('hex'))

    })

    it("should fail updating a node as non node owner", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const txDataUpdate = nodeRegistryLogic.methods.updateNode(ethAcc.address, "abc", 32000, 2000, 0).encodeABI()
        const nonOwner = await utils.createAccount(null, '400000000000000000000')

        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataUpdate }, nonOwner).catch(_ => false))

    })


    it("should fail updating a non existing node", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))
        const nonOwner = await utils.createAccount(null, '400000000000000000000')
        const ethAccTwo = await web3.eth.accounts.privateKeyToAccount(nonOwner);

        const txDataUpdate = nodeRegistryLogic.methods.updateNode(ethAccTwo.address, "abc", 32000, 2000, 0).encodeABI()

        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataUpdate }, nonOwner).catch(_ => false))

    })



    it("should fail updating a node when the new url is already taken", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')
        const pk2 = await utils.createAccount(null, '400000000000000000000')

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        // approve 2nd 
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk2)
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk2)

        const txDataTwo = nodeRegistryLogic.methods.registerNode("#2", 65000, 64, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataTwo, }, pk2)

        const txDataUpdate = nodeRegistryLogic.methods.updateNode(ethAcc.address, "#2", 32000, 2000, 0).encodeABI()
        // assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataUpdate }, pk).catch(_ => false))
        let failed = false

        try { await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataUpdate }, pk) }
        catch (e) {
            console.log(e)
            failed = true
        }
        assert.isTrue(failed)
    })

    it("should be able to register a node for a different signer", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')
        const signerPK = await utils.createAccount()

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);
        const signerAcc = await web3.eth.accounts.privateKeyToAccount(signerPK);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())

        const signature = utils.signForRegister("#1", 65000, 2000, ethAcc.address, signerPK)

        const txData = nodeRegistryLogic.methods.registerNodeFor("#1", 65000, signerAcc.address, 2000, "40000000000000000000", signature.v, signature.r, signature.s).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData }, pk)
        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        const block = await web3.eth.getBlock("latest")

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, signerAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(signerAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))
    })



    it("should fail registering a node for a different signer when the v of the signature is wrong", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')
        const signerPK = await utils.createAccount()

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);
        const signerAcc = await web3.eth.accounts.privateKeyToAccount(signerPK);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())

        const signature = utils.signForRegister("#1", 65000, 2000, ethAcc.address, signerPK)

        const txData = nodeRegistryLogic.methods.registerNodeFor("#1", 65000, signerAcc.address, 2000, "40000000000000000000", 0, signature.r, signature.s).encodeABI()
        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData }, pk).catch(_ => false))

    })

    it("should fail registering with a wrong signature", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')
        const signerPK = await utils.createAccount()

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);
        const signerAcc = await web3.eth.accounts.privateKeyToAccount(signerPK);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())

        const signature = utils.signForRegister("#1", 65000, 2000, ethAcc.address, signerPK)

        const txData = nodeRegistryLogic.methods.registerNodeFor("#2", 65000, signerAcc.address, 2000, "40000000000000000000", signature.v, signature.r, signature.s).encodeABI()
        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData }, pk).catch(_ => false))
    })


    it("should update a registeredNodeFor-node and also changing his url ", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')
        const signerPK = await utils.createAccount()

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);
        const signerAcc = await web3.eth.accounts.privateKeyToAccount(signerPK);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())

        const signature = utils.signForRegister("#1", 65000, 2000, ethAcc.address, signerPK)

        const txData = nodeRegistryLogic.methods.registerNodeFor("#1", 65000, signerAcc.address, 2000, "40000000000000000000", signature.v, signature.r, signature.s).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData }, pk)
        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        const block = await web3.eth.getBlock("latest")

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, signerAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(signerAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const txDataUpdateFail = nodeRegistryLogic.methods.updateNode(signerAcc.address, "abc", 32000, 2000, 0).encodeABI()
        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataUpdateFail }, signerPK).catch(_ => false))

        const signerInfoBefore = await nodeRegistryData.methods.signerIndex(signerAcc.address).call()

        assert.strictEqual(signerInfoBefore.stage, '1')
        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)
        assert.strictEqual(signerInfoBefore.depositAmount, '0')

        const txDataUpdate = nodeRegistryLogic.methods.updateNode(signerAcc.address, "abc", 32000, 2000, 0).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataUpdate }, pk)
        const registeredNodeUpdated = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNodeUpdated.url, "abc")
        assert.strictEqual(registeredNodeUpdated.deposit, "40000000000000000000")
        assert.strictEqual(registeredNodeUpdated.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNodeUpdated.props, '32000')
        assert.strictEqual(registeredNodeUpdated.signer, signerAcc.address)
        assert.strictEqual(registeredNodeUpdated.weight, '2000')

        const calcHashUpdated = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('32000', 24),
                in3Common.serialize.address(signerAcc.address),
                in3Common.serialize.bytes('abc')
            ]))

        assert.strictEqual(registeredNodeUpdated.proofHash, "0x" + calcHashUpdated.toString('hex'))

        const signerInfoAfter = await nodeRegistryData.methods.signerIndex(signerAcc.address).call()

        assert.strictEqual(signerInfoAfter.stage, '1')
        assert.strictEqual(signerInfoAfter.owner, ethAcc.address)
        assert.strictEqual(signerInfoAfter.depositAmount, '0')

    })



    it("should successfully convict and revealConvict and a block within 256 blocks", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')

        const convictCaller = await utils.createAccount()
        const convictCallerAcc = await web3.eth.accounts.privateKeyToAccount(convictCaller);

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))


        const signerInfoBefore = await nodeRegistryData.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.stage, '1')
        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)
        assert.strictEqual(signerInfoBefore.depositAmount, '0')


        const b = new in3Common.Block(block)
        const signedBlock = utils.signBlock(b, await nodeRegistryData.methods.registryId().call(), pk, "0x0000000000000000000000000000000000000000000000000000000000001234")

        // convicting
        const convictHash = utils.createConvictHash(signedBlock.blockHash, convictCallerAcc.address, signedBlock.v, signedBlock.r, signedBlock.s)


        const convictData = nodeRegistryLogic.methods.convict("0x" + convictHash.toString('hex')).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: convictData }, convictCaller)

        // creating some blocks
        await utils.createAccount(null, '1')
        await utils.createAccount(null, '1')


        const balanceSenderBefore = await erc20Token.methods.balanceOf(convictCallerAcc.address).call()
        const balanceContractBefore = await erc20Token.methods.balanceOf(contracts.nodeRegistryData).call()

        const revealConvictData = nodeRegistryLogic.methods.revealConvict(ethAcc.address, signedBlock.blockHash, signedBlock.block, signedBlock.v, signedBlock.r, signedBlock.s).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: revealConvictData }, convictCaller)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const signerInfoAfter = await nodeRegistryData.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoAfter.stage, '2')
        assert.strictEqual(signerInfoAfter.owner, ethAcc.address)
        assert.strictEqual(signerInfoAfter.depositAmount, '0')
        const balanceSenderAfter = await erc20Token.methods.balanceOf(convictCallerAcc.address).call()
        const balanceContractAfter = await erc20Token.methods.balanceOf(contracts.nodeRegistryData).call()

        assert.strictEqual(balanceSenderBefore, "0")
        assert.strictEqual(balanceContractBefore, "40000000000000000000")
        assert.strictEqual(balanceContractAfter, "20000000000000000000")
        assert.strictEqual(balanceSenderAfter, "20000000000000000000")
    })

    it("should fail revealing when the v of the signature is wrong", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')

        const convictCaller = await utils.createAccount()
        const convictCallerAcc = await web3.eth.accounts.privateKeyToAccount(convictCaller);

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))


        const signerInfoBefore = await nodeRegistryData.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.stage, '1')
        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)
        assert.strictEqual(signerInfoBefore.depositAmount, '0')


        const b = new in3Common.Block(block)
        const signedBlock = utils.signBlock(b, await nodeRegistryData.methods.registryId().call(), pk, "0x0000000000000000000000000000000000000000000000000000000000001234")

        // convicting
        const convictHash = utils.createConvictHash(signedBlock.blockHash, convictCallerAcc.address, 0, signedBlock.r, signedBlock.s)


        const convictData = nodeRegistryLogic.methods.convict("0x" + convictHash.toString('hex')).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: convictData }, convictCaller)

        // creating some blocks
        await utils.createAccount(null, '1')
        await utils.createAccount(null, '1')

        const revealConvictData = nodeRegistryLogic.methods.revealConvict(ethAcc.address, signedBlock.blockHash, signedBlock.block, 0, signedBlock.r, signedBlock.s).encodeABI()
        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: revealConvictData }, convictCaller).catch(_ => false))

    })


    it("should fail when calling revealConvict too early", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')

        const convictCaller = await utils.createAccount()
        const convictCallerAcc = await web3.eth.accounts.privateKeyToAccount(convictCaller);

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))


        const signerInfoBefore = await nodeRegistryData.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.stage, '1')
        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)
        assert.strictEqual(signerInfoBefore.depositAmount, '0')


        const b = new in3Common.Block(block)
        const signedBlock = utils.signBlock(b, await nodeRegistryData.methods.registryId().call(), pk, "0x0000000000000000000000000000000000000000000000000000000000001234")

        // convicting
        const convictHash = utils.createConvictHash(signedBlock.blockHash, convictCallerAcc.address, signedBlock.v, signedBlock.r, signedBlock.s)


        const convictData = nodeRegistryLogic.methods.convict("0x" + convictHash.toString('hex')).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: convictData }, convictCaller)

        // creating some blocks
        await utils.createAccount(null, '1')

        const revealConvictData = nodeRegistryLogic.methods.revealConvict(ethAcc.address, signedBlock.blockHash, signedBlock.block, signedBlock.v, signedBlock.r, signedBlock.s).encodeABI()
        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: revealConvictData }, convictCaller).catch(_ => false))

    })

    it("should fail revealConvicting when the hash is not correct", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')

        const convictCaller = await utils.createAccount()

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))


        const signerInfoBefore = await nodeRegistryData.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.stage, '1')
        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)
        assert.strictEqual(signerInfoBefore.depositAmount, '0')


        const b = new in3Common.Block(block)
        const signedBlock = utils.signBlock(b, await nodeRegistryData.methods.registryId().call(), pk, "0x0000000000000000000000000000000000000000000000000000000000001234")

        // convicting
        const convictHash = utils.createConvictHash(signedBlock.blockHash, ethAcc.address, signedBlock.v, signedBlock.r, signedBlock.s)


        const convictData = nodeRegistryLogic.methods.convict("0x" + convictHash.toString('hex')).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: convictData }, convictCaller)

        // creating some blocks
        await utils.createAccount(null, '1')
        await utils.createAccount(null, '1')


        const revealConvictData = nodeRegistryLogic.methods.revealConvict(ethAcc.address, signedBlock.blockHash, signedBlock.block, signedBlock.v, signedBlock.r, signedBlock.s).encodeABI()
        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: revealConvictData }, convictCaller).catch(_ => false))
    })


    it("should fail revealConvicting when signed blockhash was correct", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')

        const convictCaller = await utils.createAccount()
        const convictCallerAcc = await web3.eth.accounts.privateKeyToAccount(convictCaller);

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))


        const signerInfoBefore = await nodeRegistryData.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.stage, '1')
        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)
        assert.strictEqual(signerInfoBefore.depositAmount, '0')


        const b = new in3Common.Block(block)
        const signedBlock = utils.signBlock(b, await nodeRegistryData.methods.registryId().call(), pk, block.hash)

        // convicting
        const convictHash = utils.createConvictHash(signedBlock.blockHash, convictCallerAcc.address, signedBlock.v, signedBlock.r, signedBlock.s)


        const convictData = nodeRegistryLogic.methods.convict("0x" + convictHash.toString('hex')).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: convictData }, convictCaller)

        // creating some blocks
        await utils.createAccount(null, '1')
        await utils.createAccount(null, '1')


        const revealConvictData = nodeRegistryLogic.methods.revealConvict(ethAcc.address, signedBlock.blockHash, signedBlock.block, signedBlock.v, signedBlock.r, signedBlock.s).encodeABI()
        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: revealConvictData }, convictCaller).catch(_ => false))
    })


    it("should fail revealConvicting when the node did not sign the block", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')

        const convictCaller = await utils.createAccount()
        const convictCallerAcc = await web3.eth.accounts.privateKeyToAccount(convictCaller);

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))


        const signerInfoBefore = await nodeRegistryData.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.stage, '1')
        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)
        assert.strictEqual(signerInfoBefore.depositAmount, '0')


        const b = new in3Common.Block(block)
        const signedBlock = utils.signBlock(b, await nodeRegistryData.methods.registryId().call(), convictCaller, "0x0000000000000000000000000000000000000000000000000000000000001234")

        // convicting
        const convictHash = utils.createConvictHash(signedBlock.blockHash, convictCallerAcc.address, signedBlock.v, signedBlock.r, signedBlock.s)


        const convictData = nodeRegistryLogic.methods.convict("0x" + convictHash.toString('hex')).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: convictData }, convictCaller)

        // creating some blocks
        await utils.createAccount(null, '1')
        await utils.createAccount(null, '1')

        const revealConvictData = nodeRegistryLogic.methods.revealConvict(ethAcc.address, signedBlock.blockHash, signedBlock.block, signedBlock.v, signedBlock.r, signedBlock.s).encodeABI()
        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: revealConvictData }, convictCaller).catch(_ => false))
    })


    it("should increase the # of blocks to at least 260", async () => {

        let currentBlockNumber = await web3.eth.getBlockNumber()

        while (currentBlockNumber < 260) {
            await utils.createAccount(null, '0')
            currentBlockNumber = await web3.eth.getBlockNumber()
        }

    })


    it("should fail when calling with a block older then 256 blocks and not found in the blockhash registry", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')

        const convictCaller = await utils.createAccount()
        const convictCallerAcc = await web3.eth.accounts.privateKeyToAccount(convictCaller);

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))


        const signerInfoBefore = await nodeRegistryData.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.stage, '1')
        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)
        assert.strictEqual(signerInfoBefore.depositAmount, '0')


        const earlyBlock = await web3.eth.getBlock(block.number - 300)
        const b = new in3Common.Block(earlyBlock)
        const signedBlock = utils.signBlock(b, await nodeRegistryData.methods.registryId().call(), convictCaller, "0x0000000000000000000000000000000000000000000000000000000000001234")

        // convicting
        const convictHash = utils.createConvictHash(signedBlock.blockHash, convictCallerAcc.address, signedBlock.v, signedBlock.r, signedBlock.s)


        const convictData = nodeRegistryLogic.methods.convict("0x" + convictHash.toString('hex')).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: convictData }, convictCaller)

        // creating some blocks
        await utils.createAccount(null, '1')
        await utils.createAccount(null, '1')

        const revealConvictData = nodeRegistryLogic.methods.revealConvict(ethAcc.address, signedBlock.blockHash, signedBlock.block, signedBlock.v, signedBlock.r, signedBlock.s).encodeABI()
        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: revealConvictData }, convictCaller).catch(_ => false))
    })

    it("should successfully convict an older block that has been found within the blockhash registry", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')

        const signerPK = await utils.createAccount()
        const signerAcc = await web3.eth.accounts.privateKeyToAccount(signerPK);

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))
        const signerInfoBefore = await nodeRegistryData.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.stage, '1')
        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)
        assert.strictEqual(signerInfoBefore.depositAmount, '0')

        const earlyBlock = await web3.eth.getBlock(block.number - 260)

        const b = new in3Common.Block(earlyBlock)

        const signedBlock = utils.signBlock(b, await nodeRegistryData.methods.registryId().call(), pk, "0x0000000000000000000000000000000000000000000000000000000000001234")

        // convicting
        const convictHash = utils.createConvictHash(signedBlock.blockHash, signerAcc.address, signedBlock.v, signedBlock.r, signedBlock.s)
        const convictData = nodeRegistryLogic.methods.convict("0x" + convictHash.toString('hex')).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: convictData }, signerPK)

        // sending convict twice to also test using a different index
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: convictData }, signerPK)

        const blockhashRegistry = new web3.eth.Contract(BlockhashRegistry.abi, contracts.blockhashRegistry)
        const blockSnapshot = await web3.eth.getBlock("latest")

        const txDataSnapshot = blockhashRegistry.methods.saveBlockNumber(blockSnapshot.number - 240).encodeABI()
        await utils.handleTx({ to: contracts.blockhashRegistry, data: txDataSnapshot }, signerPK)

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
        await utils.handleTx({ to: contracts.blockhashRegistry, data: txDataRecreate }, signerPK)

        const revealConvictData = nodeRegistryLogic.methods.revealConvict(ethAcc.address, signedBlock.blockHash, signedBlock.block, signedBlock.v, signedBlock.r, signedBlock.s).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: revealConvictData }, signerPK)

        const signerInfoAfter = await nodeRegistryData.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoAfter.stage, '2')
        assert.strictEqual(signerInfoAfter.owner, ethAcc.address)
        assert.strictEqual(signerInfoAfter.depositAmount, '0')
    })

    it("should fail convicting a node again after he was convicted", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')

        const convictCaller = await utils.createAccount()
        const convictCallerAcc = await web3.eth.accounts.privateKeyToAccount(convictCaller);

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))


        const signerInfoBefore = await nodeRegistryData.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.stage, '1')
        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)
        assert.strictEqual(signerInfoBefore.depositAmount, '0')


        const b = new in3Common.Block(block)
        const signedBlock = utils.signBlock(b, await nodeRegistryData.methods.registryId().call(), pk, "0x0000000000000000000000000000000000000000000000000000000000001234")

        // convicting
        const convictHash = utils.createConvictHash(signedBlock.blockHash, convictCallerAcc.address, signedBlock.v, signedBlock.r, signedBlock.s)


        const convictData = nodeRegistryLogic.methods.convict("0x" + convictHash.toString('hex')).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: convictData }, convictCaller)

        // creating some blocks
        await utils.createAccount(null, '1')
        await utils.createAccount(null, '1')



        const revealConvictData = nodeRegistryLogic.methods.revealConvict(ethAcc.address, signedBlock.blockHash, signedBlock.block, signedBlock.v, signedBlock.r, signedBlock.s).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: revealConvictData }, convictCaller)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const signerInfoAfter = await nodeRegistryData.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoAfter.stage, '2')
        assert.strictEqual(signerInfoAfter.owner, ethAcc.address)
        assert.strictEqual(signerInfoAfter.depositAmount, '0')

        const convictSecond = await utils.createAccount()

        const convictSecondAcc = await web3.eth.accounts.privateKeyToAccount(convictSecond);
        // convicting
        const convictHashTwo = utils.createConvictHash(signedBlock.blockHash, convictSecondAcc.address, signedBlock.v, signedBlock.r, signedBlock.s)
        const convictDataTwo = nodeRegistryLogic.methods.convict("0x" + convictHashTwo.toString('hex')).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: convictDataTwo }, convictSecond)

        await utils.createAccount(null, '1')
        await utils.createAccount(null, '1')

        const revealConvictDataTwo = nodeRegistryLogic.methods.revealConvict(ethAcc.address, signedBlock.blockHash, signedBlock.block, signedBlock.v, signedBlock.r, signedBlock.s).encodeABI()

        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: revealConvictDataTwo }, convictSecond).catch(_ => false))

    })


    it("should successfully convict and revealConvict a node that is already unregistered", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')

        const signerPK = await utils.createAccount()
        const signerAcc = await web3.eth.accounts.privateKeyToAccount(signerPK);

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))
        const signerInfoBefore = await nodeRegistryData.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoBefore.stage, '1')
        assert.strictEqual(signerInfoBefore.owner, ethAcc.address)
        assert.strictEqual(signerInfoBefore.depositAmount, '0')

        const b = new in3Common.Block(block)
        const signedBlock = utils.signBlock(b, await nodeRegistryData.methods.registryId().call(), pk, "0x0000000000000000000000000000000000000000000000000000000000001234")

        const unregisterData = nodeRegistryLogic.methods.unregisteringNode(ethAcc.address).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: unregisterData }, pk)

        // convicting
        const convictHash = utils.createConvictHash(signedBlock.blockHash, signerAcc.address, signedBlock.v, signedBlock.r, signedBlock.s)
        const convictData = nodeRegistryLogic.methods.convict("0x" + convictHash.toString('hex')).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: convictData }, signerPK)


        // creating some blocks
        await utils.createAccount(null, '1')
        await utils.createAccount(null, '1')

        const balanceSenderBefore = await erc20Token.methods.balanceOf(signerAcc.address).call()
        const balanceContractBefore = await erc20Token.methods.balanceOf(contracts.nodeRegistryData).call()

        const revealConvictData = nodeRegistryLogic.methods.revealConvict(ethAcc.address, signedBlock.blockHash, signedBlock.block, signedBlock.v, signedBlock.r, signedBlock.s).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: revealConvictData }, signerPK)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const signerInfoAfter = await nodeRegistryData.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfoAfter.stage, '2')
        assert.strictEqual(signerInfoAfter.owner, ethAcc.address)
        assert.strictEqual(signerInfoAfter.depositAmount, '0')
        const balanceSenderAfter = await erc20Token.methods.balanceOf(signerAcc.address).call()
        const balanceContractAfter = await erc20Token.methods.balanceOf(contracts.nodeRegistryData).call()

        assert.strictEqual(balanceSenderBefore, "0")
        assert.strictEqual(balanceContractBefore, "40000000000000000000")
        assert.strictEqual(balanceContractAfter, "20000000000000000000")
        assert.strictEqual(balanceSenderAfter, "20000000000000000000")

    })


    it("should fail returning the deposit of an active user", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        const returnData = nodeRegistryLogic.methods.returnDeposit(ethAcc.address).encodeABI()
        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: returnData }, pk).catch(_ => false))

    })

    it("should successfully return the deposit after the timeout is over", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')
        const pk2 = await utils.createAccount(null, '400000000000000000000')

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '40000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "40000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        // approve 2nd 
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk2)
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk2)

        const txDataTwo = nodeRegistryLogic.methods.registerNode("#2", 65000, 64, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataTwo, }, pk2)
        const registeredNodeTwo = await nodeRegistryData.methods.nodes(1).call()

        assert.strictEqual('2', await nodeRegistryData.methods.totalNodes().call())


        const txDataRemoval = nodeRegistryLogic.methods.unregisteringNode(ethAcc.address).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataRemoval }, pk)
        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())

        const lastNode = await nodeRegistryData.methods.nodes(0).call()

        assert.deepEqual(lastNode, registeredNodeTwo)

        await utils.increaseTime(web3, 86400 * 40 + 1)

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")
        assert.strictEqual(await erc20Token.methods.balanceOf(contracts.nodeRegistryData).call(), "80000000000000000000")

        const txDataDepositReturn = nodeRegistryLogic.methods.returnDeposit(ethAcc.address).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataDepositReturn }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "40000000000000000000")
        assert.strictEqual(await erc20Token.methods.balanceOf(contracts.nodeRegistryData).call(), "40000000000000000000")

        const signerInfo = await nodeRegistryData.methods.signerIndex(ethAcc.address).call()

        assert.strictEqual(signerInfo.owner, "0x0000000000000000000000000000000000000000")
        assert.strictEqual(signerInfo.stage, "0")
        assert.strictEqual(signerInfo.depositAmount, "0")
        assert.strictEqual(signerInfo.lockedTime, "0")

    })


    it("should fail returning the deposit before the timeout is over", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')
        const pk2 = await utils.createAccount(null, '400000000000000000000')

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '40000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "40000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        // approve 2nd 
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk2)
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk2)

        const txDataTwo = nodeRegistryLogic.methods.registerNode("#2", 65000, 64, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataTwo, }, pk2)
        const registeredNodeTwo = await nodeRegistryData.methods.nodes(1).call()

        assert.strictEqual('2', await nodeRegistryData.methods.totalNodes().call())


        const txDataRemoval = nodeRegistryLogic.methods.unregisteringNode(ethAcc.address).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataRemoval }, pk)
        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())

        const lastNode = await nodeRegistryData.methods.nodes(0).call()

        assert.deepEqual(lastNode, registeredNodeTwo)

        const txDataDepositReturn = nodeRegistryLogic.methods.returnDeposit(ethAcc.address).encodeABI()
        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataDepositReturn }, pk).catch(_ => false))

    })

    it("should fail returning the deposit of a node as non owner", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')
        const pk2 = await utils.createAccount(null, '400000000000000000000')

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '40000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "40000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        // approve 2nd 
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk2)
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk2)

        const txDataTwo = nodeRegistryLogic.methods.registerNode("#2", 65000, 64, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataTwo, }, pk2)
        const registeredNodeTwo = await nodeRegistryData.methods.nodes(1).call()

        assert.strictEqual('2', await nodeRegistryData.methods.totalNodes().call())


        const txDataRemoval = nodeRegistryLogic.methods.unregisteringNode(ethAcc.address).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataRemoval }, pk)
        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())

        const lastNode = await nodeRegistryData.methods.nodes(0).call()

        assert.deepEqual(lastNode, registeredNodeTwo)

        await utils.increaseTime(web3, 86400 * 40 + 1)

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")
        assert.strictEqual(await erc20Token.methods.balanceOf(contracts.nodeRegistryData).call(), "80000000000000000000")

        const txDataDepositReturn = nodeRegistryLogic.methods.returnDeposit(ethAcc.address).encodeABI()
        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataDepositReturn }, pk2).catch(_ => false))

    })

    it("should allow register nodes with more then 50 ether as deposit after 1 year", async () => {

        const pk = await utils.createAccount(null, '51000000000000000000')

        const contracts = await deployment.deployContracts(web3)
        await utils.increaseTime(web3, 86400 * 366 + 1)

        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '50000000000000000001' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "50000000000000000001")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '50000000000000000001').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '50000000000000000001').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "50000000000000000001")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('50000000000000000001')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))
    })


    it("should fail removing a node with the signerKey after 1 year", async () => {

        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const pk = await utils.createAccount(null, '400000000000000000000')
        const pk2 = await utils.createAccount(null, '400000000000000000000')

        const contracts = await deployment.deployContracts(web3, deployKey)
        const nodeRegistryLogic = new web3.eth.Contract(NodeRegistryLogic.abi, contracts.nodeRegistryLogic)
        const nodeRegistryData = new web3.eth.Contract(NodeRegistryData.abi, contracts.nodeRegistryData)

        const erc20Token = new web3.eth.Contract(ERC20Wrapper.abi, contracts.ERC20Token)
        const ethAcc = await web3.eth.accounts.privateKeyToAccount(pk);

        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20Token.methods.mint().encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk)
        assert.strictEqual(await erc20Token.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const approveDeposit = erc20Token.methods.approve(contracts.nodeRegistryLogic, '400000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk)

        assert.strictEqual('0', await nodeRegistryData.methods.totalNodes().call())
        const txData = nodeRegistryLogic.methods.registerNode("#1", 65000, 2000, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txData, }, pk)

        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())
        const block = await web3.eth.getBlock("latest")

        const registeredNode = await nodeRegistryData.methods.nodes(0).call()

        assert.strictEqual(registeredNode.url, "#1")
        assert.strictEqual(registeredNode.deposit, "40000000000000000000")
        assert.strictEqual(registeredNode.registerTime, '' + block.timestamp)
        assert.strictEqual(registeredNode.props, '65000')
        assert.strictEqual(registeredNode.signer, ethAcc.address)

        const calcHash = ethUtil.keccak(
            Buffer.concat([
                in3Common.serialize.bytes32(in3Common.util.toBN('40000000000000000000')),
                in3Common.serialize.uint64(block.timestamp),
                in3Common.util.toBuffer('65000', 24),
                in3Common.serialize.address(ethAcc.address),
                in3Common.serialize.bytes('#1')
            ]))

        assert.strictEqual(registeredNode.proofHash, "0x" + calcHash.toString('hex'))

        // approve 2nd 
        await utils.handleTx({ to: contracts.ERC20Token, data: mintData, value: '400000000000000000000' }, pk2)
        await utils.handleTx({ to: contracts.ERC20Token, data: approveDeposit, }, pk2)

        const txDataTwo = nodeRegistryLogic.methods.registerNode("#2", 65000, 64, '40000000000000000000').encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataTwo, }, pk2)

        assert.strictEqual('2', await nodeRegistryData.methods.totalNodes().call())
        const registeredNodeTwo = await nodeRegistryData.methods.nodes(1).call()

        const txDataRemoval = nodeRegistryLogic.methods.adminRemoveNodeFromRegistry(ethAcc.address).encodeABI()
        await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataRemoval }, deployKey)
        assert.strictEqual('1', await nodeRegistryData.methods.totalNodes().call())

        const lastNode = await nodeRegistryData.methods.nodes(0).call()

        assert.deepEqual(lastNode, registeredNodeTwo)

        await utils.increaseTime(web3, 366 * 86400)

        const txDataRemovalTwo = nodeRegistryLogic.methods.adminRemoveNodeFromRegistry(web3.eth.accounts.privateKeyToAccount(pk2).address).encodeABI()
        assert.isFalse(await utils.handleTx({ to: contracts.nodeRegistryLogic, data: txDataRemovalTwo }, deployKey).catch(_ => false))

    })

})