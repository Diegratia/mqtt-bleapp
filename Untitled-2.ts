var nearDoorRules = 1.1; // meter
function checkNearDoors(
  point,
  doorfromfloorplans = [],
 scale = 0,
) {
  // doorfromfloorplan => {
  //   "floorplan_id": "floorplan_id",
  //   "door_id": "door_id",
  //   "x": "x",
  //   "y": "y",
  //   "door_name": "door_name"
  // }
  var listroutesdoor = [];
  for(var x in doorfromfloorplans){
    var item = doorfromfloorplans[x];
    const pointA = { x: item.x, y: item.y }; // pintu
    const pointB = { x: point.x, y: point.y }; // current beacon

    const distance = Math.sqrt(
      Math.pow(pointB.x - pointA.x, 2) +
      Math.pow(pointB.y - pointA.y, 2)
    );

    console.log("Jarak:", distance.toFixed(2), "px");
    console.log("Jarak:", distance * scale, "meter");
    if(nearDoorRules > (distance * scale)){
     // dia diluar jarak pintu 
    }else{
      listroutesdoor.push({
        "floorplan_id": item.floorplan_id,
        "door_id": item.door_id,
        "x": item.x,
        "y": item.y,
        "distance": (distance * scale)
      });
      
    }

  }

  return listroutesdoor;
  
}
// floor plan terbaru/pindah
var maskingsfloorplanx = [
  {"masking_id": "maskvajsdjah", doors : [{"door_id":"abcdefg"},{"door_id":"2345678"}] }
]; 

var d = checkNearDoors(point, doorfromfloorplans);
if(d.length > 0){
  for(var x in maskingsfloorplanx.doors){
    var item = maskingsfloorplanx.doors[x];
    if(d.indexOf(item.door_id) > -1){
      // beacon melewati atau berada di pintu pada masking area X
      // push ke frontend 
    }else{

    }
  }
  // beacon berada di dekat pintu 

  
}

