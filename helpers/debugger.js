const path = require('path');
const fs = require('fs');
const csv = require('./csvModule.js');
const utils = require('./utils.js');

const REEXEC = Number.MAX_SAFE_INTEGER;
const BASE_FEE = 21000;

module.exports = class TransactionDebugger {

    constructor(web3Instance){
        this.web3 = web3Instance;
        this.extendWeb3();
    }

    extendWeb3(){
        this.web3.extend({
            property: 'debug',
            methods: [
                {
                    name: 'transaction',
                    call: 'debug_traceTransaction',
                    params: 2,
                    inputFormatter: [null, null]
                },
                {
                    name: 'transactionToFile',
                    call: 'debug_standardTraceBlockToFile',
                    params: 2,
                    inputFormatter: [null, null]
                }
            ]
        });
    }

    async saveDebuggedTransaction(txData, accessList, folderPath, fileName){
        let steps = this.debuggedTx.structLogs;
        steps.map((step, index) => step.step = index);
        let txDataInfo = txData ?  processTxData(txData): 'not provided';
        let accessListGas = accessListCost(accessList);
        let opcodesGas = steps && steps.length? steps.reduce((previousStep, currentStep) => {return {gasCost : previousStep.gasCost + currentStep.gasCost }}).gasCost : 0
        let info = {
            transactionHash: this.debuggedTx.txHash,
            txDataInfo: txDataInfo,
            baseGasFee: BASE_FEE,
            opcodesGas: opcodesGas,
            opcodesStartGas: steps && steps.length ? steps[0].gas: 0,
            opcodesRemainingGas: steps && steps.length? steps[steps.length - 1].gas: 0,
            gasUsed: this.debuggedTx.gas? this.debuggedTx.gas : BASE_FEE + opcodesGas + (txDataInfo.gas? txDataInfo.gas : 0) + accessListGas,
            accessListGas: accessListGas,
            accessList: accessList? accessList : null,
            steps: steps
        }
        
        folderPath = path.join(`${folderPath}_debugged`);
        if(!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
    
        let filePath = path.join(folderPath, `${fileName}.json`);
        if(fs.existsSync(filePath)) await utils.core.sleep(1);  // TODO: This is a slopy fix. Improve
        fs.writeFileSync(filePath, JSON.stringify(info, null, 4));
    }

    async debugTransaction(txHash){
        this.debuggedTx = await this.web3.debug.transaction(txHash ,{});
        this.debuggedTx.txHash = txHash;
    }

    async debugOldTransaction(txHash, folderPath, fileName){
        try{
            var transaction = await this.web3.eth.getTransaction(txHash);
            var result = await this.web3.debug.transactionToFile(transaction.blockHash ,{txHash: txHash, reexec: REEXEC, disableStorage: false});
        }catch(err){
            console.log(err);
        }

        let traceFileName = 'block_' + transaction.blockHash.substring(0, 4);
        let tempContens = fs.readdirSync('/tmp');
        
        for(const file of tempContens){
            if(file.startsWith(traceFileName)){
                let tracePath = path.join('/tmp', file);
                let trace = utils.core.parseJsonl(tracePath);
                trace = this.convertGasToNumber(trace);

                this.debuggedTx = {};
                this.debuggedTx.txHash = txHash;
                this.debuggedTx.structLogs = trace.slice(0, -1);
                this.debuggedTx.gas = null;
                
                await this.saveDebuggedTransaction(transaction.input, null, folderPath, fileName)
                fs.unlinkSync(path.join('/tmp', file));
            }
        }
    }

    async debugSavedTransactions(csvPath){
        /* 
        TODO: write a function that returns csv as:
            [
                { headers : values },
                { headers : values },
                ....
            ]
        and then use records = records.map(record => record.txHash)
        */
        console.log(csvPath);
        let records = csv.readCsvAsArray(csvPath, 1)
        let txHashes = records.map(record => record[0])
        let folderPath = path.join(path.dirname(csvPath), path.parse(csvPath).name)

        for(const txHash of txHashes) await this.debugOldTransaction(txHash, folderPath, Date().slice(0,24).replaceAll(' ', '_'));
    }

    async debugAllSavedTransactions(rootFolder){
        const items = fs.readdirSync(rootFolder);
        for(var item of items){
            let pathToItem = path.join(rootFolder, item);
            if(fs.lstatSync(pathToItem).isDirectory()) {
                await this.debugAllSavedTransactions(pathToItem);
            }
            else {
                if(path.parse(pathToItem).ext !== '.csv') continue;
                console.log(pathToItem);
                await this.debugSavedTransactions(pathToItem);
            }
        }
    }

    convertGasToNumber(trace){
        trace.map(step => {
          step.gas = this.web3.utils.hexToNumber(step.gas);
          step.gasCost = this.web3.utils.hexToNumber(step.gasCost);
        })
        return trace;
    }
}

function processTxData(txData){
    let data = txData.substring(2);
    let zeroBytes = 0;
    let nonZeroBytes = 0;

    for(let i=0; i < data.length; i += 2){
        if(data.substring(i,i + 2) === '00') zeroBytes++;
        else nonZeroBytes++;
    }

    return {
        transactionData: txData.length > 512 ? `${txData.substring(0, 512)}...`: txData,
        zeroBytes: zeroBytes,
        nonZeroBytes: nonZeroBytes,
        gas: nonZeroBytes*16 + zeroBytes*4
    };
}

function accessListCost(accessList){
    let gasUsed = 0;
    if(accessList) accessList.forEach(element => {
        // each element of the access list corresponds to an address, so add 2400
        gasUsed += 2400;

        // each element of the access list has a storageKeys array
        gasUsed += element.storageKeys.length * 1900;
    });
    return gasUsed;
}