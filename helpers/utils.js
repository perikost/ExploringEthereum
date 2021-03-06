require('dotenv').config();
const randomstring = require("randomstring");
const path = require('path');
const CSV = require('./csvClassModule.js');
const provider = `https://ropsten.infura.io/v3/${process.env.INFURA_ID}`;
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider(provider));
const formattedContractsPath = './formatted_contracts';
const fs = require('fs');
const prompt = require('prompt-sync')({sigint: true});
const shell = require('shelljs');
const { CID } = require('multiformats/cid');
const hashes = require('multihashes')
const assert = require('assert');
// const { inspect } = require('util');

function _sleep(sec) {
    let ms = sec*1000;
    return new Promise(resolve => setTimeout(resolve, ms));
}

function _toHex(input){
    return web3.utils.toHex(input);
}


// blockchain
function _getContracts(chosenContracts){
    let availableContracts = fs.readdirSync(formattedContractsPath);
    let contracts = [];

    availableContracts.forEach(file => {
        let con = fs.readFileSync(path.join(formattedContractsPath, file), 'utf8');
        contracts.push(JSON.parse(con));
    });

    if(chosenContracts){
        if(chosenContracts != 'all'){
            contracts = contracts.filter(con => {
                return chosenContracts.includes(con.name);
            });
        }
    }else{
        availableContracts.forEach((file,id) => {
            console.log(`(${id}) ${file}`);
        });
        chosenIds = prompt('Which contracts do you want to execute (ids separated by comma) ?');
        chosenIds = chosenIds.split(',');
        contracts = contracts.filter((con, id) => {
            return chosenIds.indexOf(String(id)) >= 0;
        });
    }
    return contracts;
}

// TODO: add more data types
function _getRandomInput(arg){
    if(arg.length){
        return eval("getRandom_" + arg.type)(arg.length);
    }else{
        let temp = arg.type.split(/(\d+)/);
        let funcName = temp[0];
        let length = temp[1];

        return eval("getRandom_" + funcName)(length);
    }
}
function getRandom_string(length){
    // returns 32 characters if length = 0
    let string = randomstring.generate({
        length: length,
        charset: 'alphabetic'
    });

    return string;
}

function getRandom_uint(power){
    let max = 2 ** power;
    return Math.floor(Math.random() * max);
}

function getRandom_bytes(length){
    let str = getRandom_string(length);
    console.log(length);
    return web3.utils.toHex(str);
}


function _isEmpty(input){
    // TODO: check what do empty strings (maybe null?) or other data types return and correct the calculation
    assert(typeof input === 'string', 'Input is not a string');
    try {
        var inputBN = web3.utils.toBN(input).toString()
    } catch (error) {
        return input.length === 0;
    }
    return input ? inputBN == web3.utils.toBN(0).toString() : true 
}
// blockchain


// IPFS & Swarm
function _getIdentifiers(platform, rootFolder = './csv_records'){
    let headerToSearch;
    if(platform == 'ipfs') headerToSearch = 'CID';
    else headerToSearch = 'Hash';

    let csvsFolder = chooseCsvFolder(rootFolder);
    let folders = fs.readdirSync(csvsFolder);

    let platformIndex = folders.indexOf(platform);
    if(platformIndex < 0){
        console.log('Could not find uploaded cids');
        return null;
    }

    let platformFolder = path.join(csvsFolder, folders[platformIndex], 'upload');
    console.log(platformFolder);

    let identifiers = [];
    for(const csvPath of fs.readdirSync(platformFolder)){
        let info = CSV.readCsvAsArray(path.join(platformFolder, csvPath));
        
        // get the column containing the cids, excluding the first element (header) 
        let ids = info.map(line => { return line[info[0].indexOf(headerToSearch)]; });
        ids = ids.slice(1);
        identifiers.push(...ids);
    }
    return identifiers;
}

function chooseCsvFolder(rootFolder){
    const folders = fs.existsSync(rootFolder)? fs.readdirSync(rootFolder) : null;
    if(!folders) {
        console.log(`Could not find folder '${rootFolder}' cids`);
        return null;
    }

    console.log('CSV records folders:');
    for(let [index, folder] of folders.entries()) console.log(`(${index}) `, folder);
    
    console.log('');
    let choice = Number(prompt('Choose folder to read from '));

    if (choice >=0 && choice <= folders.length) return path.join(rootFolder, folders[choice]);
    else{
        console.log('Chosen folder out of bounds.');
        return null;
    }
}

function _inspectCid(cidString){
    let cid = CID.parse(cidString);
    let inspectedCid = CID.inspectBytes(cid.bytes.subarray(0, 10));

    for(const [key,val] of Object.entries(inspectedCid)){
        inspectedCid[key] = web3.utils.toHex(val)
    }

    inspectedCid.digest = '0x' + Buffer.from(cid.multihash.digest).toString('hex');
    
    // or
    // let decoded = hashes.decode(Buffer.from(cid.multihash.bytes))
    // inspectedCid.digest = '0x' + hashes.toHexString(decoded.digest);

    return inspectedCid;
}
// IPFS & Swarm


// General
function _parseJsonl(filePath){
    let content = fs.readFileSync(filePath, 'utf-8').split('\n');
    let parsedContent = [];
    content.forEach(line => {
      try{
        parsedContent.push(JSON.parse(line));
      }catch{
        //
      }
    });
    return parsedContent;
}

function _type(values){
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

function _clearCache(){
    // must run script as sudo (sudo node utils.js) for this to work
    // shell.exec(path.join(__dirname, 'cache.sh'));

    // alternatively
    shell.exec('free -h');
    shell.exec(`sync; echo ${process.env.USER_PASSWORD} | sudo -S sh -c 'echo 3 >/proc/sys/vm/drop_caches' && echo ''`);
    shell.exec('free -h');
}


module.exports = {
    sleep : _sleep,
    toHex : _toHex,
    getContracts : _getContracts,
    getRandomInput : _getRandomInput,
    getRandomString : getRandom_string,
    getRandomUint : getRandom_uint,
    getRandomBytes : getRandom_bytes,
    getIdentifiers : _getIdentifiers,
    parseJsonl: _parseJsonl,
    type: _type,
    clearCache: _clearCache,
    inspectCid: _inspectCid,
    web3: web3,
    isEmpty: _isEmpty
};
