const sqlite3 = require('sqlite3');
const fs = require('fs');

const DATABASE_SETUP_SCRIPT = `${__dirname}/db_setup.sql`;
const DATABASE_FILEPATH = `${__dirname}/plugs.db`;

// Read SQL script
fs.readFile(DATABASE_SETUP_SCRIPT, 'utf-8', (err, sql) => {
    if (err){
        console.error(`Error: Failed to read database setup script!`, err);
    }
    else{
        let db = null;

        try {
            // Open database
            db = new sqlite3.Database(DATABASE_FILEPATH, (err) => {
                if (err){
                    console.error(`Error: Failed to create database handle!`, err);
                }
                else{
                    // Run SQL
                    db.exec(sql, (err) => {
                        if (err){
                            console.error(`Error: Failed to exec setup script!`, err);
                        }
                        else{
                            console.log('Database setup complete!');
                        }
                    })
                }
            })
        } catch (error) {
            console.error(`Error: Failed to setup database`);
        } finally {
            if (db){
                db.close();
            }
        }
    }
})