const utils = require('../utils.js');
const IpfsBase = require('./ipfs');
const SwarmBase = require('./swarm.js');

const OPTIONS = {
    clearCache: false,
    data: {
        start: '4kb',
        step: 4,
        stepOp: '*',
        maxStringSize: '16mb'
    }
};

function Experiment(Base) {
    return class ExperimentBase extends Base {

        constructor(opts) {
            // merge the defaultOptions with the input options
            super(utils.core.getOptions(opts, OPTIONS, true));
        }

        async uploadStrings(options = null) {
            utils.core.setOptions(options, this.options);

            const ids = [];
            for (const value of utils.core.getRandomStrings(this.options.data)) {
                const id = await this.upload(value);
                ids.push(id);
            }
            return ids;
        }

        async loopUpload(times, options = null) {
            utils.core.setOptions(options, this.options);

            for (let i = 0; i < times; i++) {
                await this.uploadStrings();
            }
        }

        async downloadStrings(ids, options = null) {
            utils.core.setOptions(options, this.options);

            const stats = [];
            for (const id of ids) {
                const result = await this.download(id);
                stats.push(result.stats);
            }
            return stats;
        }

        async loopDownload(ids, times, options = null) {
            utils.core.setOptions(options, this.options);

            const stats = [];
            for (let i = 0; i < times; i++) {
                stats.push(await this.downloadStrings(ids));
            }
            return stats;
        }

        resetOptions() {
            utils.core.setOptions(OPTIONS, this.options);
            return this;
        }
    };
}

class ExtendedIpfsExperiment extends Experiment(IpfsBase) {

    constructor() {
        super();
    }

    async downloadOnlyLocalStrings(ids, options = null) {
        utils.core.setOptions(options, this.options);

        const localids = await this.getLocalids();
        ids = ids.filter(id => localids.includes(id.toString()));

        return await this.downloadStrings(ids);
    }
}

class ExtendedSwarmExperiment extends Experiment(SwarmBase) {

    constructor() {
        super();
    }

    // ...
}

module.exports = {
    IpfsExperiment: Experiment(IpfsBase),
    SwarmExperiment: Experiment(SwarmBase)
}
