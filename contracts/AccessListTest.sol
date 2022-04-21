// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

contract AccessListTest{
    event balance(uint senderBalance, uint inputAccountBalance);

    function logBalance(address  _inputAccount) external{
        emit balance(msg.sender.balance, _inputAccount.balance);
    }
}
