const Web3 = require("web3")
const fs = require("fs")
const util = require("../src/utils/utils")

const deployContract = async (web3, byteCode, privateKey) => {

    const transactionbBytecode = byteCode.startsWith("0x") ? byteCode : "0x" + byteCode

    const senderAddress = web3.eth.accounts.privateKeyToAccount(privateKey);

    const nonce = await web3.eth.getTransactionCount(senderAddress.address)

    const gasPrice = await web3.eth.getGasPrice()

    const transactionParams = {
        to: '',
        data: transactionbBytecode,
        from: senderAddress.address,
        nonce: nonce,
        gasPrice: gasPrice,
        gasLimit: 7000000
    };

    const signedTx = await web3.eth.accounts.signTransaction(transactionParams, privateKey);
    return (web3.eth.sendSignedTransaction(signedTx.rawTransaction));
}

const sendTx = async (web3, data, targetAddress, value, gasLimit, privateKey) => {
    const senderAddress = web3.eth.accounts.privateKeyToAccount(privateKey);

    const nonce = await web3.eth.getTransactionCount(senderAddress.address, "pending")

    const gasPrice = await web3.eth.getGasPrice()

    const transactionParams = {
        to: targetAddress,
        data: data,
        from: senderAddress.address,
        nonce: nonce,
        gasPrice: gasPrice,
        gasLimit: gasLimit,
        value: value || 0
    };

    const signedTx = await web3.eth.accounts.signTransaction(transactionParams, privateKey);
    return (web3.eth.sendSignedTransaction(signedTx.rawTransaction));
}

