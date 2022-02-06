// SPDX-License-Identifier: MIT
pragma solidity 0.7.1;

contract Events{

    uint public counter = 1;
    uint public counterAnonym = 1;
    uint public counterIndexed = 1;
    uint public counterUnused = 1;
    uint public counterUnusedIndexed = 1;
    uint public counterFallback = 1;

    event logDataAnonym(uint indexed id, string  data)anonymous;
    event logDataIndexed(uint indexed id, string  data);
    event logData(uint id, string  data);
    event logUnused(uint id);
    event logUnusedIndexed(uint indexed id);
    event logFallback(uint id);

    fallback() external {
        emit logFallback(counterFallback);
        counterFallback++;
    }

    function log(string calldata  _data) external {
        emit logData(counter, _data);
        counter++;
    }

    function logAnonym(string calldata  _data) external {
        emit logDataAnonym(counterAnonym, _data);
        counterAnonym++;
    }

    function logIndexed(string calldata  _data) external {
        emit logDataIndexed(counterIndexed, _data);
        counterIndexed++;
    }

    function Unused(string calldata  _data) external {
        emit logUnused(counterUnused);
        counterUnused++;
    }

    function UnusedIndexed(string calldata  _data) external {
        emit logUnusedIndexed(counterUnusedIndexed);
        counterUnusedIndexed++;
    }
}
