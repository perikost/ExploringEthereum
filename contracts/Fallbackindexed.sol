// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

contract FallbackIndexed{
    uint public counter = 1;

    event logFallback(uint indexed id);

    fallback() external {
        emit logFallback(counter);
        counter++;
    }
}
