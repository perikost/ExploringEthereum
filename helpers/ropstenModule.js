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
var errors = 0;
var fromContractCreation;
var clearCache;

// TODO: maybe make capitalize the vars above to be able to tell them apart easily

function _loadBlockchain({provider = 'localhost',  signMeth = 'web3', accessList= true, hardFork = 'london', cache = true} = {}){ 
    // TODO: improve
    if(provider != 'localhost') provider = `https://ropsten.infura.io/v3/${process.env.INFURA_ID}`;
    else provider = 'http://localhost:8545'

    web3 = new Web3(new Web3.providers.HttpProvider(provider));
    signMethod = signMeth;
    fork = hardFork;
    csvObject = new CSV();
    txDebugger = new TransactionDebugger(web3);
    useAccessList = accessList;
    clearCache = cache;
    
    return web3;
}

function _config(contract, signMeth = 'web3', fromConCreation = false){  
    // signMethod can be 1) 'web3' -> to sign using Web3
    //  2) anything else ->  to sign using ethereumjs-tx

    if(contract){  // no need to load contract if intending to call sendData()
        formattedCon = contract;
        signMethod = signMeth;
        con = new web3.eth.Contract(formattedCon.abi, formattedCon.contractAddress);
        fromContractCreation = fromConCreation;
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

    let result = await send(message);
    
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

        // await txDebugger.debugTransaction(txHash);
        // await txDebugger.saveDebuggedTransaction(message, null, folderPath, Date().slice(0,24).replaceAll(' ', '_'))
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
        let gasprice = await getGaspriceBasedOnHistory(); // TODO: Should make it work in localhost mode as well where getFeeHistory() isn't available

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
        if(accessList) accessList = accessList.accessList;
        // Contract's address is included even though it is not used in any EXT* operation, resulting in 2400 extra
        let result = await send(message, null, accessList);
        
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

            // await txDebugger.debugTransaction(txHash);
            // await txDebugger.saveDebuggedTransaction(message, accessList, folderPath + `/${name}`, Date().slice(0,24).replaceAll(' ', '_'))
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

async function _executeSpecificFunctions(functions = {}, keepStats = true){
    if(formattedCon.functions.length == 0 || Object.values(functions).length == 0) return; //there are no functions to execute, so return

    for(const [func, vals] of Object.entries(functions)){
        await executeFunction(func, {values: vals, keepStats: keepStats});
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
        let retrievalTime = (performance.now() - begin).toFixed(4);

        if(keepStats){
            let toWrite = {
                basic: [Date().slice(0,24), retrievalTime],
                inputInfo: type(result)
            };

            //class
            csvObject.writeStats(toWrite, 'blockchain', 'retrieveStorage', name, formattedCon.name);

            // normal
            // csv.write(toWrite, 'blockchain', 'retrieveStorage', name, formattedCon.name);
        }
        return result;

    }catch(error){
        errors++;
        console.log(error);
        console.log(errors);
    }
}


async function _retrieveStorage(keepStats = true){
    if(formattedCon.getters.length == 0) return;  // this contract doesn't have getters, so return;

    for(var getter of formattedCon.getters){
        if(!getter.execute) continue;  // don't execute the getter
        if(clearCache) utils.clearCache();

        let name = getter.name;
        await executeGetter(name, {keepStats : keepStats});
    }

}

async function _isStorageDirty(getters){
    for(const getter of getters){
        let result = await executeGetter(getter, {keepStats: false});
        if(!result) continue;
        if(typeof result === 'object'){
            for(const val of Object.values(result)) if(!utils.isEmpty(val)) return true;
        }else{
            if(!utils.isEmpty(result)) return true;
        }
    }
    return false;
}

// TODO:    
// 1) Retrieve all events if toFind = null or throw an error "fill in toFind in formattedCon".
// 2) The same for index
// 3) Fill in paramType automatically

async function _retrieveEvents(keepStats = true){
    if(formattedCon.events.length == 0) return;

    for(var eve of formattedCon.events){
        if(!eve.retrieve) continue; // don't retrieve the Event
        if(clearCache) utils.clearCache();

        try{
            let name = eve.name;
            let toFind = eve.toFind;
            let paramType = eve.paramType;
            let indexName = eve.index.name;
            let indexValue = eve.index.value;

            let begin = performance.now();
            let results = await con.getPastEvents(name,{
                fromBlock: fromContractCreation ? formattedCon.blockNumber : 0
            });
            let allEventsRetrieval = (performance.now() - begin).toFixed(4);

            begin = performance.now();
            for(let i=0; i<results.length; i++){
                if(results[i].returnValues[indexName] == indexValue){
                    var findSpecificEvent = (performance.now() - begin).toFixed(4);

                    var decodingTime = 0;
                    if(eve.unused == true){
                        let beginDecoding = performance.now();
                        var result = await retrieveUnused(results[i].transactionHash, paramType);
                        decodingTime = (performance.now() - beginDecoding).toFixed(4);
                    }
                    else if(eve.fallback == true){
                        var result = await retrieveTxData(results[i].transactionHash);
                        decodingTime = result.retrievalTime
                        result = result.decodedInput
                    }
                    else {
                        var result = results[i].returnValues[toFind];
                    }
                    break;
                }
            }

            if(keepStats){
                if(!result) continue;
                var totalTime = Number(allEventsRetrieval) + Number(findSpecificEvent) + Number(decodingTime);
                let id = ',';
                if(indexName == 'id') id = indexValue;
                let toWrite = {
                    basic: [Date().slice(0,24), results.length, id, allEventsRetrieval, findSpecificEvent, decodingTime, totalTime],
                    inputInfo: type(result)
                };

                //class
                csvObject.writeStats(toWrite, 'blockchain', 'retrieve_Events', name, formattedCon.name);

                // normal
                // csv.write(toWrite, 'blockchain', 'retrieve_Events', name, formattedCon.name);
            }


            console.log(`Retrieval time (events) |${eve.name}|: `, totalTime, 'Result: ',result.length);
            console.log(result.length > 10? result.substring(0,10) : result);

            // await utils.sleep(2);
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
        if(clearCache) utils.clearCache();

        try{

            let name = eve.name;
            let paramType = eve.paramType;
            let indexName = eve.index.name;
            let indexValue = eve.index.value;

            let filter = new Object(); // create the object needed for getPastEvents filter property
            filter[indexName] = [indexValue]; // modify object to { indexed_parameter_name : expected_value }

            let begin = performance.now();
            let results = await con.getPastEvents(name,{
                filter : filter,
                fromBlock: fromContractCreation ? formattedCon.blockNumber : 0
            });
            let retrievalTime = (performance.now() - begin).toFixed(4);

            let result = results[0];
            let numOfLogs = results.length;

            let decodingTime = 0;
            if(eve.unused == true){
                let beginDecoding = performance.now();
                result = await retrieveUnused(result.transactionHash, paramType);
                decodingTime = (performance.now() - beginDecoding).toFixed(4);
            }
            else if(eve.fallback == true){
                result = await retrieveTxData(result.transactionHash);
                decodingTime = result.retrievalTime
                result = result.decodedInput
            }else {
                result  = result.returnValues[eve.toFind];
            }


            if(keepStats){
                if(!result) continue;
                var totalTime = Number(retrievalTime) + Number(decodingTime);
                let id = ',';
                if(indexName == 'id') id = indexValue;

                let toWrite = {
                    basic: [Date().slice(0,24), numOfLogs, id, retrievalTime, decodingTime, totalTime],
                    inputInfo: type(result)
                };
                //class
                csvObject.writeStats(toWrite, 'blockchain', 'retrieve_Indexed_Events', name, formattedCon.name);

                // normal
                // csv.write(toWrite, 'blockchain', 'retrieve_Indexed_Events', name, formattedCon.name);
            }


            console.log(`Retrieval time (events) |${eve.name}|: `, totalTime, 'Result: ',result.length);
            console.log(result.length > 10? result.substring(0,10) : result);

            // await utils.sleep(2);
        }catch(error){
            errors++;
            console.log(error);
            console.log(errors);
        }
    }
}


async function _retrieveAnonymousEvents(keepStats = true) {
    if(formattedCon.anonymousEvents.length == 0) return;

    for(var eve of formattedCon.anonymousEvents){
        if(!eve.retrieve) continue; // don't retrieve the Event
        if(clearCache) utils.clearCache();

        try {
            let numOfLogs;
            let name = eve.name;
            let toFind = eve.toFind;
            let paramType = eve.paramType;
            let indexName = eve.index.name;
            let indexValue = eve.index.value;
            let topic = eve.indexed ? web3.eth.abi.encodeParameter('uint256', indexValue): null; // parameter should be abiEncoded
            /*
            if topics : [null, indexValue]  it will match every event whose second topic = indexValue.
            Generally, getPastLogs finds logs based on specific topic values. The order of the topics is important
            and should use null for every one you don't want to match. In this case the event we are searching for
            is anonymous, so the event signature is not used as the first topic. That's why we don't use null
            */

            // temporary fix to record both non-indexed and indexed anonymous events retrieval time
            if(eve.indexed){
                let begin = performance.now();
                let logs = await web3.eth.getPastLogs({
                    fromBlock: fromContractCreation ? formattedCon.blockNumber : 0,
                    address : formattedCon.contractAddress,
                    topics : [topic]
                });
                var retrievalTime = (performance.now() - begin).toFixed(4);

                let data = logs[0].data
                numOfLogs = logs.length;

                let beginDecoding = performance.now();
                var result = await web3.eth.abi.decodeLog([{
                    type : paramType,
                    name : toFind
                }], data);
                var decodingTime = (performance.now() - beginDecoding).toFixed(4); 
            } 
            
            if(!eve.indexed){
                let begin = performance.now();
                let logs = await web3.eth.getPastLogs({
                    fromBlock: fromContractCreation ? formattedCon.blockNumber : 0,
                    address : formattedCon.contractAddress
                });
                var retrievalTime = (performance.now() - begin).toFixed(4);

                numOfLogs = logs.length;

                let beginDecoding = performance.now();
                for(let i = 0; i < logs.length; i++){
                    
                    if(logs[i].topics.length !== 0) continue;  // an anonymous non-indexed event has no topics at all
                    
                    let data = logs[i].data
                    var result = await web3.eth.abi.decodeLog([
                        {
                            type : 'uint256',
                            name : indexName
                        },
                        {
                            type : paramType,
                            name : toFind
                        }
                    ], data);

                    if(result[indexName] == indexValue){
                        var decodingTime = (performance.now() - beginDecoding).toFixed(4);
                        break;
                    }
                }
            } 
            result = result[toFind]; // neeeded because the output of decodeLog is something like : Result { '0': 's', __length__: 1, data: 's' }

            if(keepStats){
                if(!result) continue;
                var totalTime = Number(retrievalTime) + Number(decodingTime);
                let id = ',';
                if(indexName == 'id') id = indexValue;

                let toWrite = {
                    basic: [Date().slice(0,24), numOfLogs || 0, id, retrievalTime, decodingTime, totalTime],
                    inputInfo: type(result)
                };
                //class
                csvObject.writeStats(toWrite, 'blockchain', 'retrieve_Anonymous_Events', name, formattedCon.name);

                // normal
                // csv.write(toWrite, 'blockchain', 'retrieve_Anonymous_Events', name, formattedCon.name);
            }


            console.log(`Retrieval time (anonymous) |${eve.name}|: `, totalTime, 'Result: ',result.length);
            console.log(result.length > 10? result.substring(0,10) : result);

            // await utils.sleep(2);
        } catch (error) {
            errors++;
            console.log(error);
            console.log(errors);
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
        if(clearCache) utils.clearCache();
        try {
            // let begin = performance.now();
            let result = await retrieveTxData(txHash);
            // let retrievalTime = (performance.now() - begin).toFixed(4);

            let toWrite = {
                basic: [Date().slice(0,24), result.retrievalTime],
                inputInfo: type(result.decodedInput)
            };
    

            if(keepStats){
                //class
                // let csvObject = new CSV('blockchain', 'retrieve_txData', name);
                csvObject.writeStats(toWrite, 'blockchain', 'retrieve_txData', name);

                // normal
                // csv.write(toWrite, 'blockchain', 'retrieve_txData', name);
            }
            console.log(`Retrieval time (txData) : `, result.retrievalTime, 'Result: ', result.decodedInput.length);
            console.log(result.decodedInput.length > 10? result.decodedInput.substring(0,10) : result.decodedInput);
            // await utils.sleep(2);
        } catch (error) {
            errors++;
            console.log(error);
            console.log(errors);
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

// TODO: works only for our test cases. Improve it
async function retrieveUnused(txHash, type) {
    // TODO: measure time as in retrieveTxData
    let tx = await web3.eth.getTransaction(txHash);
    let txData = tx.input;
    // let param = '0x' + txData.slice(10);
    // let result = web3.eth.abi.decodeParameter(type, param);

    let result = web3.eth.abi.decodeParameters([{
        type : 'uint256',
        name : '_id'
    },{
        type: type,
        name: '_data'
    }], txData.slice(10));

    return result['_data'];
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
    executeFunction : executeFunction,
    executeGetter: executeGetter,
    isStorageDirty: _isStorageDirty,
    executeSpecificFunctions: _executeSpecificFunctions
};
