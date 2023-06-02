// const { io } = require('socket.io-client');
const Client = require('./helpers/dfs/remote/client');
const { Server } = require('./helpers/dfs/remote/server');
const os = require('os')
const fs = require('fs');
const { SingleStateStore, STATE } = require('./helpers/dfs/remote/state');
const IpfsBase = require('./helpers/dfs/ipfs');
const utils = require('./helpers/utils')
const { spawn } = require('child_process');
const { readLines } = require('./helpers/csvModule');
const path = require('path');
const { get } = require('http');

jest.mock('./helpers/dfs/ipfs');
jest.mock('prompt-sync', () => {
    return jest.fn(() => {
        return jest.fn(() => {
            return 'n';
        });
    });
});

function expectRecordsToBeCorrect() {
    const recordsFolderPath = fs.readdirSync('test_csv_records');
    const ipfsFolderPath = path.join('test_csv_records', recordsFolderPath[0], 'ipfs', 'retrieve')
    for (const exp of fs.readdirSync(ipfsFolderPath)) {
        const expFolderPath = path.join(ipfsFolderPath, exp)
        expect(fs.existsSync(expFolderPath)).toBeTruthy();

        for (const record of fs.readdirSync(expFolderPath)) {
            expect(readLines(path.join(expFolderPath, record)).length).toBe(6)
        }
    }
}

function spawnClientsAndKeepTrack(clientsCount, ...options) {
    const clients = [];

    for (let i = 0; i < clientsCount; i++) {
        clients.push(spawn('node', ['./dfsRemoteExperiments', ...options], {
            env: { ...process.env, ID: `id_${i + 1}`, USER_NAME: `user_${i + 1}` }
        }))

        clients[i].stderr.on('data', (data) => {
            const error = data.toString().trim();
            console.error(`Client${i + 1} error:`, error);
        });

        clients[i].stdout.on('data', (data) => {
            const message = data.toString().trim();
            console.log(`Client${i + 1} log:`, message);
        });
    }
    return clients;
}


describe('Run all experiments', () => {
    let client1, client2, client3;
    let server;

    beforeAll(() => {
        if (fs.existsSync('.state')) fs.rmSync('.state', { recursive: true });
        if (fs.existsSync('test_csv_records')) fs.rmSync('test_csv_records', { recursive: true });
    })

    afterAll(() => {
        // close the sockets after each test
        server.io.close();

        client1.kill();
        client2.kill();
        client3.kill();
    });


    test('Clients should be connected', (done) => {
        expect.assertions(1 + 3 + 2 + 4 + 4 * 3)


        let counter = 0
        server = new Server(3000, true, 3, 'test_csv_records');
        server.io.on("connection", (socket) => {
            counter++
            if (counter === 3) {
                server.io.fetchSockets().then(sockets => {
                    expect(sockets.length).toBe(3);

                    const expectedDataPatterns = [
                        { user: 'user_1', id: 'id_1' },
                        { user: 'user_2', id: 'id_2' },
                        { user: 'user_3', id: 'id_3' },
                    ];

                    sockets.forEach((socket) => {
                        const matchedPattern = expectedDataPatterns.find((pattern) =>
                            socket.data.user === pattern.user && socket.data.id === pattern.id
                        );
                        expect(matchedPattern).toBeDefined();
                    });
                })
            }

        });

        server.networks.ipfs.peerReachable.mockImplementation(() => Promise.resolve(true));

        const clients = spawnClientsAndKeepTrack(3, '--ipfs', '--data-max', '16kb');
        client1 = clients[0];
        client2 = clients[1];
        client3 = clients[2];


        const promises = [
            new Promise((resolve, reject) => {
                client1.on('close', resolve);
            }),
            new Promise((resolve, reject) => {
                client2.on('close', resolve);
            }),
            new Promise((resolve, reject) => {
                client3.on('close', resolve);
            })
        ];

        // wait for all processes to finish
        Promise.all(promises).then(exitCodes => {
            expect(exitCodes.findIndex(val => !!val)).toBe(-1);
            expect(fs.existsSync('test_csv_records')).toBeTruthy();
            expectRecordsToBeCorrect()

            done()
        })

    }, 60000);
});


