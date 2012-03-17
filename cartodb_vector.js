
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

CartoDB.get_tile_data_sql = function(projection, table, x, y, zoom) {
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
    var ENABLE_CLIPPING = 0
    if ( ENABLE_CLIPPING ) {
      // we expand the bounding box by a couple of pixels
      geom_column = 'ST_Intersection(' + geom_column
        + ', ST_Expand(' + sql_env + ', ' + pixel_geo_maxsize * 2  + '))';
    }

    var columns = id_column + ',' + geom_column + ' as the_geom';

    // profiling only
    var COUNT_ONLY = 0
    if ( COUNT_ONLY ) {
      columns = 'sum(st_npoints(' + geom_column + ')) as the_geom';
    }

    var sql = "select " + columns +" from " + table;
    sql += " WHERE the_geom && " + sql_env;

    console.log('-- SQL: ' + sql);

    return sql;
};

CartoDB.prototype.tile_data = function(x, y, zoom , callback) {
    var opts = this.options;
    var table = opts.table;
    var prj = this.projection;
    var sql = CartoDB.get_tile_data_sql(prj, table, x, y, zoom);
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
              if ( ! coordinates[0] || ! coordinates[0][0] ) return;
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
              if ( coordinates[0] ) {
                for(var i=0; i < coordinates[0].length; ++i) {
                  coords.push(map_latlon(coordinates[0][i], x, y, zoom));
                }
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

          self.tile_data(coord.x, coord.y, zoom, function(data) {
            var primitives = tile_info.primitives = data.features;
            for(var i = 0; i < primitives.length; ++i) {
                var p = primitives[i];
                if(p.geometry.projected === undefined) {
                    p.geometry.projected = self.convert_geometry(p.geometry, zoom, coord.x, coord.y);
                }
            }
            r.render(ctx, primitives, coord, zoom, self.shader);
            r.render(hit_ctx, primitives, coord, zoom, self.hit_shader);
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

if (typeof module !== 'undefined') {
   module.exports.CartoDB = CartoDB;
}
