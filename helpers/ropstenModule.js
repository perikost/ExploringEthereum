require('dotenv').config();
const csv = require('./csvModule.js');  //normal
const CSV = require('./csvClassModule.js').CSV;  //class
const TransactionDebugger = require('./debugger.js');
const utils = require('./utils.js');
const performance = require('perf_hooks').performance;
const ethereumTx = require('ethereumjs-tx').Transaction;
const Web3 = require('web3');
const { env, exit } = require('process');

// general TODO:
// 1) initiallize all csv objects outside the for loops of the functions and pass each
// function's name in csv.write, not in new CSV('blockchain', 'retrieveStorage', name, formattedCon.name);
// 2) in every forEach print error if not found
// 3) update web3 to latest version
// 4) assign "named parameters" in most  functions (e.g., {values = [],  keepStats = true} = {})
// 5) if result is null in retrieval throw error

var web3;
var con;
var formattedCon;
var signMethod;
var fork; 
var csvObject;
var txDebugger;
var useAccessList;

// TODO: maybe make capitalize the vars above to be able to tell them apart easily

function _loadBlockchain({provider = 'localhost',  signMeth = 'web3', accessList= false, hardFork = 'london'} = {}){ 
    // TODO: improve
    if(provider != 'localhost') provider = `https://ropsten.infura.io/v3/${process.env.INFURA_ID}`;
    else provider = 'http://localhost:8545'

    web3 = new Web3(new Web3.providers.HttpProvider(provider));
    signMethod = signMeth;
    fork = hardFork;
    csvObject = new CSV();
    txDebugger = new TransactionDebugger(web3);
    useAccessList = accessList;
    
    return web3;
}


function _config(contract, signMeth = 'web3'){  
    // signMethod can be 1) 'web3' -> to sign using Web3
    //  2) anything else ->  to sign using ethereumjs-tx

    if(contract){  // no need to load contract if intending to call sendData()
        formattedCon = contract;
        signMethod = signMeth;
        con = new web3.eth.Contract(formattedCon.abi, formattedCon.contractAddress);
    } 

    web3.eth.transactionPollingTimeout = 3600*2; //set waiting time for a transaction to be mined to 2 hours
    console.log('Max await time for transaction to be mined', web3.eth.transactionPollingTimeout / 60, 'mins');
}


// TODO: maybe merge sendData, fallback together and pass destination address as input
async function _sendData(input, keepStats = true) {
    let message = web3.utils.toHex(input);
    let result = await send(message, process.env.MY_ADDRESS);

    let executionTime = result.executionTime;
    let txHash = result.txReceipt.transactionHash;
    let cost = result.txReceipt.gasUsed;
    let info = type(input);

    let toWrite = {
        basic: [txHash, Date().slice(0,24), cost, executionTime],
        inputInfo: info
    };

    if(keepStats){
        // class
        csvObject.writeStats(toWrite, 'blockchain', 'execute', 'send_data');

        // normal
        // csv.write(toWrite, 'blockchain', 'execute', 'send_data');
    }
}


async function _fallback(input, id = null, keepStats = true){
    if(!formattedCon.fallback) return;  //this contract doesn't have a fallback, so return

    let message = web3.utils.toHex(input);
    if(id !== null){
        id = web3.utils.toHex(id);
        id = web3.utils.padLeft(id, 64);
        message = id + web3.utils.stripHexPrefix(message);
    }

    let executionTime = result.executionTime;
    let txHash = result.txReceipt.transactionHash;
    let cost = result.txReceipt.gasUsed;
    let info = type(input);

    let toWrite = {
        basic: [txHash, Date().slice(0,24), cost, executionTime],
        inputInfo: info
    };

    if(keepStats){
        // class
        let folderPath = csvObject.writeStats(toWrite, 'blockchain', 'execute', 'fallback', formattedCon.name);

        // normal
        // csv.write(toWrite, 'blockchain', 'execute', 'fallback', formattedCon.name);

        await txDebugger.debugTransaction(txHash);
        await txDebugger.saveDebuggedTransaction(message, null, folderPath, Date().slice(0,24).replaceAll(' ', '_'))
    }
}

