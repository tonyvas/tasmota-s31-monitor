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
                
                // Get items from request
                let {template, params, cResolve, cReject} = request;

                // Process queued requests
                await this._query(template, params).then(cResolve).catch(cReject)
            }

            // Finished processing
            this._isProcessingQueue = false;
        }
    }

    _queueQuery(template, params, cResolve, cReject){
        return new Promise((resolve, reject) => {
            console.log('Queue', this._queue.length + 1, QUEUE_MAX_SIZE);
            if (this._queue.length >= QUEUE_MAX_SIZE){
                // Make sure queue doesn't get too full
                reject(new Error(`Reached maximum queue size of ${QUEUE_MAX_SIZE}!`));
            }
            else{
                // Push query to queue
                this._queue.push({ template, params, cResolve, cReject });
        
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
            // setTimeout(() => {
                db.all(template, values, (err, res) => {
                    if (err){
                        reject(err);
                    }
                    else{
                        resolve(res);
                    }
                })
            // }, 1000);
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
    addResult(plugName, result, timestamp = null){
        return new Promise((resolve, reject) => {
            // Assume current timestamp unless specified
            timestamp = timestamp || Date.now();

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
    getPlugs(){
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
    getPlugResults(plug_id, start = null, end = null){
        return new Promise((resolve, reject) => {
            // Max signed 64-bit number
            const MAX_TIMESTAMP = 2**63 - 1;
            const MIN_TIMESTAMP = 0;

            // Template to select everything for a plug by id between 2 timestamps
            const TEMPLATE = 'SELECT * FROM result WHERE plug_id = ? AND timestamp_ms BETWEEN ? AND ?;'

            // Assume default values if not specified
            start = start || MIN_TIMESTAMP;
            end = end || MAX_TIMESTAMP;

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









    _calculateResultAverages(start, end){
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

            this._query(SELECT_TEMPLATE, [start, end])
            .catch(err => {
                // Failed to select
                return Promise.reject(new Error(`Failed to select results: ${err.message}`))
            })
            .then((valueRows) => {
                resolve(valueRows);
            })
            .catch(err => {
                reject(new Error(`Failed to calculate result averages: ${err.message}`))
            })
        })
    }

    _getCurrentAverageIDOfPlug(plugID, startMS, durationMS){
        return new Promise((resolve, reject) => {
            const TEMPLATE = 'SELECT average_id FROM average WHERE plug_id = ? AND timestamp_start_ms = ? AND duration_ms = ?;';

            this._query(TEMPLATE, [plugID, startMS, durationMS])
            .catch(err => {
                return Promise.reject(new Error(`Failed to select averages: ${err.message}`))
            })
            .then(res => {
                switch (res.length) {
                    case 0:
                        return null
                    case 1:
                        return res[0]['average_id'];
                    default:
                        return Promise.reject(new Error(`Multiple averages exist for current period!`))
                }
            })
            .then(averageID => {
                resolve(averageID)
            })
            .catch(err => {
                reject(new Error(`Failed to get current averages: ${err.message}`));
            })
        })
    }

    _insertResultAveragesOfPlug(plugID, startMS, durationMS, results){
        return new Promise((resolve, reject) => {
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
            const INSERT_TEMPLATE = `INSERT INTO average (${INSERT_FIELDS.join(',')}) VALUES (${INSERT_VALUES.join(',')}) RETURNING average_id, plug_id;`;

            let values = [
                plugID,                     // plug_id
                startMS,                    // timestamp_start_ms
                durationMS,                 // duration_ms
                results['voltage'],         // voltage
                results['current'],         // current
                results['active_power'],    // active_power
                results['apparent_power'],  // apparent_power
                results['reactive_power'],  // reactive_power
                results['power_factor'],    // power_factor
            ]

            this._query(INSERT_TEMPLATE, values)
            .then(IDs => {
                resolve(IDs);
            })
            .catch(err => {
                reject(new Error(`Failed to insert average: ${err.message}`));
            })
        })
    }

    _updateResultAveragesOfPlug(plugID, averageID, results){
        return new Promise((resolve, reject) => {
            const UPDATE_FIELDS = [
                'voltage = ?',
                'current = ?',
                'active_power = ?',
                'apparent_power = ?',
                'reactive_power = ?',
                'power_factor = ?'
            ]
            
            const UPDATE_TEMPLATE = `UPDATE average SET ${UPDATE_FIELDS.join(', ')} WHERE plug_id = ? AND average_id = ?;`;

            let values = [
                results['voltage'],         // voltage
                results['current'],         // current
                results['active_power'],    // active_power
                results['apparent_power'],  // apparent_power
                results['reactive_power'],  // reactive_power
                results['power_factor'],    // power_factor
                plugID,                     // plug_id
                averageID                   // average_id
            ]

            this._query(UPDATE_TEMPLATE, values)
            .then(IDs => {
                resolve(IDs);
            })
            .catch(err => {
                reject(new Error(`Failed to update average: ${err.message}`));
            })
        })
    }

    averagePlugResults(durationMS){
        return new Promise((resolve, reject) => {
            // Current timestamp
            let now = Date.now();

            // Start of duration group
            let startMS = now - (now % durationMS)

            // End of duration group
            let endMS = startMS + durationMS

            // Run query
            this._calculateResultAverages(startMS, endMS)
            .catch(err => {
                return Promise.reject(`Failed to calculate result averages: ${err.message}`)
            })
            .then(resultsOfPlugs => {
                let promises = [];

                for (let results of resultsOfPlugs){
                    let plugID = results['plug_id'];

                    let promise = this._getCurrentAverageIDOfPlug(plugID, startMS, durationMS)
                    .then(averageID => {
                        if (averageID){
                            return this._updateResultAveragesOfPlug(plugID, averageID, results)
                            .catch(err => {
                                return Promise.reject(new Error(`Failed to update average: ${err.message}`))
                            })
                        }
                        else{
                            return this._insertResultAveragesOfPlug(plugID, startMS, durationMS, results)
                            .catch(err => {
                                return Promise.reject(new Error(`Failed to insert average: ${err.message}`))
                            })
                        }
                    })

                    promises.push(promise);
                }

                return Promise.all(promises)
            })
            .then(() => {
                resolve();
            })
            .catch(err => {
                reject(new Error(`Failed to average results: ${err.message}`))
            })
        })
    }
}

module.exports = DatabaseManager;