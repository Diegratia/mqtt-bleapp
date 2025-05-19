const express = require("express");
const cors = require("cors");
const { initializeDatabase, getDbPool } = require("./database");
const { startMqttClient } = require("./mqtt");
const sql = require("mssql");
const path = require("path");
const minimist = require("minimist");

const app = express();
const port = 3000;

const args = minimist(process.argv.slice(2));
const testTableName = args.t;

app.use(cors({ origin: "*" }));
app.use(express.static(path.join(__dirname, "public")));

async function saveToDatabase(obj) {
  if (!obj.dmac) {
    console.warn("Beacon missing dmac, skipping:", obj);
    return;
  }

  const gmac = obj.gmac || obj.obj[0].gmac;

  const { db, testTable } = getDbPool();

  await db.request().input("gmac", sql.VarChar(12), gmac).query(`
    IF NOT EXISTS (SELECT 1 FROM gateways WHERE gmac = @gmac)
    INSERT INTO gateways (gmac) VALUES (@gmac);
  `);

  const tableName = testTable;

  console.log(`save ke ${tableName}:`, obj);

  await db
    .request()
    .input("gateway_id", sql.Int, 1)
    .input("type", sql.TinyInt, obj.type)
    .input("dmac", sql.VarChar(12), obj.dmac)
    .input("refpower", sql.SmallInt, obj.refpower ?? null)
    .input("rssi", sql.Float, obj.rssi ?? null)
    .input("vbatt", sql.Int, obj.vbatt ?? null)
    .input("temp", sql.Float, obj.temp ?? null)
    .input("meter", sql.Float, obj.meter ?? 0)
    .input("measure", sql.Float, obj.measure ?? 0)
    .input("time", sql.DateTime, obj.time ? new Date(obj.time) : new Date())
    .query(`
        INSERT INTO ${tableName} (
          gateway_id, type, dmac, refpower, rssi, vbatt, temp, time, meter, measure
        ) VALUES (
          @gateway_id, @type, @dmac, @refpower, @rssi, @vbatt, @temp, @time, @meter, @measure
        );
      `);
}

app.get("/beacons-data", async (req, res) => {
  try {
    const { db, testTable } = getDbPool();
    const tableName = testTable || "beacons";

    const result = await db.request().query(`
      SELECT g.gmac, b.dmac, b.type, b.vbatt, b.temp, b.rssi, b.refpower
      FROM ${tableName} b
      JOIN gateways g ON b.gateway_id = g.id
      ORDER BY g.gmac, b.dmac, b.type;
    `);

    const rows = result.recordset;
    const groupedByGmac = {};
    const finalResult = [];

    rows.forEach((row) => {
      const { gmac, dmac, type, vbatt, temp, rssi, refpower } = row;

      if (!groupedByGmac[gmac]) {
        groupedByGmac[gmac] = {
          gmac: gmac,
          beacons: {},
        };
        finalResult.push(groupedByGmac[gmac]);
      }

      if (!groupedByGmac[gmac].beacons[dmac]) {
        groupedByGmac[gmac].beacons[dmac] = {
          type1: [],
          type4: [],
        };
      }

      if (type === 1) {
        groupedByGmac[gmac].beacons[dmac].type1.push({ vbatt, temp });
      } else if (type === 4) {
        groupedByGmac[gmac].beacons[dmac].type4.push({ rssi, refpower });
      }
    });

    res.json({
      message: `Data berhasil diambil dari ${tableName}`,
      data: finalResult,
    });
  } catch (error) {
    console.error("Error fetching beacons data:", error.message);
    res.status(500).json({
      message: "Gagal ambil data",
      error: error.message,
    });
  }
});

app.get("/rssi-chart-data", async (req, res) => {
  try {
    const { db, testTable } = getDbPool();
    const tableName = testTable || "beacons";

    const result = await db.request().query(`
      SELECT g.gmac, b.dmac, b.rssi
      FROM ${tableName} b
      JOIN gateways g ON b.gateway_id = g.id
      WHERE b.rssi IS NOT NULL
      ORDER BY g.gmac, b.dmac, b.id;
    `);

    const data = result.recordset.map((row) => ({
      gmac: row.gmac,
      dmac: row.dmac,
      rssi: row.rssi,
    }));

    res.json({
      message: `RSSI data per beacon fetched from ${tableName}`,
      data: data,
    });
  } catch (error) {
    console.error("Error get chart data:", error.message);
    res.status(500).json({
      message: "Fetch failed",
      error: error.message,
    });
  }
});

app.get("/", (req, res) => {
  res.json({ message: "Server is running" });
});

async function startServer() {
  try {
    await initializeDatabase(testTableName);
    startMqttClient(saveToDatabase);
    app.listen(port, () => {
      console.log(`HTTP server running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
  }
}

startServer();
