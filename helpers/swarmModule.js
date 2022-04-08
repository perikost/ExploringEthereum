const fs = require('fs');
const csv = require('./csvModule.js');
const utils = require('./utils.js');
const performance = require('perf_hooks').performance;
const { Bee, BeeDebug } = require("@ethersphere/bee-js");
const bee = new Bee("http://localhost:1633");
const beeDebug = new BeeDebug("http://localhost:1635");
const CSV = require('./csvClassModule.js').CSV;  //class
const csvObject = new CSV();
//const bee = new Bee("https://gateway.ethswarm.org");

const POSTAGE_STAMPS_AMOUNT = '10000000';
const POSTAGE_STAMPS_DEPTH = 20

var postageBatchId;

async function _configPostageBatch(){
    let availableBatches = await beeDebug.getAllPostageBatch();
    let batchId;

    // check if we have a non expired postageBatch
    if(availableBatches && availableBatches.length >= 0){
        for(const batch of availableBatches){
            if(batch.batchTTL >= 0){
                batchId = batch.batchID;
                console.log('\nUsing batchId:', batchId);
                break;
            }
        }
    }
    
    if (!batchId){
        batchId = await beeDebug.createPostageBatch(POSTAGE_STAMPS_AMOUNT, POSTAGE_STAMPS_DEPTH)
    }
    postageBatchId = batchId;
}

async function _uploadText(data, keepStats=true){
    try{
        let options = {
            pin: true,
            deferred : false // when true, node uploads data locally and then pushes chunks to the network
            // encrypt: true
        };

        let begin = performance.now();
        let result = await bee.uploadData(postageBatchId, data, options); 
        let uploadTime = (performance.now() - begin).toFixed(4);
        let hash = result.reference;

        let info = utils.type(data);
        let toWrite = {
            basic: [Date().slice(0,24), hash, uploadTime],
            inputInfo: info
        };

        if(keepStats) csvObject.writeStats(toWrite, 'swarm', 'upload', `string_${data.length / 1024}kB`);

        await utils.sleep(2);
        return hash;
    }catch(err){
        console.log(err);
        process.exit();
    }
}

async function retrieveText(hash, keepStats=true){
    try{
        let begin;
        let date = Date().slice(0,24);

        begin = performance.now();
        var data = await bee.downloadData(hash);
        retrievalTime = (performance.now() - begin).toFixed(4);

        data = new TextDecoder("utf-8").decode(data);
        let info = utils.type(data);
        let toWrite = {
            basic: [Date().slice(0,24), retrievalTime],
            inputInfo: info
        };
        
        if(keepStats) csvObject.writeStats(toWrite, 'swarm', 'retrieve', `string_${data.length / 1024}kB`);
        
        await utils.sleep(2);
    }catch(err){
        console.log(err);
        process.exit();
    }
}

async function _retrieveAllTexts(hashes, times = 1, clearCache = true){
    for(let i = 0; i < times; i++){
        for(const hash of hashes){
            if(clearCache) utils.clearCache();
            await retrieveText(hash);
        }
    }
}

module.exports = {
    retrieveAllTexts : _retrieveAllTexts,
    uploadText : _uploadText,
    configPostageBatch : _configPostageBatch
}