async function getGaspriceBasedOnHistory(){
    let latestBlock = await web3.eth.getBlockNumber();
    let blockRange = 10;
    let feeHistory = await web3.eth.getFeeHistory(blockRange, Number(latestBlock), [0, 100]);
    let baseFeesToNumber = feeHistory.baseFeePerGas.map(fee => web3.utils.hexToNumber(fee));
    let wei = baseFeesToNumber.reduce((a, b) => a + b, 0) 
    wei /= baseFeesToNumber.length;
    wei += Number(web3.utils.toWei('20', 'gwei'));
    return Math.ceil(wei);
}

// TODO: split in two: send, sign with web3, sign with ethereumjs
async function send(input, account, accessList){
    try{
        let nodeVersion = await web3.eth.getNodeInfo();
        console.log('Node version:', nodeVersion);

        let accountTo
        if(formattedCon) accountTo = formattedCon.contractAddress;
        if(account) accountTo = account;
        let nonce = await web3.eth.getTransactionCount(process.env.MY_ADDRESS);
        let gasprice = await getGaspriceBasedOnHistory();

        if(signMethod == 'web3'){
            var rawTx = {
                 nonce: nonce,
                 to: accountTo,
                 gasPrice : gasprice,
                 value: 0,
                 data: input,
                 accessList: accessList,
                 chain: 'ropsten',
                 hardfork: fork
            };
        }else{
            var rawTx = {
                nonce: web3.utils.toHex(nonce),
                gasPrice: web3.utils.toHex(gasprice),
                to: accountTo,
                value: web3.utils.toHex(0),
                data: input
            };
        }

        let gasEstimate = await web3.eth.estimateGas(rawTx);
        let gasToSend = 10000 * Math.ceil(gasEstimate / 10000);
        console.log('Estimated gas:',gasEstimate);

        if(signMethod == 'web3'){
            rawTx.gas = gasToSend;
            let signed_tx = await web3.eth.accounts.signTransaction(rawTx, process.env.MY_PRIVATE_KEY);
            var transaction = signed_tx.rawTransaction
        }else{
            rawTx.gasLimit = web3.utils.toHex(gasToSend);
            let tx = new ethereumTx(rawTx, {'chain':'ropsten', hardfork: fork});
            tx.sign(Buffer.from(process.env.MY_PRIVATE_KEY, 'hex'));

            let serializedTx = tx.serialize();
            var transaction = '0x' + serializedTx.toString('hex');
        }

        console.log('Waiting for transaction to be mined...');

        let begin = performance.now();
        let txReceipt = await web3.eth.sendSignedTransaction(transaction);
        let executionTime = (performance.now() - begin).toFixed(4);

        return {
            executionTime: executionTime,
            txReceipt: txReceipt
        };
    }catch(err){
        console.log('Transaction not completed. Error: ', err);
        process.exit();
    }
}


async function executeFunction(name, {values = [], keepStats = true} = {}){
    try{
        // if no values are given, get the harcoded values or generate random ones
        if(values.length == 0){
            let func = getFunction(name);
            if(!func){
                // if no such function is found return;
                return;
            }

            func.inputs.forEach(input => {
                if(Object.keys(input).length != 0){
                    if(input.value){
                        values.push(input.value);
                    }else{
                        values.push(utils.getRandomInput(input));
                    }
                }
            });
        }
        
        let message = con.methods[name].apply(null, values).encodeABI();
        let accessList = useAccessList ? await con.methods[name].apply(null, values).createAccessList({from: process.env.MY_ADDRESS}): null;
        // Contract's address is included even though it is not used in any EXT* operation, resulting in 2400 extra
        let result = await send(message, null, accessList.accessList);
        
        if(keepStats){
            let executionTime = result.executionTime;
            let txHash = result.txReceipt.transactionHash;
            let cost = result.txReceipt.gasUsed;

            let info = type(values);
            let toWrite = {
                basic: [txHash, Date().slice(0,24), cost, executionTime],
                inputInfo: info
            };
        
            // class
            let folderPath = csvObject.writeStats(toWrite, 'blockchain', 'execute', name, formattedCon.name);

            await txDebugger.debugTransaction(txHash);
            await txDebugger.saveDebuggedTransaction(message, accessList.accessList, folderPath + `/${name}`, Date().slice(0,24).replaceAll(' ', '_'))
            // normal
            // csv.write(toWrite, 'blockchain', 'execute', name, formattedCon.name);
        }

    }catch(error){
        console.log(error);
        process.exit();
    }
}


