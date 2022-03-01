require('dotenv').config();
const csv = require('./csvModule.js');  //normal
const CSV = require('./csvClassModule.js').CSV;  //class
const utils = require('./utils.js');
const performance = require('perf_hooks').performance;
const ethereumTx = require('ethereumjs-tx').Transaction;
const Web3 = require('web3');

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
var fork; // TODO: pass this as a value in _loadBlockchain()
var csvObject;

// TODO: maybe make capitalize the vars above to be able to tell them apart easily

async function _loadBlockchain(provider = 'localhost',  signMeth = 'Web3'){ 
    // TODO: improve
    if(provider != 'localhost') provider = `https://ropsten.infura.io/v3/${process.env.INFURA_ID}`;
    else provider = 'http://localhost:8545'

    web3 = new Web3(new Web3.providers.HttpProvider(provider));
    signMethod = signMeth;
    csvObject = new CSV();
}


async function _config(contract, signMeth = 'Web3'){  
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

    let toWrite = [txHash, Date().slice(0,24), info.type, info.size, cost, executionTime];

    if(keepStats){
        // class
        csvObject.writeStats(toWrite, 'blockchain', 'execute', 'send_data');

        // normal
        // csv.write(toWrite, 'blockchain', 'execute', 'send_data');
    }

    console.log('Data was sent');
}


async function _fallback(input, keepStats = true){
    if(!formattedCon.fallback) return;  //this contract doesn't have a fallback, so return

    let message = web3.utils.toHex(input);
    let result = await send(message);

    let executionTime = result.executionTime;
    let txHash = result.txReceipt.transactionHash;
    let cost = result.txReceipt.gasUsed;
    let info = type(input);

    let toWrite = [txHash, Date().slice(0,24), info.type, info.size, cost, executionTime];

    if(keepStats){
        // class
        csvObject.writeStats(toWrite, 'blockchain', 'execute', 'fallback', formattedCon.name);

        // normal
        // csv.write(toWrite, 'blockchain', 'execute', 'fallback', formattedCon.name);
    }

    console.log('Fallback executed');
}


// TODO: split in two: send, sign with web3, sign with ethereumjs
async function send(input, account){
    try{
        let accountTo = formattedCon.contractAddress;
        if(account) accountTo = account;
        let nonce = await web3.eth.getTransactionCount(process.env.MY_ADDRESS);

        if(signMethod == 'web3'){
            var rawTx = {
                 nonce: nonce,
                 to: accountTo,
                 gasPrice : web3.utils.toWei('20', 'gwei'),
                 value: 0,
                 data: input,
                 chain: 'ropsten',
                 hardfork: fork
            };
        }else{
            var rawTx = {
                nonce: web3.utils.toHex(nonce),
                gasPrice: web3.utils.toHex(web3.utils.toWei('20', 'gwei')),
                to: accountTo,
                value: web3.utils.toHex(0),
                data: input
            };
        }

        let gasEstimate = await web3.eth.estimateGas(rawTx);
        let gasToSend = 10000 * Math.ceil(gasEstimate / 10000);
        console.log('Estimate',gasEstimate);

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

        console.log('sending');

        let begin = performance.now();
        let txReceipt = await web3.eth.sendSignedTransaction(transaction);
        let executionTime = (performance.now() - begin).toFixed(4);

        return {
            executionTime : executionTime,
            txReceipt : txReceipt
        };
    }catch(err){
        console.log('Could not send transaction', err);
        process.exit();
    }
}


async function executeFunction(name, {values = [],  keepStats = true} = {}){
    try{
        // if no values are given, get the harcoded values or generate random ones
        if(values.length == 0){
            let func = getFunction(name);
            if(!func){
                // if no such function is found return;
                return;
            }

            func.args.forEach(arg => {
                if(Object.keys(arg).length != 0){
                    if(arg.value){
                        values.push(arg.value);
                    }else{
                        values.push(utils.getRandomInput(arg));
                    }
                }
            });
        }
        
        let message = con.methods[name].apply(null, values).encodeABI();
        let result = await send(message);
        
        if(keepStats){
            let executionTime = result.executionTime;
            let txHash = result.txReceipt.transactionHash;
            let cost = result.txReceipt.gasUsed;
            // TODO: 
            // Make csv module more abstract.
            // This only work for one input.
            // Allow multiple inputs or don't record info for inputs
            // Possible solution: one header for each input
            //    e.g.,
            //    columns (headers): input1 info, input2 info 
            //    rows: type_of_input1 : size_of_input1...etc
            // type() also needs to be more abstract 
            let info = type(values[0]);
            let toWrite = [txHash, Date().slice(0,24), info.type, info.size, cost, executionTime];
        
            // class
            csvObject.writeStats(toWrite, 'blockchain', 'execute', name, formattedCon.name);
        
            // normal
            // csv.write(toWrite, 'blockchain', 'execute', name, formattedCon.name);
        }

    }catch(error){
        console.log(error);
        process.exit();
    }
}


async function _executeFunctions(keepStats = true){
    if(formattedCon.functions.length == 0) return; //this contract doesn't have functions, so return

    for(var func of formattedCon.functions){
        if(!func.execute) continue; // don't execute the function

        let name = func.name;
        await executeFunction(name, {keepStats : keepStats});
    }
}


async function executeGetter(name, {values = [],  keepStats = true} = {}){
    try{
        // if no values are given, get the harcoded values or generate random ones
        if(values.length == 0){
            let getter = getGetter(name);

            getter.args.forEach(arg => {
                if(Object.keys(arg).length != 0){
                    if(arg.value){
                        values.push(arg.value);
                    }else{
                        values.push(utils.getRandomInput(arg));
                    }
                }
            });
        }

        let begin = performance.now();
        let result = await con.methods[name].apply(null, values).call();
        let executionTime = (performance.now() - begin).toFixed(4);

        if(keepStats){
            // TODO: 
            // Make csv module more abstract.
            // This only work for one input.
            // Allow multiple inputs or don't record info for inputs
            // Possible solution: one header for each input
            //    e.g.,
            //    columns (headers): input1 info, input2 info 
            //    rows: type_of_input1 : size_of_input1...etc
            // type() also needs to be more abstract
            let info = type(result);
            let toWrite = [Date().slice(0,24), info.type, info.size, executionTime];

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
                let toWrite = [Date().slice(0,24),id, results.length, info.type, info.size, executionTime, decodingTime, totalTime];

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
                let toWrite = [Date().slice(0,24),id, info.type, info.size, executionTime, decodingTime, totalTime];
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
                let toWrite = [Date().slice(0,24),id, info.type, info.size, retrievalTime, decodingTime, totalTime];
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
            let toWrite = [Date().slice(0,24), info.type, info.size, result.retrievalTime];

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


async function retrieveUnused(txHash, type) {
    // TODO: measure time as in retrieveTxData
    let tx = await web3.eth.getTransaction(txHash);
    let txData = tx.input;
    let param = '0x' + txData.slice(10);
    let result = web3.eth.abi.decodeParameter(type, param);

    return result;
}


function type(input){
    if(!input) return {type : 'No input', size : 'No input'};
    if(typeof(input) != 'string') return {type : typeof(input), size : 'Not measured'};
    if( input.slice(0,2) == '0x'){ //could also use web3.utils.isHexStrict()
        let length = input.slice(2).length / 2;
        if( length == 32) return {type : 'Bytes32', size : length};
        return {type : 'Bytes', size : length};
    }
    let length = input.length;
    return {type : typeof(input), size : length};
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
