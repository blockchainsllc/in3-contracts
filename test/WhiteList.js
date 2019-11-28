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
        const logicConDeployTx = await deployment.deployNodeRegistryLogic(web3, undefined, dataConDeployTx.contractAddress, ethAcc.privateKey)
        const whiteListConDeployTx = await deployment.deployWhiteListContract(web3, logicConDeployTx.contractAddress, ethAcc.privateKey)

        //init contract obj
        const whiteListCon = new web3.eth.Contract(IN3WhiteList.abi, whiteListConDeployTx.contractAddress)

        //register a node in white list
        const nodeAddr = "0x71c24b85086928930f5dC2a6690574E7016C1A7F"
        const txData = whiteListCon.methods.whiteListNode(nodeAddr).encodeABI()
        await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: txData }, ethAcc.privateKey)

        //check if node is registered
        const whiteListAddr = await whiteListCon.methods.getWhiteList().call()
        assert.equal(nodeAddr.toLowerCase(), whiteListAddr.toLowerCase())
    })

    it("Should not allow register to non-owner", async () => {

        const ethAcc = await web3.eth.accounts.privateKeyToAccount("0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7");
        const etcAcc2 = await utils.createAccount(null, '40000000000000000')

        //deploy contracts
        const dataConDeployTx = await deployment.deployNodeRegistryData(web3, ethAcc.privateKey)
        const logicConDeployTx = await deployment.deployNodeRegistryLogic(web3, undefined, dataConDeployTx.contractAddress, ethAcc.privateKey)
        const whiteListConDeployTx = await deployment.deployWhiteListContract(web3, logicConDeployTx.contractAddress, ethAcc.privateKey)

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
        const logicConDeployTx = await deployment.deployNodeRegistryLogic(web3, undefined, dataConDeployTx.contractAddress, ethAcc.privateKey)
        const whiteListConDeployTx = await deployment.deployWhiteListContract(web3, logicConDeployTx.contractAddress, ethAcc.privateKey)

        //init contract obj
        const whiteListCon = new web3.eth.Contract(IN3WhiteList.abi, whiteListConDeployTx.contractAddress)

        //register a node in white list
        const nodeAddr = "0x71c24b85086928930f5dC2a6690574E7016C1A7F"
        const txData = whiteListCon.methods.whiteListNode(nodeAddr).encodeABI()
        await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: txData }, ethAcc.privateKey)

        //confirm node is registered correctly
        const whiteListAddr = await whiteListCon.methods.getWhiteList().call()
        assert.equal(nodeAddr.toLowerCase(), whiteListAddr.toLowerCase())

        //now remove node
        const tx2Data = whiteListCon.methods.removeNode(nodeAddr).encodeABI()
        await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: tx2Data }, ethAcc.privateKey)

        //as node is removed it should be empty
        const whiteListAddrCall2 = await whiteListCon.methods.getWhiteList().call()
        assert.equal(whiteListAddrCall2, null)
    })

    it("Should not allow node removal to non-owner", async () => {

        const ethAcc = await web3.eth.accounts.privateKeyToAccount("0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7")
        const etcAcc2 = await utils.createAccount(null, '40000000000000000')

        //deploy contracts
        const dataConDeployTx = await deployment.deployNodeRegistryData(web3, ethAcc.privateKey)
        const logicConDeployTx = await deployment.deployNodeRegistryLogic(web3, undefined, dataConDeployTx.contractAddress, ethAcc.privateKey)
        const whiteListConDeployTx = await deployment.deployWhiteListContract(web3, logicConDeployTx.contractAddress, ethAcc.privateKey)

        //init contract obj
        const whiteListCon = new web3.eth.Contract(IN3WhiteList.abi, whiteListConDeployTx.contractAddress)

        //register a node in white list
        const nodeAddr = "0x71c24b85086928930f5dC2a6690574E7016C1A7F"
        const txData = whiteListCon.methods.whiteListNode(nodeAddr).encodeABI()
        await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: txData }, ethAcc.privateKey)

        //confirm node is registered correctly
        const whiteListAddr = await whiteListCon.methods.getWhiteList().call()
        assert.equal(nodeAddr.toLowerCase(), whiteListAddr.toLowerCase())

        //now remove node
        const tx2Data = whiteListCon.methods.removeNode(nodeAddr).encodeABI()
        assert.isFalse(await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: tx2Data }, etcAcc2).catch(_ => false))

        //re verify node is not removed
        const whiteListAddrCall2 = await whiteListCon.methods.getWhiteList().call()
        assert.equal(nodeAddr.toLowerCase(), whiteListAddrCall2.toLowerCase())
    })

    it("Should not allow to register if node already registered", async () => {

        const ethAcc = await web3.eth.accounts.privateKeyToAccount("0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7");

        //deploy contracts
        const dataConDeployTx = await deployment.deployNodeRegistryData(web3, ethAcc.privateKey)
        const logicConDeployTx = await deployment.deployNodeRegistryLogic(web3, undefined, dataConDeployTx.contractAddress, ethAcc.privateKey)
        const whiteListConDeployTx = await deployment.deployWhiteListContract(web3, logicConDeployTx.contractAddress, ethAcc.privateKey)

        //init contract obj
        const whiteListCon = new web3.eth.Contract(IN3WhiteList.abi, whiteListConDeployTx.contractAddress)

        //register a node in white list
        const nodeAddr = "0x71c24b85086928930f5dC2a6690574E7016C1A7F"
        const txData = whiteListCon.methods.whiteListNode(nodeAddr).encodeABI()
        await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: txData }, ethAcc.privateKey)

        //check if node is registered
        const whiteListAddr = await whiteListCon.methods.getWhiteList().call()
        assert.equal(nodeAddr.toLowerCase(), whiteListAddr.toLowerCase())

        //try to reregister and it should fail
        assert.isFalse(await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: txData }, ethAcc.privateKey).catch(_ => false))
    })

    it("Removal non whitelist should fail", async () => {
        //test for Node doesnt exist in whitelist.

        const ethAcc = await web3.eth.accounts.privateKeyToAccount("0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7");

        //deploy contracts
        const dataConDeployTx = await deployment.deployNodeRegistryData(web3, ethAcc.privateKey)
        const logicConDeployTx = await deployment.deployNodeRegistryLogic(web3, undefined, dataConDeployTx.contractAddress, ethAcc.privateKey)
        const whiteListConDeployTx = await deployment.deployWhiteListContract(web3, logicConDeployTx.contractAddress, ethAcc.privateKey)

        //init contract obj
        const whiteListCon = new web3.eth.Contract(IN3WhiteList.abi, whiteListConDeployTx.contractAddress)

        //register a node in white list
        const nodeAddr = "0x71c24b85086928930f5dC2a6690574E7016C1A7F"
        const txData = whiteListCon.methods.whiteListNode(nodeAddr).encodeABI()
        await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: txData }, ethAcc.privateKey)

        //confirm node is registered correctly
        const whiteListAddr = await whiteListCon.methods.getWhiteList().call()
        assert.equal(nodeAddr.toLowerCase(), whiteListAddr.toLowerCase())

        //now remove node that is different from registered one
        const tx2Data = whiteListCon.methods.removeNode("0x41d8A416301f53a3EBa3c85B2b88270f636DBd5C").encodeABI()
        assert.isFalse(await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: tx2Data }, ethAcc.privateKey).catch(_ => false))
    })

    it("Correct block number for event", async () => {
        const ethAcc = await web3.eth.accounts.privateKeyToAccount("0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7");

        //deploy contracts
        const dataConDeployTx = await deployment.deployNodeRegistryData(web3, ethAcc.privateKey)
        const logicConDeployTx = await deployment.deployNodeRegistryLogic(web3, undefined, dataConDeployTx.contractAddress, ethAcc.privateKey)
        const whiteListConDeployTx = await deployment.deployWhiteListContract(web3, logicConDeployTx.contractAddress, ethAcc.privateKey)

        //init contract obj
        const whiteListCon = new web3.eth.Contract(IN3WhiteList.abi, whiteListConDeployTx.contractAddress)

        //register a node and see block num
        const nodeAddr = "0x71c24b85086928930f5dC2a6690574E7016C1A7F"
        const txData = whiteListCon.methods.whiteListNode(nodeAddr).encodeABI()
        const tx = await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: txData }, ethAcc.privateKey)

        const eventNum = await whiteListCon.methods.getLastEventBlockNumber().call()
        assert.equal(tx.blockNumber, eventNum)

        //now remove node and see event num
        const tx2Data = whiteListCon.methods.removeNode(nodeAddr).encodeABI()
        const tx2 = await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: tx2Data }, ethAcc.privateKey)
        const eventNum2 = await whiteListCon.methods.getLastEventBlockNumber().call()
        assert.equal(tx2.blockNumber, eventNum2)

    })

    it("Should register multiple whitelist and get correct address for each", async () => {

        const ethAcc = await web3.eth.accounts.privateKeyToAccount("0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7");

        //deploy contracts
        const dataConDeployTx = await deployment.deployNodeRegistryData(web3, ethAcc.privateKey)
        const logicConDeployTx = await deployment.deployNodeRegistryLogic(web3, undefined, dataConDeployTx.contractAddress, ethAcc.privateKey)
        const whiteListConDeployTx = await deployment.deployWhiteListContract(web3, logicConDeployTx.contractAddress, ethAcc.privateKey)

        //init contract obj
        const whiteListCon = new web3.eth.Contract(IN3WhiteList.abi, whiteListConDeployTx.contractAddress)

        const register = async (addr) => {
            const txData = whiteListCon.methods.whiteListNode(addr).encodeABI()
            return await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: txData }, ethAcc.privateKey)
        }

        const nodeAddr = ["0x71c24b85086928930f5dC2a6690574E7016C1A7F", "0x387009c20921cA57684B1E62E5526c328bAbFC33",
            "0x534570d3b64f45793BAcD9A8a1C1fc2af504D81A", "0x89156806b7deC7a18e009dCBA74F194E0319D924"]

        for (const element of nodeAddr)
            await register(element)

        //check if all nodes are registered
        let whiteListAddrs = await whiteListCon.methods.getWhiteList().call()
        whiteListAddrs = whiteListAddrs.substring(2)
        const resultAddrs = whiteListAddrs.match(new RegExp('.{1,40}', 'g'))

        for (const element of nodeAddr) {
            assert.isTrue(resultAddrs.find(e => "0x" + e.toLowerCase() == element.toLowerCase()) != undefined)
        }
    })

    it("Should not alter other multiple nodes when deleting first node", async () => {

        const ethAcc = await web3.eth.accounts.privateKeyToAccount("0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7");

        //deploy contracts
        const dataConDeployTx = await deployment.deployNodeRegistryData(web3, ethAcc.privateKey)
        const logicConDeployTx = await deployment.deployNodeRegistryLogic(web3, undefined, dataConDeployTx.contractAddress, ethAcc.privateKey)
        const whiteListConDeployTx = await deployment.deployWhiteListContract(web3, logicConDeployTx.contractAddress, ethAcc.privateKey)

        //init contract obj
        const whiteListCon = new web3.eth.Contract(IN3WhiteList.abi, whiteListConDeployTx.contractAddress)

        const register = async (addr) => {
            const txData = whiteListCon.methods.whiteListNode(addr).encodeABI()
            return await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: txData }, ethAcc.privateKey)
        }

        const nodeAddr = ["0x71c24b85086928930f5dC2a6690574E7016C1A7F", "0x387009c20921cA57684B1E62E5526c328bAbFC33",
            "0x534570d3b64f45793BAcD9A8a1C1fc2af504D81A", "0x89156806b7deC7a18e009dCBA74F194E0319D924"]

        for (const element of nodeAddr)
            await register(element)

        //check if all nodes are registered
        let whiteListAddrs = await whiteListCon.methods.getWhiteList().call()
        whiteListAddrs = whiteListAddrs.substring(2)
        const resultAddrs = whiteListAddrs.match(new RegExp('.{1,40}', 'g'))

        //verify all no
        for (const element of nodeAddr) {
            assert.isTrue(resultAddrs.find(e => "0x" + e.toLowerCase() == element.toLowerCase()) != undefined)
        }

        removeNode = async (addr) => {
            const txData = whiteListCon.methods.removeNode(addr).encodeABI()
            return await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: txData }, ethAcc.privateKey)
        }

        //remove first node
        await removeNode(nodeAddr[0])

        //now verrify all other nodes exists in whitelist
        let whiteListAddrs2 = await whiteListCon.methods.getWhiteList().call()
        whiteListAddrs2 = whiteListAddrs2.substring(2)
        const resultAddrs2 = whiteListAddrs2.match(new RegExp('.{1,40}', 'g'))

        //verify all no
        for (const element of nodeAddr) {
            if(element == nodeAddr[0]){
                assert.isTrue(resultAddrs2.find(e => "0x" + e.toLowerCase() == element.toLowerCase()) == undefined)
            }
            else{
                assert.isTrue(resultAddrs2.find(e => "0x" + e.toLowerCase() == element.toLowerCase()) != undefined)
            }
        }

    })

    it("Should not alter other multiple nodes when deleting first last", async () => {

        const ethAcc = await web3.eth.accounts.privateKeyToAccount("0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7");

        //deploy contracts
        const dataConDeployTx = await deployment.deployNodeRegistryData(web3, ethAcc.privateKey)
        const logicConDeployTx = await deployment.deployNodeRegistryLogic(web3, undefined, dataConDeployTx.contractAddress, ethAcc.privateKey)
        const whiteListConDeployTx = await deployment.deployWhiteListContract(web3, logicConDeployTx.contractAddress, ethAcc.privateKey)

        //init contract obj
        const whiteListCon = new web3.eth.Contract(IN3WhiteList.abi, whiteListConDeployTx.contractAddress)

        const register = async (addr) => {
            const txData = whiteListCon.methods.whiteListNode(addr).encodeABI()
            return await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: txData }, ethAcc.privateKey)
        }

        const nodeAddr = ["0x71c24b85086928930f5dC2a6690574E7016C1A7F", "0x387009c20921cA57684B1E62E5526c328bAbFC33",
            "0x534570d3b64f45793BAcD9A8a1C1fc2af504D81A", "0x89156806b7deC7a18e009dCBA74F194E0319D924"]

        for (const element of nodeAddr)
            await register(element)

        //check if all nodes are registered
        let whiteListAddrs = await whiteListCon.methods.getWhiteList().call()
        whiteListAddrs = whiteListAddrs.substring(2)
        const resultAddrs = whiteListAddrs.match(new RegExp('.{1,40}', 'g'))

        //verify all no
        for (const element of nodeAddr) {
            assert.isTrue(resultAddrs.find(e => "0x" + e.toLowerCase() == element.toLowerCase()) != undefined)
        }

        removeNode = async (addr) => {
            const txData = whiteListCon.methods.removeNode(addr).encodeABI()
            return await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: txData }, ethAcc.privateKey)
        }

        //remove first node
        await removeNode(nodeAddr[3])

        //now verrify all other nodes exists in whitelist
        let whiteListAddrs2 = await whiteListCon.methods.getWhiteList().call()
        whiteListAddrs2 = whiteListAddrs2.substring(2)
        const resultAddrs2 = whiteListAddrs2.match(new RegExp('.{1,40}', 'g'))

        //verify all no
        for (const element of nodeAddr) {
            if(element == nodeAddr[3]){
                assert.isTrue(resultAddrs2.find(e => "0x" + e.toLowerCase() == element.toLowerCase()) == undefined)
            }
            else{
                assert.isTrue(resultAddrs2.find(e => "0x" + e.toLowerCase() == element.toLowerCase()) != undefined)
            }
        }

    })

    it("Should not alter other multiple nodes when deleting middle last", async () => {

        const ethAcc = await web3.eth.accounts.privateKeyToAccount("0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7");

        //deploy contracts
        const dataConDeployTx = await deployment.deployNodeRegistryData(web3, ethAcc.privateKey)
        const logicConDeployTx = await deployment.deployNodeRegistryLogic(web3, undefined, dataConDeployTx.contractAddress, ethAcc.privateKey)
        const whiteListConDeployTx = await deployment.deployWhiteListContract(web3, logicConDeployTx.contractAddress, ethAcc.privateKey)

        //init contract obj
        const whiteListCon = new web3.eth.Contract(IN3WhiteList.abi, whiteListConDeployTx.contractAddress)

        const register = async (addr) => {
            const txData = whiteListCon.methods.whiteListNode(addr).encodeABI()
            return await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: txData }, ethAcc.privateKey)
        }

        const nodeAddr = ["0x71c24b85086928930f5dC2a6690574E7016C1A7F", "0x387009c20921cA57684B1E62E5526c328bAbFC33",
            "0x534570d3b64f45793BAcD9A8a1C1fc2af504D81A", "0x89156806b7deC7a18e009dCBA74F194E0319D924"]

        for (const element of nodeAddr)
            await register(element)

        //check if all nodes are registered
        let whiteListAddrs = await whiteListCon.methods.getWhiteList().call()
        whiteListAddrs = whiteListAddrs.substring(2)
        const resultAddrs = whiteListAddrs.match(new RegExp('.{1,40}', 'g'))

        //verify all no
        for (const element of nodeAddr) {
            assert.isTrue(resultAddrs.find(e => "0x" + e.toLowerCase() == element.toLowerCase()) != undefined)
        }

        removeNode = async (addr) => {
            const txData = whiteListCon.methods.removeNode(addr).encodeABI()
            return await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: txData }, ethAcc.privateKey)
        }

        //remove first node
        await removeNode(nodeAddr[1])

        //now verrify all other nodes exists in whitelist
        let whiteListAddrs2 = await whiteListCon.methods.getWhiteList().call()
        whiteListAddrs2 = whiteListAddrs2.substring(2)
        const resultAddrs2 = whiteListAddrs2.match(new RegExp('.{1,40}', 'g'))

        //verify all no
        for (const element of nodeAddr) {
            if(element == nodeAddr[1]){
                assert.isTrue(resultAddrs2.find(e => "0x" + e.toLowerCase() == element.toLowerCase()) == undefined)
            }
            else{
                assert.isTrue(resultAddrs2.find(e => "0x" + e.toLowerCase() == element.toLowerCase()) != undefined)
            }
        }

    })

    it("Should match proofHash for single node", async () => {

        const ethAcc = await web3.eth.accounts.privateKeyToAccount("0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7");

        //deploy contracts
        const dataConDeployTx = await deployment.deployNodeRegistryData(web3, ethAcc.privateKey)
        const logicConDeployTx = await deployment.deployNodeRegistryLogic(web3, undefined, dataConDeployTx.contractAddress, ethAcc.privateKey)
        const whiteListConDeployTx = await deployment.deployWhiteListContract(web3, logicConDeployTx.contractAddress, ethAcc.privateKey)

        //init contract obj
        const whiteListCon = new web3.eth.Contract(IN3WhiteList.abi, whiteListConDeployTx.contractAddress)

        //register a node in white list
        const nodeAddr = "0x71c24b85086928930f5dC2a6690574E7016C1A7F"
        const txData = whiteListCon.methods.whiteListNode(nodeAddr).encodeABI()
        await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: txData }, ethAcc.privateKey)

        //check if node is registered
        const whiteListAddr = await whiteListCon.methods.getWhiteList().call()
        assert.equal(nodeAddr.toLowerCase(), whiteListAddr.toLowerCase())

        const proofHash = await whiteListCon.methods.getProofHash().call()
        const wlHash =  in3Common.util.toMinHex(in3Common.bytes32(ethUtil.keccak(nodeAddr)))

        assert.equal(proofHash,wlHash)

    })

    it("Should match proofHash for multiple nodes", async () => {

        const ethAcc = await web3.eth.accounts.privateKeyToAccount("0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7");

        //deploy contracts
        const dataConDeployTx = await deployment.deployNodeRegistryData(web3, ethAcc.privateKey)
        const logicConDeployTx = await deployment.deployNodeRegistryLogic(web3, undefined, dataConDeployTx.contractAddress, ethAcc.privateKey)
        const whiteListConDeployTx = await deployment.deployWhiteListContract(web3, logicConDeployTx.contractAddress, ethAcc.privateKey)

        //init contract obj
        const whiteListCon = new web3.eth.Contract(IN3WhiteList.abi, whiteListConDeployTx.contractAddress)

        const register = async (addr) => {
            const txData = whiteListCon.methods.whiteListNode(addr).encodeABI()
            return await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: txData }, ethAcc.privateKey)
        }

        const nodeAddr = ["0x71c24b85086928930f5dC2a6690574E7016C1A7F", "0x387009c20921cA57684B1E62E5526c328bAbFC33",
            "0x534570d3b64f45793BAcD9A8a1C1fc2af504D81A", "0x89156806b7deC7a18e009dCBA74F194E0319D924"]

        for (const element of nodeAddr)
            await register(element)

        const proofHash = await whiteListCon.methods.getProofHash().call()
        const wlHash =  in3Common.util.toMinHex(in3Common.bytes32(ethUtil.keccak(Buffer.concat( nodeAddr.map(in3Common.address) ))))

        assert.equal(proofHash,wlHash)

    })

    it("Should calculate correct proofhash in case of multiple nodes and when a node is deleted", async () => {

        const ethAcc = await web3.eth.accounts.privateKeyToAccount("0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7");

        //deploy contracts
        const dataConDeployTx = await deployment.deployNodeRegistryData(web3, ethAcc.privateKey)
        const logicConDeployTx = await deployment.deployNodeRegistryLogic(web3, undefined, dataConDeployTx.contractAddress, ethAcc.privateKey)
        const whiteListConDeployTx = await deployment.deployWhiteListContract(web3, logicConDeployTx.contractAddress, ethAcc.privateKey)

        //init contract obj
        const whiteListCon = new web3.eth.Contract(IN3WhiteList.abi, whiteListConDeployTx.contractAddress)

        const register = async (addr) => {
            const txData = whiteListCon.methods.whiteListNode(addr).encodeABI()
            return await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: txData }, ethAcc.privateKey)
        }

        const nodeAddr = ["0x71c24b85086928930f5dC2a6690574E7016C1A7F", "0x387009c20921cA57684B1E62E5526c328bAbFC33",
            "0x534570d3b64f45793BAcD9A8a1C1fc2af504D81A", "0x89156806b7deC7a18e009dCBA74F194E0319D924"]

        for (const element of nodeAddr)
            await register(element)

        removeNode = async (addr) => {
            const txData = whiteListCon.methods.removeNode(addr).encodeABI()
            return await utils.handleTx({ to: whiteListConDeployTx.contractAddress, data: txData }, ethAcc.privateKey)
        }

        //remove first node
        await removeNode(nodeAddr[0])

        const proofHash = await whiteListCon.methods.getProofHash().call()
        //let list = [nodeAddr[3],nodeAddr[1],nodeAddr[2]]

        let whiteListAddrs = await whiteListCon.methods.getWhiteList().call()
        whiteListAddrs = whiteListAddrs.substring(2)
        let resultAddrs = whiteListAddrs.match(new RegExp('.{1,40}', 'g'))

        resultAddrs.forEach(function(part, index, arr) {
            arr[index] = "0x"+arr[index];
          });

        const wlHash =  in3Common.util.toMinHex(in3Common.bytes32(ethUtil.keccak(Buffer.concat( resultAddrs.map(in3Common.address) ))))

        //before deletion proof hahs
        assert.equal(proofHash,wlHash)

    })

  

})