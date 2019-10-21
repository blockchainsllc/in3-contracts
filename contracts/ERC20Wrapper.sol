pragma solidity ^0.5.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Wrapper is ERC20 {

    function mint() public payable returns (bool) {
        require(msg.value > 0, "no ether provided");
        _mint(msg.sender, msg.value);
        return true;
    }

    function burn(uint256 amount) public {
        _burn(msg.sender, amount);
        msg.sender.transfer(amount);
    }
}