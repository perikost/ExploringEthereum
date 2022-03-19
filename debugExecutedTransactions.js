const TransactionDebugger = require('./helpers/debugger.js');
const Web3 = require('web3');

const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
let txDebugger = new TransactionDebugger(web3);
txDebugger.debugAllSavedTransactions('./csv_records/19-03-2022');
    