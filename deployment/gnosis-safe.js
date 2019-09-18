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

    const nonce = await web3.eth.getTransactionCount(senderAddress.address)

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

const deployGnosisSafeWallet = async (deployPK) => {

    const web3 = new Web3("http://localhost:8545")
    const deployerAddress = web3.eth.accounts.privateKeyToAccount("0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7");


    /**
     * 
     * How to:
     *  - deploy createCall (maybe already done on goerli)
     *  - deploy and setup wallet (threshold one)
     *  - prepare deployment-tx for new contract (=> get ByteCode)
     *  - deploymetTx: to: createCall, data: performceCreate(uint,bytes) + delegateCall (operation: 1)
     */

    /**
    * setup Mastercopy
    */

    // parsing contract infos
    const gnosisMasterInfo = JSON.parse(fs.readFileSync("gnosis-safe-build/GnosisSafe.json"))

    const txDeployMasterCopy = await deployContract(web3, gnosisMasterInfo.bytecode, "0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7")

    const gnosisSafeMasterCopyAddress = txDeployMasterCopy.contractAddress

    const gnosisSafeContractMasterCopy = new web3.eth.Contract(gnosisMasterInfo.abi, gnosisSafeMasterCopyAddress)

    const setupTxData = gnosisSafeContractMasterCopy.methods.setup(
        [deployerAddress.address],
        1,
        "0x0000000000000000000000000000000000000000",
        "0x00",
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
        0,
        "0x0000000000000000000000000000000000000000"
    ).encodeABI()

    const txSetup = await sendTx(web3, setupTxData, gnosisSafeMasterCopyAddress, 0, deployerAddress.privateKey)

    /**
     * proxyFactory
     */

    const proxyFactoryInfo = JSON.parse(fs.readFileSync("gnosis-safe-build/ProxyFactory.json"))

    const txDeployProxyFactory = await deployContract(web3, proxyFactoryInfo.bytecode, "0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7")

    const proxyFactoryAddress = txDeployProxyFactory.contractAddress

    const proxyFactory = new web3.eth.Contract(proxyFactoryInfo.abi, proxyFactoryAddress)

    const txDataProxy = proxyFactory.methods.createProxy(gnosisSafeMasterCopyAddress, "0x00").encodeABI()
    const txSetupProxy = await sendTx(web3, txDataProxy, proxyFactoryAddress, 0, deployerAddress.privateKey)

    // console.log(txSetupProxy.logs[0])

    const deployedWalletAddress = "0x" + txSetupProxy.logs[0].data.substr(26)

    // console.log(txSetupProxy)
    console.log("deployedWallet", deployedWalletAddress)

    /**
     * pretend to be the gnosis safe
     */
    const gnosisProxy = new web3.eth.Contract(gnosisMasterInfo.abi, deployedWalletAddress)

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

    console.log(txsetupProxy)

    /**
     * proxy is ready
     */

    /**
     * deploying the createCall contract
     */

    const createCallInfo = JSON.parse(fs.readFileSync("gnosis-safe-build/CreateCall.json"))
    const txDeployCreateCall = await deployContract(web3, createCallInfo.bytecode, "0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7")

    const createCallContractAddress = txDeployCreateCall.contractAddress

    const createCall = new web3.eth.Contract(createCallInfo.abi, createCallContractAddress)

    console.log("createCallContract-Address", createCallContractAddress)

    /**
     * Testwise deployment of blockhashRegistry
     */

    const blockHashInfo = JSON.parse(fs.readFileSync("build/contracts/BlockhashRegistry.json"))

    //getting the txData 
    const txDataCallDeployBlockHash = createCall.methods.performCreate(0, blockHashInfo.bytecode).encodeABI()

    // getting the data for the gnosis-tx
    let nonceWallet = await web3.eth.getTransactionCount(deployedWalletAddress)

    console.log("nonceWallet", nonceWallet)

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
        nonceWallet - 1                                     //uint256 _nonce
    ).call()

    console.log("calculatedTxHash deployment blockhash-registry", calculatedTxHashBlockhash)
    // signing
    const signatureBlockhash = util.signHash("0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7", calculatedTxHashBlockhash)

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

    const txDeployBlockHash = await sendTx(web3, execBlockHashDeployTxData, deployedWalletAddress, 0, "0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7")

    console.log(txDeployBlockHash)
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
    nonceWallet = await web3.eth.getTransactionCount(deployedWalletAddress)

    console.log("nonceWallet", nonceWallet)

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
        nonceWallet - 1                                     //uint256 _nonce
    ).call()

    console.log("calculatedTxHash deployment blockhash-registry", calculatedTxHashNodeReg)
    // signing
    const signature = util.signHash("0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7", calculatedTxHashNodeReg)

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

    const txDeployNodeRegistry = await sendTx(web3, execNodeRegistryDeployTxData, deployedWalletAddress, 0, "0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7")

    console.log(txDeployNodeRegistry)
    const nodeRegistryAddress = "0x" + txDeployNodeRegistry.logs[0].data.substr(26)

    console.log("nodeRegistry-address", nodeRegistryAddress)

    const nodeReg = new web3.eth.Contract(nodeRegistryInfo.abi, nodeRegistryAddress)

    console.log("owner nodeRegistry:", await nodeReg.methods.unregisterKey().call())
    console.log("multisig-wallet", deployedWalletAddress)


}

deployGnosisSafeWallet()

