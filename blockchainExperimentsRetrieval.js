const blockchain = require('./helpers/ropstenModule.js');
const utils = require('./helpers/utils.js');

var contracts = [];


async function retrieveEvents(con, ids){

    for(var id of ids){
        [con.events, con.indexedEvents, con.anonymousEvents].forEach(item => {
            item.forEach(event => {
                event.index.value = id;
            });
        });

        await blockchain.retrieveEvents();
        await blockchain.retrieveIndexedEvents();
        await blockchain.retrieveAnonymousEvents();
    }
}


async function loopRetrieval(options){
    contracts = utils.getContracts(['Fallback','FallbackIndexed','FallbackMsgData', 'Storage', 'Events']);
    let ids = [];
    for (let i = 0; i < options.idsCounter; i++) {
       ids.push(i);
    }

    for(var [index, con] of contracts.entries()){
        blockchain.config(con);

        for(let i=0; i<options.times; i++){
            if(options.retrieveTxData && index === 0) await blockchain.retrievePlainTransactionData('./csv_records/15-03-2022/execute/send_data.csv')
            await blockchain.retrieveStorage();
            await retrieveEvents(con, ids);
        }
    }
}


// run
blockchain.loadBlockchain({provider:'infura'});
loopRetrieval({
    times : 1,
    idsCounter : 15,
    retrieveTxData : true,
});