async function _executeFunctions(values = [], keepStats = true){
    if(formattedCon.functions.length == 0) return; //this contract doesn't have functions, so return

    for(var func of formattedCon.functions){
        if(!func.execute) continue; // don't execute the function

        let name = func.name;
        await executeFunction(name, {values: values, keepStats: keepStats});
    }
}


async function executeGetter(name, {values = [],  keepStats = true} = {}){
    try{
        // if no values are given, get the harcoded values or generate random ones
        if(values.length == 0){
            let getter = getGetter(name);

            getter.inputs.forEach(input => {
                if(Object.keys(input).length != 0){
                    if(input.value){
                        values.push(input.value);
                    }else{
                        values.push(utils.getRandomInput(input));
                    }
                }
            });
        }

        let begin = performance.now();
        let result = await con.methods[name].apply(null, values).call();
        let executionTime = (performance.now() - begin).toFixed(4);

        if(keepStats){
            let info = type(result);
            let toWrite = {
                basic: [txHash, Date().slice(0,24), cost, executionTime],
                inputInfo: info
            };

            //class
            csvObject.writeStats(toWrite, 'blockchain', 'retrieveStorage', name, formattedCon.name);

            // normal
            // csv.write(toWrite, 'blockchain', 'retrieveStorage', name, formattedCon.name);
        }
        return result;

    }catch(error){
        console.log(error);
        process.exit();
    }
}


async function _retrieveStorage(keepStats = true){
    if(formattedCon.getters.length == 0) return;  // this contract doesn't have getters, so return;

    for(var getter of formattedCon.getters){
        if(!getter.execute) continue;  // don't execute the getter

        let name = getter.name;
        await executeGetter(name, {keepStats : keepStats});
    }

}

// TODO:    
// 1) Retrieve all events if toFind = null or throw an error "fill in toFind in formattedCon".
// 2) The same for index
// 3) Fill in paramType automatically

async function _retrieveEvents(keepStats = true){
    if(formattedCon.events.length == 0) return;

    for(var eve of formattedCon.events){
        if(!eve.retrieve) continue; // don't retrieve the Event

        try{
            let name = eve.name;
            let toFind = eve.toFind;
            let paramType = eve.paramType;
            let indexName = eve.index.name;
            let indexValue = eve.index.value;

            let begin = performance.now();
            let results = await con.getPastEvents(name,{
                fromBlock : 0
            });

            for(let i=0; i<results.length; i++){
                if(results[i].returnValues[indexName] == indexValue){

                    var decodingTime = 0;
                    if(eve.unused == true){
                        let beginDecoding = performance.now();
                        var result = await retrieveUnused(results[i].transactionHash, paramType);
                        decodingTime = (performance.now() - beginDecoding).toFixed(4);
                    }
                    else if(eve.fallback == true){
                        let beginDecoding = performance.now();
                        var result = await retrieveTxData(results[i].transactionHash);
                        decodingTime = (performance.now() - beginDecoding).toFixed(4);
                    }
                    else {
                        var result = results[i].returnValues[toFind];
                    }
                    break;
                }
            }
            // TODO: this timer should stop before the for-loop. Make another for measuring the time to match the event
            let executionTime = (performance.now() - begin).toFixed(4);

            if(keepStats){
                if(!result) continue;
                let info = type(result);
                let totalTime = Number(executionTime) + Number(decodingTime);
                let id = ',';
                if(indexName == 'id') id = indexValue;
                let toWrite = {
                    basic: [Date().slice(0,24),id, results.length, executionTime, decodingTime, totalTime],
                    inputInfo: info
                };

                //class
                csvObject.writeStats(toWrite, 'blockchain', 'retrieve_Events', name, formattedCon.name);

                // normal
                // csv.write(toWrite, 'blockchain', 'retrieve_Events', name, formattedCon.name);
            }


            console.log(`Retrieval time (events) |${eve.name}|: `, executionTime, 'Result: ',result.length);
            console.log(result);

            await utils.sleep(3);
        }catch(error){
            console.log(error);
            process.exit();
        }
    }
}


