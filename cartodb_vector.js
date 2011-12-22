
function CartoDB(options) {
    this.options = options;
    this.projection = new MercatorProjection();
    this.shader = new CartoShader(this.options.shader || '{ point-color: "#000" }');
    this.cache = {};
    // shader used to render the hit grid
    this.hit_shader = new CartoShader({
          'line-color': '#FFF',
          'line-width': 2,
          'polygon-fill': function(data, render_context) {
              return 'rgb(' + Int2RGB(render_context.id).join(',') + ')';
          }
      });

    if(options.user && options.table) {
        //this.base_url = 'http://' + options.user + ".cartodb.com/api/v2/sql";
        this.base_url = 'http://vizzuality.cartodb.com/api/v2/sql';
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
    $.getJSON(this.base_url  + "?q=" + encodeURIComponent(sql) ,function(data){
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
    if(this.options.where) {
        sql  += " AND " + this.options.where;
    }
    this.sql(sql, callback);
};

CartoDB.prototype.tile_data_raster = function(x, y, zoom , callback) {
    var opts = this.options;
    var projection = new MercatorProjection();
    var bbox = projection.tileBBox(x, y, zoom);

    var box_sql = "ST_SetSRID(ST_MakeBox2D(";
    box_sql += "ST_Point(" + bbox[0].lng() + "," + bbox[0].lat() +"),";
    box_sql += "ST_Point(" + bbox[1].lng() + "," + bbox[1].lat() +")), 4326)";

    var tb = TileLatLonBounds(0, 0, zoom, true);
    var bounds = [bbox[0].lat(), bbox[0].lng(), bbox[1].lng(), bbox[1].lat(), 100, 100];
    var table = 'carbon_1gp';
    //return [ minLat, minLon, maxLat, maxLon ];
    var sql = "SELECT ST_SummaryStats(rast) as stats, encode(ST_AsPNG(ST_Rescale(rast, "+tb[4]+", "+tb[5]+")) , 'base64') as png FROM (WITH foo AS ( SELECT ST_AsRaster("+box_sql+", rast ) AS rast FROM "+table+" LIMIT 1) " +
				  "SELECT "+
       			  "ST_Union(ST_MapAlgebraExpr(m.rast, f.rast, 'rast1', '16BUI')) as rast " +
				  "FROM "+table+" m JOIN foo f ON ST_Intersects(m.rast, f.rast)) bar;";
    console.log(sql);

    this.sql(sql, callback);
};


function Renderer() {
    var self = this;
    var primitive_render = this.primitive_render = {
        'Point': function(ctx, coordinates) {
                  ctx.save();
                  var radius = 2;
                  var p = coordinates;
                  ctx.translate(p.x, p.y);
                  ctx.beginPath();
                  ctx.arc(radius, radius, radius, 0, Math.PI * 2, true);
                  ctx.closePath();
                  ctx.fill();
                  ctx.stroke();
                  ctx.restore();
        },
        'MultiPoint': function(ctx, coordinates) {
              var prender = primitive_render['Point'];
              for(var i=0; i < coordinates.length; ++i) {
                  prender(ctx, zoom, coordinates[i]);
              }
        },
        'Polygon': function(ctx, coordinates) {
              ctx.beginPath();
              var p = coordinates[0][0];
              ctx.moveTo(p.x, p.y);
              for(var i=0; i < coordinates[0].length; ++i) {
                p = coordinates[0][i];
                ctx.lineTo(p.x, p.y);
             }
             ctx.closePath();
             ctx.fill();
             ctx.stroke();
        },
        'MultiPolygon': function(ctx, coordinates) {
              var prender = primitive_render['Polygon'];
              for(var i=0; i < coordinates.length; ++i) {
                  prender(ctx, coordinates[i]);
              }
        }
    };
}

Renderer.prototype.render = function(ctx, primitives, coord, zoom, shader) {
  var primitive_render = this.primitive_render;
  ctx.canvas.width = ctx.canvas.width;
  if(primitives.length) {
      for(var i = 0; i < primitives.length; ++i) {
          var renderer = primitive_render[primitives[i].geometry.type];
          if(renderer) {
              // render visible tile
              var render_context = {
                  zoom: zoom,
                  id: i
              };
              shader.apply(ctx, primitives[i].properties, render_context);
              renderer(ctx, primitives[i].geometry.projected);
          }
      }
  }
};

CartoDB.prototype.convert_geometry = function(geometry, zoom, x, y) {
    var self = this;
    function map_latlon(latlng, x, y, zoom) {
        latlng = new google.maps.LatLng(latlng[1], latlng[0]);
        return self.projection.latLngToTilePoint(latlng, x, y, zoom);
    }
    var primitive_conversion = this.primitive_conversion = {
        'Point': function(x, y, zoom, coordinates) {
            return map_latlon(coordinates, x, y, zoom);
        },
        'MultiPoint': function(x, y,zoom, coordinates) {
              var converted = [];
              var pc = primitive_conversion['Point'];
              for(var i=0; i < coordinates.length; ++i) {
                  converted.push(pc(x, y, zoom, coordinates[i]));
              }
              return converted;
        },
        //do not manage inner polygons!
        'Polygon': function(x, y, zoom, coordinates) {
              var coords = [];
              for(var i=0; i < coordinates[0].length; ++i) {
                coords.push(map_latlon(coordinates[0][i], x, y, zoom));
             }
             return [coords];
        },
        'MultiPolygon': function(x, y, zoom, coordinates) {
              var polys = [];
              var pc = primitive_conversion['Polygon'];
              for(var i=0; i < coordinates.length; ++i) {
                  polys.push(pc(x, y, zoom, coordinates[i]));
              }
              return polys;
        }
    };
    var conversor = this.primitive_conversion[geometry.type];
    if(conversor) {
        return conversor(x, y , zoom, geometry.coordinates);
    }

};

// init google maps layer
CartoDB.prototype._init_layer = function() {
    var self = this;

    var r = new Renderer();
    r.projection = self.projection;

    

    this.layer = new CanvasTileLayer(function(tile_info, coord, zoom) {

          var ctx = tile_info.ctx;
          var hit_ctx = tile_info.hit_ctx;

          self.tile_data_raster(coord.x, coord.y, zoom, function(data) {
              var img = new Image();
              img.src = "data:image/png;base64," + data.rows[0].png; 
              img.onload= function() {
                ctx.drawImage(img, 0, 0);
                var pixels = ctx.getImageData(0, 0, ctx.width, ctx.height);
                var sh = self.shader.compiled['pixel-shader'];
                var h = ctx.height;
                var w = ctx.width;
                for(var i =0 ; i < w; ++i) {
                    for(var j =0 ; j < h; ++j) {
                        var idx = 4*(j*w + i);
                        var c = [
                            pixels.data[idx + 0],
                            pixels.data[idx + 1],
                            pixels.data[idx + 2],
                            pixels.data[idx + 3]
                        ];
                        //normal
                        //var v1 = vec3(i, j, c[0]);
                        //var v2 = vec3(i+1, j, pixels.data[idx + 4]);
                        //var n = sub(v1, v2);
                        n = vec(0, 0, 1);
                        c = sh(i, j, c, n);
                        pixels.data[idx + 0] = c[0]
                        pixels.data[idx + 1] = c[1]
                        pixels.data[idx + 2] = c[2]
                        pixels.data[idx + 3] = c[3];
                    }
                }
                ctx.putImageData(pixels, 0, 0);
              }

              /*
            var primitives = tile_info.primitives = data.features;
            for(var i = 0; i < primitives.length; ++i) {
                var p = primitives[i];
                if(p.geometry.projected === undefined) {
                    p.geometry.projected = self.convert_geometry(p.geometry, zoom, coord.x, coord.y);
                }
            }
            r.render(ctx, primitives, coord, zoom, self.shader);
            r.render(hit_ctx, primitives, coord, zoom, self.hit_shader);
            */
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



