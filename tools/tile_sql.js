var MercatorProjection = require('../gmaps_mercator').MercatorProjection

function data_for_tile(table, x, y, zoom , callback) {
    var opts = this.options;
    var projection = new MercatorProjection();
    var bbox = projection.tileBBox(x, y, zoom);
    var geom_column = 'the_geom';
    var id_column = 'cartodb_id';
    var the_geom;
    var TILE_SIZE = 256;
    var tile_pixel_width = TILE_SIZE;
    var tile_pixel_height = TILE_SIZE;

    console.log('-- ZOOM: ' + zoom);

    var tile_geo_width = bbox[1].lng() - bbox[0].lng();
    var tile_geo_height = bbox[1].lat() - bbox[0].lat();

    var pixel_geo_width = tile_geo_width / tile_pixel_width;
    var pixel_geo_height = tile_geo_height / tile_pixel_height;

    console.log('-- PIXEL_GEO_SIZE: '
      + pixel_geo_width + ' x ' + pixel_geo_height);

    var pixel_geo_maxsize = Math.max(pixel_geo_width, pixel_geo_height);
    console.log('-- MAX_SIZE: ' + pixel_geo_maxsize);

    var tolerance = pixel_geo_maxsize / 2;
    console.log('-- TOLERANCE: ' + tolerance);

    // simplify
    geom_column = 'ST_Simplify("'+geom_column+'", ' + tolerance + ')';

    // TODO: snap to a grid, somewhere ?

    // This is the query bounding box
    var sql_env = "ST_MakeEnvelope("
      + bbox[0].lng() + "," + bbox[0].lat() + ","
      + bbox[1].lng() + "," + bbox[1].lat() + ", 4326)";

    // clip
    var ENABLE_CLIPPING = 1
    if ( ENABLE_CLIPPING ) {
      // we expand the bounding box by a couple of pixels
      geom_column = 'ST_Intersection(' + geom_column
        + ', ST_Expand(' + sql_env + ', ' + pixel_geo_maxsize * 2  + '))';
    }

    var columns = id_column + ',' + geom_column + ' as the_geom';

    // profiling only
    //columns = 'sum(st_npoints(' + geom_column + ')) as the_geom';

    var sql = "select " + columns +" from " + table;
    sql += " WHERE the_geom && " + sql_env;

    callback(sql);
};


if (process.argv.length == 6) {
    args = process.argv.slice(2)
    data_for_tile(args[0], parseInt(args[1]), parseInt(args[2]), parseInt(args[3]), function(sql) {
        console.log(sql);
    });
} else {
    console.log("usage: node " + process.argv[1] + " table x y zoom")
}

