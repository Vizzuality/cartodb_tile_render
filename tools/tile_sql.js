var MercatorProjection = require('../gmaps_mercator').MercatorProjection;
var CartoDB = require('../cartodb_vector').CartoDB;

function data_for_tile(table, x, y, z, callback) {
    var opts = this.options;
    var prj = new MercatorProjection();

    var sql = CartoDB.get_tile_data_sql(prj, table, x, y, z);
    callback(sql);
};

function parse_range(val) {
  var p = val.split(':');
  return p;
};


if (process.argv.length < 4) {
   console.log("usage: node " + process.argv[1] + " <table> <zoom> [<x>] [<y>]")
} else {

   args = process.argv.slice(2)
   var table = args[0];

   var zoom = parseInt(args[1]);
   var ntiles = 1<<zoom;

   var miny = 0;
   var maxy = ntiles-1;

   var minx = 0;
   var maxx = ntiles-1;

   if ( args.length > 2 ) {
    range = args[2].split(':');
    miny = parseInt(range[0]);
    if ( range.length > 1 ) maxy = parseInt(range[1]);
    else maxy = miny;
   }

   if ( args.length > 3 ) {
    range = args[3].split(':');
    minx = parseInt(range[0]);
    if ( range.length > 1 ) maxx = parseInt(range[1]);
    else maxx = minx;
   }

   var logger = function(sql) {
        console.log(sql + ';');
   };

  console.log("-- Y range = " + miny + ":" + maxy);
  console.log("-- X range =  " + minx + ":" + maxx);

  for (y=miny; y<=maxy; ++y) {
    for (x=minx; x<=maxx; ++x) {
      data_for_tile(table, x, y, zoom, logger);
    }
  }

} 

