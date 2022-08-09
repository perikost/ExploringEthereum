require('dotenv').config();
const { CSV } = require('./csvModule.js');  //class
const TransactionDebugger = require('./debugger.js');
const utils = require('./utils.js');
const performance = require('perf_hooks').performance;
const Web3 = require('web3');

var web3;
var con;
var formattedCon;
var csvObject;
var txDebugger;
var errors = 0;

const options = {
    chain: 'ropsten',
    fork: 'london', 
    keepStats: false,
    transactionPollingTimeout: 3600*2
};

const defaultFunctionOptions = {
    useAccessList: false, 
    clearCache: false,
    debug : false,
    fromConCreation: false,
    keepStats: false
};


function loadBlockchain(provider = 'localhost', opts = null){ 
    utils.core.setOptions(opts, options);
    if(provider === 'infura' && process.env.INFURA_ENDPOINT) provider = process.env.INFURA_ENDPOINT;
    else provider = 'http://localhost:8545'

    web3 = new Web3(new Web3.providers.HttpProvider(provider));

    // increase wait-time for a transaction to be mined to avoid timeouts
    web3.eth.transactionPollingTimeout = options.transactionPollingTimeout;
    console.log('Max wait-time for transaction to be mined: ', web3.eth.transactionPollingTimeout / 60, 'mins');

    // to avoid creating a csv object and configure its path when we don't plan to keepStats at all
    if(options.keepStats) csvObject = new CSV();
    txDebugger = new TransactionDebugger(web3);
    
    return web3;
}

function config(contract, opts = null){
    if(contract){  // no need to load contract if intending to call sendData()
        formattedCon = contract;
        formattedCon.options = utils.core.getOptions(opts, defaultFunctionOptions);
        con = new web3.eth.Contract(formattedCon.abi, formattedCon.contractAddress);
    } 
}

async function sendData(input, opts = null) {
    let localOptions = utils.core.getOptions(opts, defaultFunctionOptions);
    let message = web3.utils.toHex(input);
    let result = await send(message, process.env.MY_ADDRESS);

    if(localOptions.keepStats && options.keepStats) {
        let toWrite = {
            basic: [result.txHash, Date().slice(0,24), result.gasUsed, result.executionTime],
            inputInfo: info
        };
        csvObject.writeStats(toWrite, 'blockchain', 'execute', 'send_data');
    }
}