async function _retrieveIndexedEvents(keepStats = true){
    if(formattedCon.indexedEvents.length == 0) return;

    for(var eve of formattedCon.indexedEvents){
        if(!eve.retrieve) continue; // don't retrieve the Event

        try{

            let name = eve.name;
            let paramType = eve.paramType;
            let indexName = eve.index.name;
            let indexValue = eve.index.value;

            let filter = new Object(); // create the object needed for getPastEvents filter property
            filter[indexName] = indexValue; // modify object to { indexed_parameter_name : expected_value }

            let begin = performance.now();
            let result = await con.getPastEvents(name,{
                filter : filter,
                fromBlock : 0
            });
            let executionTime = (performance.now() - begin).toFixed(4);

            result = result[0];

            let decodingTime = 0;
            if(eve.unused == true){
                let beginDecoding = performance.now();
                result = await retrieveUnused(result.transactionHash, paramType);
                decodingTime = (performance.now() - beginDecoding).toFixed(4);
            }
            else if(eve.fallback == true){
                let beginDecoding = performance.now();
                result = await retrieveTxData(result.transactionHash);
                decodingTime = (performance.now() - beginDecoding).toFixed(4);
            }else {
                result  = result.returnValues[eve.toFind];
            }


            if(keepStats){
                if(!result) continue;
                let info = type(result);
                let totalTime = Number(executionTime) + Number(decodingTime);
                let id = ',';
                if(indexName == 'id') id = indexValue;

                let toWrite = {
                    basic: [Date().slice(0,24),id, executionTime, decodingTime, totalTime],
                    inputInfo: info
                };
                //class
                csvObject.writeStats(toWrite, 'blockchain', 'retrieve_Indexed_Events', name, formattedCon.name);

                // normal
                // csv.write(toWrite, 'blockchain', 'retrieve_Indexed_Events', name, formattedCon.name);
            }


            console.log(`Retrieval time (events) |${eve.name}|: `, executionTime, 'Result: ',result.length);
            console.log(result);

            await utils.sleep(3);
        }catch(error){
            console.log(error);
            process.exit();
        }
    }
}


async function _retrieveAnonymousEvents(keepStats = true) {
    if(formattedCon.anonymousEvents.length == 0) return;

    for(var eve of formattedCon.anonymousEvents){
        if(!eve.retrieve) continue; // don't retrieve the Event

        try {
            let name = eve.name;
            let toFind = eve.toFind;
            let paramType = eve.paramType;
            let indexName = eve.index.name;
            let indexValue = eve.index.value;
            let topic = web3.eth.abi.encodeParameter('uint256', indexValue); // parameter should be abiEncoded
            /*
            if topics : [null, indexValue]  it will match every event whose second topic = indexValue.
            Generally, getPastLogs finds logs based on specific topic values. The order of the topics is important
            and should use null for every one you don't want to match. In this case the event we are searching for
            is anonymous, so the event signature is not used as the first topic. That's why we don't use null
            */
            let begin = performance.now();
            let log = await web3.eth.getPastLogs({
                fromBlock : 0,
                address : formattedCon.contractAddress,
                topics : [topic]
            });
            let retrievalTime = (performance.now() - begin).toFixed(4);

            let data = log[0].data

            let beginDecoding = performance.now();
            let result = await web3.eth.abi.decodeLog([{
                type : paramType,
                name : toFind
            }], data);
            let decodingTime = (performance.now() - beginDecoding).toFixed(4); 

            result = result[toFind]; // neeeded because the output of decodeLog is something like : Result { '0': 's', __length__: 1, data: 's' }

            if(keepStats){
                if(!result) continue;
                let info = type(result);
                let totalTime = Number(retrievalTime) + Number(decodingTime);
                let id = ',';
                if(indexName == 'id') id = indexValue;

                let toWrite = {
                    basic: [Date().slice(0,24),id, retrievalTime, decodingTime, totalTime],
                    inputInfo: info
                };
                //class
                csvObject.writeStats(toWrite, 'blockchain', 'retrieve_Anonymous_Events', name, formattedCon.name);

                // normal
                // csv.write(toWrite, 'blockchain', 'retrieve_Anonymous_Events', name, formattedCon.name);
            }


            console.log(`Retrieval time (anonymous) |${eve.name}|: `, retrievalTime, 'Result: ',result.length);
            console.log(result);

            await utils.sleep(3);
        } catch (e) {
            console.log(e);
        }
    }
}


