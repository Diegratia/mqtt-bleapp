

function setupRealtimeStream() {
  if (!client) {
    client = startMqttClient((topic, filteredBeacon) => {
      try {
        const { dmac, gmac, calcDist: calcDistStr, time } = filteredBeacon;
        const calc_dist = parseFloat(calcDistStr);
        const timestamp = new Date(time.replace(",", ".") + "Z").getTime();
        const now = Date.now();

        const floorplanIds = Array.from(gmacToFloorplans.get(gmac) || []);
        floorplanIds = gmacToFloorplans['4CA38F691898']; // []
        if (!floorplanIds.length) return;

        let beaconState = lastBeaconState.get(dmac);
        if (!beaconState) {
          beaconState = {
            x: null,
            y: null,
            timestamp: null,
            observationCount: 0,
            positions: [],
          };
          lastBeaconState.set(dmac, beaconState);
        }

        const positions = [];
        for (const floorplanId of floorplanIds) {
        
          if (!realtimeBeaconPairs.has(floorplanId)) {
            realtimeBeaconPairs.set(floorplanId, new Map());
          }
          const floorplanBeacons = realtimeBeaconPairs.get(floorplanId);

          if (!floorplanBeacons.has(dmac)) {
            floorplanBeacons.set(dmac, new Map());
            
          }
          const dmacData = floorplanBeacons.get(dmac);

          let closestTime = null,
            minDiff = Infinity;
          for (let [t] of dmacData) {
            const diff = Math.abs(timestamp - t);
            if (diff < minDiff && diff <= timeTolerance) {
              minDiff = diff;
              closestTime = t;
            }
          }

          if (!closestTime) closestTime = timestamp;
          if (!dmacData.has(closestTime)) dmacData.set(closestTime, {});
          dmacData.get(closestTime)[gmac] = calc_dist;

          const floorplan = floorplans.get(floorplanId);
          if (floorplan) {
            const pos = generateBeaconPositions(
              floorplanId,
              floorplan.gateways,
              floorplan.scale
            );
            positions.push(...pos.map((p) => ({ ...p, floorplanId })));
          }
        }

        beaconState.observationCount++;
        beaconState.positions.push(...positions);

        if (beaconState.observationCount >= observationWindow) {
          const bestFloorplanId = determineBestFloorplan(
            dmac,
            beaconState.positions
          );
          if (
            bestFloorplanId &&
            bestFloorplanId !== beaconState.primaryFloorplanId
          ) {
            beaconState.primaryFloorplanId = bestFloorplanId;
          }
          beaconState.positions = positions.slice(-observationWindow);
        }

        const primaryFloorplanId = beaconState.primaryFloorplanId;
        if (primaryFloorplanId) {
          const floorplan = floorplans.get(primaryFloorplanId);
          if (floorplan) {
            const validPositions = positions.filter(
              (p) => p.floorplanId === primaryFloorplanId && p.point
            );

            const latestPos = validPositions[0];

            if (latestPos) {
              const currentTime = timestamp;
              const last = {
                x: beaconState.x,
                y: beaconState.y,
                timestamp: beaconState.timestamp,
              };

              let isValidSpeed = true;
              if (last.x !== null && last.y !== null) {
                const dx = latestPos.point.x - last.x;
                const dy = latestPos.point.y - last.y;
                // const rawDt = (currentTime - last.timestamp) / 1000;
                // const dt = Math.max(rawDt, 0.1);
                const dt = Math.max((currentTime - last.timestamp) / 1000, 0.1);

                const dist = Math.sqrt(dx * dx + dy * dy) * floorplan.scale;
                const speed = dist / dt;

                if (speed > maxSpeed) {
                  isValidSpeed = false;
                  // console.log(
                  //   `Beacon ${dmac} ${primaryFloorplanId} terlalu cepat: ${speed.toFixed(
                  //     2
                  //   )} m/s`
                  // );
                }
              }

              if (isValidSpeed) {
                beaconState.x = latestPos.point.x;
                beaconState.y = latestPos.point.y;
                beaconState.timestamp = currentTime;

                if (validPositions.length > 0) {
                  client.publish(
                    `tracking/${primaryFloorplanId}`,
                    JSON.stringify(validPositions),
                    { qos: 1 }
                  );
                  // console.log("validPositions", validPositions);
                }

                handleAlarmTrigger(
                  validPositions,
                  primaryFloorplanId,
                  currentTime
                );
                // const alarmPositions = validPositions.filter((p) =>
                //   isInRestrictedArea(p.point, primaryFloorplanId)
                // );
                // if (alarmPositions.length > 0) {
                //   client.publish(
                //     `alarm/${primaryFloorplanId}`,
                //     JSON.stringify(alarmPositions),
                //     { qos: 1 }
                //   );
                // }
              } else {
                return;
              }
            }
          }
        }
      } catch (error) {
        console.error("Error processing beacon:", error, filteredBeacon);
      }
    });
  }

  if (interval) clearInterval(interval);
  interval = setInterval(async () => {
    const now = Date.now();
    for (const [floorplanId, beacons] of realtimeBeaconPairs) {
      const floorplan = floorplans.get(floorplanId);
      if (floorplan) {
        const positions = generateBeaconPositions(
          floorplanId,
          floorplan.gateways,
          floorplan.scale
        );
        const valid = positions.filter((p) => p.point);
        if (valid.length > 0) await saveBeaconPositions(valid);
      }

      for (const [dmac, timestamps] of beacons) {
        for (const [t] of timestamps) {
          if (now - t > timeTolerance) timestamps.delete(t);
        }
        if (timestamps.size === 0) beacons.delete(dmac);
      }
      if (beacons.size === 0) realtimeBeaconPairs.delete(floorplanId);
    }
  }, timeTolerance);

  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(
    () => initializeAllFloorplans().catch(console.error),
    120000
  );
}
