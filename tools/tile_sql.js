var MercatorProjection = require('../gmaps_mercator').MercatorProjection;
var CartoDB = require('../cartodb_vector').CartoDB;

console.log('x: ' + typeof(CartoDB));

function data_for_tile(table, x, y, z, callback) {
    var opts = this.options;
    var prj = new MercatorProjection();

    var sql = CartoDB.get_tile_data_sql(prj, table, x, y, z);
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