describe('Run experiments with errors', () => {
    let server, promises, extraClientPromises, finished;
    const clients = {
        
        add(clients) {
            this.store = clients

            clients.forEach((client, index) => {
                this[`id_${index + 1}`] = client
            });
        },
        get(index) {
            return this.store[index]
        },
        getAll() {
            return this.store
        },
        replace(id, client) {
            this[id] = client
            this.store.forEach((el, index) => {
                if (id === `id_${index + 1}`) {
                    this.store[index] = client
                }
            });
        }
    }

    const sockets = {
        store: Array(3).fill(undefined),
        add(socket) {
            this.store.forEach((el, index) => {
                if (socket.data.id === `id_${index + 1}`) {
                    this[`id_${index + 1}`] = socket
                    this.store[index] = socket
                }
            });
        },
        get(index) {
            return this.store[index]
        },
        getAll() {
            return this.store
        },
        replace(id, socket) {
            this[id] = socket
            this.store.forEach((el, index) => {
                if (id === `id_${index + 1}`) {
                    this.store[index] = socket
                }
            });
        }
    }

    const killAndReplace = (clientID, user) => {
        if (finished) return;
    
        clients[clientID].kill()

        clients.replace(clientID, spawn('node', ['./dfsRemoteExperiments', '--ipfs', 'normal', '--data-max', '16kb'], {
            env: { ...process.env, ID: clientID, USER_NAME: user }
        }))

        clients[clientID].stderr.on('data', (data) => {
            const error = data.toString().trim();
            console.error(`${clientID} error:`, error);
        });

        clients[clientID].stdout.on('data', (data) => {
            const message = data.toString().trim();
            console.log(`${clientID} log:`, message);
        });

        let closed;
        extraClientPromises.push(new Promise((resolve, reject) => {
            closed = resolve;
        }))

        clients[clientID].on('close', closed);
    }

    const killAndReplaceAfterTimeout = (sec) => {
        setTimeout(() => {
            const clientIDs = server.sockets.map(socket => ({ id: socket.data.id, user: socket.data.user }))
            const randomIndex = Math.floor(Math.random() * clientIDs.length);
            const randomElement = clientIDs[randomIndex];
            if (randomElement) killAndReplace(randomElement.id, randomElement.user)
        }, sec*1000);
    }

    beforeEach((done) => {
        if (fs.existsSync('.state')) fs.rmSync('.state', { recursive: true });
        if (fs.existsSync('test_csv_records')) fs.rmSync('test_csv_records', { recursive: true });

        let counter = 0
        server = new Server(3000, true, 3, 'test_csv_records');
        server.networks.ipfs.peerReachable.mockImplementation(() => Promise.resolve(true));
        server.io.on("connection", (socket) => {
            sockets.add(socket);
            if (++counter === 3) {
                done()
            }
        });

        clients.add(spawnClientsAndKeepTrack(3, '--ipfs', 'normal', '--data-max', '16kb'));

        promises = [
            new Promise((resolve, reject) => {
                clients.get(0).on('close', resolve);
            }),
            new Promise((resolve, reject) => {
                clients.get(1).on('close', resolve);
            }),
            new Promise((resolve, reject) => {
                clients.get(2).on('close', resolve);
            })
        ];
        extraClientPromises = [];
    }, 25000)

    afterEach(() => {
        // close the sockets after each test
        server.io.close();

        clients.get(0).kill();
        clients.get(1).kill();
        clients.get(2).kill();
    });

    test('Client fails in round 1 prior to uploading (before upload event is emitted)', (done) => {
        expect.assertions(3 + 3)

        for (const socket of sockets.getAll()) {
            socket.prependAnyOutgoing((event, ...args) => {
                if (event === 'upload' && server.experiment.round.id === 1) {
                    const clientID = socket.data.id
                    const user = socket.data.user

                    socket.on('disconnect', () => {
                        console.log("DISCONNECTED")
                    })

                    server.io.on('connect', (socket) => {
                        console.log("CONNECTED")
                        sockets.replace(clientID, socket)
                    })


                    killAndReplace(clientID, user)
                }
            });
        }

        // wait for all processes to finish
        Promise.all(promises).then(exitCodes => {
            Promise.all(extraClientPromises).then(extraExitCodes => {
                expect([...exitCodes, ...extraExitCodes].findIndex(val => !!val)).toBe(-1);
                expect(fs.existsSync('test_csv_records')).toBeTruthy();
                expectRecordsToBeCorrect()

                done()
            })
        })

    }, 50000);

    test('Client fails in round 2 prior to uploading (after upload event is emitted)', (done) => {
        expect.assertions(3 + 3)

        for (const socket of sockets.getAll()) {
            socket.onAnyOutgoing((event, ...args) => {
                if (event === 'upload' && server.experiment.round.id === 2) {
                    const clientID = socket.data.id
                    const user = socket.data.user

                    socket.on('disconnect', () => {
                        console.log("DISCONNECTED")
                    })

                    server.io.on('connect', (socket) => {
                        console.log("CONNECTED")
                        sockets.replace(clientID, socket)
                    })

                    killAndReplace(clientID, user)
                }
            });
        }

        // wait for all processes to finish
        Promise.all(promises).then(exitCodes => {
            Promise.all(extraClientPromises).then(extraExitCodes => {
                expect([...exitCodes, ...extraExitCodes].findIndex(val => !!val)).toBe(-1);
                expect(fs.existsSync('test_csv_records')).toBeTruthy();
                expectRecordsToBeCorrect()

                done()
            })
        })

    }, 50000);

    test('Client fails in round 2 after uploading (should not re-upload)', (done) => {
        expect.assertions(3 + 3 + 3)

        for (const socket of sockets.getAll()) {
            socket.prependAnyOutgoing((event, ...args) => {
                if (event === 'upload' && server.experiment.round.id === 2) {
                    const clientID = socket.data.id
                    const user = socket.data.user
                    clients[clientID].stdout.on('data', (data) => {
                        const message = data.toString().trim();
                        if (message.includes('I uploaded the data')) {
                            killAndReplace(clientID, user)

                            clientState = JSON.parse(fs.readFileSync(`.state/client_${clientID}.json`))
                            expect(clientState.event).toBe('uploaded')
                            expect(clientState.round).toBe(2)
                            expect(typeof clientState.args[0]).toBe('object')
                        }
                    });

                    socket.on('disconnect', () => {
                        console.log("DISCONNECTED")
                    })

                    server.io.on('connect', (socket) => {
                        console.log("CONNECTED")
                        sockets.replace(clientID, socket)
                    })
                }
            });
        }

        // wait for all processes to finish
        Promise.all(promises).then(exitCodes => {
            Promise.all(extraClientPromises).then(extraExitCodes => {
                expect([...exitCodes, ...extraExitCodes].findIndex(val => !!val)).toBe(-1);
                expect(fs.existsSync('test_csv_records')).toBeTruthy();
                expectRecordsToBeCorrect()

                done()
            })
        })

    }, 50000);

    test('Two clients fail in round 1 prior to downloading (before download event is emitted)', (done) => {
        expect.assertions(2*1 + 2 + 1 + 3)

        for (const socket of sockets.getAll()) {
            socket.prependAnyOutgoing((event, ...args) => {
                if (event === 'download' && server.experiment.round.id === 1) {
                    const clientID = socket.data.id
                    const user = socket.data.user

                    socket.on('disconnect', () => {
                        console.log("DISCONNECTED")
                    })

                    server.io.on('connect', (socket) => {
                        console.log("CONNECTED")
                        sockets.replace(clientID, socket)
                    })


                    killAndReplace(clientID, user)

                    // clients shouldn't have registered state yet
                    expect(fs.existsSync(`.state/client_${clientID}.json`)).toBeFalsy()
                }
            });
        }

        // wait for all processes to finish
        Promise.all(promises).then(exitCodes => {
            Promise.all(extraClientPromises).then(extraExitCodes => {
                expect([...exitCodes, ...extraExitCodes].findIndex(val => !!val)).toBe(-1);
                expect(fs.existsSync('test_csv_records')).toBeTruthy();
                expectRecordsToBeCorrect()

                done()
            })
        })

    }, 50000);

    test('Two clients fail in round 2 after downloading (should not re-download)', (done) => {
        expect.assertions(2 * 3 + 2 + 1 + 3)

        for (const socket of sockets.getAll()) {
            socket.prependAnyOutgoing((event, ...args) => {
                if (event === 'download' && server.experiment.round.id === 2) {
                    const clientID = socket.data.id
                    const user = socket.data.user
                    clients[clientID].stdout.on('data', (data) => {
                        const message = data.toString().trim();
                        if (message.includes('I downloaded the data')) {
                            killAndReplace(clientID, user)

                            clientState = JSON.parse(fs.readFileSync(`.state/client_${clientID}.json`))
                            expect(clientState.event).toBe('downloaded')
                            expect(clientState.round).toBe(2)
                            expect(typeof clientState.args[0]).toBe('object')
                        }
                    });

                    socket.on('disconnect', () => {
                        console.log("DISCONNECTED")
                    })

                    server.io.on('connect', (socket) => {
                        console.log("CONNECTED")
                        sockets.replace(clientID, socket)
                    })
                }
            });
        }

        // wait for all processes to finish
        Promise.all(promises).then(exitCodes => {
            Promise.all(extraClientPromises).then(extraExitCodes => {
                expect([...exitCodes, ...extraExitCodes].findIndex(val => !!val)).toBe(-1);
                expect(fs.existsSync('test_csv_records')).toBeTruthy();
                expectRecordsToBeCorrect()

                done()
            })
        })

    }, 50000);

    test('Clients fail randomly', (done) => {

        killAndReplaceAfterTimeout(3)
        killAndReplaceAfterTimeout(4)
        killAndReplaceAfterTimeout(8)
        killAndReplaceAfterTimeout(10)
        killAndReplaceAfterTimeout(15)
        killAndReplaceAfterTimeout(20)


        // wait for all processes to finish
        Promise.all(promises).then(exitCodes => {
            finished = true;
            Promise.all(extraClientPromises).then(extraExitCodes => {
                expect([...exitCodes, ...extraExitCodes].findIndex(val => !!val)).toBe(-1);
                expect(fs.existsSync('test_csv_records')).toBeTruthy();
                expectRecordsToBeCorrect()

                done()
            })
        })

    }, 90000);
});

