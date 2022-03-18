const path = require('path');
const fs = require('fs');

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
        fs.writeFileSync(filePath, JSON.stringify(info, null, 4));
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
