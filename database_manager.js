const sqlite3 = require('sqlite3');

const QUEUE_MAX_SIZE = 32;

class DatabaseManager{
    constructor(databasePath){
        // Filepath to database
        this._databasePath = databasePath;

        // Array of queued jobs
        // Public methods queue up an object containining 3 callbacks
        //      what        The main callback, does whatever db action needs done
        //      cResolve    Gets called if what completed successfully
        //      cReject     Gets called if what completed unsuccessfully
        // Used to prevent actions from competing and potentially both writing to db at the same time
        // Forces them to be processed one at a time
        this._queue = [];
        // Bool to prevent multiple simultaneous processes
        this._isProcessingQueue = false;
    }

    // Process requests in the queue array
    async _processQueue(){
        // If not processing, start doing so
        if (!this._isProcessingQueue){
            this._isProcessingQueue = true;
            
            // While queue is not empty
            while (this._queue.length > 0){
                // Remove request from beginning of queue
                let request = this._queue.splice(0, 1)[0];
                
                // Get callbacks from request
                let {what, cResolve, cReject} = request;

                // Process queued requests
                await what().then(cResolve).catch(cReject);
            }

            // Finished processing
            this._isProcessingQueue = false;
        }
    }

    // Add a queue request to the queue
    // Takes a main action callback, and a the resolve and reject callbacks for when what is complete
    // Resolves when request was added
    // Rejects if failed to queue request
    _addToQueue(what, cResolve, cReject){
        return new Promise((resolve, reject) => {
            if (this._queue.length >= QUEUE_MAX_SIZE){
                // Make sure queue doesn't get too full
                reject(new Error(`Reached maximum queue size of ${QUEUE_MAX_SIZE}!`));
            }
            else{
                this._queue.push({
                    // Bind callbacks to this instance
                    what: what.bind(this), cResolve, cReject });
        
                // Resume processing
                this._processQueue();

                // Resolve if setup didn't fail
                resolve();
            }
        })
    }

    // Opens a handle to the database
    // Resolves with the handle if successful
    // Rejects if failed to open
    _open(){
        return new Promise((resolve, reject) => {
            // Open database (do not create once, that's for setup.js to do)
            let db = new sqlite3.Database(this._databasePath, sqlite3.OPEN_READWRITE, err => {
                if (err){
                    reject(new Error(`Failed to open database: ${err.message}`));
                }
                else{
                    resolve(db);
                }
            })
        })
    }

    // Promise wrapper for sqlite3.Database.all
    // Executes SQL using a template and array of values
    // Takes the sqlite database instance, a SQL template and array of values
    // Resolves with the result if successful
    // Rejects if not
    _execSql(db, template, values){
        return new Promise((resolve, reject) => {
            db.all(template, values, (err, res) => {
                if (err){
                    reject(err);
                }
                else{
                    resolve(res);
                }
            })
        })
    }

    // Run a SQL query
    // Takes an SQL template, and an array of values
    // Resolves results of query if successful
    // Rejects if unsuccessful
    _query(template, values){
        return new Promise((resolve, reject) => {
            let database = null;

            // Connect to the DB
            this._open()
            .then(db => {
                database = db;

                // Execute SQL using template and params
                return this._execSql(database, template, values).catch(err => {
                    // Failed to exec
                    return Promise.reject(new Error(`Failed to execute sql: ${err.message}`));
                })
            })
            .then(res => {
                // Resolve result
                resolve(res);
            })
            .catch(err => {
                // Failed to query
                reject(new Error(`Failed to query database: ${err.message}`));
            })
            .finally(() => {
                if (database){
                    // Close handle when done
                    database.close();
                }
            })
        })
    }

    // Gets a plug ID if it exists in the database,
    // Otherwise create a new entry and return the plug ID
    // Takes a plug name
    // Resolves with the plug ID if successful
    // Rejects if unsuccessful
    _getOrInsertPlug(name){
        return new Promise((resolve, reject) => {
            // Templates for selecting or inserting plug
            const SELECT_TEMPLATE = 'SELECT plug_id FROM plug WHERE plug_name = ?;';
            const INSERT_TEMPLATE = 'INSERT INTO plug (plug_name) VALUES (?) RETURNING plug_id;';

            // Try selecting plug by name
            this._query(SELECT_TEMPLATE, [name])
            .then(selected => {
                if (selected.length > 0){
                    // If got a match, resolve the plug ID
                    resolve(selected[0]['plug_id']);
                }
                else{
                    // If no match, insert new plug
                    this._query(INSERT_TEMPLATE, [name])
                    .then(inserted => {
                        // If successful, resolve ID of new plug
                        resolve(inserted[0]['plug_id']);
                    })
                    .catch(err => {
                        reject(new Error(`Failed to insert plug: ${err.message}`));
                    })
                }
            })
            .catch(err => {
                reject(new Error(`Failed to select plug: ${err.message}`));
            })
        })
    }

