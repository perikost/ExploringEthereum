require('dotenv').config();
const randomstring = require("randomstring");
const path = require('path');
const CSV = require('./csvModule.js');
const provider = `https://ropsten.infura.io/v3/${process.env.INFURA_ID}`;
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider(provider));
const formattedContractsPath = './formatted_contracts';
const fs = require('fs');
const prompt = require('prompt-sync')({sigint: true});
const shell = require('shelljs');
const { CID } = require('multiformats/cid');
const assert = require('assert');
const readline = require('readline');

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);

const core = {
    setOptions(opts, targetOpts) {
        if(!opts || typeof opts !== 'object' || Object.keys(opts).length === 0) return;

        for(const opt in targetOpts) {
            if (typeof targetOpts[opt] === 'object') {
                this.setOptions(opts[opt], targetOpts[opt])
            } else if (opts.hasOwnProperty(opt)) {
                targetOpts[opt] = opts[opt];
            }
        }
    },

    getOptions(opts, sourceOpts, merge = false) {
        if (!opts || typeof opts !== 'object' || Object.keys(opts).length === 0) return JSON.parse(JSON.stringify(sourceOpts));
        let options = opts && merge? {...opts} : {}; // TODO: investigate if they should be merged

        for (const opt in sourceOpts) {
            if (typeof sourceOpts[opt] === 'object') {
                options[opt] = this.getOptions(opts[opt], sourceOpts[opt], merge)
            } else {
                options[opt] = opts.hasOwnProperty(opt) ? opts[opt] : sourceOpts[opt];
            }
        }

        return options;
    },

    sleep(sec) {
        let ms = sec*1000;
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    keypress() {
        return new Promise(resolve => {
            // Opposite of unref(), calling ref() on a previously unrefed socket will not let the program exit if it's the only socket left
            // We use ref(),unref() to ensure that the program will wait for a keypress but will be able to exit after it 
            process.stdin.ref();
            process.stdin.once('keypress', (str, key) => {
                process.stdin.unref();
                resolve(key);
            });
        });
    },

    clearCache(){
        // must run script as sudo (sudo node utils.js) for this to work
        // shell.exec(path.join(__dirname, 'cache.sh'));
    
        // alternatively
        shell.exec('free -h');
        shell.exec(`sync; echo ${process.env.USER_PASSWORD} | sudo -S sh -c 'echo 3 >/proc/sys/vm/drop_caches' && echo ''`);
        shell.exec('free -h');
    },

    toHex(input){
        return web3.utils.toHex(input);
    },

    parseJsonl(filePath){
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
    },

    type(values){
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
    },

    byteSize (dataSize) {
        if (typeof dataSize === 'number') return dataSize;

        const sizeMap = { 'b': 1, 'kb': 1024, 'mb': 1024 * 1024 }
        // const size = parseFloat(dataSize.match(/[. 0-9]+/)[0]);
        // const unitMatch = dataSize.match(/kb|mb|b/i);
        // const unit = unitMatch ? unitMatch[0].toLowerCase() : 'b'
        const fileSize = dataSize.match(/(?<size>[. 0-9]+)(?<unit>kb|mb|b)?/i)
        const {size, unit} = fileSize.groups;

        return Math.floor(size * sizeMap[unit.toLowerCase() || 'b']);
    },

    getRandomString(length){
        length = this.byteSize(length);
        // returns 32 characters if length = 0
        let string = randomstring.generate({
            length: length,
            charset: 'alphabetic'
        });
    
        return string;
    },

    getRandomUint(power){
        let max = 2 ** power;
        return Math.floor(Math.random() * max);
    },
    
    getRandomBytes(length){
        let str = this.getRandomString(length);
        return web3.utils.toHex(str);
    },

    getRandomStrings({start = 1, maxStringSize = 16384, step = 2, stepOp = '*'} = {}){
        maxStringSize = this.byteSize(maxStringSize);
        start = this.byteSize(start)

        let randomStrings = [];
        let i = start;
        while(true){
            let input;
            if(i >= maxStringSize) {
                input = this.getRandomString(maxStringSize);
                randomStrings.push(input);
                break;
            }
            
            input = this.getRandomString(i);
            randomStrings.push(input);
            if (stepOp == '+') i += step;
            if (stepOp == '*') i *= step;
        }
        return randomStrings;
    }
}


const blockchain = {
    getContracts(chosenContracts){
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
    },

    getRandomInput(arg){
        if(arg.length){
            let funcName = arg.type.charAt(0).toUpperCase() + arg.type.slice(1);
            return core['getRandom' + funcName](arg.length);
        }else{
            let temp = arg.type.split(/(\d+)/);
            let funcName = temp[0].charAt(0).toUpperCase() + temp[0].slice(1);
            let length = temp[1];
    
            return core['getRandom' + funcName](length);
        }
    },

    isEmpty(input){
        // TODO: check what do empty strings (maybe null?) or other data types return and correct the calculation
        assert(typeof input === 'string', 'Input is not a string');
        try {
            var inputBN = web3.utils.toBN(input).toString()
        } catch (error) {
            return input.length === 0;
        }
        return input ? inputBN == web3.utils.toBN(0).toString() : true 
    }
}


const dfs = {
    getIdentifiers(platform, rootFolder = './csv_records'){
        let headerToSearch;
        if(platform == 'ipfs') headerToSearch = 'CID';
        else headerToSearch = 'Hash';
    
        let csvsFolder = csv.chooseCsvFolder(rootFolder);
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
    },

    inspectCid(cidString){
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
}

// TODO: change chooseCsvFolder in csv.module
const csv = {
    chooseCsvFolder(rootFolder){
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
}

module.exports = {
    core: core,
    blockchain: blockchain,
    dfs: dfs,
    csv: csv,
    web3: web3
};
