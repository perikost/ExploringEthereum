const fs = require('fs');
const Client = require('./client');
const { Server} = require('./server');
const utils = require('../../utils')

const EXPERIMENT = {
    name: 'disconnect',
    description: 'For each round one node will upload a series of content and the rest of the nodes will download it. Since the connection with the uploader isn\'t terminated instantly, the downloader (after getting the content) will disconnect from the peer from which they got it.',
    network: 'ipfs',
    nodeAddress: 'ipdfs_address',
    methods: {
        upload: jest.fn(() => {
            return Promise.resolve(['id1', 'id2']);
        }),
        download: jest.fn((data) => {
            return Promise.resolve('downloaded');
        }),
    }
}

jest.mock('../../utils.js', () => ({
    core: {
        sleep: jest.fn((sec) => Promise.resolve()),
        keypress: jest.fn((sec) => Promise.resolve({ name: 'enter' })),
        cancelKeypress: jest.fn()
    }
}));

jest.mock('../ipfs');
jest.mock('../swarm');
jest.mock('../../csvModule');

beforeAll(() => {
    if (fs.existsSync('.state')) fs.rmSync('.state', { recursive: true });
})

test('server constructor should throw error if auto is true but no connections (>0) are specified', () => {
    expect(() => {
        new Server(3000, true);
    }).toThrow('Can\'t start in auto mode. Specify the number of clients that are expected to connect.');
});