async function fallback(input, id = null, opts = null){
    if(!formattedCon.fallback) return;  //this contract doesn't have a fallback, so return

    let localOptions = utils.core.getOptions(opts, formattedCon.options);
    let message = web3.utils.toHex(input);
    /* 
    this is for a specific use-case
    the id is padded to 32 bytes and then is concatenated with the message
    the fallback function of the Smart Contract splits the msg.data 
    and passes the id to an event, as follows:
         uint _id = uint(bytes32(msg.data[0:32]));
         emit logFallback(_id); 
    */
    if(id !== null){
        id = web3.utils.toHex(id);
        id = web3.utils.padLeft(id, 64);
        message = id + web3.utils.stripHexPrefix(message);
    }
    let result = await send(message);

    if(localOptions.keepStats && options.keepStats){
        let toWrite = {
            basic: [result.txHash, Date().slice(0,24), result.gasUsed, result.executionTime],
            inputInfo: utils.core.type(input)
        };
        let folderPath = csvObject.writeStats(toWrite, 'blockchain', 'execute', 'fallback', formattedCon.name);

        if(localOptions.debug){
            await txDebugger.debugTransaction(result.txHash);
            await txDebugger.saveDebuggedTransaction(message, null, folderPath, Date().slice(0,24).replace(/\s|:/g, '_'))
        } 
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

async function send(input, account, accessList = null){
    try{
        // print node's version
        let nodeVersion = await web3.eth.getNodeInfo();
        console.log('Node version:', nodeVersion);

        let accountTo = formattedCon ? formattedCon.contractAddress : account;
        let nonce = await web3.eth.getTransactionCount(process.env.MY_ADDRESS);
        let gasprice = await getGaspriceBasedOnHistory(); // TODO: Should make it work in localhost mode as well where getFeeHistory() isn't available

        let rawTx = {
             nonce: nonce,
             to: accountTo,
             gasPrice : gasprice,
             value: 0,
             data: input,
             accessList: accessList,
             chain: options.chain,
             hardfork: options.fork
        };

        let gasEstimate = await web3.eth.estimateGas(rawTx);
        let gasToSend = 10000 * Math.ceil(gasEstimate / 10000);
        console.log('Estimated gas:',gasEstimate);

        rawTx.gas = gasToSend;
        let signed_tx = await web3.eth.accounts.signTransaction(rawTx, process.env.MY_PRIVATE_KEY);
        let transaction = signed_tx.rawTransaction;

        console.log('Waiting for transaction to be mined...');

        let begin = performance.now();
        let txReceipt = await web3.eth.sendSignedTransaction(transaction);
        let executionTime = (performance.now() - begin).toFixed(4);

        return {
            executionTime: executionTime,
            txHash: txReceipt.transactionHash,
            gasUsed: txReceipt.gasUsed
        };
    }catch(err){
        console.log('Transaction not completed. Error: ', err);
        process.exit();
    }
}


async function executeFunction(name, values = [], opts = null){
    try{
        // if no function with such a name is found return;
        let func = _getFunction(name);
        if(!func) return;

        // if no values are given, get the hardcoded values or generate random ones
        if(values.length == 0){
            func.inputs.forEach(input => {
                if(Object.keys(input).length != 0){
                    if(input.value){
                        values.push(input.value);
                    }else{
                        values.push(utils.blockchain.getRandomInput(input));
                    }
                }
            });
        }
        
        let localOptions = utils.core.getOptions(opts, formattedCon.options);

        let message = con.methods[name].apply(null, values).encodeABI();
        let accessList = localOptions.useAccessList ? await con.methods[name].apply(null, values).createAccessList({from: process.env.MY_ADDRESS}): null;
        if(accessList) accessList = accessList.accessList;
        // Contract's address is included even though it is not used in any EXT* operation, resulting in 2400 extra
        let result = await send(message, null, accessList);
        
        if(localOptions.keepStats && options.keepStats){
            let toWrite = {
                basic: [result.txHash, Date().slice(0,24), result.gasUsed, result.executionTime],
                inputInfo: utils.core.type(values)
            };
            let folderPath = csvObject.writeStats(toWrite, 'blockchain', 'execute', name, formattedCon.name);

            if(localOptions.debug){
                await txDebugger.debugTransaction(result.txHash);
                await txDebugger.saveDebuggedTransaction(message, null, folderPath, Date().slice(0,24).replace(/\s|:/g, '_'))
            } 
        }

    }catch(error){
        console.log(error);
        process.exit();
    }
}


async function executeFunctions(values = [], opts = null){
    if(formattedCon.functions.length == 0) return; //this contract doesn't have functions, so return

    for(var func of formattedCon.functions){
        if(!func.execute) continue; // don't execute the function

        let name = func.name;
        await executeFunction(name, values, opts);
    }
}

async function executeSpecificFunctions(functions = {}, opts){
    if(formattedCon.functions.length == 0 || Object.values(functions).length == 0) return; //there are no functions to execute, so return

    for(const [func, values] of Object.entries(functions)){
        await executeFunction(func, values, opts);
    }
}

async function executeGetter(name, values = [],  opts = null){
    try{
        // if no getter with such a name is found return;
        let getter = _getGetter(name); 
        if(!getter) return;

        // if no values are given, get the hardcoded values or generate random ones
        if(values.length == 0){
            getter.inputs.forEach(input => {
                if(Object.keys(input).length != 0){
                    if(input.value){
                        values.push(input.value);
                    }else{
                        values.push(utils.blockchain.getRandomInput(input));
                    }
                }
            });
        }

        let localOptions = utils.core.getOptions(opts, formattedCon.options);
        let begin = performance.now();
        let result = await con.methods[name].apply(null, values).call();
        let retrievalTime = (performance.now() - begin).toFixed(4);

        if(localOptions.keepStats && options.keepStats){
            let toWrite = {
                basic: [Date().slice(0,24), retrievalTime],
                inputInfo: utils.core.type(result)
            };
            csvObject.writeStats(toWrite, 'blockchain', 'retrieveStorage', name, formattedCon.name);
        }
        return result;

    }catch(error){
        errors++;
        console.log(error);
        console.log(errors);
    }
}


async function retrieveStorage( opts = null){
    if(formattedCon.getters.length == 0) return;  // this contract doesn't have getters, so return;
    let localOptions = utils.core.getOptions(opts, formattedCon.options);

    for(var getter of formattedCon.getters){
        if(!getter.execute) continue;  // don't execute the getter
        if(localOptions.clearCache) utils.core.clearCache();

        let name = getter.name;
        await executeGetter(name, [], opts);
    }

}

async function isStorageDirty(getters){
    for(const getter of getters){
        let result = await executeGetter(getter, values = [], {keepStats: false});
        if(!result) continue;
        if(typeof result === 'object'){
            for(const val of Object.values(result)) if(!utils.blockchain.isEmpty(val)) return true;
        }else{
            if(!utils.blockchain.isEmpty(result)) return true;
        }
    }
    return false;
}

// TODO:    
// 1) Retrieve all events if toFind = null or throw an error "fill in toFind in formattedCon".
// 2) The same for index
// 3) Fill in paramType automatically

async function retrieveEvents(opts = null){
    if(formattedCon.events.length == 0) return;

    let localOptions = utils.core.getOptions(opts, formattedCon.options);

    for(var eve of formattedCon.events){
        if(!eve.retrieve) continue; // don't retrieve the Event
        if(localOptions.clearCache) utils.core.clearCache();

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

            if(localOptions.keepStats && options.keepStats){
                if(!result) continue;
                var totalTime = Number(allEventsRetrieval) + Number(findSpecificEvent) + Number(decodingTime);
                let id = ',';
                if(indexName == 'id') id = indexValue;
                let toWrite = {
                    basic: [Date().slice(0,24), results.length, id, allEventsRetrieval, findSpecificEvent, decodingTime, totalTime],
                    inputInfo: utils.core.type(result)
                };

                csvObject.writeStats(toWrite, 'blockchain', 'retrieve_Events', name, formattedCon.name);
            }


            console.log(`Retrieval time (events) |${eve.name}|: `, totalTime, 'Result: ',result.length);
            console.log(result.length > 10? result.substring(0,10) : result);

            // await utils.core.sleep(2);
        }catch(error){
            console.log(error);
            process.exit();
        }
    }
}


async function retrieveIndexedEvents(opts = null){
    if(formattedCon.indexedEvents.length == 0) return;

    let localOptions = utils.core.getOptions(opts, formattedCon.options);

    for(var eve of formattedCon.indexedEvents){
        if(!eve.retrieve) continue; // don't retrieve the Event
        if(localOptions.clearCache) utils.core.clearCache();

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


            if(localOptions.keepStats && options.keepStats){
                if(!result) continue;
                var totalTime = Number(retrievalTime) + Number(decodingTime);
                let id = ',';
                if(indexName == 'id') id = indexValue;

                let toWrite = {
                    basic: [Date().slice(0,24), numOfLogs, id, retrievalTime, decodingTime, totalTime],
                    inputInfo: utils.core.type(result)
                };

                csvObject.writeStats(toWrite, 'blockchain', 'retrieve_Indexed_Events', name, formattedCon.name);
            }


            console.log(`Retrieval time (events) |${eve.name}|: `, totalTime, 'Result: ',result.length);
            console.log(result.length > 10? result.substring(0,10) : result);

            // await utils.core.sleep(2);
        }catch(error){
            errors++;
            console.log(error);
            console.log(errors);
        }
    }
}


