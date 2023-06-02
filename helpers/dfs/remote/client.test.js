const fs = require('fs');
const Client = require('./client');
const { Server } = require("socket.io");
const { SingleStateStore, STATE } = require('./state');

const EXPERIMENT = {
    name: 'disconnect',
    description: 'For each round one node will upload a series of content and the rest of the nodes will download it. Since the connection with the uploader isn\'t terminated instantly, the downloader (after getting the content) will disconnect from the peer from which they got it.',
    networks: ['ipfs', 'swarm'],
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
        keypress: jest.fn((sec) => Promise.resolve({name: 'enter'}))
    }
}));

describe('Client', () => {
    let client;
    let clientSocket;
    let server;
    let serverSocket;

    beforeAll(() => {
        if (fs.existsSync('.state')) fs.rmSync('.state', { recursive: true });
    })

    beforeEach((done) => {
        jest.clearAllMocks()

        // Create a new server before tests
        server = new Server(3000);
        server.on("connection", (socket) => {
            serverSocket = socket;
        });

        // Create a new client before tests
        client = new Client('localhost', 3000);
        clientSocket = client.socket;
        clientSocket.on("connect", () => {
            client.run(EXPERIMENT);
            done();
        });
    });

    afterEach(() => {
        // close the sockets after each test
        server.close();
        client.disconnect();
    });


    test('_start method should start the experiment interactively or automatically', (done) => {
        client._start();
        client._start(true);

        let counter = 0;
        serverSocket.on('start', (experiment) => {
            expect(experiment).toEqual(client.exp)
            if (++counter === 2) done();
        })
    });

    test('"upload" event handler should call upload, update the state and emit "uploaded" with the results', (done) => {
        const round = 1;

        // At this point the client has executed the handler attached to 'upload'
        serverSocket.on('uploaded', (...args) => {
            // Verify that the upload method was called once
            expect(client.methods.upload).toHaveBeenCalledTimes(1);

            // Verify that the client's state was set correctly 
            expect(client.state.event()).toEqual('uploaded');
            expect(client.state.args()).toEqual([['id1', 'id2']]);
            expect(client.state.round()).toEqual(round);

            // Verify that the client.socket.emit('uploaded') was called with the correct arguments
            expect(args).toEqual(client.state.args());
            done();
        })

        // Trigger the upload event
        serverSocket.emit('upload', round);
    });

    test('upload event handler, if already executed should just emit "uploaded" with the previously uploaded results', (done) => {
        const round = 1;

        fs.writeFileSync('./.state/client.json', JSON.stringify({ ...STATE, round, event: 'uploaded', args: [['id1', 'id2']] }))

        client.state = new SingleStateStore('client.json')

        jest.spyOn(client.state, 'event');
        jest.spyOn(client.state, 'args');
        jest.spyOn(client.state, 'round');

        let counter = 0;

        // At this point the client has executed the handler attached to 'upload'
        serverSocket.on('uploaded', (...args) => {
            // Verify that the upload method was not called
            expect(client.methods.upload).toHaveBeenCalledTimes(0);

            // Verify that the client's state was set correctly 
            expect(client.state.event).not.toHaveBeenCalledWith('uploaded');
            expect(client.state.args).not.toHaveBeenCalledWith(['id1', 'id2']);
            expect(client.state.round).not.toHaveBeenCalledWith(1);

            // Verify that the client.socket.emit('uploaded') was called with the previously uploaded results
            expect(args).toEqual(client.state.args());

            if (++counter === 2) {
                done();
            }
        })

        // Trigger the upload event. The number of times it is triggered doesn't matter.
        serverSocket.emit('upload', round);
        serverSocket.emit('upload', round);
    });

    test('"download" event handler should call download, update the state and emit "downloaded" with the results', (done) => {
        // Mock the necessary data and dependencies
        const round = 1;
        const identifiers = ['id1', 'id2'];

        // At this point the client has executed the handler attached to 'download'
        serverSocket.on('downloaded', (...args) => {
            // Verify that the download method was called with the correct arguments
            expect(client.methods.download).toHaveBeenCalledWith(identifiers);

            // Verify that the client's state was set correctly 
            expect(client.state.event()).toEqual('downloaded');
            expect(client.state.args()).toEqual([{ results: 'downloaded' }]);
            expect(client.state.round()).toEqual(round);

            // Verify that the client.socket.emit('downloaded') was called with the correct arguments
            expect(args).toEqual(client.state.args());
            done();
        })

        // Trigger the download event
        serverSocket.emit('download', round, identifiers);
    });

    test('download event handler, if already executed should just emit "downloaded" with the previously downloaded results', (done) => {
        const round = 1;
        const identifiers = ['id1', 'id2'];

        fs.writeFileSync('./.state/client.json', JSON.stringify({ ...STATE, event: 'downloaded', args: [{ results: 'downloaded' }], round: 1 }))

        client.state = new SingleStateStore('client.json')

        jest.spyOn(client.state, 'event');
        jest.spyOn(client.state, 'args');
        jest.spyOn(client.state, 'round');

        let counter = 0;

        // At this point the client has executed the handler attached to 'download'
        serverSocket.on('downloaded', (...args) => {
            // Verify that the download method was not called
            expect(client.methods.download).toHaveBeenCalledTimes(0);

            // Verify that the client's state was called with the correct arguments
            expect(client.state.event).not.toHaveBeenCalledWith('downloaded');
            expect(client.state.args).not.toHaveBeenCalledWith(identifiers);
            expect(client.state.round).not.toHaveBeenCalledWith(1);

            // Verify that the client.socket.emit('downloaded') was called with the previously downloaded results
            expect(args).toEqual(client.state.args());
            
            if (++counter === 2) {
                done();
            }
        })

        // Trigger the download event. The number of times it is triggered doesn't matter.
        serverSocket.emit('download', round, identifiers);
        serverSocket.emit('download', round, identifiers);
    });
});
