const fs = require('fs');
const path = require('path');

const STATE = {
    event: '',
    status: '',
    args: [],
    round: null,
    response: ''
}


class SingleStateStore {
    #root
    #path;
    #temp;

    constructor(file = 'temp.json', root = null, initialState = STATE, folder = './.state') {
        this.#root = root;
        this.#path = path.join(folder, file);
        this.loadState(JSON.parse(JSON.stringify(initialState)));

        //  register setters/getters for all properties of the state;
        for (const key in this.#temp) {
            this.addGetterSetter(key)
        }
    }

    addGetterSetter(key) {
        this[key] = (val) => {
            if (typeof val !== 'undefined') {
                this.#temp[key] = val;
                this.saveState();
                return this;
            } else {
                return this.#temp[key];
            }
        }
    }

    extend(key, val = '') {
        if (!this.hasOwnProperty(key)) this.addGetterSetter(key);
        this[key](val);
        return this;
    }

    get() {
        return JSON.parse(JSON.stringify(this.#temp))
    }

    set(state) {
        for (const key in state) {
            if (key in this.#temp) this.#temp[key] = state[key];
        }
        this.saveState();
        return this;
    }

    saveState() {
        const folderPath = path.dirname(this.#path);
        if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

        let toWrite = {};
        if (this.#root) {
            if (fs.existsSync(this.#path)) {
                toWrite = JSON.parse(fs.readFileSync(this.#path));
            }
            toWrite[this.#root] = this.get();
        } else {
            toWrite = this.get();
        }
        fs.writeFileSync(this.#path, JSON.stringify(toWrite, null, 2));
        return this;
    }

    loadState(initialState) {
        if (fs.existsSync(this.#path)) {
            const state = JSON.parse(fs.readFileSync(this.#path));
            this.#temp = this.#root
                ? state[this.#root] || initialState
                : state;
        } else {
            this.#temp = initialState;
        }
    }

    clear() {
        if (fs.existsSync(this.#path)) {
            fs.rmSync(this.#path);
        }
    }
}

class MultiStateStore {
    #file;
    #folder;
    #path;
    #initialState;
    #states = {};

    constructor(file = 'client.json', folder = './.state', initialState = STATE) {
        this.#folder = folder;
        this.#file = file
        this.#initialState = initialState;
        this.#path = path.join(this.#folder, this.#file);
        this.loadState();
    }

    add(id) {
        this.#states[id] = new SingleStateStore(this.#file, id, this.#initialState, this.#folder);
        return this.#states[id];
    }

    get(id) {
        return this.#states[id];
    }

    clear() {
        if (fs.existsSync(this.#path)) {
            fs.rmSync(this.#path);
        }
    }

    loadState() {
        if (fs.existsSync(this.#path)) {
            const state = JSON.parse(fs.readFileSync(this.#path));
            for (const key in state) {
                this.add(key);
            }
        }
    }
}

module.exports = {
    SingleStateStore,
    MultiStateStore,
    STATE: JSON.parse(JSON.stringify(STATE))
}

