const swarm = require('./helpers/swarmModule.js');
const utils = require('./helpers/utils.js');


async function uploadStrings(){
    for(const value of utils.core.getRandomStrings({start: 4*1024, step: 4, maxStringSize: 16*1024*1024})){
        let name = `string${value.length / 1024}`;
        let hash = await swarm.uploadText(value);
        console.log(`${name} uploaded. hash : ${hash}`);
    }
}

async function loopUpload(times){
    for(let i = 0; i < times; i++){
        await uploadStrings();
    }
}


/* // uncomment to run the experiments
(async function(){
    // upload
    await swarm.configPostageBatch();
    await loopUpload(1);
    
    // retrieve
    let hashes = utils.dfs.getIdentifiers('swarm');
    await swarm.retrieveAllTexts(hashes, 20);
})();  */


// uncomment to compute average retrieval latency of a folder's csv records
// csv.average('csv_records/27-03-2022/')