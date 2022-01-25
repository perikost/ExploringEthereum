const blockchain = require('./helpers/ropstenModule.js');
const utils = require('./helpers/utils.js');

var contracts = [];


async function retrieveEvents(con){

    [con.events, con.indexedEvents, con.anonymousEvents].forEach(item => {
        item.forEach(event => {
            event.index.value = 5;
        });
    });

    await blockchain.retrieveEvents();
    await blockchain.retrieveIndexedEvents();
    await blockchain.retrieveAnonymousEvents();

}


async function Execute() {
    for(var con of contracts){
        await blockchain.config(con);
        await blockchain.sendData("test")
        await blockchain.fallback("test");
        await blockchain.executeFunctions();
    }  
}


async function Retrieve(){
    for(var con of contracts){
        await blockchain.config(con);
        await blockchain.retrieveStorage();
        await retrieveEvents(con);
    }
}


// TEST
(async function(){
    blockchain.loadBlockchain();
    contracts = utils.getContracts();
    await Execute()
    await Retrieve();
})();
