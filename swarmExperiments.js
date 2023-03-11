const utils = require('./helpers/utils.js');
const csv = require('./helpers/csvModule.js')
const { SwarmExperiment } = require('./helpers/dfs/experiments');


(async () => {
    const swarm = new SwarmExperiment({ keepStats: true, data: {start: '4kb', maxStringSize: '16kb'} });

    // upload
    await swarm.loopUpload(1);

    // retrieve
    const hashes = utils.dfs.getIdentifiers('swarm');
    await swarm.loopDownload(hashes, 1);
})();


// uncomment to compute average retrieval latency of a folder's csv records
// csv.average('csv_records/27-03-2022/')
