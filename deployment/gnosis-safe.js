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


    if (balanceDeployAccount < 500000000000000000 && balanceParityAccount > 500000000000000000) {
        console.log("transfering ether to", deployerAddress.address)
        await sendTx(web3, null, deployerAddress.address, "500000000000000000", 122000, parityDevAccount.privateKey)
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
     * the multisig wallet is now ready -> sending ether
     */

    console.log("sending ether to wallet")
    await sendTx(web3, null, deployedWalletAddress, "50000000000000000", 122000, deployerAddress.privateKey)

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
        createCallContractAddress,                          // address to,
        0,                                                  //uint256 value,
        txDataCallDeployBlockHash,                          //bytes memory data,
        1,                                                  //Enum.Operation operation,
        Math.floor(gastxDataCallDeployBlockHash * 1.25),    //uint256 safeTxGas,
        Math.floor(gastxDataCallDeployBlockHash * 1.25),    //uint256 baseGas,
        0,                                                  //uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       //address gasToken,
        "0x0000000000000000000000000000000000000000",       //address refundReceiver,
        nonceWallet                                         //uint256 _nonce
    ).call()

    // signing
    const signatureBlockhash = util.signHash(deployerAddress.privateKey, calculatedTxHashBlockhash)

    // exec
    const execBlockHashDeployTxData = gnosisProxy.methods.execTransaction(
        createCallContractAddress,                          //address to,
        0,                                                  //uint256 value,
        txDataCallDeployBlockHash,                          //bytes calldata data,
        1,                                                  //Enum.Operation operation,
        Math.floor(gastxDataCallDeployBlockHash * 1.25),    //uint256 safeTxGas,
        Math.floor(gastxDataCallDeployBlockHash * 1.25),    //uint256 baseGas,
        0,                                                  //uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       //address gasToken,
        "0x0000000000000000000000000000000000000000",       //address payable refundReceiver,
        signatureBlockhash.signatureBytes                   //bytes calldata signatures
    ).encodeABI()

    const gasExecBlockHashDeployTxData = await gnosisProxy.methods.execTransaction(
        createCallContractAddress,                          //address to,
        0,                                                  //uint256 value,
        txDataCallDeployBlockHash,                          //bytes calldata data,
        1,                                                  //Enum.Operation operation,
        Math.floor(gastxDataCallDeployBlockHash * 1.25),    //uint256 safeTxGas,
        Math.floor(gastxDataCallDeployBlockHash * 1.25),    //uint256 baseGas,
        0,                                                  //uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       //address gasToken,
        "0x0000000000000000000000000000000000000000",       //address payable refundReceiver,
        signatureBlockhash.signatureBytes                   //bytes calldata signatures
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

    // getting the data for the gnosis-tx
    nonceWallet = await gnosisProxy.methods.nonce().call()

    const calculatedTxHashNodeReg = await gnosisProxy.methods.getTransactionHash(
        createCallContractAddress,                          // address to,
        0,                                                  // uint256 value,
        txDataCallDeployNodeRegistry,                       // bytes memory data,
        1,                                                  // Enum.Operation operation,
        Math.floor(gasTxDataCallDeployNodeRegistry * 1.1),  // uint256 safeTxGas,
        Math.floor(gasTxDataCallDeployNodeRegistry * 1.1),  // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        nonceWallet                                         // uint256 _nonce
    ).call()

    // signing
    const signature = util.signHash(deployerAddress.privateKey, calculatedTxHashNodeReg)

    // exec
    const execNodeRegistryDeployTxData = gnosisProxy.methods.execTransaction(
        createCallContractAddress,                          // address to,
        0,                                                  // uint256 value,
        txDataCallDeployNodeRegistry,                       // bytes calldata data,
        1,                                                  // Enum.Operation operation,
        Math.floor(gasTxDataCallDeployNodeRegistry * 1.1),  // uint256 safeTxGas,
        Math.floor(gasTxDataCallDeployNodeRegistry * 1.1),  // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address payable refundReceiver,
        signature.signatureBytes                            // bytes calldata signatures
    ).encodeABI()

    const gasExecTxDataCallDeployNodeRegistry = await gnosisProxy.methods.execTransaction(
        createCallContractAddress,                          // address to,
        0,                                                  // uint256 value,
        txDataCallDeployNodeRegistry,                       // bytes calldata data,
        1,                                                  // Enum.Operation operation,
        Math.floor(gasTxDataCallDeployNodeRegistry * 1.1),  // uint256 safeTxGas,
        Math.floor(gasTxDataCallDeployNodeRegistry * 1.1),  // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address payable refundReceiver,
        signature.signatureBytes                            // bytes calldata signatures
    ).estimateGas()

    const txDeployNodeRegistry = await sendTx(web3, execNodeRegistryDeployTxData, deployedWalletAddress, 0, Math.floor(gasExecTxDataCallDeployNodeRegistry * 1.1), deployerAddress.privateKey)
    const nodeRegistryAddress = "0x" + txDeployNodeRegistry.logs[0].data.substr(26)

    const nodeReg = new web3.eth.Contract(nodeRegistryInfo.abi, nodeRegistryAddress)

    console.log("node 1")
    const nodeOneAccount = web3.eth.accounts.privateKeyToAccount(process.env.SRV_PK1)
    const signatureOne = util.signForRegister(process.env.NODE_URL + "/nd-1", 29, 3600, 2000, deployedWalletAddress, nodeOneAccount.privateKey)
    const txDataOne = nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-1", 29, 3600, nodeOneAccount.address, 2000, signatureOne.v, signatureOne.r, signatureOne.s).encodeABI()
    const gasTxDataOne = await nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-1", 29, 3600, nodeOneAccount.address, 2000, signatureOne.v, signatureOne.r, signatureOne.s).estimateGas({ from: deployedWalletAddress, value: "10000000000000000" })

    nonceWallet = await gnosisProxy.methods.nonce().call()

    const calcTxNodeOne = await gnosisProxy.methods.getTransactionHash(
        nodeRegistryAddress,                                // address to,
        "10000000000000000",                                // uint256 value,
        txDataOne,                                          // bytes memory data,
        0,                                                  // Enum.Operation operation,
        Math.floor(gasTxDataOne * 1.2),                     // uint256 safeTxGas,
        Math.floor(gasTxDataOne * 1.2),                     // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        nonceWallet                                         // uint256 _nonce
    ).call()

    // signing
    const signatureNodeOne = util.signHash(deployerAddress.privateKey, calcTxNodeOne)

    const registerNodeOneTxData = gnosisProxy.methods.execTransaction(
        nodeRegistryAddress,                                // address to,
        "10000000000000000",                                // uint256 value,
        txDataOne,                                          // bytes memory data,
        0,                                                  // Enum.Operation operation,
        Math.floor(gasTxDataOne * 1.2),                     // uint256 safeTxGas,
        Math.floor(gasTxDataOne * 1.2),                     // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        signatureNodeOne.signatureBytes                     // bytes calldata signatures
    ).encodeABI()

    const gasRegisterNodeOne = await gnosisProxy.methods.execTransaction(
        nodeRegistryAddress,                                // address to,
        "10000000000000000",                                // uint256 value,
        txDataOne,                                          // bytes memory data,
        0,                                                  // Enum.Operation operation,
        Math.floor(gasTxDataOne * 1.2),                     // uint256 safeTxGas,
        Math.floor(gasTxDataOne * 1.2),                     // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        signatureNodeOne.signatureBytes                     // bytes calldata
    ).estimateGas({ from: deployedWalletAddress })
    await sendTx(web3, registerNodeOneTxData, deployedWalletAddress, 0, Math.floor(gasRegisterNodeOne * 1.3), deployerAddress.privateKey)

    console.log("node 2")
    const nodeTwoAccount = web3.eth.accounts.privateKeyToAccount(process.env.SRV_PK2)
    const signatureTwo = util.signForRegister(process.env.NODE_URL + "/nd-2", 29, 3600, 2000, deployedWalletAddress, nodeTwoAccount.privateKey)
    const txDataTwo = nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-2", 29, 3600, nodeTwoAccount.address, 2000, signatureTwo.v, signatureTwo.r, signatureTwo.s).encodeABI()
    const gasTxDataTwo = await nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-2", 29, 3600, nodeTwoAccount.address, 2000, signatureTwo.v, signatureTwo.r, signatureTwo.s).estimateGas({ from: deployedWalletAddress, value: "10000000000000000" })
    nonceWallet = await gnosisProxy.methods.nonce().call()

    const calcTxNodeTwo = await gnosisProxy.methods.getTransactionHash(
        nodeRegistryAddress,                                // address to,
        "10000000000000000",                                // uint256 value,
        txDataTwo,                                          // bytes memory data,
        0,                                                  // Enum.Operation operation,
        Math.floor(gasTxDataTwo * 1.2),                     // uint256 safeTxGas,
        Math.floor(gasTxDataTwo * 1.2),                     // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        nonceWallet                                         // uint256 _nonce
    ).call()

    // signing
    const signatureNodeTwo = util.signHash(deployerAddress.privateKey, calcTxNodeTwo)

    const registerNodeTwoTxData = gnosisProxy.methods.execTransaction(
        nodeRegistryAddress,                                // address to,
        "10000000000000000",                                // uint256 value,
        txDataTwo,                                          // bytes memory data,
        0,                                                  // Enum.Operation operation,
        Math.floor(gasTxDataTwo * 1.2),                     // uint256 safeTxGas,
        Math.floor(gasTxDataTwo * 1.2),                     // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        signatureNodeTwo.signatureBytes                     // bytes calldata signatures
    ).encodeABI()

    const gasRegisterNodeTwo = await gnosisProxy.methods.execTransaction(
        nodeRegistryAddress,                                // address to,
        "10000000000000000",                                // uint256 value,
        txDataTwo,                                          // bytes memory data,
        0,                                                  // Enum.Operation operation,
        Math.floor(gasTxDataTwo * 1.2),                     // uint256 safeTxGas,
        Math.floor(gasTxDataTwo * 1.2),                     // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        signatureNodeTwo.signatureBytes                     // bytes calldata
    ).estimateGas({ from: deployedWalletAddress })
    await sendTx(web3, registerNodeTwoTxData, deployedWalletAddress, 0, Math.floor(gasRegisterNodeTwo * 1.3), deployerAddress.privateKey)


    console.log("node 3")
    const nodeThreeAccount = web3.eth.accounts.privateKeyToAccount(process.env.SRV_PK3)
    const signatureThree = util.signForRegister(process.env.NODE_URL + "/nd-3", 29, 3600, 2000, deployedWalletAddress, nodeThreeAccount.privateKey)
    const txDataThree = nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-3", 29, 3600, nodeThreeAccount.address, 2000, signatureThree.v, signatureThree.r, signatureThree.s).encodeABI()
    const gasTxDataThree = await nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-3", 29, 3600, nodeThreeAccount.address, 2000, signatureThree.v, signatureThree.r, signatureThree.s).estimateGas({ from: deployedWalletAddress, value: "10000000000000000" })
    nonceWallet = await gnosisProxy.methods.nonce().call()

    const calcTxNodeThree = await gnosisProxy.methods.getTransactionHash(
        nodeRegistryAddress,                                // address to,
        "10000000000000000",                                // uint256 value,
        txDataThree,                                        // bytes memory data,
        0,                                                  // Enum.Operation operation,
        Math.floor(gasTxDataThree * 1.2),                   // uint256 safeTxGas,
        Math.floor(gasTxDataThree * 1.2),                   // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        nonceWallet                                         // uint256 _nonce
    ).call()

    // signing
    const signatureNodeThree = util.signHash(deployerAddress.privateKey, calcTxNodeThree)

    const registerNodeThreeTxData = gnosisProxy.methods.execTransaction(
        nodeRegistryAddress,                                // address to,
        "10000000000000000",                                // uint256 value,
        txDataThree,                                        // bytes memory data,
        0,                                                  // Enum.Operation operation,
        Math.floor(gasTxDataThree * 1.2),                   // uint256 safeTxGas,
        Math.floor(gasTxDataThree * 1.2),                   // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        signatureNodeThree.signatureBytes                   // bytes calldata signatures
    ).encodeABI()

    const gasRegisterNodeThree = await gnosisProxy.methods.execTransaction(
        nodeRegistryAddress,                                // address to,
        "10000000000000000",                                // uint256 value,
        txDataThree,                                        // bytes memory data,
        0,                                                  // Enum.Operation operation,
        Math.floor(gasTxDataThree * 1.2),                   // uint256 safeTxGas,
        Math.floor(gasTxDataThree * 1.2),                   // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        signatureNodeThree.signatureBytes                   // bytes calldata
    ).estimateGas({ from: deployedWalletAddress })
    await sendTx(web3, registerNodeThreeTxData, deployedWalletAddress, 0, Math.floor(gasRegisterNodeThree * 1.3), deployerAddress.privateKey)

    console.log("node 4")
    const nodeFourAccount = web3.eth.accounts.privateKeyToAccount(process.env.SRV_PK4)
    const signatureFour = util.signForRegister(process.env.NODE_URL + "/nd-4", 29, 3600, 2000, deployedWalletAddress, nodeFourAccount.privateKey)
    const txDataFour = nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-4", 29, 3600, signatureFour.address, 2000, signatureFour.v, signatureFour.r, signatureFour.s).encodeABI()
    const gasTxDataFour = await nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-4", 29, 3600, signatureFour.address, 2000, signatureFour.v, signatureFour.r, signatureFour.s).estimateGas({ from: deployedWalletAddress, value: "10000000000000000" })
    nonceWallet = await gnosisProxy.methods.nonce().call()

    const calcTxNodeFour = await gnosisProxy.methods.getTransactionHash(
        nodeRegistryAddress,                                // address to,
        "10000000000000000",                                // uint256 value,
        txDataFour,                                         // bytes memory data,
        0,                                                  // Enum.Operation operation,
        Math.floor(gasTxDataFour * 1.2),                    // uint256 safeTxGas,
        Math.floor(gasTxDataFour * 1.2),                    // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        nonceWallet                                         // uint256 _nonce
    ).call()

    // signing
    const signatureNodeFour = util.signHash(deployerAddress.privateKey, calcTxNodeFour)

    const registerNodeFourTxData = gnosisProxy.methods.execTransaction(
        nodeRegistryAddress,                                // address to,
        "10000000000000000",                                // uint256 value,
        txDataFour,                                         // bytes memory data,
        0,                                                  // Enum.Operation operation,
        Math.floor(gasTxDataFour * 1.2),                    // uint256 safeTxGas,
        Math.floor(gasTxDataFour * 1.2),                    // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        signatureNodeFour.signatureBytes                    // bytes calldata
    ).encodeABI()

    const gasRegisterNodeFour = await gnosisProxy.methods.execTransaction(
        nodeRegistryAddress,                                // address to,
        "10000000000000000",                                // uint256 value,
        txDataFour,                                         // bytes memory data,
        0,                                                  // Enum.Operation operation,
        Math.floor(gasTxDataFour * 1.2),                    // uint256 safeTxGas,
        Math.floor(gasTxDataFour * 1.2),                    // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        signatureNodeFour.signatureBytes                    // bytes calldata
    ).estimateGas({ from: deployedWalletAddress })
    await sendTx(web3, registerNodeFourTxData, deployedWalletAddress, 0, Math.floor(gasRegisterNodeFour * 1.3), deployerAddress.privateKey)


    console.log("node 5")
    const nodeFiveAccount = web3.eth.accounts.privateKeyToAccount(process.env.SRV_PK5)
    const signatureFive = util.signForRegister(process.env.NODE_URL + "/nd-5", 29, 3600, 2000, deployedWalletAddress, nodeFiveAccount.privateKey)
    const txDataFive = nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-5", 29, 3600, nodeFiveAccount.address, 2000, signatureFive.v, signatureFive.r, signatureFive.s).encodeABI()
    const gasTxDataFive = await nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-5", 29, 3600, nodeFiveAccount.address, 2000, signatureFive.v, signatureFive.r, signatureFive.s).estimateGas({ from: deployedWalletAddress, value: "10000000000000000" })
    nonceWallet = await gnosisProxy.methods.nonce().call()

    const calcTxNodeFive = await gnosisProxy.methods.getTransactionHash(
        nodeRegistryAddress,                                // address to,
        "10000000000000000",                                // uint256 value,
        txDataFive,                                         // bytes memory data,
        0,                                                  // Enum.Operation operation,
        Math.floor(gasTxDataFive * 1.2),                    // uint256 safeTxGas,
        Math.floor(gasTxDataFive * 1.2),                    // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        nonceWallet                                         // uint256 _nonce
    ).call()

    // signing
    const signatureNodeFive = util.signHash(deployerAddress.privateKey, calcTxNodeFive)

    const registerNodeFiveTxData = gnosisProxy.methods.execTransaction(
        nodeRegistryAddress,                                // address to,
        "10000000000000000",                                // uint256 value,
        txDataFive,                                         // bytes memory data,
        0,                                                  // Enum.Operation operation,
        Math.floor(gasTxDataFive * 1.2),                    // uint256 safeTxGas,
        Math.floor(gasTxDataFive * 1.2),                    // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        signatureNodeFive.signatureBytes                    // bytes calldata
    ).encodeABI()

    const gasRegisterNodeFive = await gnosisProxy.methods.execTransaction(
        nodeRegistryAddress,                                // address to,
        "10000000000000000",                                // uint256 value,
        txDataFive,                                         // bytes memory data,
        0,                                                  // Enum.Operation operation,
        Math.floor(gasTxDataFive * 1.2),                    // uint256 safeTxGas,
        Math.floor(gasTxDataFive * 1.2),                    // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        signatureNodeFive.signatureBytes                    // bytes calldata
    ).estimateGas({ from: deployedWalletAddress })
    await sendTx(web3, registerNodeFiveTxData, deployedWalletAddress, 0, Math.floor(gasRegisterNodeFive * 1.3), deployerAddress.privateKey)

    /**
     * adding keys to multisig
     */

    console.log("adding 0xc2c2c26961e5560081003bb157549916b21744db")
    const txDataKeyOne = gnosisProxy.methods.addOwnerWithThreshold("0xc2c2c26961e5560081003bb157549916b21744db", 1).encodeABI()

    nonceWallet = await gnosisProxy.methods.nonce().call()
    const calcTxKeyOne = await gnosisProxy.methods.getTransactionHash(
        deployedWalletAddress,                              // address to,
        0,                                                  // uint256 value,
        txDataKeyOne,                                       // bytes memory data,
        0,                                                  // Enum.Operation operation,
        500000,                                             // uint256 safeTxGas,
        500000,                                             // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        nonceWallet                                         // uint256 _nonce
    ).call()

    // signing
    const signatureKeyOne = util.signHash(deployerAddress.privateKey, calcTxKeyOne)

    const txKeyOne = gnosisProxy.methods.execTransaction(
        deployedWalletAddress,                              // address to,
        0,                                                  // uint256 value,
        txDataKeyOne,                                       // bytes memory data,
        0,                                                  // Enum.Operation operation,
        500000,                                             // uint256 safeTxGas,
        500000,                                             // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        signatureKeyOne.signatureBytes                    // bytes calldata
    ).encodeABI()

    /*  const gasKeyOne = await gnosisProxy.methods.execTransaction(
          deployedWalletAddress,                              // address to,
          0,                                                  // uint256 value,
          txDataKeyOne,                                       // bytes memory data,
          0,                                                  // Enum.Operation operation,
          500000,                                             // uint256 safeTxGas,
          500000,                                             // uint256 baseGas,
          0,                                                  // uint256 gasPrice,
          "0x0000000000000000000000000000000000000000",       // address gasToken,
          "0x0000000000000000000000000000000000000000",       // address refundReceiver,
          signatureKeyOne.signatureBytes                    // bytes calldata
      ).estimateGas({ from: deployerAddress.address })
      */
    await sendTx(web3, txKeyOne, deployedWalletAddress, 0, Math.floor(1050403 * 1.1), deployerAddress.privateKey)

    console.log("adding 0xf68a4703314e9a9cf65be688bd6d9b3b34594ab4")
    const txDataKeyTwo = gnosisProxy.methods.addOwnerWithThreshold("0xf68a4703314e9a9cf65be688bd6d9b3b34594ab4", 1).encodeABI()

    nonceWallet = await gnosisProxy.methods.nonce().call()
    const calcTxKeyTwo = await gnosisProxy.methods.getTransactionHash(
        deployedWalletAddress,                              // address to,
        0,                                                  // uint256 value,
        txDataKeyTwo,                                       // bytes memory data,
        0,                                                  // Enum.Operation operation,
        750000,                                             // uint256 safeTxGas,
        750000,                                             // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        nonceWallet                                         // uint256 _nonce
    ).call()

    // signing
    const signatureKeyTwo = util.signHash(deployerAddress.privateKey, calcTxKeyTwo)

    const txKeyTwo = gnosisProxy.methods.execTransaction(
        deployedWalletAddress,                              // address to,
        0,                                                  // uint256 value,
        txDataKeyTwo,                                       // bytes memory data,
        0,                                                  // Enum.Operation operation,
        750000,                                             // uint256 safeTxGas,
        750000,                                             // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        signatureKeyTwo.signatureBytes                    // bytes calldata
    ).encodeABI()

    /*
    const gasKeyTwo = await gnosisProxy.methods.execTransaction(
        deployedWalletAddress,                              // address to,
        0,                                                  // uint256 value,
        txDataKeyTwo,                                       // bytes memory data,
        0,                                                  // Enum.Operation operation,
        750000,                                             // uint256 safeTxGas,
        750000,                                             // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        signatureKeyTwo.signatureBytes                    // bytes calldata
    ).estimateGas({ from: deployerAddress.address })
    */

    //& console.log(Math.floor(gasKeyTwo * 1.3))
    await sendTx(web3, txKeyTwo, deployedWalletAddress, 0, Math.floor(1050403 * 1.1), deployerAddress.privateKey)

    console.log("adding 0x1487319Fb1EaE24981A2862502d397e22232e6be")
    const txDataKeyThree = gnosisProxy.methods.addOwnerWithThreshold("0x1487319Fb1EaE24981A2862502d397e22232e6be", 1).encodeABI()

    nonceWallet = await gnosisProxy.methods.nonce().call()
    const calcTxKeyThree = await gnosisProxy.methods.getTransactionHash(
        deployedWalletAddress,                              // address to,
        0,                                                  // uint256 value,
        txDataKeyThree,                                       // bytes memory data,
        0,                                                  // Enum.Operation operation,
        750000,                                             // uint256 safeTxGas,
        750000,                                             // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        nonceWallet                                         // uint256 _nonce
    ).call()

    // signing
    const signatureKeyThree = util.signHash(deployerAddress.privateKey, calcTxKeyThree)

    const txKeyThree = gnosisProxy.methods.execTransaction(
        deployedWalletAddress,                              // address to,
        0,                                                  // uint256 value,
        txDataKeyThree,                                       // bytes memory data,
        0,                                                  // Enum.Operation operation,
        750000,                                             // uint256 safeTxGas,
        750000,                                             // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        signatureKeyThree.signatureBytes                    // bytes calldata
    ).encodeABI()

    /*
    const gasKeyThree = await gnosisProxy.methods.execTransaction(
        deployedWalletAddress,                              // address to,
        0,                                                  // uint256 value,
        txDataKeyThree,                                       // bytes memory data,
        0,                                                  // Enum.Operation operation,
        750000,                                             // uint256 safeTxGas,
        750000,                                             // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        signatureKeyThree.signatureBytes                    // bytes calldata
    ).estimateGas({ from: deployerAddress.address })
    */
    await sendTx(web3, txKeyThree, deployedWalletAddress, 0, Math.floor(1050403 * 1.1), deployerAddress.privateKey)

    console.log("removing deploy-address from multisig")
    const txDataRemove = gnosisProxy.methods.removeOwner("0xC2c2c26961e5560081003Bb157549916B21744Db", deployerAddress.address, 2).encodeABI()

    nonceWallet = await gnosisProxy.methods.nonce().call()
    const calcRemoveTxHash = await gnosisProxy.methods.getTransactionHash(
        deployedWalletAddress,                              // address to,
        0,                                                  // uint256 value,
        txDataRemove,                                       // bytes memory data,
        0,                                                  // Enum.Operation operation,
        5000000,                                             // uint256 safeTxGas,
        5000000,                                             // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        nonceWallet                                         // uint256 _nonce
    ).call()

    // signing
    const signatureRemove = util.signHash(deployerAddress.privateKey, calcRemoveTxHash)

    const txRemove = gnosisProxy.methods.execTransaction(
        deployedWalletAddress,                              // address to,
        0,                                                  // uint256 value,
        txDataRemove,                                       // bytes memory data,
        0,                                                  // Enum.Operation operation,
        5000000,                                             // uint256 safeTxGas,
        5000000,                                             // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        signatureRemove.signatureBytes                    // bytes calldata
    ).encodeABI()

    /*
    const gasRemove = await gnosisProxy.methods.execTransaction(
        deployedWalletAddress,                              // address to,
        0,                                                  // uint256 value,
        txDataRemove,                                       // bytes memory data,
        0,                                                  // Enum.Operation operation,
        5000000,                                             // uint256 safeTxGas,
        5000000,                                             // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        signatureRemove.signatureBytes                    // bytes calldata
    ).estimateGas({ from: deployerAddress.address })
    */
    const rtx = await sendTx(web3, txRemove, deployedWalletAddress, 0, Math.floor(6664706 * 1.1), deployerAddress.privateKey)

    console.log("")
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

    console.log("-----------")
    console.log("multisig-address", deployedWalletAddress)
    console.log("owners", await gnosisProxy.methods.getOwners().call())

}

deployGnosisSafeWallet()
