const Web3 = require("web3")
const fs = require("fs")
const util = require("../src/utils/utils")


let errorMapping = {}

const deployContract = async (web3, byteCode, privateKey) => {

    const transactionbBytecode = byteCode.startsWith("0x") ? byteCode : "0x" + byteCode

    const senderAddress = web3.eth.accounts.privateKeyToAccount(privateKey);
    await timeout(15000)
    const nonce = await web3.eth.getTransactionCount(senderAddress.address)

    const gasPrice = Math.floor(parseInt(await web3.eth.getGasPrice()) * 1.05)

    const transactionParams = {
        to: '',
        data: transactionbBytecode,
        from: senderAddress.address,
        nonce: nonce,
        gasPrice: gasPrice,
        gasLimit: 7000000
    };

    const signedTx = await web3.eth.accounts.signTransaction(transactionParams, privateKey);
    return (web3.eth.sendSignedTransaction(signedTx.rawTransaction)).catch(async (_) => {

        if (!errorMapping[byteCode]) {
            errorMapping[byteCode] = 1
        }
        else {
            errorMapping[byteCode]++
        }

        console.log("errorCounter", errorMapping[byteCode])
        console.log(_)

        if (errorMapping[byteCode] < 5) {
            const deployTx = await deployContract(web3, byteCode, privateKey)

            return deployTx
        }
    });
}

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


