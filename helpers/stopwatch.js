const performance = require('perf_hooks').performance;

class Stopwatch {
    
    constructor(precision = 4){
        this.precision = precision;
        this.isStopped = true;
    }

    start(processName = null){
        if(this.isRunning){
            console.warn("Stopwatch is already running");
            return;
        }
        if(this.isStopped){
            this.total = 0;
            this.processes = {};
        }
        if(processName) this.processName = processName;
        this.isStopped = false;
        this.isRunning = true;
        this.startTime = performance.now();
    }

    stop(){
        const now = performance.now()

        if(this.isStopped){
            console.warn("Stopwatch is already stopped");
            return;
        }
        if(this.isRunning){
            this.total += now - this.startTime;
            this.#incrementProcessTime(now);
        }

        this.isStopped = true;
        this.isRunning = false;

        if(!this.processName){
            return this.#toFixed(this.total);
        }else{
            this.processes.total = this.total;
            // for(const [key, val] of Object.entries(this.processes)) this.processes[key] = this.#toFixed(val);
            Object.keys(this.processes).forEach(key => this.processes[key] = this.#toFixed(this.processes[key]));
            return this.processes;
        } 
    }

    pause(){
        const now = performance.now()

        if(!this.isRunning){
            console.warn("Stopwatch is already stopped/paused");
            return;
        }

        this.isRunning = false;
        this.total += now - this.startTime;
        this.#incrementProcessTime(now);
    }

    #incrementProcessTime(now){
        if(this.processName){
            if(this.processes[this.processName]){
                this.processes[this.processName] += now - this.startTime;
            }else{
                this.processes[this.processName] = now - this.startTime;
            }
        }
    }

    #toFixed(num){
        return num.toFixed(this.precision);
    }

}

module.exports = Stopwatch;
