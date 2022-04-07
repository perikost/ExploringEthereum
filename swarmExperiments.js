const swarm = require('./helpers/swarmModule.js');
const utils = require('./helpers/utils.js');


async function uploadToSwarm(input){
    if(!input) return;
    
    let name = `string${input.length}`;
    let hash = await swarm.uploadText(input);

    console.log(`${name} uploaded. hash : ${hash}`);
}


async function uploadStrings({start = 16384, step = 4, maxStringSize = 16384} = {}){

    let i = start * 1024;
    maxStringSize *= 1024;
    while(true){
        let input;
        if(i >= maxStringSize) {
            input = utils.getRandomString(maxStringSize);
            await uploadToSwarm(input);
            break;
        }
        
        input = utils.getRandomString(i);
        await uploadToSwarm(input);
        i *= step;
    }
}


async function loopUpload(times){
    for(let i = 0; i < times; i++){
        await uploadStrings()
    }
}


/* 
uncomment to run the experiments
(async function(){
    // upload
    await swarm.configPostageBatch();
    await loopUpload(20);
    
    // retrieve
    let hashes = utils.getIdentifiers('swarm');
    await swarm.retrieveAllTexts(hashes);
})(); 
*/

// uncomment to compute average retrieval latency of a folder's csv records
// csv.average('csv_records/27-03-2022/')