const sql = require("mssql");

const globalpooldb = {
  db: null,
  testTable: null,
};

const dbConfig = {
  user: "sa",
  password: "Password_123#",
  server: "192.168.1.116",
  port: 1433,
  database: "BleTrackingDbDev",
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

async function initializeDatabase(testTableName = null) {
  try {
    const pool = await sql.connect(dbConfig);

    await pool.request()
      .query(`IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'BleTrackingDbDev')
      BEGIN
        CREATE DATABASE BleTrackingDbDev;
      END
    `);

    await pool.close();

    const db = await sql.connect(dbConfig);

    await db.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'gateways' AND xtype = 'U')
      CREATE TABLE gateways (
        id INT IDENTITY(1,1) PRIMARY KEY,
        gmac VARCHAR(12) NOT NULL UNIQUE,
        created_at DATETIME DEFAULT GETDATE()
      );
    `);

    await db.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'beacons' AND xtype = 'U')
      CREATE TABLE beacons (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        gateway_id INT NOT NULL,
        type TINYINT NOT NULL,
        dmac VARCHAR(12) NOT NULL,
        refpower SMALLINT,
        rssi FLOAT,
        vbatt INT,
        temp FLOAT,
        time DATETIME NOT NULL,
        meter FLOAT,
        calc_dist FLOAT,
        gmac VARCHAR(12) NOT NULL,
        measure FLOAT,
        FOREIGN KEY (gateway_id) REFERENCES gateways(id)
      );
    `);

    await db.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'beacon_positions' AND xtype = 'U')
      CREATE TABLE beacon_positions (
        id UNIQUEIDENTIFIER PRIMARY KEY,
        beacon_id VARCHAR(12) NOT NULL,
        floorplan_id UNIQUEIDENTIFIER NOT NULL,
        pos_x BIGINT NOT NULL,
        pos_y BIGINT NOT NULL,
        is_in_restricted_area BIT NOT NULL,
        first_gateway_id VARCHAR(12) NOT NULL,
        second_gateway_id VARCHAR(12) NOT NULL,
        first_distance FLOAT NOT NULL,
        second_distance FLOAT NOT NULL,
        timestamp DATETIME NOT NULL,
        created_at DATETIME DEFAULT GETDATE()
      );
    `);

    await db.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'alarm_triggers' AND xtype = 'U')
      CREATE TABLE alarm_triggers (
        id UNIQUEIDENTIFIER PRIMARY KEY,
        beacon_id VARCHAR(12) NOT NULL,
        floorplan_id UNIQUEIDENTIFIER NOT NULL,
        pos_x BIGINT NOT NULL,
        pos_y BIGINT NOT NULL,
        is_in_restricted_area BIT NOT NULL,
        first_gateway_id VARCHAR(12) NOT NULL,
        second_gateway_id VARCHAR(12) NOT NULL,
        first_distance FLOAT NOT NULL,
        second_distance FLOAT NOT NULL,
        trigger_time DATETIME NOT NULL,
        is_active BIT NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT GETDATE()
      );
    `);

    if (testTableName) {
      globalpooldb.testTable = testTableName;
      await db.request().query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = '${testTableName}' AND xtype='U')
        CREATE TABLE ${testTableName} (
          id BIGINT IDENTITY(1,1) PRIMARY KEY,
          gateway_id INT NOT NULL,
          type TINYINT NOT NULL,
          dmac VARCHAR(12) NOT NULL,
          refpower SMALLINT,
          rssi FLOAT,
          vbatt INT,
          temp FLOAT,
          time DATETIME NOT NULL,
          meter FLOAT,
          calc_dist FLOAT,
          gmac VARCHAR(12) NOT NULL,
          measure FLOAT,
          FOREIGN KEY (gateway_id) REFERENCES gateways(id)
        );
      `);
      console.log(
        `Test table '${testTableName}' initialized or already exists`
      );
    }

    globalpooldb.db = db;
    console.log("Database dan tabel berhasil diinisialisasi (MSSQL)");
  } catch (error) {
    console.error("Inisialisasi database MSSQL gagal:", error);
    throw error;
  }
}

function getDbPool() {
  if (!globalpooldb.db) {
    throw new Error("Database pool not initialized");
  }
  return {
    db: globalpooldb.db,
    testTable: globalpooldb.testTable,
  };
}

async function fetchAllFloorplans() {
  const { db } = getDbPool();
  try {
    console.log("Fetching all floorplans");
    const floorplanResult = await db.request().query(`
      SELECT fp.id AS floorplan_id, fp.name, m.meter_per_px AS scale
      FROM mst_floorplan fp
      JOIN mst_floor m ON fp.floor_id = m.id
      WHERE m.status != 0 AND fp.status != 0
    `);
    const gatewayResult = await db.request().query(`
      SELECT fd.floorplan_id, br.gmac, fd.pos_px_x, fd.pos_px_y
      FROM floorplan_device fd
      JOIN mst_ble_reader br ON fd.ble_reader_id = br.id
      WHERE fd.type = 'blereader' AND fd.status != 0 AND br.status != 0
    `);
    const maskedAreaResult = await db.request().query(`
      SELECT fp.id AS floorplan_id, fma.name, fma.area_shape, fma.restricted_status
      FROM floorplan_masked_area fma
      JOIN mst_floorplan fp ON fma.floor_id = fp.floor_id
      WHERE fma.status != 0 AND fp.status != 0
    `);
    const accessDoorResult = await db.request().query(`
      SELECT fd.floorplan_id, fd.pos_px_x, fd.pos_px_y, mac.door_id
      FROM floorplan_device fd
      JOIN mst_access_control mac ON fd.access_control_id = mac.id
      WHERE fd.type = 'AccessDoor' AND fd.status != 0 AND mac.status != 0
    `);
    return {
      floorplans: floorplanResult.recordset,
      gateways: gatewayResult.recordset,
      maskedAreas: maskedAreaResult.recordset,
      accessDoors: accessDoorResult.recordset,
    };
  } catch (error) {
    console.error("Error fetching all floorplans:", error);
    throw error;
  }
}

module.exports = { initializeDatabase, getDbPool, fetchAllFloorplans };
