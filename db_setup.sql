-- DROP VIEW IF EXISTS v_results;
-- DROP TABLE IF EXISTS result;
-- DROP TABLE IF EXISTS plug;

CREATE TABLE IF NOT EXISTS plug(
    plug_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    plug_name       TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS result(
    -- Fields for primary key
    result_id       INTEGER NOT NULL,
    plug_id         INTEGER NOT NULL,

    -- Timestamp for when poll was started
    utc_dt          TIMESTAMP NOT NULL,

    -- Result values from poll
    voltage         REAL NOT NULL,
    current         REAL NOT NULL,
    active_power    REAL NOT NULL,
    apparent_power  REAL NOT NULL,
    reactive_power  REAL NOT NULL,
    power_factor    REAL NOT NULL,

    -- Primary key
    PRIMARY KEY (result_id, plug_id),

    -- Reference plug
    FOREIGN KEY (plug_id) REFERENCES plug (plug_id)
);

CREATE VIEW IF NOT EXISTS v_results AS
    SELECT
        p.plug_name 'Name',
        r.utc_dt 'UTC Time',
        r.voltage 'Voltage',
        r.current 'Current',
        r.active_power 'Active Power',
        r.apparent_power 'Apparent Power',
        r.reactive_power 'Reactive Power',
        r.power_factor 'Power Factor'
    FROM
        result r,
        plug p
    WHERE
        r.plug_id = p.plug_id
    ORDER BY utc_dt;