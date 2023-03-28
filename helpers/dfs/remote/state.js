const fs = require('fs');
const path = require('path');

const STATE = {
    event: '',
    status: 'waiting', // received, executed, sent, errored (only when errored will load the old one)
    args: [],
    action: '' // upload, download
}

// module.exports = class State {
//     got;
//     sent;

//     constructor() {
//         this.got = JSON.parse(JSON.stringify(STATE));
//         this.sent = JSON.parse(JSON.stringify(STATE));
//     }
// }

class SingleStateStore {
    #event = ''
    #status = 'waiting' // received, executed, sent/completed, errored (only when errored will load the old one)
    #args = []
    #action = '' // upload, download
    #root
    #path;
    #temp;

    constructor(root, file = 'temp.json', folder = './.state') {
        this.#root = root;
        this.#path = path.join(folder, file);
        this.loadState();

        //  register setters/getters for all properties of the state;
        for (const key in this.#temp) {
            this[key] = (prop) => {
                if (prop) {
                    this.#temp[key] = prop;
                    return this.saveState();
                } else {
                    return this.#temp[key];
                }
            }
        }
    }

    get() {
        return JSON.parse(JSON.stringify(this.#temp))
    }

    set(state) {
        for (const key in state) {
            if (key in this.#temp) this.#temp[key] = state[key];
        }
        return this.saveState();
    }

    saveState() {
        const folderPath = path.dirname(this.#path);
        if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
        fs.writeFileSync(this.#path, JSON.stringify(this.get(), null, 4));
        return this;
    }

    loadState() {
        this.#temp = fs.existsSync(this.#path)
            ? JSON.parse(fs.readFileSync(this.#path))
            : JSON.parse(JSON.stringify(STATE));
    }
}

class MultiStateStore {
    got;
    sent;

    constructor(file = 'client.json', folder = './.state') {
        this.got = new SingleStateStore();
        this.sent = new SingleStateStore();
    }
}

module.exports = {
    SingleStateStore
}

// class ClientStateStore extends SingleStateStore {
//     got;
//     sent;

//     constructor(file = 'client.json', folder = './.state') {
//         this.got = new SingleStateStore();
//         this.sent = new SingleStateStore();
//     }
// }

// module.exports = class StateStore {
//     got;
//     sent;

//     constructor() {
//         this.got = new State();
//         this.sent = new State();
//     }
// }

    // event(name) {
    //     if (name) {
    //         this.#event = name;
    //         return this;
    //     } else {
    //         return this.#event;
    //     }
    // }

    // status(status) {
    //     if (status) {
    //         this.#status = status;
    //         return this;
    //     } else {
    //         return this.#status;
    //     }
    // }

    // args(args) {
    //     if (args) {
    //         this.#args = args;
    //         return this;
    //     } else {
    //         return this.#args;
    //     }
    // }

    // action(action) {
    //     if (action) {
    //         this.#action = action;
    //         return this;
    //     } else {
    //         return this.#action;
    //     }
    // }
