// const sql = require("mssql");

// const globalpooldb = {
//   db: null,
//   testTable: null,
// };

// const dbConfig = {
//   user: "sa",
//   password: "P@ssw0rd",
//   // server: "10.0.74.189",
//   // database: "test_gresik",
//   server: "103.193.15.120",
//   database: "testingble_gresik",
//   options: {
//     encrypt: false,
//     trustServerCertificate: true,
//   },
// };

// async function initializeDatabase(testTableName = null) {
//   try {
//     const pool = await sql.connect({
//       user: dbConfig.user,
//       password: dbConfig.password,
//       server: dbConfig.server,
//       options: {
//         encrypt: false,
//         trustServerCertificate: true,
//       },
//     });

//     await pool.request()
//       .query(`IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'testingble_gresikz')
//       BEGIN
//         CREATE DATABASE testingble_gresikz;
//       END
//     `);

//     await pool.close();

//     const db = await sql.connect(dbConfig);

//     // gateways
//     await db.request().query(`
//       IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='gateways' AND xtype='U')
//       CREATE TABLE gateways (
//         id INT IDENTITY(1,1) PRIMARY KEY,
//         gmac VARCHAR(12) NOT NULL UNIQUE,
//         created_at DATETIME DEFAULT GETDATE()
//       );
//     `);

//     // beacons
//     await db.request().query(`
//       IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='beacons' AND xtype='U')
//       CREATE TABLE beacons (
//         id BIGINT IDENTITY(1,1) PRIMARY KEY,
//         gateway_id INT NOT NULL,
//         type TINYINT NOT NULL,
//         dmac VARCHAR(12) NOT NULL,
//         refpower SMALLINT,
//         rssi FLOAT,
//         vbatt INT,
//         temp FLOAT,
//         time DATETIME NOT NULL,
//         meter FLOAT,
//         calc_dist FLOAT,
//         gmac VARCHAR(12) NOT NULL,
//         measure FLOAT,
//         FOREIGN KEY (gateway_id) REFERENCES gateways(id)
//       );
//     `);

//     if (testTableName) {
//       globalpooldb.testTable = testTableName;
//       await db.request().query(`
//         IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='${testTableName}' AND xtype='U')
//         CREATE TABLE ${testTableName} (
//           id BIGINT IDENTITY(1,1) PRIMARY KEY,
//           gateway_id INT NOT NULL,
//           type TINYINT NOT NULL,
//           dmac VARCHAR(12) NOT NULL,
//           refpower SMALLINT,
//           rssi FLOAT,
//           vbatt INT,
//           temp FLOAT,
//           time DATETIME NOT NULL,
//           meter FLOAT,
//           calc_dist FLOAT,
//           gmac VARCHAR(12) NOT NULL,
//           measure FLOAT,
//           FOREIGN KEY (gateway_id) REFERENCES gateways(id)
//         );
//       `);
//       console.log(
//         `Test table '${testTableName}' initialized or already exists`
//       );
//     }

//     globalpooldb.db = db;
//     console.log("Database dan tabel berhasil diinisialisasi (MSSQL)");
//   } catch (error) {
//     console.error("Inisialisasi database MSSQL gagal:", error);
//     throw error;
//   }
// }

// function getDbPool() {
//   if (!globalpooldb.db) {
//     throw new Error("Database pool not initialized");
//   }
//   return {
//     db: globalpooldb.db,
//     testTable: globalpooldb.testTable,
//   };
// }

// module.exports = { initializeDatabase, getDbPool };

// database.js
const sql = require("mssql");

const globalpooldb = {
  db: null,
  testTable: null,
};

const dbConfig = {
  user: "sa",
  password: "Password_123#",
  server: "192.168.1.116",
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

    // gateways
    await db.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'gateways' AND xtype = 'U')
      CREATE TABLE gateways (
        id INT IDENTITY(1,1) PRIMARY KEY,
        gmac VARCHAR(12) NOT NULL UNIQUE,
        created_at DATETIME DEFAULT GETDATE()
      );
    `);

    // beacons
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

async function fetchDynamicData(floorplanId) {
  const { db } = getDbPool();
  try {
    console.log(`Fetching data for FloorplanId: ${floorplanId}`);

    const readerResult = await db
      .request()
      .input("floorplanId", sql.VarChar(36), floorplanId).query(`
        SELECT br.gmac, fd.pos_px_x, fd.pos_px_y
        FROM floorplan_device fd
        JOIN mst_ble_reader br ON fd.ble_reader_id = br.id
        WHERE fd.floorplan_id = @floorplanId
        AND fd.type = 'blereader'
        AND fd.status != 0
        AND br.status != 0
      `);
    const gateways = new Map(
      readerResult.recordset.map((row) => [
        row.gmac,
        { x: Number(row.pos_px_x), y: Number(row.pos_px_y) },
      ])
    );
    console.log(`Gateways fetched: ${readerResult.recordset.length} records`, [
      ...gateways,
    ]);

    const scaleResult = await db
      .request()
      .input("floorplanId", sql.VarChar(36), floorplanId).query(`
        SELECT m.meter_per_px
        FROM mst_floor m
        JOIN mst_floorplan fp ON m.id = fp.floor_id
        WHERE fp.id = @floorplanId
        AND m.status != 0
        AND fp.status != 0
      `);
    const scale = Number(scaleResult.recordset[0]?.meter_per_px) || 1;
    console.log(`Scale fetched: ${scale}`);

    // MstFloorplan
    const floorplanResult = await db
      .request()
      .input("floorplanId", sql.VarChar(36), floorplanId).query(`
        SELECT id, name
        FROM mst_floorplan
        WHERE id = @floorplanId
        AND status != 0
      `);
    const floorplan = floorplanResult.recordset[0] || {};
    console.log(`Floorplan fetched:`, floorplan);

    // FloorplanMaskedArea
    const maskedAreaResult = await db
      .request()
      .input("floorplanId", sql.VarChar(36), floorplanId).query(`
        SELECT area_shape, restricted_status
        FROM floorplan_masked_area
        WHERE floor_id = (SELECT floor_id FROM mst_floorplan WHERE id = @floorplanId)
        AND status != 0
      `);
    const maskedAreas = maskedAreaResult.recordset;
    console.log(`Masked areas fetched: ${maskedAreas.length} records`);

    return { gateways, scale, floorplan, maskedAreas };
  } catch (error) {
    console.error(`Error fetching data for FloorplanId ${floorplanId}:`, error);
    throw error;
  }
}

module.exports = { initializeDatabase, getDbPool, fetchDynamicData };
