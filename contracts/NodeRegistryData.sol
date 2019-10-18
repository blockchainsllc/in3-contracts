/***********************************************************
* This file is part of the Slock.it IoT Layer.             *
* The Slock.it IoT Layer contains:                         *
*   - USN (Universal Sharing Network)                      *
*   - INCUBED (Trustless INcentivized remote Node Network) *
************************************************************
* Copyright (C) 2016 - 2018 Slock.it GmbH                  *
* All Rights Reserved.                                     *
************************************************************
* You may use, distribute and modify this code under the   *
* terms of the license contract you have concluded with    *
* Slock.it GmbH.                                           *
* For information about liability, maintenance etc. also   *
* refer to the contract concluded with Slock.it GmbH.      *
************************************************************
* For more information, please refer to https://slock.it   *
* For questions, please contact info@slock.it              *
***********************************************************/

pragma solidity 0.5.10;
pragma experimental ABIEncoderV2;

import "./ERC20Interface.sol";


/// @title Registry for IN3-nodes
contract NodeRegistryData {


    /// node has been registered
    event LogNodeRegistered(string url, uint props, address signer, uint deposit);

    /// a Node is removed
    event LogNodeRemoved(string url, address signer);

    /// a node has been updated
    event LogNodeUpdated(string url, uint props, address signer, uint deposit);

    /// the ownership of a node changed
    event LogOwnershipChanged(address signer, address oldOwner, address newOwner);

    /// a user received its deposit back
    event LogDepositReturned(address nodeOwner, uint amount);

    struct In3Node {
        string url;                         /// the url of the node

        uint deposit;                       /// stored deposit

        uint64 registerTime;                /// timestamp when the node was registered
        uint128 props;                      /// a list of properties-flags representing the capabilities of the node

        uint64 weight;                      ///  the flag for (future) incentivisation
        address signer;                     /// the signer for requests

        bytes32 proofHash;                  /// keccak(deposit,timeout,registerTime,props,signer,url)
    }

    /// information of a in3-node owner
    struct SignerInformation {
        uint64 lockedTime;                  /// timestamp until the deposit of an in3-node can not be withdrawn after the node was removed
        address owner;                      /// the owner of the node

        uint stage;                       /// state of the address

        uint depositAmount;                 /// amount of deposit to be locked, used only after a node had been removed

        uint index;                         /// current index-position of the node in the node-array
    }

    /// information of an url
    struct UrlInformation {
        bool used;                          /// flag whether the url is currently used
        address signer;                     /// address of the owner of the url
    }

    /// node list of incubed nodes
    In3Node[] public nodes;

    /// id used for signing in3-requests and in order to prevent cross-chain convicts
    /// in case a fork happens there is the possibility that a node can be convicted on the other fork,
    /// because they would use the very same registryId. Nevertheless we cannot change the registryId.
    /// So in case of a fork a node should chose one of the forks and unregister his nodes on the others.
    /// In this case it is also recommend to not sign requests until the node get his deposits from the forked contracts
    bytes32 public registryId;

    uint public timeout;

    ERC20Interface public supportedToken;

    /// add your additional storage here. If you add information before this line you will break in3 nodelist

    /// Logic-contract that is allowed to call certain functions within the smart contract
    address public ownerContract;

    /// mapping for information of the owner
    mapping (address => SignerInformation) public signerIndex;

    /// mapping for the information of the url
    /// can be used to access the SignerInformation-struct
    mapping (bytes32 => UrlInformation) public urlIndex;

    /// mapping for convicts: sender => convictHash => block number when the convict-tx had been mined)
    mapping (address => mapping(bytes32 => uint)) public convictMapping;

    /// version: major minor fork(000) date(yyyy/mm/dd)
    uint constant public VERSION = 12300020190709;

    modifier onlyLogicContract {
        require(ownerContract == msg.sender, "not the owner");
        _;
    }

    /// @notice constructor
    /// @dev cannot be deployed in a genesis block
    constructor(address _owner) public {

        require(address(_owner) != address(0x0), "no address provided");

        // solium-disable-next-line security/no-block-members
        registryId = keccak256(abi.encodePacked(address(this), blockhash(block.number-1)));
        ownerContract = _owner;
        timeout = 40 days;
    }

    /// @notice removes an in3-server from the registry
    /// @param _signer the signer-address of the in3-node
    /// @dev only callable by the unregisterKey-account
    /// @dev only callable in the 1st year after deployment
    function adminRemoveNodeFromRegistry(address _signer)
        external
        onlyLogicContract
    {

        SignerInformation memory si = signerIndex[_signer];
        _removeNodeInternal(si.index);

    }

    function adminTransferDepositFromSigner(address _signer, address _to, uint _amount) external onlyLogicContract {
        SignerInformation storage si = signerIndex[_signer];
        require(_amount <= si.depositAmount, "amount too high");
        require(supportedToken.transfer(_to, _amount), "token transfer failed");
        si.depositAmount = si.depositAmount - _amount;
    }

    function adminTransferDepositFromNode(address _signer, address _to, uint _amount) external onlyLogicContract {
        SignerInformation memory si = signerIndex[_signer];
        In3Node storage node = nodes[si.index];
        require(_amount <= si.depositAmount, "amount too high");
        require(supportedToken.transfer(_to, _amount), "token transfer failed");
        node.deposit = node.deposit - _amount;
    }

    function adminSetNodeDeposit(address _signer, uint _newDeposit) external onlyLogicContract {
        SignerInformation memory si = signerIndex[_signer];
        In3Node storage node = nodes[si.index];
        node.deposit = _newDeposit;
    }

    function adminSetSignerDeposit(address _signer, uint _newDeposit) external onlyLogicContract {
        SignerInformation storage si = signerIndex[_signer];
        si.depositAmount = _newDeposit;
    }

    function adminSetLogic(address _newLogic) external onlyLogicContract {
        ownerContract = _newLogic;
    }

    function adminSetStage(address _signer, uint _stage) external onlyLogicContract {
        SignerInformation storage si = signerIndex[_signer];
        si.stage = _stage;
    }

    function adminSetTimeout(uint _newTimeout) external onlyLogicContract {
        timeout = _newTimeout;
    }

    function adminSetSupportedToken(ERC20Interface _newToken) external onlyLogicContract {
        supportedToken = _newToken;
    }

    /// @notice commits a blocknumber and a hash
    /// @notice must be called before revealConvict
    /// @param _hash keccak256(wrong blockhash, msg.sender, v, r, s); used to prevent frontrunning.
    /// @dev The v,r,s paramaters are from the signature of the wrong blockhash that the node provided
    function setConvict(bytes32 _hash, address _caller) external onlyLogicContract {
        convictMapping[_caller][_hash] = block.number;
    }

    /// @notice register a new node as a owner using a different signer address
    /// @param _url the url of the node, has to be unique
    /// @param _props properties of the node
    /// @param _signer the signer of the in3-node
    /// @param _weight how many requests per second the node is able to handle
    /// @dev will call the registerNodeInteral function
    /// @dev in order to prove that the owner has controll over the signer-address he has to sign a message
    /// @dev which is calculated by the hash of the url, properties, timeout, weight and the owner
    /// @dev will revert when a wrong signature has been provided
    function registerNodeFor(
        string calldata _url,
        uint64 _props,
        address _signer,
        uint64 _weight,
        address _owner,
        uint _deposit
    )
        external
        onlyLogicContract
    {
        bytes32 urlHash = keccak256(bytes(_url));

        // sets the information of the owner
        signerIndex[_signer].index = nodes.length;
        signerIndex[_signer].owner = _owner;

        // add new In3Node
        In3Node memory m;
        m.url = _url;
        m.props = _props;
        m.signer = _signer;
        m.deposit = _deposit;
        // solium-disable-next-line security/no-block-members
        m.registerTime = uint64(block.timestamp); // solhint-disable-line not-rely-on-time
        m.weight = _weight;

        m.proofHash = _calcProofHashInternal(m);
        nodes.push(m);

        // sets the information of the url
        UrlInformation memory ui;
        ui.used = true;
        ui.signer = _signer;
        urlIndex[urlHash] = ui;

        emit LogNodeRegistered(
            _url,
            _props,
            _signer,
            _deposit
        );
    }

    /// @notice changes the ownership of an in3-node
    /// @param _signer the signer-address of the in3-node, used as an identifier
    /// @param _newOwner the new owner
    /// @dev reverts when trying to change ownership of an inactive node
    /// @dev reverts when trying to pass ownership to 0x0
    /// @dev reverts when the sender is not the current owner
    /// @dev reverts when inacitivity is claimed
    function transferOwnership(address _signer, address _newOwner)
        external
        onlyLogicContract
    {
        SignerInformation storage si = signerIndex[_signer];
        emit LogOwnershipChanged(_signer, si.owner, _newOwner);

        si.owner = _newOwner;
    }

    /// @notice a node owner can unregister a node, removing it from the nodeList
    /// @notice doing so will also lock his deposit for the timeout of the node
    /// @param _signer the signer of the in3-node
    /// @dev reverts when the provided address is not an in3-signer
    /// @dev reverts when the node is already unregistering
    /// @dev reverts when not called by the owner of the node
    function unregisteringNode(address _signer)
        external
        onlyLogicContract
    {

        SignerInformation storage si = signerIndex[_signer];
        In3Node memory n = nodes[si.index];

        _unregisterNodeInternal(si, n);
    }

    /// @notice updates a node by adding the msg.value to the deposit and setting the props or timeout
    /// @param _signer the signer-address of the in3-node, used as an identifier
    /// @param _url the url, will be changed if different from the current one
    /// @param _props the new properties, will be changed if different from the current onec
    /// @param _weight the amount of requests per second the node is able to handle
    /// @dev reverts when the sender is not the owner of the node
    /// @dev reverts when the signer does not own a node
    /// @dev reverts when trying to increase the timeout above 10 years
    /// @dev reverts when trying to change the url to an already existing one
    function updateNode(
        address _signer,
        string calldata _url,
        uint64 _props,
        uint64 _weight,
        uint _deposit
    )
        external
        onlyLogicContract
    {
        SignerInformation memory si = signerIndex[_signer];

        In3Node storage node = nodes[si.index];

        bytes32 newURL = keccak256(bytes(_url));
        bytes32 oldURL = keccak256(bytes(node.url));

        // the url got changed
        if (newURL != oldURL) {

            // make sure the new url is not already in use
            require(!urlIndex[newURL].used, "url is already in use");

            UrlInformation memory ui;
            ui.used = true;
            ui.signer = node.signer;
            urlIndex[newURL] = ui;
            node.url = _url;

            // deleting the old entry
            delete urlIndex[oldURL];
        }

        if (_deposit != node.deposit) {
            node.deposit = _deposit;
        }

        if (_props != node.props) {
            node.props = _props;
        }

        if (_weight != node.weight) {
            node.weight = _weight;
        }

        node.proofHash = _calcProofHashInternal(node);

        emit LogNodeUpdated(
            node.url,
            _props,
            _signer,
            node.deposit
        );
    }

    function getSignerInformation(address _signer) external view returns (SignerInformation memory) {
        return signerIndex[_signer];
    }

    function getNodeInformationByIndex(uint _index) external view returns (In3Node memory) {
        return nodes[_index];
    }

    function getNodeInfromationBySigner(address _signer) external view returns (In3Node memory) {
        return nodes[signerIndex[_signer].index];
    }

    /// @notice length of the nodelist
    /// @return the number of total in3-nodes
    function totalNodes() external view returns (uint) {
        return nodes.length;
    }

    /// @notice calculates the sha3 hash of the most important properties in order to make the proof faster
    /// @param _node the in3 node to calculate the hash from
    /// @return the hash of the properties of an in3-node
    function _calcProofHashInternal(In3Node memory _node) internal pure returns (bytes32) {

        return keccak256(
            abi.encodePacked(
                _node.deposit,
                _node.registerTime,
                _node.props,
                _node.signer,
                _node.url
            )
        );
    }

    /// @notice handes the setting of the unregister values for a node internally
    /// @param _si information of the signer
    /// @param _n information of the in3-node
    function _unregisterNodeInternal(SignerInformation  storage _si, In3Node memory _n) internal {

        // solium-disable-next-line security/no-block-members
        _si.lockedTime = uint64(block.timestamp + timeout);// solhint-disable-line not-rely-on-time
        _si.depositAmount = _n.deposit;

        _removeNodeInternal(_si.index);
    }

    /// @notice removes a node from the node-array
    /// @param _nodeIndex the nodeIndex to be removed
    function _removeNodeInternal(uint _nodeIndex) internal {

        require(_nodeIndex < nodes.length, "invalid node index provided");
        // trigger event
        emit LogNodeRemoved(nodes[_nodeIndex].url, nodes[_nodeIndex].signer);
        // deleting the old entry
        delete urlIndex[keccak256(bytes(nodes[_nodeIndex].url))];
        uint length = nodes.length;

        assert(length > 0);

        // move the last entry to the removed one.
        In3Node memory m = nodes[length - 1];
        nodes[_nodeIndex] = m;

        SignerInformation storage si = signerIndex[m.signer];
        si.index = _nodeIndex;
        nodes.length--;
    }
}
