var express = require("express");
var { initializeDatabase, getDbPool } = require("./database");
var { startMqttClient } = require("./mqtt");

var app = express();
var port = 3000;

//save
async function saveToDatabase(data) {
  try {
    var dbPool = getDbPool();
    // gateways
    var [gatewayRows] = await dbPool.query(
      "INSERT IGNORE INTO gateways (gmac) VALUES (?)",
      [data.gmac]
    );
    var gatewayId;
    if (gatewayRows.insertId) {
      gatewayId = gatewayRows.insertId;
    } else {
      var [existingGateway] = await dbPool.query(
        "SELECT id FROM gateways WHERE gmac = ?",
        [data.gmac]
      );
      if (!existingGateway[0]) {
        throw new Error("Gateway not found after insert");
      }
      gatewayId = existingGateway[0].id;
    }

    // beacons
    for (var obj of data.obj) {
      await dbPool.query(
        `INSERT INTO beacons (
          gateway_id, type, dmac, refpower, rssi, vbatt, temp, time
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          gatewayId,
          obj.type,
          obj.dmac,
          obj.refpower || null,
          obj.rssi || null,
          obj.vbatt || null,
          obj.temp || null,
          obj.time,
        ]
      );
    }
    console.log(" simpan dengan gmac:", data.gmac);
  } catch (error) {
    console.error("Error saving to database:", error.message, error.stack);
  }
}

// get
app.get("/beacons-data", async (req, res) => {
  try {
    // get koneksi
    const dbPool = getDbPool();

    // ambil data dari db
    const [rows] = await dbPool.query(`
      SELECT g.gmac, b.dmac, b.type, b.vbatt, b.temp, b.rssi, b.refpower
      FROM beacons b
      JOIN gateways g ON b.gateway_id = g.id
      ORDER BY g.gmac, b.dmac, b.type
    `);

    const result = [];

    //kelompok berdasarkan gmac
    const groupedByGmac = {};

    rows.forEach((row) => {
      const { gmac, dmac, type, vbatt, temp, rssi, refpower } = row;

      // kalau blm ada buat entri baru
      if (!groupedByGmac[gmac]) {
        groupedByGmac[gmac] = {
          gmac: gmac,
          beacons: {},
        };
        result.push(groupedByGmac[gmac]);
      }

      // kalau dmac blm ada buat entri baru
      if (!groupedByGmac[gmac].beacons[dmac]) {
        groupedByGmac[gmac].beacons[dmac] = {
          type1: {},
          type4: {},
        };
      }

      // tampilkan sesuai type
      if (type === 1) {
        groupedByGmac[gmac].beacons[dmac].type1 = { vbatt, temp };
      } else if (type === 4) {
        groupedByGmac[gmac].beacons[dmac].type4 = { rssi, refpower };
      }
    });

    // all

    // kalau dmac blm ada buat entri baru
    //   if (!groupedByGmac[gmac].beacons[dmac]) {
    //     groupedByGmac[gmac].beacons[dmac] = {
    //       type1: [],
    //       type4: [],
    //     };
    //   }

    //   // tampilkan sesuai type
    //   if (type === 1) {
    //     groupedByGmac[gmac].beacons[dmac].type1.push({ vbatt, temp });
    //   } else if (type === 4) {
    //     groupedByGmac[gmac].beacons[dmac].type4.push({ rssi, refpower });
    //   }
    // });

    res.json({
      message: "Data berhasil diambil",
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      message: "Gagal ambil data",
      error: error.message,
    });
  }
});

// app.get("/beacon-data", async (req, res) => {
//   try {
//     var dbPool = getDbPool();
//     var [rows] = await dbPool.query(`
//       SELECT b.*, g.gmac
//       FROM beacons b
//       JOIN gateways g ON b.gateway_id = g.id
//     `);
//     res.json({ message: "Stored beacon data", data: rows });
//   } catch (error) {
//     res
//       .status(500)
//       .json({ message: "Error fetching data", error: error.message });
//   }
// });

app.get("/", (req, res) => {
  res.json({ message: "Server is running" });
});

async function startServer() {
  try {
    await initializeDatabase();
    startMqttClient(saveToDatabase);
    app.listen(port, () => {
      console.log("HTTP server running at http://localhost:" + port);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
  }
}

startServer();