describe('Run all experiments with errors', () => {
    let server, promises, extraClientPromises, finished;
    const clients = {

        add(clients) {
            this.store = clients

            clients.forEach((client, index) => {
                this[`id_${index + 1}`] = client
            });
        },
        get(index) {
            return this.store[index]
        },
        getAll() {
            return this.store
        },
        replace(id, client) {
            this[id] = client
            this.store.forEach((el, index) => {
                if (id === `id_${index + 1}`) {
                    this.store[index] = client
                }
            });
        }
    }

    const sockets = {
        store: Array(3).fill(undefined),
        add(socket) {
            this.store.forEach((el, index) => {
                if (socket.data.id === `id_${index + 1}`) {
                    this[`id_${index + 1}`] = socket
                    this.store[index] = socket
                }
            });
        },
        get(index) {
            return this.store[index]
        },
        getAll() {
            return this.store
        },
        replace(id, socket) {
            this[id] = socket
            this.store.forEach((el, index) => {
                if (id === `id_${index + 1}`) {
                    this.store[index] = socket
                }
            });
        }
    }

    const killAndReplace = (clientID, user) => {
        if (finished) return;

        clients[clientID].kill()

        clients.replace(clientID, spawn('node', ['./dfsRemoteExperiments', '--ipfs', '--data-max', '16kb'], {
            env: { ...process.env, ID: clientID, USER_NAME: user }
        }))

        clients[clientID].stderr.on('data', (data) => {
            const error = data.toString().trim();
            console.error(`${clientID} error:`, error);
        });

        clients[clientID].stdout.on('data', (data) => {
            const message = data.toString().trim();
            console.log(`${clientID} log:`, message);
        });

        let closed;
        extraClientPromises.push(new Promise((resolve, reject) => {
            closed = resolve;
        }))

        clients[clientID].on('close', closed);
    }

    const killAndReplaceAfterTimeout = (sec) => {
        setTimeout(() => {
            const clientIDs = server.sockets.map(socket => ({ id: socket.data.id, user: socket.data.user }))
            const randomIndex = Math.floor(Math.random() * clientIDs.length);
            const randomElement = clientIDs[randomIndex];
            if (randomElement) killAndReplace(randomElement.id, randomElement.user)
        }, sec * 1000);
    }

    beforeEach((done) => {
        if (fs.existsSync('.state')) fs.rmSync('.state', { recursive: true });
        if (fs.existsSync('test_csv_records')) fs.rmSync('test_csv_records', { recursive: true });

        let counter = 0
        server = new Server(3000, true, 3, 'test_csv_records');
        server.networks.ipfs.peerReachable.mockImplementation(() => Promise.resolve(true));
        server.io.on("connection", (socket) => {
            sockets.add(socket);
            if (++counter === 3) {
                done()
            }
        });

        clients.add(spawnClientsAndKeepTrack(3, '--ipfs', '--data-max', '16kb'));

        promises = [
            new Promise((resolve, reject) => {
                clients.get(0).on('close', resolve);
            }),
            new Promise((resolve, reject) => {
                clients.get(1).on('close', resolve);
            }),
            new Promise((resolve, reject) => {
                clients.get(2).on('close', resolve);
            })
        ];
        extraClientPromises = [];
    })

    afterEach(() => {
        // close the sockets after each test
        server.io.close();

        clients.get(0).kill();
        clients.get(1).kill();
        clients.get(2).kill();
    });

    test('Experiments should run smoothly even if clients randomly fail', (done) => {

        killAndReplaceAfterTimeout(3)
        killAndReplaceAfterTimeout(4)
        killAndReplaceAfterTimeout(8)
        killAndReplaceAfterTimeout(10)
        killAndReplaceAfterTimeout(15)
        killAndReplaceAfterTimeout(20)
        killAndReplaceAfterTimeout(25)
        killAndReplaceAfterTimeout(27)
        killAndReplaceAfterTimeout(33)
        killAndReplaceAfterTimeout(38)
        killAndReplaceAfterTimeout(49)
        killAndReplaceAfterTimeout(60)


        // wait for all processes to finish
        Promise.all(promises).then(exitCodes => {
            finished = true;
            Promise.all(extraClientPromises).then(extraExitCodes => {
                expect([...exitCodes, ...extraExitCodes].findIndex(val => !!val)).toBe(-1);
                expect(fs.existsSync('test_csv_records')).toBeTruthy();
                expectRecordsToBeCorrect()

                done()
            })
        })

    }, 100000);
});
