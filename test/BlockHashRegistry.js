//const BlockhashRegistry = artifacts.require("contracts/BlockhashRegistry")
const utils = require('../src/utils/utils')
const deployment = require('../src/utils/deployment')
const in3Common = require("in3-common")
const fs = require('fs')
const Web3 = require("web3")

const BlockhashRegistry = JSON.parse(fs.readFileSync('build/contracts/BlockhashRegistry.json'))

contract('BlockhashRegistry', async () => {

    it("should save the correct block as snapshot during deployment", async () => {

        // we cannot deploy in 1st block, so we are creating a 1st empty block
        await utils.createAccount(null, '1000000000')

        const blockBefore = await web3.eth.getBlock('latest')

        const tx = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))

        const blockHashContract = new web3.eth.Contract(BlockhashRegistry.abi, tx.contractAddress)

        assert.strictEqual(blockBefore.hash, await blockHashContract.methods.blockhashMapping(blockBefore.number).call())

    })

    it("should successfully save a block and its hash", async () => {

        const blockBefore = await web3.eth.getBlock('latest')

        const pk = await utils.createAccount(null, '1000000000')

        const tx = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))
        const blockHashContract = new web3.eth.Contract(BlockhashRegistry.abi, tx.contractAddress)

        const blockHashBeforeSave = await blockHashContract.methods.blockhashMapping(blockBefore.number).call()
        assert.strictEqual(blockHashBeforeSave, "0x0000000000000000000000000000000000000000000000000000000000000000")

        const txData = blockHashContract.methods.saveBlockNumber(blockBefore.number).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData }, pk)
        const blockHashAfterSave = await blockHashContract.methods.blockhashMapping(blockBefore.number).call()

        assert.strictEqual(blockBefore.hash, blockHashAfterSave)
    })

    it("should revert when trying to save a non existing block", async () => {
        const pk = await utils.createAccount(null, '0')

        const tx = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))
        const blockHashContract = new web3.eth.Contract(BlockhashRegistry.abi, tx.contractAddress)

        const futureBlockNumber = (await web3.eth.getBlockNumber() + 100)

        const blockHashBeforeSave = await blockHashContract.methods.blockhashMapping(futureBlockNumber).call()
        assert.strictEqual(blockHashBeforeSave, "0x0000000000000000000000000000000000000000000000000000000000000000")

        const txData = blockHashContract.methods.saveBlockNumber(futureBlockNumber).encodeABI()

        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txData }, pk).catch(_ => false))

        const blockHashAfterSave = await blockHashContract.methods.blockhashMapping(futureBlockNumber).call()

        assert.strictEqual(blockHashAfterSave, "0x0000000000000000000000000000000000000000000000000000000000000000")
    })

    it("should successfully snapshot a block", async () => {

        const pk = await utils.createAccount(null, '1000000000')

        const tx = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))
        const blockHashContract = new web3.eth.Contract(BlockhashRegistry.abi, tx.contractAddress)
        const blockBefore = await web3.eth.getBlock('latest')

        const blockHashBeforeSave = await blockHashContract.methods.blockhashMapping(blockBefore.number).call()
        assert.strictEqual(blockHashBeforeSave, "0x0000000000000000000000000000000000000000000000000000000000000000")

        const txData = blockHashContract.methods.snapshot().encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData }, pk)
        const blockHashAfterSave = await blockHashContract.methods.blockhashMapping(blockBefore.number).call()

        assert.strictEqual(blockBefore.hash, blockHashAfterSave)

    })

    it("should successfully extract parent and blockhash of a block from a private chain", async () => {

        const tx = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))
        const blockHashContract = new web3.eth.Contract(BlockhashRegistry.abi, tx.contractAddress)
        const block = await web3.eth.getBlock('latest')

        const b = new in3Common.Block(block)

        const serializedBlock = b.serializeHeader()

        const result = await blockHashContract.methods.getParentAndBlockhash(serializedBlock).call()

        assert.strictEqual(result.parentHash, block.parentHash)
        assert.strictEqual(result.bhash, block.hash)

    })

    it("should revert when an underflow during recreation occurs", async () => {

        const tx = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))
        const blockHashContract = new web3.eth.Contract(BlockhashRegistry.abi, tx.contractAddress)
        const block = await web3.eth.getBlock('latest')

        const b = new in3Common.Block(block)

        let serializedBlock = b.serializeHeader()
        // we are replacing the 1st value to force an underflow
        serializedBlock[0] = 241

        assert.isFalse(await blockHashContract.methods.getParentAndBlockhash(serializedBlock).call().catch(_ => false))

    })

    it("should revert when an when the parent blockhash is smaller then 32 bytes", async () => {

        const tx = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))
        const blockHashContract = new web3.eth.Contract(BlockhashRegistry.abi, tx.contractAddress)
        const newB = in3Common.util.toBuffer("0xf901eda0bf7833a0", 8)
        assert.isFalse(await blockHashContract.methods.getParentAndBlockhash(newB).call().catch(_ => false))

    })

    it("should revert when an when the parent blockhash is 0x0", async () => {

        const tx = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))
        const blockHashContract = new web3.eth.Contract(BlockhashRegistry.abi, tx.contractAddress)

        const goerliGenesis = {
            author: "0x0000000000000000000000000000000000000000",
            difficulty: "0x1",
            extraData: "0x22466c6578692069732061207468696e6722202d204166726900000000000000e0a2bd4258d2768837baa26a28fe71dc079f84c70000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
            gasLimit: "0xa00000",
            gasUsed: "0x0",
            hash: "0xbf7e331f7f7c1dd2e05159666b3bf8bc7a8a3a9eb1d518969eab529dd9b88c1a",
            logsBloom: "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
            miner: "0x0000000000000000000000000000000000000000",
            number: "0x0",
            parentHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
            receiptsRoot: "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421",
            sealFields: [
                "0xa00000000000000000000000000000000000000000000000000000000000000000",
                "0x880000000000000000"
            ],
            sha3Uncles: "0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347",
            size: "0x272",
            stateRoot: "0x5d6cded585e73c4e322c30c2f782a336316f17dd85a4863b9d838d2d4b8b3008",
            timestamp: "0x5c51a607",
            totalDifficulty: "0x1",
            transactions: [],
            transactionsRoot: "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421",
            uncles: []
        }

        const b = new in3Common.Block(goerliGenesis)
        let serializedBlock = b.serializeHeader()
        assert.isFalse(await blockHashContract.methods.getParentAndBlockhash(serializedBlock).call().catch(_ => false))

    })


    it("should successfully extract parent and blockhash of a block from real blockchains", async () => {

        const tx = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))
        const blockHashContract = new web3.eth.Contract(BlockhashRegistry.abi, tx.contractAddress)

        const realBlocks = JSON.parse(fs.readFileSync('testData/blockHeaders.json').toString('utf8'))

        const chains = Object.keys(realBlocks);

        for (let j = 0; j < chains.length; j++) {
            const allBlocks = realBlocks[chains[j]];

            const numberBlocks = process.env.GITLAB_CI ? allBlocks.length : 10
            //  const numberBlocks = allBlocks.length
            for (let i = 0; i < numberBlocks; i++) {

                if (allBlocks[i].parentHash === "0x0000000000000000000000000000000000000000000000000000000000000000") console.log(allBlocks[i])

                const s = new in3Common.Block(allBlocks[i]).serializeHeader()

                const result = await blockHashContract.methods.getParentAndBlockhash(s).call()

                assert.strictEqual(result.parentHash, allBlocks[i].parentHash)
                assert.strictEqual(result.bhash, allBlocks[i].hash)

            }
        }
    })

    it("should successfully recalculate a chain", async () => {

        const tx = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))
        const blockHashContract = new web3.eth.Contract(BlockhashRegistry.abi, tx.contractAddress)

        const realBlocks = JSON.parse(fs.readFileSync('testData/blockHeaders.json').toString('utf8'))

        const chains = Object.keys(realBlocks);

        for (let j = 0; j < chains.length; j++) {

            let totalBlocks = process.env.GITLAB_CI ? realBlocks[chains[j]] : realBlocks[chains[j]].slice(0, 10)
            for (let i = 0; i < totalBlocks.length; i += 45) {
                const allBlocks = totalBlocks.slice(i, i + 45)
                const firstBlock = allBlocks.shift();
                const startHash = allBlocks[allBlocks.length - 1].hash;

                let serialzedBlocks = [];

                for (const b of allBlocks) {
                    const s = new in3Common.Block(b).serializeHeader()
                    serialzedBlocks.push(s);
                }

                serialzedBlocks = serialzedBlocks.reverse()
                const result = await blockHashContract.methods.reCalculateBlockheaders(serialzedBlocks, startHash, allBlocks[allBlocks.length - 1].number).call()
                assert.strictEqual(result, firstBlock.hash)
            }
        }
    })

    it("should fail recalculating a chain with a wrong order of blocks", async () => {

        const tx = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))
        const blockHashContract = new web3.eth.Contract(BlockhashRegistry.abi, tx.contractAddress)

        const realBlocks = JSON.parse(fs.readFileSync('testData/blockHeaders.json').toString('utf8'))

        const chains = Object.keys(realBlocks);

        for (let j = 0; j < chains.length; j++) {

            let totalBlocks = process.env.GITLAB_CI ? realBlocks[chains[j]] : realBlocks[chains[j]].slice(0, 10)
            for (let i = 0; i < totalBlocks.length; i += 45) {
                const allBlocks = totalBlocks.slice(i, i + 45)
                const startHash = allBlocks[allBlocks.length - 1].hash;

                let serialzedBlocks = [];

                for (const b of allBlocks) {
                    const s = new in3Common.Block(b).serializeHeader()
                    serialzedBlocks.push(s);
                }

                serialzedBlocks = serialzedBlocks.reverse()
                const temp = serialzedBlocks[2]
                serialzedBlocks[2] = serialzedBlocks[3]
                serialzedBlocks[3] = temp
                const result = await blockHashContract.methods.reCalculateBlockheaders(serialzedBlocks, startHash, allBlocks[allBlocks.length - 1].number).call()
                assert.strictEqual(result, "0x0000000000000000000000000000000000000000000000000000000000000000")
            }
        }
    })

    it("should fail recalculating a chain when an underflow occurs", async () => {

        const tx = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))
        const blockHashContract = new web3.eth.Contract(BlockhashRegistry.abi, tx.contractAddress)

        const realBlocks = JSON.parse(fs.readFileSync('testData/blockHeaders.json').toString('utf8'))

        const chains = Object.keys(realBlocks);

        for (let j = 0; j < chains.length; j++) {

            let totalBlocks = process.env.GITLAB_CI ? realBlocks[chains[j]] : realBlocks[chains[j]].slice(0, 10)
            for (let i = 0; i < totalBlocks.length; i += 45) {
                const allBlocks = totalBlocks.slice(i, i + 45)
                const startHash = allBlocks[allBlocks.length - 1].hash;

                let serialzedBlocks = [];

                for (const b of allBlocks) {
                    const s = new in3Common.Block(b).serializeHeader()
                    s[0] = 241

                    serialzedBlocks.push(s);
                }

                serialzedBlocks = serialzedBlocks.reverse()

                assert.isFalse(await blockHashContract.methods.reCalculateBlockheaders(serialzedBlocks, startHash, allBlocks[allBlocks.length - 1].number).call().catch(_ => false))
            }
        }
    })

    it("should fail recreating a not existing block", async () => {
        const pk = await utils.createAccount(null, '1000000000')
        const tx = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))
        const blockHashContract = new web3.eth.Contract(BlockhashRegistry.abi, tx.contractAddress)
        const block = await web3.eth.getBlock('latest')
        const s = new in3Common.Block(block).serializeHeader()
        const txData = blockHashContract.methods.recreateBlockheaders(block.number + 5, [s]).encodeABI()
        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txData }, pk).catch(_ => false))
    })

    it("should fail recreating when no blockheaders are provided", async () => {
        const pk = await utils.createAccount(null, '1000000000')
        const tx = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))
        const blockHashContract = new web3.eth.Contract(BlockhashRegistry.abi, tx.contractAddress)
        const block = await web3.eth.getBlock('latest')
        const s = new in3Common.Block(block).serializeHeader()
        const txData = blockHashContract.methods.recreateBlockheaders(block.number--, []).encodeABI()
        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txData }, pk).catch(_ => false))
    })


    it("should fail storing a block twice", async () => {
        const pk = await utils.createAccount(null, '1000000000')
        const tx = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))
        const blockHashContract = new web3.eth.Contract(BlockhashRegistry.abi, tx.contractAddress)
        const block = await web3.eth.getBlock('latest')
        const s = new in3Common.Block(block).serializeHeader()
        const txData = blockHashContract.methods.saveBlockNumber(block.number - 10).encodeABI()

        await utils.handleTx({ to: tx.contractAddress, data: txData }, pk)
        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txData }, pk).catch(_ => false))

    })

    it("should fail recalculating when no blockheaders are provided", async () => {
        const pk = await utils.createAccount(null, '1000000000')
        const tx = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))
        const blockHashContract = new web3.eth.Contract(BlockhashRegistry.abi, tx.contractAddress)
        const block = await web3.eth.getBlock('latest')
        const txData = blockHashContract.methods.recreateBlockheaders(block.number, []).encodeABI()
    })

    it("should fail recalculating when no blockhash are provided", async () => {
        const pk = await utils.createAccount(null, '1000000000')
        const tx = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))
        const blockHashContract = new web3.eth.Contract(BlockhashRegistry.abi, tx.contractAddress)
        const block = await web3.eth.getBlock('latest')

        const b = new in3Common.Block(block).serializeHeader()

        assert.isFalse(await blockHashContract.methods.reCalculateBlockheaders([b], "0x0000000000000000000000000000000000000000000000000000000000000000", block.number).call().catch(_ => false))
    })

    it("should fail recreating when no blockheaders are provided", async () => {
        const pk = await utils.createAccount(null, '1000000000')
        const tx = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))
        const blockHashContract = new web3.eth.Contract(BlockhashRegistry.abi, tx.contractAddress)
        const block = await web3.eth.getBlock('latest')
        assert.isFalse(await blockHashContract.methods.reCalculateBlockheaders([], block.hash, 0).call().catch(_ => false))
    })

    it("should find an existing block using searchForAvailableBlock and block is in range", async () => {

        const block = await web3.eth.getBlock('latest')
        const tx = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))
        const blockHashContract = new web3.eth.Contract(BlockhashRegistry.abi, tx.contractAddress)

        const res = await blockHashContract.methods.searchForAvailableBlock(block.number - 10, 10).call()
        assert.strictEqual(parseInt(res, 10), block.number)

    })

    it("should return 0 when not finding a block", async () => {

        const block = await web3.eth.getBlock('latest')
        const tx = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))
        const blockHashContract = new web3.eth.Contract(BlockhashRegistry.abi, tx.contractAddress)

        const res = await blockHashContract.methods.searchForAvailableBlock(block.number - 10, 5).call()
        assert.strictEqual(parseInt(res, 10), 0)

    })

    it("should fail when searching for a not yet existing block", async () => {

        const block = await web3.eth.getBlock('latest')
        const tx = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))
        const blockHashContract = new web3.eth.Contract(BlockhashRegistry.abi, tx.contractAddress)

        assert.isFalse(await blockHashContract.methods.searchForAvailableBlock(block.number - 10, 12).call().catch(_ => false))

    })


    it("should increase the # of blocks to at least 260", async () => {

        let currentBlockNumber = await web3.eth.getBlockNumber()

        while (currentBlockNumber < 260) {
            await utils.createAccount(null, '0')
            currentBlockNumber = await web3.eth.getBlockNumber()
        }

    })

    it("should revert when trying to save a block that is older then 256 blocks", async () => {

        const pk = await utils.createAccount(null, '1000000000')

        const tx = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))
        const blockHashContract = new web3.eth.Contract(BlockhashRegistry.abi, tx.contractAddress)
        const blockNumberToStore = await web3.eth.getBlockNumber() - 256

        const blockHashBeforeSave = await blockHashContract.methods.blockhashMapping(blockNumberToStore).call()
        assert.strictEqual(blockHashBeforeSave, "0x0000000000000000000000000000000000000000000000000000000000000000")

        const txData = blockHashContract.methods.saveBlockNumber(blockNumberToStore).encodeABI()

        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txData }, pk).catch(_ => false))
    })

    it("should successfully recreate a blockheader", async () => {
        const pk = await utils.createAccount(null, '1000000000')

        const block = await web3.eth.getBlock('latest')
        const tx = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))
        const blockHashContract = new web3.eth.Contract(BlockhashRegistry.abi, tx.contractAddress)

        let blockheaderArray = [];

        blockheaderArray.push(new in3Common.Block(block).serializeHeader())

        const startNumber = block.number

        for (let i = 1; i < 50; i++) {
            const b = await web3.eth.getBlock(startNumber - i)
            blockheaderArray.push(new in3Common.Block(b).serializeHeader())
        }


        const txData = blockHashContract.methods.recreateBlockheaders(startNumber, blockheaderArray).encodeABI()
        await utils.handleTx({ to: tx.contractAddress, data: txData }, pk)

        const endBlock = await web3.eth.getBlock(startNumber - 50)

        assert.strictEqual(endBlock.hash, await blockHashContract.methods.blockhashMapping(startNumber - 50).call())

        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txData }, pk).catch(_ => false))
    })

    it("should fail recreating blockheaders when there is no snapshot around", async () => {
        const pk = await utils.createAccount(null, '1000000000')

        const tx = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))
        const blockHashContract = new web3.eth.Contract(BlockhashRegistry.abi, tx.contractAddress)
        const block = await web3.eth.getBlock('latest')

        let blockheaderArray = [];

        blockheaderArray.push(new in3Common.Block(block).serializeHeader())

        const startNumber = block.number

        for (let i = 1; i < 50; i++) {
            const b = await web3.eth.getBlock(startNumber - i)
            blockheaderArray.push(new in3Common.Block(b).serializeHeader())
        }

        const txData = blockHashContract.methods.recreateBlockheaders(startNumber, blockheaderArray).encodeABI()
        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txData }, pk).catch(_ => false))
    })

    it("should fail recreate a blockheader when the ordering is wrong", async () => {
        const pk = await utils.createAccount(null, '1000000000')

        const block = await web3.eth.getBlock('latest')
        const tx = await deployment.deployBlockHashRegistry(new Web3(web3.currentProvider))
        const blockHashContract = new web3.eth.Contract(BlockhashRegistry.abi, tx.contractAddress)

        let blockheaderArray = [];

        blockheaderArray.push(new in3Common.Block(block).serializeHeader())

        const startNumber = block.number

        for (let i = 1; i < 50; i++) {
            const b = await web3.eth.getBlock(startNumber - i)
            blockheaderArray.push(new in3Common.Block(b).serializeHeader())
        }
        const temp = blockheaderArray[2]
        blockheaderArray[2] = blockheaderArray[3]
        blockheaderArray[3] = temp

        const txData = blockHashContract.methods.recreateBlockheaders(startNumber, blockheaderArray).encodeABI()
        assert.isFalse(await utils.handleTx({ to: tx.contractAddress, data: txData }, pk).catch(_ => false))


    })


})