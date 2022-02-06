// SPDX-License-Identifier: MIT
pragma solidity 0.7.1;

contract Exp{
    uint public counter = 1;

    event log(uint indexed id);

    fallback() external {
        emit log(counter);
        counter++;
    }
}