async function _retrievePlainTransactionData(path, keepStats = true) {
    let storedInTxData = [];
    csv.readCsvAsArray(path).forEach((line, i) => {
        if(i != 0) storedInTxData.push(line[0])
    });

    let name = path.split('/').slice(-1)[0];
    name = name.split('.')[0]

    for(const txHash of storedInTxData){
        try {
            // let begin = performance.now();
            let result = await retrieveTxData(txHash);
            // let retrievalTime = (performance.now() - begin).toFixed(4);

            let info = type(result.decodedInput);
            let toWrite = {
                basic: [Date().slice(0,24),id, result.retrievalTime],
                inputInfo: info
            };
    

            if(keepStats){
                //class
                // let csvObject = new CSV('blockchain', 'retrieve_txData', name);
                csvObject.writeStats(toWrite, 'blockchain', 'retrieve_txData', name);

                // normal
                // csv.write(toWrite, 'blockchain', 'retrieve_txData', name);
            }
            console.log(`Retrieval time (txData) : `, result.retrievalTime, 'Result: ', result.decodedInput.length);
            await utils.sleep(1);
        } catch (e) {
            console.log(e);
            process.exit();
        }

    }
}


async function retrieveTxData(txHash) {
    let begin = performance.now();
    let tx = await web3.eth.getTransaction(txHash);
    let txData = tx.input;
    let decodedInput = web3.utils.hexToUtf8(txData);
    let retrievalTime = (performance.now() - begin).toFixed(4);

    return {
        decodedInput : decodedInput,
        retrievalTime : retrievalTime
    };
}

// FIXME: must change cause now we have 2 parameters not one
async function retrieveUnused(txHash, type) {
    // TODO: measure time as in retrieveTxData
    let tx = await web3.eth.getTransaction(txHash);
    let txData = tx.input;
    let param = '0x' + txData.slice(10);
    let result = web3.eth.abi.decodeParameter(type, param);

    return result;
}


function type(values){
    if(typeof(values) !== 'object') values = [values]
    if(!values) return {type : 'No values', size : 'No values'};

    let info = values.map(val => {
        if(typeof(val) != 'string') return {type : typeof(val), size : 'Not measured'};
        if( val.slice(0,2) == '0x'){ //could also use web3.utils.isHexStrict()
            let length = val.slice(2).length / 2;
            if( length == 32) return {type : 'Bytes32', size : length};
            return {type : 'Bytes', size : length};
        }
        let length = val.length;
        return {type : typeof(val), size : length};
    });
    return info;
}


function getFunction(name){
    for(const func of formattedCon.functions){
        if(name == func.name) return func;
    }
}

function getGetter(name){
    for(const getter of formattedCon.getters){
        if(name == getter.name) return getter;
    }
}


module.exports = {
    loadBlockchain : _loadBlockchain,
    config : _config,
    executeFunctions : _executeFunctions,
    sendData : _sendData,
    fallback : _fallback,
    retrieveStorage : _retrieveStorage,
    retrieveEvents : _retrieveEvents,
    retrieveIndexedEvents : _retrieveIndexedEvents,
    retrieveAnonymousEvents : _retrieveAnonymousEvents,
    retrievePlainTransactionData : _retrievePlainTransactionData,
    executeFunction : executeFunction
};
