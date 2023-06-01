const fs = require('fs');
const { SingleStateStore, MultiStateStore, STATE } = require('./state');

beforeAll(() => {
    if (fs.existsSync('.state')) fs.rmSync('.state', { recursive: true });
})

// SingleStateStore tests
describe('SingleStateStore', () => {
    let stateStore;

    beforeEach(() => {
        // Create a new instance of SingleStateStore before each test
        stateStore = new SingleStateStore('temp.json', null, undefined, './.state');
    });

    afterEach(() => {
        // Clean up the state after each test
        stateStore.clear();
    });

    test('should initialize with default state if no initial state is provided or no state file exists', () => {
        expect(stateStore.get()).toEqual(STATE);
    });

    test('should extend state with a new property', () => {
        stateStore.extend('action', 'upload');

        expect(stateStore.get()).toEqual({ ...STATE, action: 'upload' });
    });

    test('should set and get state correctly', () => {
        const state = { event: 'event1', status: 'status1', args: [1, 2, 3] };
        stateStore.set(state);

        expect(stateStore.get()).toEqual({ ...STATE, ...state });
    });

    test('should set state via the setters correctly', () => {
        stateStore.event('event1');
        stateStore.status('status1');

        expect(stateStore.get()).toEqual({ ...STATE, event: 'event1', status: 'status1' });
    });

    test('should persist state to a JSON file', () => {
        const state = { event: 'event1', status: 'status1', args: [1, 2, 3] };
        stateStore.set(state);

        const savedState = JSON.parse(fs.readFileSync('./.state/temp.json'));
        expect(savedState).toEqual({ ...STATE, ...state });
    });

    test('should load initial state from file if state file exists', () => {
        stateStore.event('event1');
        stateStore.status('status1');

        const newStateStore = new SingleStateStore('temp.json', null, undefined, './.state');

        expect(newStateStore.get()).toEqual(stateStore.get());
    });
});

// MultiStateStore tests
describe('MultiStateStore', () => {
    let multiStateStore;

    beforeEach(() => {
        // Create a new instance of MultiStateStore before each test
        multiStateStore = new MultiStateStore('temp.json', './.state');
    });

    afterEach(() => {
        // Clean up the state after each test
        multiStateStore.clear();
    });

    test('should add and get individual state stores (initialized with default state)', () => {
        multiStateStore.add('store1');
        multiStateStore.add('store2');

        expect(multiStateStore.get('store1').get()).toEqual(STATE);
        expect(multiStateStore.get('store2').get()).toEqual(STATE);
    });

    test('should persist multiple state stores to a JSON file', () => {
        multiStateStore.add('store1').event('event1');
        multiStateStore.add('store2').status('status2');

        const savedState = JSON.parse(fs.readFileSync('./.state/temp.json'));

        expect(savedState.store1).toEqual({ ...STATE, event: 'event1' });
        expect(savedState.store2).toEqual({ ...STATE, status: 'status2' });
    });

    test('should load multiple state stores from file if state file exists', () => {
        const stateStore1 = multiStateStore.add('store1');
        const stateStore2 = multiStateStore.add('store2');

        stateStore1.event('event1');
        stateStore2.status('event2');
        stateStore2.extend('test', 5);

        const newMultiStateStore = new MultiStateStore('temp.json', './.state');

        expect(newMultiStateStore.get('store1').get()).toEqual(stateStore1.get());
        expect(newMultiStateStore.get('store2').get()).toEqual(stateStore2.get());
    });
});