async function retrieveAnonymousEvents(opts = null) {
    if(formattedCon.anonymousEvents.length == 0) return;

    let localOptions = utils.core.getOptions(opts, formattedCon.options);

    for(var eve of formattedCon.anonymousEvents){
        if(!eve.retrieve) continue; // don't retrieve the Event
        if(localOptions.clearCache) utils.core.clearCache();

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

            if(localOptions.keepStats && options.keepStats){
                if(!result) continue;
                var totalTime = Number(retrievalTime) + Number(decodingTime);
                let id = ',';
                if(indexName == 'id') id = indexValue;

                let toWrite = {
                    basic: [Date().slice(0,24), numOfLogs || 0, id, retrievalTime, decodingTime, totalTime],
                    inputInfo: utils.core.type(result)
                };

                csvObject.writeStats(toWrite, 'blockchain', 'retrieve_Anonymous_Events', name, formattedCon.name);
            }


            console.log(`Retrieval time (anonymous) |${eve.name}|: `, totalTime, 'Result: ',result.length);
            console.log(result.length > 10? result.substring(0,10) : result);

            // await utils.core.sleep(2);
        } catch (error) {
            errors++;
            console.log(error);
            console.log(errors);
        }
    }
}


async function retrievePlainTransactionData(path, opts = null) {
    let localOptions = utils.core.getOptions(opts, formattedCon.options);

    let storedInTxData = [];
    csv.readCsvAsArray(path).forEach((line, i) => {
        if(i != 0) storedInTxData.push(line[0])
    });

    let name = path.split('/').slice(-1)[0];
    name = name.split('.')[0]

    for(const txHash of storedInTxData){
        if(localOptions.clearCache) utils.core.clearCache();
        try {
            let result = await retrieveTxData(txHash);

            if(localOptions.keepStats && options.keepStats){
                let toWrite = {
                    basic: [Date().slice(0,24), result.retrievalTime],
                    inputInfo: utils.core.type(result.decodedInput)
                };

                csvObject.writeStats(toWrite, 'blockchain', 'retrieve_txData', name);
            }
            console.log(`Retrieval time (txData) : `, result.retrievalTime, 'Result: ', result.decodedInput.length);
            console.log(result.decodedInput.length > 10? result.decodedInput.substring(0,10) : result.decodedInput);
            // await utils.core.sleep(2);
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

function _getFunction(name){
    for(const func of formattedCon.functions){
        if(name == func.name) return func;
    }
}

function _getGetter(name){
    for(const getter of formattedCon.getters){
        if(name == getter.name) return getter;
    }
}


module.exports = {
    loadBlockchain,
    config,
    executeFunctions,
    sendData,
    fallback,
    retrieveStorage,
    retrieveEvents,
    retrieveIndexedEvents,
    retrieveAnonymousEvents,
    retrievePlainTransactionData,
    executeFunction,
    executeGetter,
    isStorageDirty,
    executeSpecificFunctions
};
