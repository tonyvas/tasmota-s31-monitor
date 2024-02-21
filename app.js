const DatabaseManager = require('./database_manager');
const PlugMonitor = require('./plug_monitor');
const WebAPI = require('./web_api');

const DATABASE_FILEPATH = `${__dirname}/plugs.db`;
const DEFAULT_API_PORT = 8080;

const API_PORT = process.env.API_PORT || DEFAULT_API_PORT

// Initialize a database manager
const databaseManager = new DatabaseManager(DATABASE_FILEPATH);

// Initialize the plug monitor
const plugMonitor = new PlugMonitor(databaseManager);

// Initialize the API
const webAPI = new WebAPI(databaseManager, API_PORT);


// Start monitoring
plugMonitor.start()
.catch(err => {
    // Failed to start monitor
    return Promise.reject(new Error(`Error: Failed to start plug monitor: ${err.message}`));
})
.then(() => {
    console.log('Monitoring started!');

    // Start API
    return webAPI.start()
    .catch(err => {
        // Failed to start API
        return Promise.reject(new Error(`Error: Failed to start the web API: ${err.message}`));
    })
})
.then(() => {
    console.log(`Web API started at http://127.0.0.1:${API_PORT}`);
})
.catch(err => {
    console.error(`Error: Failed to start: ${err.message}`);

    // Stop monitor
    plugMonitor.stop().then(() => {
        console.log('Stopped!');
    }).catch(err => {
        console.error(`Error: Failed to stop: ${err.message}`);
    })
})