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

//Contract for maintaining verified IN3 nodes list

/// @title Incubed White List Contract

contract IN3WhiteList {

    ///proof hash for whiteListNodesList
    bytes32 proofHash;

    ///Blocknumbe rfor last event of adding or removing node from whitelist
    uint public lastEventBlockNumber;

    ///bytes array of whitelist nodes
    bytes public whiteListNodesList;

    ///in3 nodes list in mappings
    mapping(address=>uint) public whiteListNodes;

    ///for tracking this white listing belongs to which node registry
    address public nodeRegistry;

    ///owner of this white listing contract, can be multisig
    address public owner;

    /// version: major minor fork(000) date(yyyy/mm/dd)
    uint constant public VERSION = 12300020191017;

    /// event for looking node added to whitelisting contract
    event LogNodeWhiteListed(address nodeAddress);

    /// event for looking node removed from whitelisting contract
    event LogNodeRemoved(address nodeAddress);

    ///only owner modifier
    modifier onlyOwner {
        require(msg.sender == owner,"Only owner can call this function.");
        _;
    }

    /// @notice constructor
    /// @param _nodeRegistry address of a Node Registry-contract
    ///white listing contract constructor
    constructor(address _nodeRegistry) public {
        nodeRegistry = _nodeRegistry;
        owner = msg.sender;
    }

    /// @notice whitelisting node
    /// @notice only owner is allowed to add node to whitelist
    /// @param _nodeAddr address of node to be whitelisted
    function whiteListNode( address _nodeAddr)
        external
        onlyOwner
    {
        require(whiteListNodes[_nodeAddr] == 0, "Node already exists in whitelist.");

        bytes memory newAddr = abi.encodePacked(_nodeAddr);
        for (uint i = 0;i<20;i++) {
            whiteListNodesList.push(newAddr[i]);
        }
        whiteListNodes[_nodeAddr] = whiteListNodesList.length;

        proofHash = keccak256(abi.encodePacked(whiteListNodesList));

        lastEventBlockNumber = block.number;

        emit LogNodeWhiteListed(_nodeAddr);
    }

    /// @notice removing node from white listing contract
    /// @param _nodeAddr node address to be removed from whitelist
    function removeNode(address _nodeAddr)
        external
        onlyOwner
    {
        uint location = whiteListNodes[_nodeAddr];  //location is not zero based index stored in mappings, it starts from 1
        require(location > 0, "Node doesnt exist in whitelist.");

        uint length = whiteListNodesList.length-1;

        for (uint i = 0;i<20;i++) {
            if (location!=length+1) { //check if its not first or not last addr then swap last with item to be deleted
                whiteListNodesList[location-i-1] = whiteListNodesList[length-i];}
            delete whiteListNodesList[length-i];
        }

        whiteListNodesList.length -= 20;

        lastEventBlockNumber = block.number;
        emit LogNodeRemoved(_nodeAddr);
    }

    /// @notice getting whitelist byte array
    function getWhiteList() public view returns (bytes memory tempBytes) {
        tempBytes = whiteListNodesList;
    }

    /// @notice function for getting proof hash of bytes array of whitelisted nodes addresses
    function getProofHash() public view returns (bytes32 tempBytes) {
        tempBytes = proofHash;
    }

    /// @notice function for getting last event blocknumber
    function getLastEventBlockNumber()  public view returns (uint) {
        return lastEventBlockNumber;
    }

}