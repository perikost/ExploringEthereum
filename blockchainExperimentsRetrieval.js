const blockchain = require('./helpers/ropstenModule.js');
const utils = require('./helpers/utils.js');
const csv = require('./helpers/csvClassModule')

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
    contracts = utils.getContracts(['Fallback','FallbackIndexed','FallbackMsgData', 'Storage']);
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


// uncomment to run the experiments
// blockchain.loadBlockchain();
// loopRetrieval({
//     times : 1,
//     idsCounter : 2,
//     retrieveTxData : true,
// });

// uncomment to compute average retrieval latency of a folder's csv records
csv.average('csv_records/24-03-2022/Contracts')

