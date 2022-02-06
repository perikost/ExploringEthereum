// SPDX-License-Identifier: MIT
pragma solidity 0.7.1;

contract Storage{
    string public str = 'f';
    //EDW NA MPEI I FALLBACK ME ENA EVENT KAI ENAN COUNTER GT STO ALLO THA EXOUME EIDI ENAN COUNTER
    fallback() external {}

    function storeStr(string calldata _data) external{
        str = _data;
    }

    function reset () external {
      delete str;
    }
}
