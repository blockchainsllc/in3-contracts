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


contract IN3WhiteList {

    ///EVENTS
    // event for looking node added to whitelisting contract
    event LogNodeWhiteListed(address nodeAddress);

    // event for looking node removed from whitelisting contract
    event LogNodeRemoved(address nodeAddress);

    ///DATA
    //in3 nodes list in mappings
    mapping(address=>uint) public whiteListNodes;
    bytes public whiteListNodesList;

    //for tracking this white listing belongs to which node registry
    address public nodeRegistry;

    //owner of this white listing contract, can be multisig
    address public owner;

    // version: major minor fork(000) date(yyyy/mm/dd)
    uint constant public VERSION = 12300020191017;

    ///MODIFIERS
    //only owner modifier
    modifier onlyOwner {
        require(msg.sender == owner,"Only owner can call this function.");
        _;
    }

    ///CONSTRUCTOR
    //white listing contract constructor
    constructor(address _nodeRegistry) public {
        nodeRegistry = _nodeRegistry;
        owner = msg.sender;
    }

    ///FUNCTIONS
    //function for registering node in white listing contract
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

        emit LogNodeWhiteListed(_nodeAddr);
    }

    //function for removing node from white listing contract
    function removeNode(address _nodeAddr)
        external
        onlyOwner
    {
        uint location = whiteListNodes[_nodeAddr];  //location is not zero based index stored in mappings, it starts from 1
        require(location > 0, "Node doesnt exist in whitelist.");

        uint length = whiteListNodesList.length-1;

        for (uint i = 0;i<=20;i++) {
            if (location!=length) {
                whiteListNodesList[location-i-1] = whiteListNodesList[length-i];}
            delete whiteListNodesList[length-i];
        }

        whiteListNodesList.length -= 20;
        emit LogNodeRemoved(_nodeAddr);
    }

    function getWhiteList() public view returns (bytes memory) {
        return whiteListNodesList;
    }

}