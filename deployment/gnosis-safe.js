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

const sendTx = async (web3, data, targetAddress, value, privateKey) => {
    const senderAddress = web3.eth.accounts.privateKeyToAccount(privateKey);

    const nonce = await web3.eth.getTransactionCount(senderAddress.address, "pending")

    const gasPrice = await web3.eth.getGasPrice()

    const transactionParams = {
        to: targetAddress,
        data: data,
        from: senderAddress.address,
        nonce: nonce,
        gasPrice: gasPrice,
        gasLimit: 7000000,
        value: value || 0
    };

    const signedTx = await web3.eth.accounts.signTransaction(transactionParams, privateKey);
    return (web3.eth.sendSignedTransaction(signedTx.rawTransaction));
}

const deployGnosisSafeWallet = async () => {

    const web3 = new Web3(process.env.RPCURL)

    /**
    * setup Mastercopy
    */

    // either use the provided privateKey or the PARITY-dev account (DO NOT USE IN PRO)
    const deployerAddress = web3.eth.accounts.privateKeyToAccount(process.env.SRV_OWNER);

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

    console.log("setting up proxy contract")
    const txSetupProxy = await sendTx(web3, txDataProxy, gnosisProxyFactoryAddress, 0, deployerAddress.privateKey)

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

    const txsetupProxy = await sendTx(web3, setupTxDataProxy, deployedWalletAddress, 0, deployerAddress.privateKey)

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

    const calculatedTxHashBlockhash = await gnosisProxy.methods.getTransactionHash(
        createCallContractAddress,                      // address to,
        0,                                              //uint256 value,
        txDataCallDeployBlockHash,                      //bytes memory data,
        1,                                              //Enum.Operation operation,
        1000000,                                        //uint256 safeTxGas,
        1000000,                                        //uint256 baseGas,
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
        1000000,                                        //uint256 safeTxGas,
        1000000,                                        //uint256 baseGas,
        0,                                              //uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",   //address gasToken,
        "0x0000000000000000000000000000000000000000",   //address payable refundReceiver,
        signatureBlockhash.signatureBytes                                   //bytes calldata signatures
    ).encodeABI()

    const txDeployBlockHash = await sendTx(web3, execBlockHashDeployTxData, deployedWalletAddress, 0, deployerAddress.privateKey)

    const blockHashRegistryAddress = "0x" + txDeployBlockHash.logs[1].data.substr(26)

    console.log("blockHashRegistry-address", blockHashRegistryAddress)
    /**
     * deployment of the node-Registry
     * 
     */

    const nodeRegistryInfo = JSON.parse(fs.readFileSync("build/contracts/NodeRegistry.json"))
    //getting the txData 
    const txDataCallDeployNodeRegistry = createCall.methods.performCreate(0, nodeRegistryInfo.bytecode + web3.eth.abi.encodeParameters(['address'], [blockHashRegistryAddress]).substr(2)).encodeABI()

    // getting the data for the gnosis-tx
    nonceWallet = await gnosisProxy.methods.nonce().call()

    const calculatedTxHashNodeReg = await gnosisProxy.methods.getTransactionHash(
        createCallContractAddress,                      // address to,
        0,                                              //uint256 value,
        txDataCallDeployNodeRegistry,                      //bytes memory data,
        1,                                              //Enum.Operation operation,
        4000000,                                        //uint256 safeTxGas,
        4000000,                                        //uint256 baseGas,
        0,                                              //uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",   //address gasToken,
        "0x0000000000000000000000000000000000000000",   //address refundReceiver,
        nonceWallet                                    //uint256 _nonce
    ).call()

    // signing
    const signature = util.signHash(deployerAddress.privateKey, calculatedTxHashNodeReg)

    // exec

    const execNodeRegistryDeployTxData = gnosisProxy.methods.execTransaction(
        createCallContractAddress,                      //address to,
        0,                                              //uint256 value,
        txDataCallDeployNodeRegistry,                      //bytes calldata data,
        1,                                              //Enum.Operation operation,
        4000000,                                        //uint256 safeTxGas,
        4000000,                                        //uint256 baseGas,
        0,                                              //uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",   //address gasToken,
        "0x0000000000000000000000000000000000000000",   //address payable refundReceiver,
        signature.signatureBytes                                   //bytes calldata signatures
    ).encodeABI()

    const txDeployNodeRegistry = await sendTx(web3, execNodeRegistryDeployTxData, deployedWalletAddress, 0, deployerAddress.privateKey)

    const nodeRegistryAddress = "0x" + txDeployNodeRegistry.logs[0].data.substr(26)

    // console.log("constructorParams for nodeRegistry", txDeployNodeRegistry.logs[0].data)


    const nodeReg = new web3.eth.Contract(nodeRegistryInfo.abi, nodeRegistryAddress)

    console.log("node 1")
    const nodeOneAccount = web3.eth.accounts.privateKeyToAccount(process.env.SRV_PK1)

    const signatureOne = util.signForRegister(process.env.NODE_URL + "/nd-1", 29, 3600, 2000, deployerAddress.address, nodeOneAccount.privateKey)

    const txDataOne = nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-1", 29, 3600, nodeOneAccount.address, 2000, signatureOne.v, signatureOne.r, signatureOne.s).encodeABI()
    await sendTx(web3, txDataOne, nodeRegistryAddress, '10000000000000000', deployerAddress.privateKey)

    console.log("node 2")
    const nodeTwoAccount = web3.eth.accounts.privateKeyToAccount(process.env.SRV_PK2)

    const signatureTwo = util.signForRegister(process.env.NODE_URL + "/nd-2", 29, 3600, 2000, deployerAddress.address, nodeTwoAccount.privateKey)

    const txDataTwo = nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-2", 29, 3600, nodeTwoAccount.address, 2000, signatureTwo.v, signatureTwo.r, signatureTwo.s).encodeABI()
    await sendTx(web3, txDataTwo, nodeRegistryAddress, '10000000000000000', deployerAddress.privateKey)

    console.log("node 3")
    const nodeThreeAccount = web3.eth.accounts.privateKeyToAccount(process.env.SRV_PK3)

    const signatureThree = util.signForRegister(process.env.NODE_URL + "/nd-3", 29, 3600, 2000, deployerAddress.address, nodeThreeAccount.privateKey)

    const txDataThree = nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-3", 29, 3600, nodeThreeAccount.address, 2000, signatureThree.v, signatureThree.r, signatureThree.s).encodeABI()
    await sendTx(web3, txDataThree, nodeRegistryAddress, '10000000000000000', deployerAddress.privateKey)

    console.log("node 4")
    const nodeFourAccount = web3.eth.accounts.privateKeyToAccount(process.env.SRV_PK4)

    const signatureFour = util.signForRegister(process.env.NODE_URL + "/nd-4", 29, 3600, 2000, deployerAddress.address, nodeFourAccount.privateKey)

    const txDataFour = nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-4", 29, 3600, signatureFour.address, 2000, signatureFour.v, signatureFour.r, signatureFour.s).encodeABI()
    await sendTx(web3, txDataFour, nodeRegistryAddress, '10000000000000000', deployerAddress.privateKey)

    console.log("node 5")
    const nodeFiveAccount = web3.eth.accounts.privateKeyToAccount(process.env.SRV_PK5)

    const signatureFive = util.signForRegister(process.env.NODE_URL + "/nd-5", 29, 3600, 2000, deployerAddress.address, nodeFiveAccount.privateKey)

    const txDataFive = nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-5", 29, 3600, nodeFiveAccount.address, 2000, signatureFive.v, signatureFive.r, signatureFive.s).encodeABI()
    await sendTx(web3, txDataFive, nodeRegistryAddress, '10000000000000000', deployerAddress.privateKey)

    console.log("-----------")
    console.log("nodeRegistry-address", nodeRegistryAddress)
    console.log(await nodeReg.methods.registryId().call())
    console.log("constructorParams for nodeRegistry", txDeployNodeRegistry.logs[0].data)
}



deployGnosisSafeWallet()

