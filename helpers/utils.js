const randomstring = require("randomstring");
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

function _getContracts(){
    let availableContracts = fs.readdirSync(formattedContractsPath);
    let contracts = [];

    availableContracts.forEach((file,i) => {
        console.log(`(${i}) ${file}`);
    });

    let chosenContracts = prompt('Which contracts do you want to execute (ids separated by comma) ?');
    chosenContracts = chosenContracts.split(',');
    chosenContracts.forEach(id => {
        let conName = availableContracts[Number(id)];
        let con = fs.readFileSync(formattedContractsPath + '/' + conName, 'utf8');
        contracts.push(JSON.parse(con));
    });

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

module.exports = {
    sleep : _sleep,
    toHex : _toHex,
    getContracts : _getContracts,
    getRandomInput : _getRandomInput,
    getRandomString : getRandom_string,
    getRandomUint : getRandom_uint,
    getRandomBytes : getRandom_bytes
};
