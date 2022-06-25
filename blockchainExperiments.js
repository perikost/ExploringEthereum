const blockchain = require('./helpers/ropstenModule.js');
const utils = require('./helpers/utils.js');

var contracts = [];


async function execute(input, reset){
    if(reset){
        await blockchain.executeFunction('reset');
    }

    await blockchain.executeFunctions(input);
    await utils.core.sleep(2);
}

async function loopExecution({loops = 1,  executionType = 'functions', reset = false, startingID = 0} = {}) {
    if(executionType == 'send_data'){
        for(const value of utils.core.getRandomStrings()){
            await blockchain.sendData(value);
        }
    }else{
        for(const con of contracts){
            blockchain.config(con, {keepStats: true});
            for(let [index, value] of utils.core.getRandomStrings().entries()){
                for (var i = 0; i < loops; i++) {
                    if(loops > 1) {value = utils.core.getRandomString(value.length)};
                    if(executionType == 'fallback') await blockchain.fallback(value);
                    if(executionType == 'fallbackMsgData') await blockchain.fallback(value, index);
                    if(executionType == 'functions'){
                        if(con.name == 'Events') await execute([startingID + index, value], reset);
                        else await execute([value], reset);
                    }
                }
            }
        }
    }
}

async function executeStorageContract() {
    contracts = utils.blockchain.getContracts(['Storage']);

    await loopExecution({executionType: 'functions', loops: 2});
    await loopExecution({executionType: 'functions', reset: true});
    await loopExecution({executionType: 'functions'});
}

async function executeRest() {
    contracts = utils.blockchain.getContracts(['Events']);

    await loopExecution({executionType: 'functions', startingID: 0});
    await loopExecution({executionType: 'send_data'});
    await loopExecution({executionType: 'fallback'});
    await loopExecution({executionType: 'fallbackMsgData'});
}


/* // uncomment to run the experiments
blockchain.loadBlockchain('infura', {keepStats: true});
(async () => {
    await executeStorageContract();
    await executeRest();
})(); */