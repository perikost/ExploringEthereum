const { create, globSource } = require('ipfs-http-client');
const ipfs = create('http://localhost:5001');
const fs = require('fs');
const bs58 = require('bs58');
const csv = require('./csvModule.js');  //normal
const CSV = require('./csvClassModule.js').CSV;  //class
const csvObject = new CSV();
const utils = require('./utils.js');
const performance = require('perf_hooks').performance;
const UnixFS = require('ipfs-unixfs');
//const BigNumber = require('bignumber.js');


// CIDs are a base58 encoding of a Hash(in this case a Bytes32) and a prefix.
// The 2 Functions below are used to transform a CID to Bytes32 and reverse.
function _bytes32ToCid(bytes32){
    let prefix = '1220'; // standard first 2 bytes of every IPFS version 0 CID
    bytes32 = bytes32.slice(2);
    cid = prefix + bytes32;
    cid = Buffer.from(cid, 'hex');
    cid = bs58.encode(cid);
    return cid;
}


function _cidToBytes32(cid){
    cid = cid.toString();
    cid = bs58.decode(cid);
    cid = cid.toString('hex');
    cid = cid.slice(4); // don't include '1220'
    let bytes32 = '0x' + cid;
    return bytes32;
}


async function _uploadText(data, {wrapWithDirectory = false, keepStats = true} = {}){
    try{
        let options = {
            //cidVersion : 0,
            //rawLeaves : true
            wrapWithDirectory : wrapWithDirectory
            //chunker : 'size-4096'
            //progress : (prog) => console.log(prog)
        };

        let begin = performance.now();
        let uploaded = await ipfs.add(data, options);
        let uploadTime = (performance.now() - begin).toFixed(4);
        //UPLOAD AS OBJECT
        //const obj = {
        //    Data: new TextEncoder().encode('test'),
        //    Links: []
        //}
        //const cid = await ipfs.object.put(obj)
        //UPLOAD AS OBJECT

        console.log('uploaded text');
        let date = Date().slice(0,24);
        let toWrite = [date, uploaded.cid, uploaded.size, data.length, uploadTime];

        if(keepStats) csvObject.writeStats(toWrite, 'ipfs', 'upload', `string_${data.length}`);

        await utils.sleep(1);
        return uploaded.cid;
    }catch(err){
        console.log(err);
        process.exit();
    }
}

async function retrieveText(cid, keepStats = true){
    try{
        let chunks = [];

        let begin = performance.now();
        for await (const chunk of ipfs.cat(cid, {timeout : 200})) chunks.push(chunk);
        let executionTime = (performance.now() - begin).toFixed(4);

        let objectStats = await ipfs.object.stat(cid);
        let data = chunks.toString();
        let toWrite = [Date().slice(0,24), objectStats.CumulativeSize, data.length, executionTime];
        
        if(keepStats) csvObject.writeStats(toWrite, 'ipfs', 'retrieve', `string_${data.length}.csv`);

        console.log(data);
        await utils.sleep(1);
    }catch(err){
        console.log(err);
        process.exit();
    }
}

async function _retrieveAllTexts(cids, keepStats = true){
    for(const cid of cids) await retrieveText(cid, keepStats);
}


async function _clearRepo(){
    try{
        for await (const {cid,type} of ipfs.pin.ls({type : 'recursive'})) await ipfs.pin.rm(cid);
        for await (const res of ipfs.repo.gc());
        let stats = await ipfs.repo.stat({human : true});
        console.log(stats);
    }catch{
        console.log(error);
        process.exit();
    }
}


module.exports = {
    clearRepo : _clearRepo,
    cidToBytes32 : _cidToBytes32,
    bytes32ToCid : _bytes32ToCid,
    uploadText : _uploadText,
    retrieveAllTexts : _retrieveAllTexts
};
