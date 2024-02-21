-- DROP VIEW IF EXISTS v_results;
-- DROP TABLE IF EXISTS result;
-- DROP TABLE IF EXISTS plug;

CREATE TABLE IF NOT EXISTS plug(
    plug_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    plug_name       TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS result(
    result_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    plug_id         INTEGER NOT NULL,

    -- Timestamp in MS for when poll was started
    timestamp_ms    TIMESTAMP NOT NULL,

    -- Result values from poll
    voltage         REAL NOT NULL,
    current         REAL NOT NULL,
    active_power    REAL NOT NULL,
    apparent_power  REAL NOT NULL,
    reactive_power  REAL NOT NULL,
    power_factor    REAL NOT NULL,

    -- Reference plug
    FOREIGN KEY (plug_id) REFERENCES plug (plug_id)
);

CREATE TABLE IF NOT EXISTS average(
    avgerage_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    plug_id             INTEGER NOT NULL,

    -- Timestamp in MS for start average group
    timestamp_start_ms  TIMESTAMP NOT NULL,

    -- Duration of group
    duration_ms         TIMESTAMP NOT NULL,

    -- Average result values from polls
    voltage             REAL NOT NULL,
    current             REAL NOT NULL,
    active_power        REAL NOT NULL,
    apparent_power      REAL NOT NULL,
    reactive_power      REAL NOT NULL,
    power_factor        REAL NOT NULL,

    -- Reference plug
    FOREIGN KEY (plug_id) REFERENCES plug (plug_id)
);

CREATE VIEW IF NOT EXISTS v_results AS
    SELECT
        p.plug_name,
        r.*
    FROM
        result r,
        plug p
    WHERE
        r.plug_id = p.plug_id
    ORDER BY r.timestamp_ms;

CREATE VIEW IF NOT EXISTS v_averages AS
    SELECT
        p.plug_name,
        a.*
    FROM
        average a,
        plug p
    WHERE
        a.plug_id = p.plug_id
    ORDER BY a.timestamp_start_ms;