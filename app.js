const DatabaseManager = require('./database_manager');
const PlugMonitor = require('./plug_monitor');

const DATABASE_FILEPATH = `${__dirname}/plugs.db`;

// Initialize a database manager
const databaseManager = new DatabaseManager(DATABASE_FILEPATH);

// Initialize the plug monitor
const plugMonitor = new PlugMonitor(databaseManager);

// Start monitoring
plugMonitor.start().then(() => {
    console.log('Monitoring started!');
}).catch(err => {
    console.error(`Error: Failed to start monitoring: ${err.message}`);
})