const sendTx = async (web3, data, targetAddress, value, gasLimit, privateKey) => {
    const senderAddress = web3.eth.accounts.privateKeyToAccount(privateKey);
    await timeout(15000)
    const nonce = await web3.eth.getTransactionCount(senderAddress.address)

    const gasPrice = Math.floor(parseInt(await web3.eth.getGasPrice()) * 1.05)

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
    return (web3.eth.sendSignedTransaction(signedTx.rawTransaction)).catch(async (_) => {

        if (!errorMapping[data]) {
            errorMapping[data] = 1
        }
        else {
            errorMapping[data]++
        }
        console.log("errorCounter", errorMapping[data])
        console.log(_)

        if (errorMapping[data] < 5) {
            const tx = await sendTx(web3, data, targetAddress, value, gasLimit, privateKey)
            errorMapping[data] = 0

            return tx

        }
    });
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
        const txDeployMasterCopy = await deployContract(web3, gnosisMasterInfo.bytecode, parityDevAccount.privateKey)
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
        [
            "0x1487319Fb1EaE24981A2862502d397e22232e6be",
            "0xF68A4703314E9a9cF65be688BD6d9b3B34594Ab4",
            "0xC2c2c26961e5560081003Bb157549916B21744Db",
            deployerAddress.address
        ],
        1,
        "0x0000000000000000000000000000000000000000",
        "0x00",
        "0x0000000000000000000000000000000000000000",
        0,
        "0x0000000000000000000000000000000000000000"
    ).encodeABI()

    const gasSetupTxDataProxy = await gnosisProxy.methods.setup(
        [
            "0x1487319Fb1EaE24981A2862502d397e22232e6be",
            "0xF68A4703314E9a9cF65be688BD6d9b3B34594Ab4",
            "0xC2c2c26961e5560081003Bb157549916B21744Db",
            deployerAddress.address
        ],
        1,
        "0x0000000000000000000000000000000000000000",
        "0x00",
        "0x0000000000000000000000000000000000000000",
        0,
        "0x0000000000000000000000000000000000000000"
    ).estimateGas()

    await sendTx(web3, setupTxDataProxy, deployedWalletAddress, 0, Math.floor(gasSetupTxDataProxy * 1.2), deployerAddress.privateKey)

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
    *  deployment of nodeRegistryData
    */

    const nodeRegistryDataInfo = JSON.parse(fs.readFileSync("build/contracts/NodeRegistryData.json"))

    //getting the txData 
    const txDataCallDeployNodeRegistryData = createCall.methods.performCreate(0, nodeRegistryDataInfo.bytecode).encodeABI()

    // getting the data for the gnosis-tx
    nonceWallet = await gnosisProxy.methods.nonce().call()

    const gastxDataCallDeployNodeRegistryData = await createCall.methods.performCreate(0, nodeRegistryDataInfo.bytecode).estimateGas()

    const calculatedTxHashNodeRegistryData = await gnosisProxy.methods.getTransactionHash(
        createCallContractAddress,                                  // address to,
        0,                                                          //uint256 value,
        txDataCallDeployNodeRegistryData,                           //bytes memory data,
        1,                                                          //Enum.Operation operation,
        Math.floor(gastxDataCallDeployNodeRegistryData * 1.25),     //uint256 safeTxGas,
        Math.floor(gastxDataCallDeployNodeRegistryData * 1.25),     //uint256 baseGas,
        0,                                                          //uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",               //address gasToken,
        "0x0000000000000000000000000000000000000000",               //address refundReceiver,
        nonceWallet                                                 //uint256 _nonce
    ).call()

    // signing
    const signatureDeployNodeRegistryData = util.signHash(deployerAddress.privateKey, calculatedTxHashNodeRegistryData)

    // exec
    const execNodeRegistryDataDeployTxData = gnosisProxy.methods.execTransaction(
        createCallContractAddress,                                  //address to,
        0,                                                          //uint256 value,
        txDataCallDeployNodeRegistryData,                           //bytes calldata data,
        1,                                                          //Enum.Operation operation,
        Math.floor(gastxDataCallDeployNodeRegistryData * 1.25),     //uint256 safeTxGas,
        Math.floor(gastxDataCallDeployNodeRegistryData * 1.25),     //uint256 baseGas,
        0,                                                          //uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",               //address gasToken,
        "0x0000000000000000000000000000000000000000",               //address payable refundReceiver,
        signatureDeployNodeRegistryData.signatureBytes              //bytes calldata signatures
    ).encodeABI()

    const gasExecNodeRegistryDataDeployTxData = await gnosisProxy.methods.execTransaction(
        createCallContractAddress,                                  //address to,
        0,                                                          //uint256 value,
        txDataCallDeployNodeRegistryData,                           //bytes calldata data,
        1,                                                          //Enum.Operation operation,
        Math.floor(gastxDataCallDeployNodeRegistryData * 1.25),     //uint256 safeTxGas,
        Math.floor(gastxDataCallDeployNodeRegistryData * 1.25),     //uint256 baseGas,
        0,                                                          //uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",               //address gasToken,
        "0x0000000000000000000000000000000000000000",               //address payable refundReceiver,
        signatureDeployNodeRegistryData.signatureBytes              //bytes calldata signatures
    ).estimateGas()


    const txDeployNodeRegistryData = await sendTx(web3, execNodeRegistryDataDeployTxData, deployedWalletAddress, 0, Math.floor(gasExecNodeRegistryDataDeployTxData * 1.25), deployerAddress.privateKey)

    const nodeRegistryDataAddress = "0x" + txDeployNodeRegistryData.logs[0].data.substr(26)

    console.log("nodeRegistryData-address", nodeRegistryDataAddress)
    const nodeRegistryData = new web3.eth.Contract(nodeRegistryDataInfo.abi, nodeRegistryDataAddress)

    /**
     * deployment of the node-Registry
     * 
     */

    const nodeRegistryInfo = JSON.parse(fs.readFileSync("build/contracts/NodeRegistryLogic.json"))
    //getting the txData 
    const txDataCallDeployNodeRegistry = createCall.methods.performCreate(0, nodeRegistryInfo.bytecode + web3.eth.abi.encodeParameters(['address', 'address', 'uint'], [blockHashRegistryAddress, nodeRegistryDataAddress, (process.env.MIN_DEPOSIT || '10000000000000000')]).substr(2)).encodeABI()

    const gasTxDataCallDeployNodeRegistry = await createCall.methods.performCreate(0, nodeRegistryInfo.bytecode + web3.eth.abi.encodeParameters(['address', 'address', 'uint'], [blockHashRegistryAddress, nodeRegistryDataAddress, (process.env.MIN_DEPOSIT || '10000000000000000')]).substr(2)).estimateGas()

    // getting the data for the gnosis-tx
    nonceWallet = await gnosisProxy.methods.nonce().call()

    const calculatedTxHashNodeReg = await gnosisProxy.methods.getTransactionHash(
        createCallContractAddress,                          // address to,
        0,                                                  // uint256 value,
        txDataCallDeployNodeRegistry,                       // bytes memory data,
        1,                                                  // Enum.Operation operation,
        Math.floor(gasTxDataCallDeployNodeRegistry * 1.2),  // uint256 safeTxGas,
        Math.floor(gasTxDataCallDeployNodeRegistry * 1.2),  // uint256 baseGas,
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
        Math.floor(gasTxDataCallDeployNodeRegistry * 1.2),  // uint256 safeTxGas,
        Math.floor(gasTxDataCallDeployNodeRegistry * 1.2),  // uint256 baseGas,
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
        Math.floor(gasTxDataCallDeployNodeRegistry * 1.2),  // uint256 safeTxGas,
        Math.floor(gasTxDataCallDeployNodeRegistry * 1.2),  // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address payable refundReceiver,
        signature.signatureBytes                            // bytes calldata signatures
    ).estimateGas()

    const txDeployNodeRegistry = await sendTx(web3, execNodeRegistryDeployTxData, deployedWalletAddress, 0, Math.floor(gasExecTxDataCallDeployNodeRegistry * 1.1), deployerAddress.privateKey)

    const nodeRegistryAddress = "0x" + txDeployNodeRegistry.logs[0].data.substr(26)
    console.log("NodeRegistryAddress", nodeRegistryAddress)

    const nodeReg = new web3.eth.Contract(nodeRegistryInfo.abi, nodeRegistryAddress)

    /**
     * setting up values inside the nodeRegistryData
    */

    // we did not set a token contract, so we have to deploy one

    let erc20Address
    const erc20tokenInfo = JSON.parse(fs.readFileSync("build/contracts/ERC20Wrapper.json"))

    if (!process.env.ERC20Token) {
        console.log("deploying ERC20 token")
        //getting the txData 
        const txCallDeployERC20 = createCall.methods.performCreate(0, erc20tokenInfo.bytecode).encodeABI()

        const gasTxDataCallDeployERC2020 = await createCall.methods.performCreate(0, erc20tokenInfo.bytecode).estimateGas()

        // getting the data for the gnosis-tx
        nonceWallet = await gnosisProxy.methods.nonce().call()

        const calculatedTxHashERC20 = await gnosisProxy.methods.getTransactionHash(
            createCallContractAddress,                          // address to,
            0,                                                  // uint256 value,
            txCallDeployERC20,                                  // bytes memory data,
            1,                                                  // Enum.Operation operation,
            Math.floor(gasTxDataCallDeployERC2020 * 1.1),       // uint256 safeTxGas,
            Math.floor(gasTxDataCallDeployERC2020 * 1.1),       // uint256 baseGas,
            0,                                                  // uint256 gasPrice,
            "0x0000000000000000000000000000000000000000",       // address gasToken,
            "0x0000000000000000000000000000000000000000",       // address refundReceiver,
            nonceWallet                                         // uint256 _nonce
        ).call()

        // signing
        const signatureERC20 = util.signHash(deployerAddress.privateKey, calculatedTxHashERC20)

        // exec
        const execERC20DeployTxData = gnosisProxy.methods.execTransaction(
            createCallContractAddress,                          // address to,
            0,                                                  // uint256 value,
            txCallDeployERC20,                                  // bytes calldata data,
            1,                                                  // Enum.Operation operation,
            Math.floor(gasTxDataCallDeployERC2020 * 1.1),       // uint256 safeTxGas,
            Math.floor(gasTxDataCallDeployERC2020 * 1.1),       // uint256 baseGas,
            0,                                                  // uint256 gasPrice,
            "0x0000000000000000000000000000000000000000",       // address gasToken,
            "0x0000000000000000000000000000000000000000",       // address payable refundReceiver,
            signatureERC20.signatureBytes                       // bytes calldata signatures
        ).encodeABI()

        const gasExecTxDataCallDeployERC20 = await gnosisProxy.methods.execTransaction(
            createCallContractAddress,                          // address to,
            0,                                                  // uint256 value,
            txCallDeployERC20,                                  // bytes calldata data,
            1,                                                  // Enum.Operation operation,
            Math.floor(gasTxDataCallDeployERC2020 * 1.1),       // uint256 safeTxGas,
            Math.floor(gasTxDataCallDeployERC2020 * 1.1),       // uint256 baseGas,
            0,                                                  // uint256 gasPrice,
            "0x0000000000000000000000000000000000000000",       // address gasToken,
            "0x0000000000000000000000000000000000000000",       // address payable refundReceiver,
            signatureERC20.signatureBytes                       // bytes calldata signatures
        ).estimateGas()

        const txDeployERC20 = await sendTx(web3, execERC20DeployTxData, deployedWalletAddress, 0, Math.floor(gasExecTxDataCallDeployERC20 * 1.1), deployerAddress.privateKey)
        erc20Address = "0x" + txDeployERC20.logs[0].data.substr(26)
        const erc20Contract = new web3.eth.Contract(erc20tokenInfo.abi, erc20Address)

        console.log("minting tokens")
        const txMintData = erc20Contract.methods.mint().encodeABI()
        const gasTxMint = await erc20Contract.methods.mint().estimateGas({ from: deployerAddress.address, value: '50000000000000000' })
        await sendTx(web3, txMintData, erc20Address, '50000000000000000', Math.floor(gasTxMint * 1.1), deployerAddress.privateKey)
    }
    else erc20Address = process.env.ERC20

    const erc20Contract = new web3.eth.Contract(erc20tokenInfo.abi, erc20Address)

    console.log("transfering tokens")
    // transfering tokens to the erc20 contract
    const tokenTransferTxData = erc20Contract.methods.transfer(deployedWalletAddress, '50000000000000000').encodeABI()
    const gasTokenTransfer = await erc20Contract.methods.transfer(deployedWalletAddress, '50000000000000000').estimateGas({ from: deployerAddress.address })
    await sendTx(web3, tokenTransferTxData, erc20Address, 0, Math.floor(gasTokenTransfer * 1.1), deployerAddress.privateKey)


    console.log("balance", await erc20Contract.methods.balanceOf(deployedWalletAddress).call())
    // allow tokens to be transfered by the contract
    const txApproveContract = erc20Contract.methods.approve(nodeRegistryAddress, '50000000000000000').encodeABI()
    const gasApproveToken = await erc20Contract.methods.approve(nodeRegistryAddress, '50000000000000000').estimateGas({ from: deployedWalletAddress })

    nonceWallet = await gnosisProxy.methods.nonce().call()

    const calcTxApproveToken = await gnosisProxy.methods.getTransactionHash(
        erc20Address,                                       // address to,
        0,                                                  // uint256 value,
        txApproveContract,                                          // bytes memory data,
        0,                                                  // Enum.Operation operation,
        Math.floor(gasApproveToken * 1.2),                     // uint256 safeTxGas,
        Math.floor(gasApproveToken * 1.2),                     // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        nonceWallet                                         // uint256 _nonce
    ).call()

    // signing
    const signatureApprove = util.signHash(deployerAddress.privateKey, calcTxApproveToken)

    const approveTokenTxData = gnosisProxy.methods.execTransaction(
        erc20Address,                                // address to,
        0,                                // uint256 value,
        txApproveContract,                                          // bytes memory data,
        0,                                                  // Enum.Operation operation,
        Math.floor(gasApproveToken * 1.2),                     // uint256 safeTxGas,
        Math.floor(gasApproveToken * 1.2),                     // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        signatureApprove.signatureBytes                     // bytes calldata signatures
    ).encodeABI()

    const gasTxApproveToken = await gnosisProxy.methods.execTransaction(
        erc20Address,                                // address to,
        0,                                // uint256 value,
        txApproveContract,                                          // bytes memory data,
        0,                                                  // Enum.Operation operation,
        Math.floor(gasApproveToken * 1.2),                     // uint256 safeTxGas,
        Math.floor(gasApproveToken * 1.2),                     // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        signatureApprove.signatureBytes                     // bytes calldata
    ).estimateGas({ from: deployedWalletAddress })
    await sendTx(web3, approveTokenTxData, deployedWalletAddress, 0, Math.floor(gasTxApproveToken * 1.3), deployerAddress.privateKey)
    console.log("allowance", await erc20Contract.methods.allowance(deployedWalletAddress, nodeRegistryAddress).call())

    /**
     * setting erc20 token
     */

    console.log("setting ERC20 token")

    const setERC20TokenTxData = await nodeRegistryData.methods.adminSetSupportedToken(erc20Address).encodeABI()

    const gasSetERC20Token = await nodeRegistryData.methods.adminSetSupportedToken(erc20Address).estimateGas({ from: deployedWalletAddress })

    // getting the data for the gnosis-tx
    nonceWallet = await gnosisProxy.methods.nonce().call()

    const calculatedTxHashSetERC20 = await gnosisProxy.methods.getTransactionHash(
        nodeRegistryDataAddress,                            // address to,
        0,                                                  // uint256 value,
        setERC20TokenTxData,                                // bytes memory data,
        0,                                                  // Enum.Operation operation,
        Math.floor(gasSetERC20Token * 1.2),                 // uint256 safeTxGas,
        Math.floor(gasSetERC20Token * 1.2),                 // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        nonceWallet                                         // uint256 _nonce
    ).call()

    // signing
    const signatureSetERC20 = util.signHash(deployerAddress.privateKey, calculatedTxHashSetERC20)

    // exec
    const execSetERC20TxData = gnosisProxy.methods.execTransaction(
        nodeRegistryDataAddress,                            // address to,
        0,                                                  // uint256 value,
        setERC20TokenTxData,                                // bytes calldata data,
        0,                                                  // Enum.Operation operation,
        Math.floor(gasSetERC20Token * 1.2),                 // uint256 safeTxGas,
        Math.floor(gasSetERC20Token * 1.2),                 // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address payable refundReceiver,
        signatureSetERC20.signatureBytes                    // bytes calldata signatures
    ).encodeABI()

    const gasExecTxDataSetERC20 = await gnosisProxy.methods.execTransaction(
        nodeRegistryDataAddress,                            // address to,
        0,                                                  // uint256 value,
        setERC20TokenTxData,                                // bytes calldata data,
        0,                                                  // Enum.Operation operation,
        Math.floor(gasSetERC20Token * 1.2),                 // uint256 safeTxGas,
        Math.floor(gasSetERC20Token * 1.2),                 // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address payable refundReceiver,
        signatureSetERC20.signatureBytes                    // bytes calldata signatures
    ).estimateGas({ from: deployedWalletAddress })

    await sendTx(web3, execSetERC20TxData, deployedWalletAddress, 0, Math.floor(gasExecTxDataSetERC20 * 1.1), deployerAddress.privateKey)

    /**
     * change owner to logic contract
    */
    console.log("changing owner of the data contract")

    const setLogicContractTxData = await nodeRegistryData.methods.adminSetLogic(nodeRegistryAddress).encodeABI()

    const gasSetLogicContract = await nodeRegistryData.methods.adminSetLogic(nodeRegistryAddress).estimateGas({ from: deployedWalletAddress })

    // getting the data for the gnosis-tx
    nonceWallet = await gnosisProxy.methods.nonce().call()

    const calculatedTxHashSetLogicContract = await gnosisProxy.methods.getTransactionHash(
        nodeRegistryDataAddress,                                // address to,
        0,                                                  // uint256 value,
        setLogicContractTxData,                             // bytes memory data,
        0,                                                  // Enum.Operation operation,
        Math.floor(gasSetLogicContract * 1.1),              // uint256 safeTxGas,
        Math.floor(gasSetLogicContract * 1.1),              // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        nonceWallet                                         // uint256 _nonce
    ).call()

    // signing
    const signatureSetLogicContract = util.signHash(deployerAddress.privateKey, calculatedTxHashSetLogicContract)

    // exec
    const execSetLogicData = gnosisProxy.methods.execTransaction(
        nodeRegistryDataAddress,                                // address to,
        0,                                                  // uint256 value,
        setLogicContractTxData,                             // bytes calldata data,
        0,                                                  // Enum.Operation operation,
        Math.floor(gasSetLogicContract * 1.1),              // uint256 safeTxGas,
        Math.floor(gasSetLogicContract * 1.1),              // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address payable refundReceiver,
        signatureSetLogicContract.signatureBytes            // bytes calldata signatures
    ).encodeABI()

    const gasExecTxDataSetLogicContract = await gnosisProxy.methods.execTransaction(
        nodeRegistryDataAddress,                                // address to,
        0,                                                  // uint256 value,
        setLogicContractTxData,                             // bytes calldata data,
        0,                                                  // Enum.Operation operation,
        Math.floor(gasSetLogicContract * 1.1),              // uint256 safeTxGas,
        Math.floor(gasSetLogicContract * 1.1),              // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address payable refundReceiver,
        signatureSetLogicContract.signatureBytes                    // bytes calldata signatures
    ).estimateGas({ from: deployedWalletAddress })

    await sendTx(web3, execSetLogicData, deployedWalletAddress, 0, Math.floor(gasExecTxDataSetLogicContract * 1.1), deployerAddress.privateKey)

    console.log("owner data", await nodeRegistryData.methods.ownerContract().call())
    console.log("nodeREg", nodeRegistryAddress)
    /**
     * onboarding nodes
    */
    console.log("node 1")
    const nodeOneAccount = web3.eth.accounts.privateKeyToAccount(process.env.SRV_PK1)
    const signatureOne = util.signForRegister(process.env.NODE_URL + "/nd-1", 29, 2000, deployedWalletAddress, nodeOneAccount.privateKey)

    const txDataOne = nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-1", 29, nodeOneAccount.address, 2000, "10000000000000000", signatureOne.v, signatureOne.r, signatureOne.s).encodeABI()
    const gasTxDataOne = await nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-1", 29, nodeOneAccount.address, 2000, "10000000000000000", signatureOne.v, signatureOne.r, signatureOne.s).estimateGas({ from: deployedWalletAddress })

    nonceWallet = await gnosisProxy.methods.nonce().call()

    const calcTxNodeOne = await gnosisProxy.methods.getTransactionHash(
        nodeRegistryAddress,                                // address to,
        0,                                // uint256 value,
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
        0,                                // uint256 value,
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
        0,                                // uint256 value,
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
    const signatureTwo = util.signForRegister(process.env.NODE_URL + "/nd-2", 29, 2000, deployedWalletAddress, nodeTwoAccount.privateKey)
    const txDataTwo = nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-2", 29, nodeTwoAccount.address, 2000, "10000000000000000", signatureTwo.v, signatureTwo.r, signatureTwo.s).encodeABI()
    const gasTxDataTwo = await nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-2", 29, nodeTwoAccount.address, 2000, "10000000000000000", signatureTwo.v, signatureTwo.r, signatureTwo.s).estimateGas({ from: deployedWalletAddress })
    nonceWallet = await gnosisProxy.methods.nonce().call()

    const calcTxNodeTwo = await gnosisProxy.methods.getTransactionHash(
        nodeRegistryAddress,                                // address to,
        0,                                // uint256 value,
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
        0,                                // uint256 value,
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
        0,                                // uint256 value,
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
    const signatureThree = util.signForRegister(process.env.NODE_URL + "/nd-3", 29, 2000, deployedWalletAddress, nodeThreeAccount.privateKey)
    const txDataThree = nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-3", 29, nodeThreeAccount.address, 2000, "10000000000000000", signatureThree.v, signatureThree.r, signatureThree.s).encodeABI()
    const gasTxDataThree = await nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-3", 29, nodeThreeAccount.address, 2000, "10000000000000000", signatureThree.v, signatureThree.r, signatureThree.s).estimateGas({ from: deployedWalletAddress })
    nonceWallet = await gnosisProxy.methods.nonce().call()

    const calcTxNodeThree = await gnosisProxy.methods.getTransactionHash(
        nodeRegistryAddress,                                // address to,
        0,                                // uint256 value,
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
        0,                                // uint256 value,
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
        0,                                // uint256 value,
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
    const signatureFour = util.signForRegister(process.env.NODE_URL + "/nd-4", 29, 2000, deployedWalletAddress, nodeFourAccount.privateKey)
    const txDataFour = nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-4", 29, signatureFour.address, 2000, "10000000000000000", signatureFour.v, signatureFour.r, signatureFour.s).encodeABI()
    const gasTxDataFour = await nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-4", 29, signatureFour.address, 2000, "10000000000000000", signatureFour.v, signatureFour.r, signatureFour.s).estimateGas({ from: deployedWalletAddress })
    nonceWallet = await gnosisProxy.methods.nonce().call()

    const calcTxNodeFour = await gnosisProxy.methods.getTransactionHash(
        nodeRegistryAddress,                                // address to,
        0,                                // uint256 value,
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
        0,                                // uint256 value,
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
        0,                                // uint256 value,
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
    const signatureFive = util.signForRegister(process.env.NODE_URL + "/nd-5", 29, 2000, deployedWalletAddress, nodeFiveAccount.privateKey)
    const txDataFive = nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-5", 29, nodeFiveAccount.address, 2000, "10000000000000000", signatureFive.v, signatureFive.r, signatureFive.s).encodeABI()
    const gasTxDataFive = await nodeReg.methods.registerNodeFor(process.env.NODE_URL + "/nd-5", 29, nodeFiveAccount.address, 2000, "10000000000000000", signatureFive.v, signatureFive.r, signatureFive.s).estimateGas({ from: deployedWalletAddress })
    nonceWallet = await gnosisProxy.methods.nonce().call()

    const calcTxNodeFive = await gnosisProxy.methods.getTransactionHash(
        nodeRegistryAddress,                                // address to,
        0,                                // uint256 value,
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
        0,                                // uint256 value,
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
        0,                                // uint256 value,
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

    console.log("removing deploy-address from multisig")
    const txDataRemove = gnosisProxy.methods.removeOwner("0xC2c2c26961e5560081003Bb157549916B21744Db", deployerAddress.address, 2).encodeABI()

    nonceWallet = await gnosisProxy.methods.nonce().call()
    const calcRemoveTxHash = await gnosisProxy.methods.getTransactionHash(
        deployedWalletAddress,                              // address to,
        0,                                                  // uint256 value,
        txDataRemove,                                       // bytes memory data,
        0,                                                  // Enum.Operation operation,
        0,                                             // uint256 safeTxGas,
        0,                                             // uint256 baseGas,
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
        0,                                             // uint256 safeTxGas,
        0,                                             // uint256 baseGas,
        0,                                                  // uint256 gasPrice,
        "0x0000000000000000000000000000000000000000",       // address gasToken,
        "0x0000000000000000000000000000000000000000",       // address refundReceiver,
        signatureRemove.signatureBytes                    // bytes calldata
    ).encodeABI()

    await sendTx(web3, txRemove, deployedWalletAddress, 0, Math.floor(250000 * 1.1), deployerAddress.privateKey)

    console.log("")

    for (let i = 0; i < 5; i++) {
        console.log("node", i)
        console.log(await nodeRegistryData.methods.getIn3NodeInformation(i).call())
    }

    console.log("-----------")
    console.log("nodeRegistryData-address", nodeRegistryDataAddress)
    console.log("nodeRegistryLogic-address", nodeRegistryAddress)
    console.log("ERC20-address", erc20Address)
    console.log("registryId", await nodeRegistryData.methods.registryId().call())
    console.log("-----------")
    console.log("multisig-address", deployedWalletAddress)
    console.log("owners", await gnosisProxy.methods.getOwners().call())

}

deployGnosisSafeWallet()
