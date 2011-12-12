
function CartoDB(options) {
    this.options = options;
    this.projection = new MercatorProjection();
    this.shader = new CartoShader(this.options.shader || '{ point-color: "#000" }');
    this.cache = {};

    if(options.user && options.table) {
        this.base_url = 'http://' + options.user + ".cartodb.com/api/v2/sql";
        this._init_layer();
    } else {
        throw Exception("CartoDB user and table must be specified");
    }
}

CartoDB.prototype.set_css = function(css) {
    this.shader = new CartoShader(css);
    this.layer.redraw();
}
// executes sql on the cartodb server
CartoDB.prototype.sql = function(sql, callback) {
    var self = this;
    if(this.options.debug) {
        console.log(sql);
    }
    data = this.cache[sql];
    if(data) {
        console.log("CACHED");
        callback(data);
        return;
    }
    $.getJSON(this.base_url  + "?q=" + encodeURIComponent(sql) + "&format=geojson&dp=6",function(data){
        self.cache[sql] = data;
        callback(data);
    });
};
function test() {
    console.log("EYY");
}

//get data for a tile
CartoDB.prototype.tile_data = function(x, y, zoom , callback) {
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

    var columns = [the_geom].concat(opts.columns).join(',');
    var sql = "select " + columns +" from " + opts.table + " WHERE the_geom && ST_SetSRID(ST_MakeBox2D(";
    sql += "ST_Point(" + bbox[0].lng() + "," + bbox[0].lat() +"),";
    sql += "ST_Point(" + bbox[1].lng() + "," + bbox[1].lat() +")), 4326)";
    this.sql(sql, callback);
};


// apply style to a primitive changing canvas parameters
CartoDB.prototype.apply_style = function(ctx, data) {
    this.shader.apply(ctx, data);
};

// init google maps layer
CartoDB.prototype._init_layer = function() {
    var self = this;
    function map_latlon(latlng, x, y, zoom) {
        latlng = new google.maps.LatLng(latlng[1], latlng[0]);
        return self.projection.latLngToTilePoint(latlng, x, y, zoom);
    }
    var primitive_render = {
        'Point': function(ctx, x, y, zoom, coordinates) {
                  ctx.save();
                  var radius = 2;
                  var p = map_latlon(coordinates, zoom);
                  ctx.translate(p.x, p.y);
                  ctx.beginPath();
                  ctx.arc(radius, radius, radius, 0, Math.PI * 2, true);
                  ctx.closePath();
                  ctx.fill();
                  ctx.stroke();
                  ctx.restore();
        },
        'MultiPoint': function(ctx, x, y,zoom, coordinates) {
              var prender = primitive_render['Point'];
              for(var i=0; i < coordinates.length; ++i) {
                  prender(ctx, zoom, coordinates[i]);
              }
        },
        'Polygon': function(ctx, x, y, zoom, coordinates) {
              ctx.beginPath();
              var p = map_latlon(coordinates[0][0], x, y, zoom);
              ctx.moveTo(p.x, p.y);
              for(var i=0; i < coordinates[0].length; ++i) {
                p = map_latlon(coordinates[0][i], x, y, zoom);
                ctx.lineTo(p.x, p.y);
             }
             ctx.closePath();
             ctx.fill();
             ctx.stroke();
        },
        'MultiPolygon': function(ctx, x, y, zoom, coordinates) {
              var prender = primitive_render['Polygon'];
              for(var i=0; i < coordinates.length; ++i) {
                  prender(ctx, x, y, zoom, coordinates[i]);
              }
        }
    };

    // Method builds a top layer hitgrid. faster, but not as good as a per geometry hitgrid commented below
    // polygon only
    this.layer = new CanvasTileLayer(function(tile_info, coord, zoom) {
          var ctx = tile_info.ctx;
          var hit_ctx = tile_info.hit_ctx;
          hit_ctx.strokeStyle = 'rgb(255,255,255)';
//          hit_ctx.fillStyle ="rgb(255,255,255)";
          hit_ctx.lineWidth = 2;
//          hit_ctx.fillRect(0,0,tile_info.width, tile_info.height);

          self.tile_data(coord.x, coord.y, zoom, function(data) {
            var tile_point = self.projection.tilePoint(coord.x, coord.y, zoom);
            var primitives = tile_info.primitives = data.features;
            // clear canvas
            ctx.canvas.width = ctx.canvas.width;
            if(primitives.length) {
                  for(var i = 0; i < primitives.length; ++i) {

                      // get layer geometry
                      var renderer = primitive_render[primitives[i].geometry.type];

                      // render 2 tiles. doesn't handle lines
                      if(renderer) {
                          // render visible tile
                          self.apply_style(ctx, primitives[i].properties);
                          renderer(ctx, coord.x, coord.y, zoom, primitives[i].geometry.coordinates);

                          // render hit tile using index of primitive
                          hit_ctx.fillStyle = 'rgb(' + Int2RGB(i).join(',') + ')';

                          renderer(hit_ctx, coord.x, coord.y, zoom, primitives[i].geometry.coordinates);
                      } else {
                        console.log("no renderer for ", primitives[i].geometry.type);
                      }
                   }
            }
          });

    });
};


// conversion from RGB => integer and back
// note, we have another channel to play with...
RGB2Int = function(r,g,b){
    return r+(256*g)+(256*256*b);
};

Int2RGB = function(input){
    var r = input % 256;
    var g = parseInt(input / 256) % 256;
    var b = parseInt(input / 256 / 256) % 256;
    return [r,g,b];
};





//// TO BUILD A PER FEATURE HITGRID (Will work with overlaps). PRETTY SLOW
//    this.layer = new CanvasTileLayer(function(tile_info, coord, zoom) {
//        var ctx = tile_info.ctx;
//
//        // draw each primitive onto its own blank canvas to allow us to build up a hitgrid
//        // Fast in chrome, slow in safari
//        var layer_canvas  = document.createElement('canvas');
//        layer_canvas.width  = ctx.width;
//        layer_canvas.height = ctx.height;
//        var layer_ctx = layer_canvas.getContext('2d');
//
//        tile_info.canvas.width = tile_info.canvas.width ;
//        self.tile_data(coord.x, coord.y, zoom, function(data) {
//            var tile_point = self.projection.tilePoint(coord.x, coord.y, zoom);
//            var primitives = data.features;
//            if(primitives.length) {
//                for(var i = 0; i < primitives.length; ++i) {
//
//                    // reset primitive layer context
//                    layer_ctx.clearRect(0,0,layer_canvas.width,layer_canvas.height);
//
//                    // get layer geometry
//                    var renderer = primitive_render[primitives[i].geometry.type];
//
//                    // render layer, calculate hitgrid and composite onto main ctx
//                    if(renderer) {
//                        self.apply_style(layer_ctx, primitives[i].properties);
//                        renderer(layer_ctx, coord.x, coord.y, zoom, primitives[i].geometry.coordinates);
//
//                        // here is where we would calculate hit grid
//                        // TODO: Implement hit grid :D
//
//                        // composite layer context onto main context
//                        ctx.drawImage(layer_canvas,0,0);
//                    } else {
//                        console.log("no renderer for ", primitives[i].geometry.type);
//                    }
//                }
//            }
//        });
//
//    });
