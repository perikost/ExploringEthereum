// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

contract Fallback{
    uint public counter = 1;

    event logFallback(uint id);

    fallback() external {
        emit logFallback(counter);
        counter++;
    }
}
