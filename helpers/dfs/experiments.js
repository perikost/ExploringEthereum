const utils = require('../utils.js');
const IpfsBase = require('./ipfs');
const SwarmBase = require('./swarm.js');

const OPTIONS = {
    retry: false,
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
            if(this.options.retry) this._wrapBaseMethods();
        }

        async _retrier(method, ...params) {
            let errorCount = 0;
            while (true) {
                try {
                    const result = await method.apply(this, params);
                    errorCount
                        ? console.log('\n', `Successfully executed ${method.name}() after ${errorCount} trie(s)`)
                        : console.log('\n', `Successfully executed ${method.name}()`)
                    return result;
                } catch (error) {
                    console.log('\n', `An error ocurred while executing ${method.name}().`, error.toString());
                    console.log('Press ANY key to retry, CTRL + C to abort the experiments or ENTER to skip current execution');
                    const key = await utils.core.keypress();

                    // return null on CTRL + ENTER so that the experiments can continue
                    if (key.name === 'return') {
                        console.log('Skipping...');
                        return null;
                    }

                    // rethrow the error on ctrl + C
                    if (key.ctrl && key.name === 'c') {
                        console.log('Aborting...');
                        throw error;
                    }

                    console.log('Retrying...');
                    errorCount++;
                }
            }
        }

        _wrapBaseMethods() {
            Object.getOwnPropertyNames(Base.prototype).forEach((method) => {
                if(method !== 'constructor') {
                    this[method] = (...params) => {
                        return this._retrier(super[method], ...params);
                    }
                }
            })
        }

        async uploadStrings(options = null) {
            utils.core.setOptions(options, this.options);

            const ids = [];
            for (const value of utils.core.getRandomStrings(this.options.data)) {
                const id = await this.upload(value);
                if(id) ids.push(id);
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
                stats.push((result && result.stats) || null);
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
