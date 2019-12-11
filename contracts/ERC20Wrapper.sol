pragma solidity 0.5.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";


contract ERC20Wrapper is ERC20 {

    /// @notice mints as many tokens as ethers are provided
    /// @return true if successfull
    function mint() public payable returns (bool) {
        require(msg.value > 0, "no ether provided");
        _mint(msg.sender, msg.value);
        return true;
    }

    /// @notice burns tokens and receives locked ether for it
    /// @param amount the amount of ether to be burned / ether to be received
    function burn(uint256 amount) public {
        _burn(msg.sender, amount);
        msg.sender.transfer(amount);
    }
}