const deployment = require('../src/utils/deployment')
const utils = require('../src/utils/utils')
const ERC20Wrapper = artifacts.require("ERC20Wrapper")

contract('ERC20Wrapper', async () => {

    it("should mint tokens", async () => {
        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(deployKey);

        const erc20deployTx = await deployment.deployERC20Wrapper(web3, deployKey)
        const erc20Address = erc20deployTx.contractAddress

        const erc20 = new web3.eth.Contract(ERC20Wrapper.abi, erc20Address)
        assert.strictEqual(await erc20.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20.methods.mint().encodeABI()
        await utils.handleTx({ to: erc20Address, data: mintData, value: '400000000000000000000' }, deployKey)
        assert.strictEqual(await erc20.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")
    })

    it("should fail minting tokens when no ether is provided", async () => {
        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(deployKey);

        const erc20deployTx = await deployment.deployERC20Wrapper(web3, deployKey)
        const erc20Address = erc20deployTx.contractAddress

        const erc20 = new web3.eth.Contract(ERC20Wrapper.abi, erc20Address)
        assert.strictEqual(await erc20.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20.methods.mint().encodeABI()
        assert.isFalse(await utils.handleTx({ to: erc20Address, data: mintData }, deployKey).catch(_ => false))
    })


    it("should burn tokens", async () => {
        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(deployKey);

        const balanceBefore = await web3.eth.getBalance(ethAcc.address)

        const erc20deployTx = await deployment.deployERC20Wrapper(web3, deployKey)
        const erc20Address = erc20deployTx.contractAddress

        const erc20 = new web3.eth.Contract(ERC20Wrapper.abi, erc20Address)
        assert.strictEqual(await erc20.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20.methods.mint().encodeABI()
        await utils.handleTx({ to: erc20Address, data: mintData, value: '400000000000000000000' }, deployKey)
        assert.strictEqual(await erc20.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const burnData = erc20.methods.burn("400000000000000000000").encodeABI()
        await utils.handleTx({ to: erc20Address, data: burnData }, deployKey)
        assert.strictEqual(await erc20.methods.balanceOf(ethAcc.address).call(), "0")

        assert.strictEqual(await web3.eth.getBalance(ethAcc.address), balanceBefore)
    })

    it("should fail burninh too much tokens", async () => {
        const deployKey = await utils.createAccount(null, '400000000000000000000')

        const ethAcc = await web3.eth.accounts.privateKeyToAccount(deployKey);

        const erc20deployTx = await deployment.deployERC20Wrapper(web3, deployKey)
        const erc20Address = erc20deployTx.contractAddress

        const erc20 = new web3.eth.Contract(ERC20Wrapper.abi, erc20Address)
        assert.strictEqual(await erc20.methods.balanceOf(ethAcc.address).call(), "0")

        const mintData = erc20.methods.mint().encodeABI()
        await utils.handleTx({ to: erc20Address, data: mintData, value: '400000000000000000000' }, deployKey)
        assert.strictEqual(await erc20.methods.balanceOf(ethAcc.address).call(), "400000000000000000000")

        const burnData = erc20.methods.burn("500000000000000000000").encodeABI()
        assert.isFalse(await utils.handleTx({ to: erc20Address, data: burnData }, deployKey).catch(_ => false))

    })


})