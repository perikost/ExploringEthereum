const randomstring = require("randomstring");
const path = require('path');
const CSV = require('./csvClassModule.js');
const provider = `https://ropsten.infura.io/v3/${process.env.INFURA_ID}`;
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider(provider));
const formattedContractsPath = './formatted_contracts';
const fs = require('fs');
const prompt = require('prompt-sync')({sigint: true});

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
// IPFS & Swarm

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

module.exports = {
    sleep : _sleep,
    toHex : _toHex,
    getContracts : _getContracts,
    getRandomInput : _getRandomInput,
    getRandomString : getRandom_string,
    getRandomUint : getRandom_uint,
    getRandomBytes : getRandom_bytes,
    getIdentifiers : _getIdentifiers,
    parseJsonl: _parseJsonl
};