    // Generate an object containing the SQL template, and array of values to insert a plug result
    // Takes the plug ID, a timestamp, and result object
    // Returns a dict { template, values } if successful
    _generateInsertResultQuery(plug_id, timestamp, result){
        // Dict to convert DB key into JS result object key
        const DB_TO_JS_KEYMAP = {
            'voltage': 'Voltage',
            'current': 'Current',
            'active_power': 'Active Power',
            'apparent_power': 'Apparent Power',
            'reactive_power': 'Reactive Power',
            'power_factor': 'Power Factor',
        }

        // Order in which to insert result object values into result table
        const RESULT_OBJECT_INSERT_KEY_ORDER = [
            'voltage',
            'current',
            'active_power',
            'apparent_power',
            'reactive_power',
            'power_factor',
        ];

        // Final insert order
        let insertKeyOrder = ['plug_id', 'timestamp_ms', ...RESULT_OBJECT_INSERT_KEY_ORDER];

        // Generate insert template
        let template = `INSERT INTO result (${insertKeyOrder.join(',')}) VALUES (?,?,?,?,?,?,?,?) RETURNING result_id;`;

        // Ordered values
        let values = [];

        // Add the plug_id and timestamp
        values.push(plug_id);
        values.push(timestamp);

        // Iterate over DB key order
        for (let dbKey of RESULT_OBJECT_INSERT_KEY_ORDER){
            // Convert DB to JS key
            let jsKey = DB_TO_JS_KEYMAP[dbKey];

            // Add relevant result value
            values.push(result[jsKey]);
        }

        return {template, values};
    }

    // Insert a result into the database
    // Takes the plug ID for the result, a timestamp and the result object itself
    // Resolves with the result ID if successful
    // Rejects if not
    _insertResult(plug_id, timestamp, result){
        return new Promise((resolve, reject) => {
            // Get the template and values from the generator helper
            let {template, values} = this._generateInsertResultQuery(plug_id, timestamp, result);

            // Run the insert query
            this._query(template, values)
            .then(inserted => {
                // Resolve ID if successful
                resolve(inserted[0]['result_id'])
            })
            .catch(err => {
                reject(new Error(`Failed to insert result: ${err.message}`));
            })
        })
    }

    // Add a result to the database
    // Takes the plug name, result object and a timestamp
    // Converts the plug name into its ID, and inserts result
    // Resolves the plug and result IDs if successful
    // Rejects if not
    _addResult(plugName, result, timestamp){
        return new Promise((resolve, reject) => {
            // Get the Plug ID
            this._getOrInsertPlug(plugName)
            .catch(err => {
                return Promise.reject(new Error(`Failed to get plug ID: ${err.message}`));
            })
            .then(plug_id => {
                // Insert into result table
                return this._insertResult(plug_id, timestamp, result)
                .then(result_id => {
                    // Resolve with IDs when done
                    resolve({plug_id, result_id});
                })
                .catch(err => {
                    // Failed to insert
                    return Promise.reject(new Error(`Failed to insert result: ${err.message}`));
                })
            })
            .catch(err => {
                reject(new Error(`Failed to add result: ${err.message}`));
            })
        })
    }

    // Get all plugs
    // Takes nothing
    // Resolves array of plug records
    _getPlugs(){
        return new Promise((resolve, reject) => {
            // Template to select everything for a plug by id between 2 timestamps
            const TEMPLATE = 'SELECT * FROM plug;'

            // Run query
            this._query(TEMPLATE)
            .then((res) => {
                // Resolve results
                resolve(res)
            })
            .catch(err => {
                // Failed to select
                reject(new Error(`Failed to select plugs: ${err.message}`))
            })
        })
    }

    // Get results for a plug
    // Takes the plug ID, a start and end timestamp
    // Resolves array of results records
    _getPlugResults(plug_id, start, end){
        return new Promise((resolve, reject) => {
            // Template to select everything for a plug by id between 2 timestamps
            const TEMPLATE = 'SELECT * FROM result WHERE plug_id = ? AND timestamp_ms BETWEEN ? AND ?;'

            // Run query
            this._query(TEMPLATE, [plug_id, start, end])
            .then((res) => {
                // Resolve results
                resolve(res)
            })
            .catch(err => {
                // Failed to select
                reject(new Error(`Failed to select results: ${err.message}`))
            })
        })
    }

