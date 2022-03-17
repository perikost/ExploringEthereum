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

    async saveDebuggedTransaction(txHash, folderPath, fileName){
        let result = await this.web3.debug.transaction(txHash ,{});
        let steps = result.structLogs;
        steps.map((step, index) => step.step = index);
        let info = {
            transactionHash: txHash,
            opcodesGas: steps.reduce((previousStep, currentStep) => {return {gasCost : previousStep.gasCost + currentStep.gasCost }}).gasCost,
            startGas: steps[0].gas,
            remainingGas: steps[steps.length - 1].gas,
            spentGas: result.gas,
            steps: steps
        }
        
        folderPath = path.join(folderPath, 'debuggedTransactions');
        if(!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
    
        let filePath = path.join(folderPath, `${fileName}.json`);
        fs.writeFileSync(filePath, JSON.stringify(info, null, 4));
    }
}