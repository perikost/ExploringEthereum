const blockchain = require('./helpers/ropstenModule.js');
const utils = require('./helpers/utils.js');

var contracts = [];

function getRandomStrings(start = 1, maxStringSize = 16384, step = 2){
    let randomStrings = [];
    let i = start;
    while(true){
        let input;
        if(i >= maxStringSize) {
            input = utils.basics.getRandomString(maxStringSize);
            randomStrings.push(input);
            break;
        }
        
        input = utils.basics.getRandomString(i);
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
    await utils.basics.sleep(2);
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
            for(let [index, value] of getRandomStrings().entries()){
                for (var i = 0; i < loops; i++) {
                    if(loops > 1) {value = utils.basics.getRandomString(value.length)};
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

    // await loopExecution({executionType: 'functions', loops: 2});
    // await loopExecution({executionType: 'functions', reset: true});
    await loopExecution({executionType: 'functions'});
}

async function executeRest() {
    contracts = utils.blockchain.getContracts(['Events']);

    // await loopExecution({executionType: 'functions', startingID: 0});
    // await loopExecution({executionType: 'send_data'});  
    // await loopExecution({executionType: 'fallback'});
    // await loopExecution({executionType: 'fallbackMsgData'});
}


// run
blockchain.loadBlockchain({accessList: true});
(async () => {
    // await executeStorageContract();
    await executeRest();
})();