    _averagePlugResults(durationMS){
        return new Promise((resolve, reject) => {
            // Template to select everything for a plug by id between 2 timestamps
            const SELECT_FIELDS = [
                'plug_id',
                'avg(voltage) "voltage"',
                'avg(current) "current"',
                'avg(active_power) "active_power"',
                'avg(apparent_power) "apparent_power"',
                'avg(reactive_power) "reactive_power"',
                'avg(power_factor) "power_factor"'
            ]
            const SELECT_TEMPLATE = `SELECT ${SELECT_FIELDS.join(', ')} FROM result WHERE timestamp_ms BETWEEN ? AND ? GROUP BY plug_id;`

            const INSERT_FIELDS = [
                'plug_id',
                'timestamp_start_ms',
                'duration_ms',
                'voltage',
                'current',
                'active_power',
                'apparent_power',
                'reactive_power',
                'power_factor'
            ]
            const INSERT_VALUES = INSERT_FIELDS.map(item => '?');
            const INSERT_TEMPLATE = `INSERT INTO average (${INSERT_FIELDS.join(',')}) VALUES (${INSERT_VALUES.join(',')}) RETURNING average_id;`;

            // Current timestamp
            let now = Date.now();

            // Start of duration group
            let startMS = now - (now % durationMS)

            // End of duration group
            let endMS = startMS + durationMS

            // Run query
            this._query(SELECT_TEMPLATE, [startMS, endMS])
            .then((res) => {
                let promises = [];
                let averageIDs = [];

                for (let row of res){
                    let values = [
                        row['plug_id'],         // plug_id
                        startMS,                // timestamp_start_ms
                        durationMS,             // duration_ms
                        row['voltage'],         // voltage
                        row['current'],         // current
                        row['active_power'],    // active_power
                        row['apparent_power'],  // apparent_power
                        row['reactive_power'],  // reactive_power
                        row['power_factor'],    // power_factor
                    ]

                    // let promise = this._query(INSERT_TEMPLATE, values).then(avgerageID => {
                    //     averageIDs.push(avgerageID)
                    // })

                    // promises.push(promise)
                }

                return Promise.all(promises)
                .then(() => {
                    return Promise.resolve(averageIDs);
                })
                .catch(err => {
                    return Promise.reject();
                })
            })
            .then(() => {
                resolve()
            })
            .catch(err => {
                // Failed to select
                reject(new Error(`Failed to select results: ${err.message}`))
            })
        })
    }

    // Public facing method to add a result to the database
    // Queues a request to insert the result, and waits until it gets processed
    // Takes the plug name, result object and optionally a timestamp
    // Resolves with the plug and result IDs if successful
    // Rejects if not
    addResult(plugName, result, timestamp = null){
        return new Promise((resolve, reject) => {
            // What to do when it is time to process request
            function what(){
                if (!timestamp){
                    // Use current time if no timestamp
                    timestamp = Date.now();
                }

                // Add the result
                return this._addResult(plugName, result, timestamp);
            }

            // Queue request
            this._addToQueue(what, resolve, reject)
            .catch(err => {
                // Failed to queue
                reject(new Error(`Failed to add to queue: ${err.message}`));
            })
        })
    }

    // Public facing method to get plugs
    // Takes nothing
    // Resolves array of plugs
    getPlugs(){
        return new Promise((resolve, reject) => {
            // What to do when it is time to process request
            function what(){
                // Get plugs
                return this._getPlugs();
            }

            // Queue request
            this._addToQueue(what, resolve, reject)
            .catch(err => {
                // Failed to queue
                reject(new Error(`Failed to add to queue: ${err.message}`));
            })
        })
    }

    // Public facing method to get results for a plug
    // Takes a plug ID, and optionally a start and end timestamp
    getPlugResults(plug_id, start = null, end = null){
        return new Promise((resolve, reject) => {
            // What to do when it is time to process request
            function what(){
                // Max signed 64-bit number
                const MAX_TIMESTAMP = 2**63 - 1;
                const MIN_TIMESTAMP = 0;

                if (!start){
                    start = MIN_TIMESTAMP;
                }

                if (!end){
                    end = MAX_TIMESTAMP;
                }

                // Get the results
                return this._getPlugResults(plug_id, start, end);
            }

            // Queue request
            this._addToQueue(what, resolve, reject)
            .catch(err => {
                // Failed to queue
                reject(new Error(`Failed to add to queue: ${err.message}`));
            })
        })
    }

    averagePlugResults(durationMS){
        return new Promise((resolve, reject) => {
            // What to do when it is time to process request
            function what(){
                // Get plugs
                return this._averagePlugResults(durationMS);
            }

            // Queue request
            this._addToQueue(what, resolve, reject)
            .catch(err => {
                // Failed to queue
                reject(new Error(`Failed to add to queue: ${err.message}`));
            })
        })
    }
}

module.exports = DatabaseManager;