const blockchain = require('./helpers/ropstenModule.js');
const utils = require('./helpers/utils.js');

var contracts = [];

function getRandomStrings(start = 1, maxStringSize = 16384, step = 2){
    let randomStrings = [];
    let i = start;
    while(true){
        let input;
        if(i >= maxStringSize) {
            input = utils.getRandomString(maxStringSize);
            randomStrings.push(input);
            break;
        }
        
        input = utils.getRandomString(i);
        randomStrings.push(input);
        i *= step;
    }
    return randomStrings;
}


async function execute(input, reset){
    if(reset){
        await blockchain.executeFunction('reset');
    }

    await blockchain.executeFunctions(input);
    await utils.sleep(2);
}


async function loopExecution({loops = 1,  executionType = 'functions', reset = false, startingID = 0} = {}) {
    if(executionType == 'send_data'){
        blockchain.config();

        for(const [index, value] of getRandomStrings().entries()){
            await blockchain.sendData(value);
        }

    }else{
        for(var con of contracts){
            blockchain.config(con);
            for(const [index, value] of getRandomStrings().entries()){
                for (var i = 0; i < loops; i++) {

                    if(executionType == 'fallback') await blockchain.fallback(value);
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
    contracts = utils.getContracts(['Storage']);

    await loopExecution({executionType: 'functions', loops: 2});
    await loopExecution({executionType: 'functions', reset: true});
    await loopExecution({executionType: 'functions'});
}

async function executeRest() {
    contracts = utils.getContracts(['Events', 'Fallback', 'FallbackIndexed']);

    // await loopExecution({executionType: 'functions', startingID: 0});
    await loopExecution({executionType: 'send_data'});  
    // await loopExecution({executionType: 'fallback'});
}


// run
blockchain.loadBlockchain({provider: 'infura'});
(async () => {
    // await executeStorageContract();
    await executeRest();
})();