const deployGnosisSafeWallet = async () => {

    const web3 = new Web3(process.env.RPCURL)

    const parityDevAccount = web3.eth.accounts.privateKeyToAccount("0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7")

    /**
    * setup Mastercopy
    */

    // either use the provided privateKey or the PARITY-dev account (DO NOT USE IN PRO)
    const deployerAddress = web3.eth.accounts.privateKeyToAccount(process.env.SRV_OWNER);

    const balanceParityAccount = await web3.eth.getBalance(parityDevAccount.address)
    const balanceDeployAccount = await web3.eth.getBalance(deployerAddress.address)

    console.log("balanceParityAccount", balanceParityAccount)
    console.log("balanceDeployAccount", balanceDeployAccount)


    if (balanceDeployAccount < 100000000000000000 && balanceParityAccount > 100000000000000000) {
        console.log("transfering ether to", deployerAddress.address)
        await sendTx(web3, null, deployerAddress.address, "100000000000000000", 122000, parityDevAccount.privateKey)
    }

    console.log("deploying the in3-contracts using the address", deployerAddress.address)

    // parsing contract infos
    const gnosisMasterInfo = JSON.parse(fs.readFileSync("gnosis-safe-build/GnosisSafe.json"))
    let gnosisSafeMasterCopyAddress = "0xb6029EA3B2c51D09a50B53CA8012FeEB05bDa35A"

    const codeMasterCopy = await web3.eth.getCode(gnosisSafeMasterCopyAddress)

    if (codeMasterCopy === "0x") {
        console.log("deploying gnosis master copy")
        const txDeployMasterCopy = await deployContract(web3, gnosisMasterInfo.bytecode, deployerAddress.privateKey)
        gnosisSafeMasterCopyAddress = txDeployMasterCopy.contractAddress
    }
    console.log("gnosis masterCopyAddress", gnosisSafeMasterCopyAddress)

    /** ProxyFactory */
    const proxyFactoryInfo = JSON.parse(fs.readFileSync("gnosis-safe-build/ProxyFactory.json"))
    let gnosisProxyFactoryAddress = "0x12302fE9c02ff50939BaAaaf415fc226C078613C"

    const codeProxyFactory = await web3.eth.getCode(gnosisProxyFactoryAddress)

    if (codeProxyFactory === "0x") {
        console.log("deploying gnosis proxy factory")

        const txDeplyProxyFactory = await deployContract(web3, proxyFactoryInfo.bytecode, deployerAddress.privateKey)
        gnosisProxyFactoryAddress = txDeplyProxyFactory.contractAddress
    }
    console.log("gnosis proxyFactoryy", gnosisProxyFactoryAddress)

    const proxyFactory = new web3.eth.Contract(proxyFactoryInfo.abi, gnosisProxyFactoryAddress)

    const txDataProxy = proxyFactory.methods.createProxy(gnosisSafeMasterCopyAddress, "0x00").encodeABI()
    const gasTxDataProxy = await proxyFactory.methods.createProxy(gnosisSafeMasterCopyAddress, "0x00").estimateGas()

    console.log("setting up proxy contract")
    const txSetupProxy = await sendTx(web3, txDataProxy, gnosisProxyFactoryAddress, 0, Math.floor(gasTxDataProxy * 1.3), deployerAddress.privateKey)

    const deployedWalletAddress = "0x" + txSetupProxy.logs[0].data.substr(26)
    console.log("deployedWallet", deployedWalletAddress)

    /**
    * setup wallet
    */
    const gnosisProxy = new web3.eth.Contract(gnosisMasterInfo.abi, deployedWalletAddress)

    console.log(`setting up wallet with ${deployerAddress.address} as owner`)
    const setupTxDataProxy = gnosisProxy.methods.setup(
        [deployerAddress.address],
        1,
        "0x0000000000000000000000000000000000000000",
        "0x00",
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
        0,
        "0x0000000000000000000000000000000000000000"
    ).encodeABI()

    const gasSetupTxDataProxy = await gnosisProxy.methods.setup(
        [deployerAddress.address],
        1,
        "0x0000000000000000000000000000000000000000",
        "0x00",
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
        0,
        "0x0000000000000000000000000000000000000000"
    ).estimateGas()

    await sendTx(web3, setupTxDataProxy, deployedWalletAddress, 0, Math.floor(gasSetupTxDataProxy * 1.2), deployerAddress.privateKey)

    /**
     * the multisig wallet is now ready
     */

    /**
    * deploying the createCall contract
    */

    const createCallInfo = JSON.parse(fs.readFileSync("gnosis-safe-build/CreateCall.json"))
    const txDeployCreateCall = await deployContract(web3, createCallInfo.bytecode, deployerAddress.privateKey)
    const createCallContractAddress = txDeployCreateCall.contractAddress

    console.log("createCallContract-Address", createCallContractAddress)

    const createCall = new web3.eth.Contract(createCallInfo.abi, createCallContractAddress)
    /**
    *  deployment of blockhashRegistry
    */

    const blockHashInfo = JSON.parse(fs.readFileSync("build/contracts/BlockhashRegistry.json"))

    //getting the txData 
    const txDataCallDeployBlockHash = createCall.methods.performCreate(0, blockHashInfo.bytecode).encodeABI()

    // getting the data for the gnosis-tx
    let nonceWallet = await gnosisProxy.methods.nonce().call()

    const gastxDataCallDeployBlockHash = await createCall.methods.performCreate(0, blockHashInfo.bytecode).estimateGas()

    const calculatedTxHashBlockhash = await gnosisProxy.methods.getTransactionHash(
        createCallContractAddress,                      // address to,
        0,                                              //uint256 value,
        txDataCallDeployBlockHash,                      //bytes memory data,
        1,                                              //Enum.Operation operation,
        Math.floor(gastxDataCallDeployBlockHash * 1.25),            //uint256 safeTxGas,
        Math.floor(gastxDataCallDeployBlockHash * 1.25),            //uint256 baseGas,
        0,                                              //uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",   //address gasToken,
        "0x0000000000000000000000000000000000000000",   //address refundReceiver,
        nonceWallet                                      //uint256 _nonce
    ).call()

    // signing
    const signatureBlockhash = util.signHash(deployerAddress.privateKey, calculatedTxHashBlockhash)

    // exec
    const execBlockHashDeployTxData = gnosisProxy.methods.execTransaction(
        createCallContractAddress,                      //address to,
        0,                                              //uint256 value,
        txDataCallDeployBlockHash,                      //bytes calldata data,
        1,                                              //Enum.Operation operation,
        Math.floor(gastxDataCallDeployBlockHash * 1.25),            //uint256 safeTxGas,
        Math.floor(gastxDataCallDeployBlockHash * 1.25),            //uint256 baseGas,
        0,                                              //uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",   //address gasToken,
        "0x0000000000000000000000000000000000000000",   //address payable refundReceiver,
        signatureBlockhash.signatureBytes                                   //bytes calldata signatures
    ).encodeABI()

    const gasExecBlockHashDeployTxData = await gnosisProxy.methods.execTransaction(
        createCallContractAddress,                      //address to,
        0,                                              //uint256 value,
        txDataCallDeployBlockHash,                      //bytes calldata data,
        1,                                              //Enum.Operation operation,
        Math.floor(gastxDataCallDeployBlockHash * 1.25),            //uint256 safeTxGas,
        Math.floor(gastxDataCallDeployBlockHash * 1.25),            //uint256 baseGas,
        0,                                              //uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",   //address gasToken,
        "0x0000000000000000000000000000000000000000",   //address payable refundReceiver,
        signatureBlockhash.signatureBytes                                   //bytes calldata signatures
    ).estimateGas()


    const txDeployBlockHash = await sendTx(web3, execBlockHashDeployTxData, deployedWalletAddress, 0, Math.floor(gasExecBlockHashDeployTxData * 1.25), deployerAddress.privateKey)

    const blockHashRegistryAddress = "0x" + txDeployBlockHash.logs[1].data.substr(26)

    console.log("blockHashRegistry-address", blockHashRegistryAddress)

    /**
     * deployment of the node-Registry
     * 
     */

    const nodeRegistryInfo = JSON.parse(fs.readFileSync("build/contracts/NodeRegistry.json"))
    //getting the txData 
    const txDataCallDeployNodeRegistry = createCall.methods.performCreate(0, nodeRegistryInfo.bytecode + web3.eth.abi.encodeParameters(['address'], [blockHashRegistryAddress]).substr(2)).encodeABI()


    const gasTxDataCallDeployNodeRegistry = await createCall.methods.performCreate(0, nodeRegistryInfo.bytecode + web3.eth.abi.encodeParameters(['address'], [blockHashRegistryAddress]).substr(2)).estimateGas()

    console.log("gasTxDataCallDeployNodeRegistry", gasTxDataCallDeployNodeRegistry)

    // getting the data for the gnosis-tx
    nonceWallet = await gnosisProxy.methods.nonce().call()

    const calculatedTxHashNodeReg = await gnosisProxy.methods.getTransactionHash(
        createCallContractAddress,                      // address to,
        0,                                              //uint256 value,
        txDataCallDeployNodeRegistry,                   //bytes memory data,
        1,                                              //Enum.Operation operation,
        Math.floor(gasTxDataCallDeployNodeRegistry * 1.1),                                              //uint256 safeTxGas,
        Math.floor(gasTxDataCallDeployNodeRegistry * 1.1),          //uint256 baseGas,
        0,                                              //uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",   //address gasToken,
        "0x0000000000000000000000000000000000000000",   //address refundReceiver,
        nonceWallet                                     //uint256 _nonce
    ).call()

    // signing
    const signature = util.signHash(deployerAddress.privateKey, calculatedTxHashNodeReg)

    // exec

    const execNodeRegistryDeployTxData = gnosisProxy.methods.execTransaction(
        createCallContractAddress,                      //address to,
        0,                                              //uint256 value,
        txDataCallDeployNodeRegistry,                   //bytes calldata data,
        1,                                              //Enum.Operation operation,
        Math.floor(gasTxDataCallDeployNodeRegistry * 1.1),                                              //uint256 safeTxGas,
        Math.floor(gasTxDataCallDeployNodeRegistry * 1.1),          //uint256 baseGas,
        0,                                              //uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",   //address gasToken,
        "0x0000000000000000000000000000000000000000",   //address payable refundReceiver,
        signature.signatureBytes                                   //bytes calldata signatures
    ).encodeABI()

    const gasExecTxDataCallDeployNodeRegistry = await gnosisProxy.methods.execTransaction(
        createCallContractAddress,                      //address to,
        0,                                              //uint256 value,
        txDataCallDeployNodeRegistry,                      //bytes calldata data,
        1,                                              //Enum.Operation operation,
        Math.floor(gasTxDataCallDeployNodeRegistry * 1.1),            //uint256 safeTxGas,
        Math.floor(gasTxDataCallDeployNodeRegistry * 1.1),            //uint256 baseGas,
        0,                                              //uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",   //address gasToken,
        "0x0000000000000000000000000000000000000000",   //address payable refundReceiver,
        signature.signatureBytes                                   //bytes calldata signatures
    ).estimateGas()

    const txDeployNodeRegistry = await sendTx(web3, execNodeRegistryDeployTxData, deployedWalletAddress, 0, Math.floor(gasExecTxDataCallDeployNodeRegistry * 1.1), deployerAddress.privateKey)

    const nodeRegistryAddress = "0x" + txDeployNodeRegistry.logs[0].data.substr(26)

    // console.log("constructorParams for nodeRegistry", txDeployNodeRegistry.logs[0].data)


    const nodeReg = new web3.eth.Contract(nodeRegistryInfo.abi, nodeRegistryAddress)

    console.log("node 1")
    const nodeOneAccount = web3.eth.accounts.privateKeyToAccount(process.env.SRV_PK1)
    const signatureOne = util.signForRegister(process.env.NODE_URL + "/nd-1", 29, 3600, 2000, deployerAddress.address, nodeOneAccount.privateKey)
    const txDataOne = nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-1", 29, 3600, nodeOneAccount.address, 2000, signatureOne.v, signatureOne.r, signatureOne.s).encodeABI()
    const gasTxDataOne = await nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-1", 29, 3600, nodeOneAccount.address, 2000, signatureOne.v, signatureOne.r, signatureOne.s).estimateGas({ from: deployerAddress.address, value: "10000000000000000" })
    await sendTx(web3, txDataOne, nodeRegistryAddress, '10000000000000000', Math.floor(gasTxDataOne * 1.1), deployerAddress.privateKey)

    console.log("node 2")
    const nodeTwoAccount = web3.eth.accounts.privateKeyToAccount(process.env.SRV_PK2)
    const signatureTwo = util.signForRegister(process.env.NODE_URL + "/nd-2", 29, 3600, 2000, deployerAddress.address, nodeTwoAccount.privateKey)
    const txDataTwo = nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-2", 29, 3600, nodeTwoAccount.address, 2000, signatureTwo.v, signatureTwo.r, signatureTwo.s).encodeABI()
    const gasTxDataTwo = await nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-2", 29, 3600, nodeTwoAccount.address, 2000, signatureTwo.v, signatureTwo.r, signatureTwo.s).estimateGas({ from: deployerAddress.address, value: "10000000000000000" })
    await sendTx(web3, txDataTwo, nodeRegistryAddress, '10000000000000000', Math.floor(gasTxDataTwo * 1.1), deployerAddress.privateKey)

    console.log("node 3")
    const nodeThreeAccount = web3.eth.accounts.privateKeyToAccount(process.env.SRV_PK3)
    const signatureThree = util.signForRegister(process.env.NODE_URL + "/nd-3", 29, 3600, 2000, deployerAddress.address, nodeThreeAccount.privateKey)
    const txDataThree = nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-3", 29, 3600, nodeThreeAccount.address, 2000, signatureThree.v, signatureThree.r, signatureThree.s).encodeABI()
    const gasTxDataThree = await nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-3", 29, 3600, nodeThreeAccount.address, 2000, signatureThree.v, signatureThree.r, signatureThree.s).estimateGas({ from: deployerAddress.address, value: "10000000000000000" })
    await sendTx(web3, txDataThree, nodeRegistryAddress, '10000000000000000', Math.floor(gasTxDataThree * 1.1), deployerAddress.privateKey)

    console.log("node 4")
    const nodeFourAccount = web3.eth.accounts.privateKeyToAccount(process.env.SRV_PK4)
    const signatureFour = util.signForRegister(process.env.NODE_URL + "/nd-4", 29, 3600, 2000, deployerAddress.address, nodeFourAccount.privateKey)
    const txDataFour = nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-4", 29, 3600, signatureFour.address, 2000, signatureFour.v, signatureFour.r, signatureFour.s).encodeABI()
    const gasTxDataFour = await nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-4", 29, 3600, signatureFour.address, 2000, signatureFour.v, signatureFour.r, signatureFour.s).estimateGas({ from: deployerAddress.address, value: "10000000000000000" })
    await sendTx(web3, txDataFour, nodeRegistryAddress, '10000000000000000', Math.floor(gasTxDataFour * 1.1), deployerAddress.privateKey)

    console.log("node 5")
    const nodeFiveAccount = web3.eth.accounts.privateKeyToAccount(process.env.SRV_PK5)
    const signatureFive = util.signForRegister(process.env.NODE_URL + "/nd-5", 29, 3600, 2000, deployerAddress.address, nodeFiveAccount.privateKey)
    const txDataFive = nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-5", 29, 3600, nodeFiveAccount.address, 2000, signatureFive.v, signatureFive.r, signatureFive.s).encodeABI()
    const gasTxDataFive = await nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-5", 29, 3600, nodeFiveAccount.address, 2000, signatureFive.v, signatureFive.r, signatureFive.s).estimateGas({ from: deployerAddress.address, value: "10000000000000000" })
    await sendTx(web3, txDataFive, nodeRegistryAddress, '10000000000000000', gasTxDataFive, deployerAddress.privateKey)

    for (let i = 0; i < 5; i++) {
        const n = await nodeReg.methods.nodes(i).call()
        console.log("node", i)
        console.log("url", n.url)
        console.log("deposit", n.deposit)
        console.log("timeout", n.timeout)
        console.log("props", n.props)
        console.log("weight", n.weight)
        console.log("signer", n.signer)
        console.log("")
    }

    console.log("-----------")
    console.log("nodeRegistry-address", nodeRegistryAddress)
    console.log(await nodeReg.methods.registryId().call())
    console.log("constructorParams for nodeRegistry", txDeployNodeRegistry.logs[0].data)
}



deployGnosisSafeWallet()

