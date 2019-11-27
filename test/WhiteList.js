const IN3WhiteList = artifacts.require("IN3WhiteList")

const utils = require('../src/utils/utils')
const deployment = require('../src/utils/deployment')
const in3Common = require("in3-common")
const fs = require('fs')
const Web3 = require('web3')

const ethUtil = require('ethereumjs-util')


contract('WhiteList', async () => {


    it("Should register whitelist and get correct address", async () => {

        const ethAcc = await web3.eth.accounts.privateKeyToAccount("0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7");

        //deploy contracts
        const dataConDeployTx = await deployment.deployNodeRegistryData(web3, ethAcc.privateKey)
        const logicConDeployTx = await deployment.deployNodeRegistryLogic(web3,undefined, dataConDeployTx.contractAddress, ethAcc.privateKey)
        const whiteListConDeployTx = await deployment.deployWhiteListContract(web3,logicConDeployTx.contractAddress, ethAcc.privateKey)

        //init contract obj
        const whiteListCon = new web3.eth.Contract(IN3WhiteList.abi, whiteListConDeployTx.contractAddress)

        //register a node in white list
        const nodeAddr = "0x71c24b85086928930f5dC2a6690574E7016C1A7F"
        const txData = whiteListCon.methods.whiteListNode(nodeAddr).encodeABI()
        await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: txData }, ethAcc.privateKey)

        //check if node is registered
        const whiteListAddr = await whiteListCon.methods.getWhiteList().call()
        assert.equal(nodeAddr.toLowerCase(),whiteListAddr.toLowerCase())
    })

    it("Should not allow register to non-owner", async () => {

        const ethAcc = await web3.eth.accounts.privateKeyToAccount("0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7");
        const etcAcc2 = await utils.createAccount(null, '40000000000000000')

        //deploy contracts
        const dataConDeployTx = await deployment.deployNodeRegistryData(web3, ethAcc.privateKey)
        const logicConDeployTx = await deployment.deployNodeRegistryLogic(web3,undefined, dataConDeployTx.contractAddress, ethAcc.privateKey)
        const whiteListConDeployTx = await deployment.deployWhiteListContract(web3,logicConDeployTx.contractAddress, ethAcc.privateKey)

        //init contract obj
        const whiteListCon = new web3.eth.Contract(IN3WhiteList.abi, whiteListConDeployTx.contractAddress)

        const nodeAddr = "0x71c24b85086928930f5dC2a6690574E7016C1A7F"
        const txData = whiteListCon.methods.whiteListNode(nodeAddr).encodeABI()

        //trying to register node using another account other then whitelist contract owner, it should fail
        assert.isFalse(await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: txData }, etcAcc2).catch(_ => false))

    })

    it("Should allow node removal from whitelist to owner", async () => {

        const ethAcc = await web3.eth.accounts.privateKeyToAccount("0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7");

        //deploy contracts
        const dataConDeployTx = await deployment.deployNodeRegistryData(web3, ethAcc.privateKey)
        const logicConDeployTx = await deployment.deployNodeRegistryLogic(web3,undefined, dataConDeployTx.contractAddress, ethAcc.privateKey)
        const whiteListConDeployTx = await deployment.deployWhiteListContract(web3,logicConDeployTx.contractAddress, ethAcc.privateKey)

        //init contract obj
        const whiteListCon = new web3.eth.Contract(IN3WhiteList.abi, whiteListConDeployTx.contractAddress)

        //register a node in white list
        const nodeAddr = "0x71c24b85086928930f5dC2a6690574E7016C1A7F"
        const txData = whiteListCon.methods.whiteListNode(nodeAddr).encodeABI()
        await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: txData }, ethAcc.privateKey)

        //confirm node is registered correctly
        const whiteListAddr = await whiteListCon.methods.getWhiteList().call()
        assert.equal(nodeAddr.toLowerCase(),whiteListAddr.toLowerCase())

        //now remove node
        const tx2Data = whiteListCon.methods.removeNode(nodeAddr).encodeABI()
        await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: tx2Data }, ethAcc.privateKey)

        //as node is removed it should be empty
        const whiteListAddrCall2 = await whiteListCon.methods.getWhiteList().call()
        assert.equal(whiteListAddrCall2,null)
    })

    it("Should not allow node removal to non-owner", async () => {

        const ethAcc = await web3.eth.accounts.privateKeyToAccount("0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7")
        const etcAcc2 = await utils.createAccount(null, '40000000000000000')

        //deploy contracts
        const dataConDeployTx = await deployment.deployNodeRegistryData(web3, ethAcc.privateKey)
        const logicConDeployTx = await deployment.deployNodeRegistryLogic(web3,undefined, dataConDeployTx.contractAddress, ethAcc.privateKey)
        const whiteListConDeployTx = await deployment.deployWhiteListContract(web3,logicConDeployTx.contractAddress, ethAcc.privateKey)

        //init contract obj
        const whiteListCon = new web3.eth.Contract(IN3WhiteList.abi, whiteListConDeployTx.contractAddress)

        //register a node in white list
        const nodeAddr = "0x71c24b85086928930f5dC2a6690574E7016C1A7F"
        const txData = whiteListCon.methods.whiteListNode(nodeAddr).encodeABI()
        await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: txData }, ethAcc.privateKey)

        //confirm node is registered correctly
        const whiteListAddr = await whiteListCon.methods.getWhiteList().call()
        assert.equal(nodeAddr.toLowerCase(),whiteListAddr.toLowerCase())

        //now remove node
        const tx2Data = whiteListCon.methods.removeNode(nodeAddr).encodeABI()
        assert.isFalse(await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: tx2Data }, etcAcc2).catch(_ => false))

        //re verify node is not removed
        const whiteListAddrCall2 = await whiteListCon.methods.getWhiteList().call()
        assert.equal(nodeAddr.toLowerCase(),whiteListAddrCall2.toLowerCase())
    })

    it("Should not allow to register if node already registered", async () => {

        const ethAcc = await web3.eth.accounts.privateKeyToAccount("0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7");

        //deploy contracts
        const dataConDeployTx = await deployment.deployNodeRegistryData(web3, ethAcc.privateKey)
        const logicConDeployTx = await deployment.deployNodeRegistryLogic(web3,undefined, dataConDeployTx.contractAddress, ethAcc.privateKey)
        const whiteListConDeployTx = await deployment.deployWhiteListContract(web3,logicConDeployTx.contractAddress, ethAcc.privateKey)

        //init contract obj
        const whiteListCon = new web3.eth.Contract(IN3WhiteList.abi, whiteListConDeployTx.contractAddress)

        //register a node in white list
        const nodeAddr = "0x71c24b85086928930f5dC2a6690574E7016C1A7F"
        const txData = whiteListCon.methods.whiteListNode(nodeAddr).encodeABI()
        await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: txData }, ethAcc.privateKey)

        //check if node is registered
        const whiteListAddr = await whiteListCon.methods.getWhiteList().call()
        assert.equal(nodeAddr.toLowerCase(),whiteListAddr.toLowerCase())

        //try to reregister and it should fail
        assert.false(await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: txData }, ethAcc.privateKey).catch(_ => false))
    })

    it("Removal non whitelist should fail", async () => {
        //test for Node doesnt exist in whitelist.
        
        const ethAcc = await web3.eth.accounts.privateKeyToAccount("0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7");

        //deploy contracts
        const dataConDeployTx = await deployment.deployNodeRegistryData(web3, ethAcc.privateKey)
        const logicConDeployTx = await deployment.deployNodeRegistryLogic(web3,undefined, dataConDeployTx.contractAddress, ethAcc.privateKey)
        const whiteListConDeployTx = await deployment.deployWhiteListContract(web3,logicConDeployTx.contractAddress, ethAcc.privateKey)

        //init contract obj
        const whiteListCon = new web3.eth.Contract(IN3WhiteList.abi, whiteListConDeployTx.contractAddress)

        //register a node in white list
        const nodeAddr = "0x71c24b85086928930f5dC2a6690574E7016C1A7F"
        const txData = whiteListCon.methods.whiteListNode(nodeAddr).encodeABI()
        await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: txData }, ethAcc.privateKey)

        //confirm node is registered correctly
        const whiteListAddr = await whiteListCon.methods.getWhiteList().call()
        assert.equal(nodeAddr.toLowerCase(),whiteListAddr.toLowerCase())

        //now remove node that is different from registered one
        const tx2Data = whiteListCon.methods.removeNode("0x41d8A416301f53a3EBa3c85B2b88270f636DBd5C").encodeABI()
        assert.false(await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: tx2Data }, ethAcc.privateKey).catch(_ => false))
    })

})