describe('Server auto mode', () => {
    let client1, client2, client3;
    let server;

    beforeAll(() => {
    })

    beforeEach((done) => {
        jest.clearAllMocks()

        let counter = 0
        server = new Server(3000, true, 3);
        server.io.on("connection", (socket) => {
 
            if (++counter === 3) done()
        });

        server.networks.ipfs.peerReachable.mockImplementation(() => Promise.resolve(true));

        // Create a new instance of Client before tests
        client1 = new Client('localhost', 3000, 'id_1', 'user_1');
        client2 = new Client('localhost', 3000, 'id_2', 'user_2');
        client3 = new Client('localhost', 3000, 'id_3', 'user_3');
    });

    beforeEach(() => {
        const findServerSocket = (id) => server.sockets.find(socket => socket.data.id === id)
        client1.serverSocket = findServerSocket(client1.id);
        client2.serverSocket = findServerSocket(client2.id);
        client3.serverSocket = findServerSocket(client3.id);
    });

    afterEach(() => {
        // close the sockets after each test
        server.io.close();
        client1.disconnect();
        client2.disconnect();
        client3.disconnect();

        server.state.clear()
        client1.state.clear()
        client2.state.clear()
        client3.state.clear()
    });


    test('Clients should be connected', (done) => {
        server.io.fetchSockets().then(sockets => {
            expect(sockets.length).toBe(3);
            expect(sockets[0].data).toEqual({ user: client1.user, id: client1.id });
            expect(sockets[1].data).toEqual({ user: 'user_2', id: 'id_2' });
            expect(sockets[2].data).toEqual({ user: 'user_3', id: 'id_3' });
            done()
        })
    });

    test('clients should be able to disconnect and reconnect',(done) => {
        jest.spyOn(console, 'log')

        client2.disconnect();
        client3.disconnect();
        client2.socket.connect();

        server.io.on('connection', async (socket) => {
            expect((await server.io.fetchSockets()).length).toBe(2);
            expect(console.log).toHaveBeenCalledTimes(3);
            expect(console.log).toHaveBeenCalledWith('User user_2 disconnected');
            expect(console.log).toHaveBeenCalledWith('User user_3 disconnected');
            expect(console.log).toHaveBeenCalledWith('User user_2 connected');
            done()
        });
    });

    test('running clients should be registered correctly', (done) => {
        // we can't register a second handler to the running event cause we can't ensure the execution order, since the handler 
        // registerer in Server.js is async. The second one added here may be called first causing the test to always fail
        // client2.serverSocket.on('running', () => {
        //     expect(server.runningClients).toBe(1);
        //     done()
        // })
        // A work around would be to set a timeout to wait for the handler in Server.js to be executed

        client1.socket.emit('running', EXPERIMENT, () => {
            expect(server.runningClients).toBe(1);
            expect(client1.serverSocket.data.participant).toBe(true);

            client2.socket.emit('running', EXPERIMENT, () => {
                expect(server.runningClients).toBe(2);
                expect(client2.serverSocket.data.participant).toBe(true);

                client3.socket.emit('running', EXPERIMENT, () => {
                    // when all the clients run the exp the server.runningClients is set to zero
                    expect(server.runningClients).toBe(0);
                    expect(client2.serverSocket.data.participant).toBe(true);
                    done()
                });
            });
        });
    });

    test('if a client\s DFS node is not reachable upon running they should receive an error', async () => {
        jest.spyOn(client1.socket, 'disconnect')
        server.networks.ipfs.peerReachable.mockResolvedValue(false);

        client1.socket.on('error', (err) => {
            expect(err).toBe(`Could not connect to your ${client1.exp.network} address.`);
            expect(server.runningClients).toBe(0);
        })
        
        try {
            await client1.run(EXPERIMENT);
        } catch (error) {
            expect(error).toBe(`Could not connect to your ${client1.exp.network} address.`)
            expect(client1.socket.disconnect).toHaveBeenCalledTimes(1)
        }
    });

    test('the experiment should be started from the client that connected first, when all clients are running', (done) => {
        jest.spyOn(client1, '_start')
        jest.spyOn(client2, '_start')
        jest.spyOn(client3, '_start')

        // this will be called after the handler registered in Client.js. Only client1's start should have been called
        client1.socket.on('automated-start', () => {
            expect(client1._start).toHaveBeenCalledTimes(1);
            expect(client2._start).toHaveBeenCalledTimes(0);
            expect(client3._start).toHaveBeenCalledTimes(0);
            done()
        })

        client1.run(EXPERIMENT);
        client2.run(EXPERIMENT);
        client3.run(EXPERIMENT);
    });

    test('if a running client disconnects the experiment should start after they reconnect and re-run', (done) => {
        // TODO: probably it will not work correctly if a client disconnects right after server sent started. investigate this.

        // this will be called after the handler registered in Client.js. Only client1's start should have been called
        client1.socket.on('automated-start', () => {
            expect(client2.socket.connected).toBe(true);
            done()
        })


        client1.run(EXPERIMENT);

        client2.socket.emit('running', EXPERIMENT, () => {
            client2.serverSocket.on('disconnect', () => {
                // run client3 after client2 has disconnected
                client3.socket.emit('running', EXPERIMENT, () => {
                    expect(server.runningClients).toBe(2);
                    expect(client1.serverSocket.data.participant).toBe(true);
                    expect(client3.serverSocket.data.participant).toBe(true);

                    // reconnect and run client2
                    client2.socket.connect();
                    client2.socket.on('connect', () => {
                        client2.run(EXPERIMENT)
                    })
                });
            })

            client2.disconnect()
        });
    });

    test('first round: client1 should upload, rest should download', (done) => {
        // spy on console.log
        jest.spyOn(console, 'log')

        expect.assertions(9)

        client1.socket.on('upload', (round) => {
            expect(console.log).toHaveBeenCalledWith(`User ${client1.user} started the experiment: `, client1.exp)
            expect(round).toBe(1);
            expect(utils.core.cancelKeypress).toHaveBeenCalledTimes(3)
            expect(client1.methods.upload).toHaveBeenCalledTimes(1)
        })

        client2.socket.on('upload', (round) => {
            expect(console.log).toHaveBeenCalledWith(`Round ${round - 1}: All nodes downloaded the data`)
            expect(EXPERIMENT.methods.download).toHaveBeenCalledTimes(2)
            expect(round).toBe(2);
            done()
        })

        client2.serverSocket.on('downloaded', () => {
            expect(EXPERIMENT.methods.download).toHaveBeenCalledWith(['id1', 'id2'])
        })
        
        client3.serverSocket.on('downloaded', () => {
            expect(EXPERIMENT.methods.download).toHaveBeenCalledWith(['id1', 'id2'])
        })

        client1.run(EXPERIMENT);
        client2.run(EXPERIMENT);
        client3.run(EXPERIMENT);
    });


    test('flow', async () => {
        jest.spyOn(console, 'log')
        jest.spyOn(server, 'writeRoundResults')

        let orderCounter = 0
        const orderCounterIncrementor = () => ++orderCounter

        // ROUND 1
        client1.socket.on('upload', (round) => {
            orderCounter++;
            expect(orderCounter).toBe(1);
            expect(round).toBe(1);
        })

        client1.serverSocket.on('downloaded', orderCounterIncrementor)
        client2.serverSocket.on('downloaded', orderCounterIncrementor)
        client3.serverSocket.on('downloaded', orderCounterIncrementor)

        // ROUND 2
        client2.socket.on('upload', (round) => {
            orderCounter++;
            expect(orderCounter).toBe(4);
            expect(round).toBe(2);
        })

        // ROUND 3
        client3.socket.on('upload', (round) => {
            orderCounter++;
            expect(orderCounter).toBe(7);
            expect(round).toBe(3);
        })

        const promises = []
        promises.push(client1.run(EXPERIMENT))
        promises.push(client2.run(EXPERIMENT))
        promises.push(client3.run(EXPERIMENT))

        const results = await Promise.all(promises);
        expect(orderCounter).toBe(9);
        expect(results).toEqual(['Success', 'Success', 'Success'])
        expect(server.writeRoundResults).toHaveBeenCalledTimes(3)

        //  check last round's state
        for (const id of ['id_1', 'id_2']) {
            expect(server.state.get(id).event()).toBe('download');
            expect(server.state.get(id).response()).toBe('downloaded');
            expect(server.state.get(id).status()).toBe('got');
            expect(server.state.get(id).args()).toEqual([{ "results": "downloaded" }]);
        }

        expect(server.state.get('id_3').event()).toBe('upload');
        expect(server.state.get('id_3').response()).toBe('uploaded');
        expect(server.state.get('id_3').status()).toBe('got');
        expect(server.state.get('id_3').args()).toEqual([['id1', 'id2']]);
    });
});
