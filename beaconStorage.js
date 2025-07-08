const { getDbPool } = require("./database");
const { v4: uuidv4 } = require("uuid");
const sql = require("mssql");

async function saveBeaconPositions(positions) {
  if (!positions || positions.length === 0) {
    return;
  }

  try {
    const { db } = getDbPool();

    for (const pos of positions) {
      const request = db.request();

      request.input("id", sql.UniqueIdentifier, uuidv4());
      request.input("beacon_id", sql.VarChar(12), pos.beaconId);
      request.input("floorplan_id", sql.UniqueIdentifier, pos.floorplanId);
      request.input("pos_x", sql.BigInt, pos.point.x);
      request.input("pos_y", sql.BigInt, pos.point.y);
      request.input("is_in_restricted_area", sql.BigInt, pos.inRestrictedArea);
      request.input("first_gateway_id", sql.VarChar(12), pos.first);
      request.input("second_gateway_id", sql.VarChar(12), pos.second);
      request.input("first_distance", sql.Float, pos.firstDist);
      request.input("second_distance", sql.Float, pos.secondDist);
      request.input("timestamp", sql.DateTime, new Date(pos.time));

      await request.query(`
        INSERT INTO beacon_positions (
          id, beacon_id, floorplan_id, pos_x, pos_y, is_in_restricted_area,
          first_gateway_id, second_gateway_id, first_distance, second_distance,
          timestamp, created_at
        ) VALUES (
          @id, @beacon_id, @floorplan_id, @pos_x, @pos_y, @is_in_restricted_area,
          @first_gateway_id, @second_gateway_id, @first_distance, @second_distance,
          @timestamp, GETDATE()
        )
      `);
    }

    // console.log(`Saved ${positions.length} positions to beacon_positions`);
  } catch (error) {
    console.error(`Failed to save positions to database: ${error.message}`);
    throw error;
  }
}

async function saveAlarmTriggers(positions) {
  if (!positions || positions.length === 0) {
    return;
  }

  try {
    const { db } = getDbPool();

    for (const pos of positions) {
      const request = db.request();
      await request
        .input("id", sql.UniqueIdentifier, uuidv4())
        .input("beacon_id", pos.beaconId)
        .input("floorplan_id", pos.floorplanId)
        .input("pos_x", pos.point.x)
        .input("pos_y", pos.point.y)
        .input("is_in_restricted_area", pos.inRestrictedArea)
        .input("first_gateway_id", pos.first)
        .input("second_gateway_id", pos.second)
        .input("first_distance", pos.firstDist)
        .input("second_distance", pos.secondDist)
        .input("trigger_time", new Date(pos.time))
        .input("is_active", sql.Bit, true).query(`
          INSERT INTO alarm_triggers (id, beacon_id, floorplan_id, pos_x, pos_y, is_in_restricted_area, first_gateway_id, second_gateway_id, first_distance, second_distance, trigger_time, is_active)
          VALUES (@id, @beacon_id, @floorplan_id, @pos_x, @pos_y, @is_in_restricted_area, @first_gateway_id, @second_gateway_id, @first_distance, @second_distance, @trigger_time, @is_active)
        `);
    }

    console.log(`Saved ${positions.length} alarm triggers to alarm_triggers`);
  } catch (error) {
    console.error(
      `Failed to save alarm triggers to database: ${error.message}`
    );
    throw error;
  }
}

async function checkActiveAlarm(dmac) {
  try {
    const { db } = getDbPool();
    const result = await db.request().input("beacon_id", sql.VarChar(12), dmac)
      .query(`
        SELECT TOP 1 * FROM alarm_triggers
        WHERE beacon_id = @beacon_id AND is_active = 1
        ORDER BY trigger_time DESC
      `);
    return result.recordset.length > 0 ? result.recordset[0] : null;
  } catch (error) {
    console.error(`Failed to check active alarm for ${dmac}: ${error.message}`);
    throw error;
  }
}

async function deactivateAlarm(dmac) {
  try {
    const { db } = getDbPool();
    const result = await db.request().input("beacon_id", sql.VarChar(12), dmac)
      .query(`
        UPDATE alarm_triggers
        SET is_active = 0
        WHERE beacon_id = @beacon_id AND is_active = 1
      `);
    console.log(`Deactivated alarm for beacon ${dmac}`);
    return result.rowsAffected[0] > 0;
  } catch (error) {
    console.error(`Failed to deactivate alarm for ${dmac}: ${error.message}`);
    throw error;
  }
}

module.exports = {
  saveBeaconPositions,
  saveAlarmTriggers,
  checkActiveAlarm,
  deactivateAlarm,
};
