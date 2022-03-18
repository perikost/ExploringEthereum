const path = require('path');
const fs = require('fs');
const csv = require('./csvClassModule.js');
const utils = require('./utils.js');

module.exports = class TransactionDebugger {

    constructor(web3Instance){
        this.web3 = web3Instance;
        this.extendWeb3();
    }

    extendWeb3(){
        this.web3.extend({
            property: 'debug',
            methods: [{
                name: 'transaction',
                call: 'debug_traceTransaction',
                params: 2,
                }]
        });
    }

    async saveDebuggedTransaction(txHash, txData, folderPath, fileName){
        let result = await this.web3.debug.transaction(txHash ,{});
        let steps = result.structLogs;
        steps.map((step, index) => step.step = index);
        let info = {
            transactionHash: txHash,
            txDataInfo: txData ?  processTxData(txData): 'not provided',
            baseGasFee: 21000,
            opcodesGas: steps.reduce((previousStep, currentStep) => {return {gasCost : previousStep.gasCost + currentStep.gasCost }}).gasCost,
            opcodesStartGas: steps[0].gas,
            opcodesRemainingGas: steps[steps.length - 1].gas,
            gasUsed: result.gas,
            steps: steps
        }
        
        folderPath = path.join(folderPath, 'debuggedTransactions');
        if(!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
    
        let filePath = path.join(folderPath, `${fileName}.json`);
        if(fs.existsSync(filePath)) await utils.sleep(1);  // TODO: This is a slopy fix. Improve
        fs.writeFileSync(filePath, JSON.stringify(info, null, 4));
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
        let records = csv.readCsvAsArray(csvPath, 1)
        let txHashes = records.map(record => record[0])
        let folderPath = path.join(path.dirname(csvPath), path.parse(csvPath).name)

        for(const txHash of txHashes) console.log(txHash, null, folderPath, Date().slice(0,24).replaceAll(' ', '_'))
        // for(const txHash of txHashes) await this.debugSavedTransactions(txHash, null, folderPath, Date().slice(0,24).replaceAll(' ', '_'));
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
                await this.debugSavedTransactions(pathToItem);
            }
        }
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
