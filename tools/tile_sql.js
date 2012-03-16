var MercatorProjection = require('../gmaps_mercator').MercatorProjection

function data_for_tile(table, x, y, zoom , callback) {
    var opts = this.options;
    var projection = new MercatorProjection();
    var bbox = projection.tileBBox(x, y, zoom);
    var geom_column = 'the_geom';
    var the_geom;

    // simplify
    // todo: replace with area/vertices ratio dependent?
    if (zoom >= 17){
      the_geom = geom_column
    } else if (zoom >= 14 ){
      the_geom = 'ST_SimplifyPreserveTopology("'+geom_column+'",0.000001) as the_geom'
    } else if (zoom >= 10){
      the_geom = 'ST_SimplifyPreserveTopology("'+geom_column+'",0.0001) as the_geom'
    } else if (zoom >=6){
      the_geom = 'ST_SimplifyPreserveTopology("'+geom_column+'",0.001) as the_geom'
    } else if (zoom >= 4){
      the_geom = 'ST_SimplifyPreserveTopology("'+geom_column+'",0.01) as the_geom'
    } else {
      the_geom = 'ST_SimplifyPreserveTopology("'+geom_column+'",0.1) as the_geom'
    }

    var columns = "*"
    var sql = "select " + columns +" from " + table + " WHERE the_geom && ST_SetSRID(ST_MakeBox2D(";
    sql += "ST_Point(" + bbox[0].lng() + "," + bbox[0].lat() +"),";
    sql += "ST_Point(" + bbox[1].lng() + "," + bbox[1].lat() +")), 4326)";
    callback(sql);
};


if (process.argv.length == 6) {
    args = process.argv.slice(2)
    data_for_tile(args[0], parseInt(args[1]), parseInt(args[2]), parseInt(args[3]), function(sql) {
        console.log(sql);
    });
} else {
    console.log("usage: node " + process.argv[1] + " table zoom x y")
}

