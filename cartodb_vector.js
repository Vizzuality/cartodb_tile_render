
var CartoCSS = (function() {

    //micro tmp from thomas fuchs
    function tmpl(s,d){
     for(var p in d) {
       s = s.replace(new RegExp('\\$'+p,'g'), d[p]);
     }
     return s;
    }
    //var props
    /*
    'line-color', 'color'
    'line-width', 'float'
    'polygon-fill', 'float'
    */
    function parse(css) {
        // remove get content inside brakets 
        var parsed = {};
        var content = css.split('{')[1].split('}')[0];
        content = content.replace('\n', '').trim();
        content.split(';').forEach(function(statement) {
            statement = statement.trim();
            if(statement.length > 0) {
                var tk = statement.split(':').map(function(s) { return s.trim(); });
                parsed[tk[0]] = tk[1];
            }
        });
        return parsed;
    }

    function _eval(css, data) {
        var to_eval = parse(css);
        var evaluated = {};
        for(var attr in to_eval) {
            var c = to_eval[attr];
            if(attr.indexOf('$') != -1) {
                //something to eval
                evaluated[attr.slice(1)] = eval(tmpl(c, data));
                delete to_eval[attr];
            }
        }
        for(var attr in to_eval) {
            var c = to_eval[attr];
            c = tmpl(c, data);
            to_eval[attr] = tmpl(c, evaluated);
        }
        return to_eval;
    }

    return {
        test: function() { 
            console.log(
            _eval("{ line-color: #FFFFFF; line-width: rgb(100, 100, 100); test: $myvar; }", { myvar: 2.3 })); 
            var css = "{ $c: ($ele - 870)/(910.0-870.0); point-color: rgb($c, $c, $c); }";
            console.log(_eval(css, {ele: 10}));
        },
        parse: parse,
        apply: _eval
    };

})();

function CartoDB(options) {
    this.options = options;
    this.projection = new MercatorProjection();
    this.options.css = this.options.css || '{ point-color: #000; }';
    this.cache = {};

    if(options.user && options.table) {
        this.base_url = 'http://' + options.user + ".cartodb.com/api/v1/sql";
        this._init_layer();
    } else {
        throw Exception("CartoDB user and table must be specified");
    }
}

CartoDB.prototype.set_css = function(css) {
    this.options.css = css;
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
    $.getJSON(this.base_url  + "?q=" + encodeURIComponent(sql) + "&format=geojson&callback=?",function(data){
        self.cache[sql] = data;
        callback(data);
    });
};

//get data for a tile
CartoDB.prototype.tile_data = function(x, y, zoom , callback) {
    var opts = this.options;
    var projection = new MercatorProjection();
    var bbox = projection.tileBBox(x, y, zoom);
    var columns = ['the_geom'].concat(opts.columns).join(',');
    var sql = "select " + columns +" from " + opts.table + " WHERE the_geom && ST_SetSRID(ST_MakeBox2D(";
    sql += "ST_Point(" + bbox[0].lng() + "," + bbox[0].lat() +"),";
    sql += "ST_Point(" + bbox[1].lng() + "," + bbox[1].lat() +")), 4326)";
    this.sql(sql, callback);
};


// apply style to a primitive changing canvas parameters
CartoDB.prototype.apply_style = function(ctx, data) {
    var css = CartoCSS.apply(this.options.css, data);
    var mapper = {
        'point-color': 'fillStyle',
        'line-color': 'strokeStyle',
        'line-width': 'lineWidth',
        'polygon-fill': 'fillStyle'
    };

    for(var attr in css) {
        var c = mapper[attr];
        if(c) {
            ctx[c] = css[attr];
        }
    }
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
                  var radius = 2;
                  var p = map_latlon(coordinates, zoom);
                  ctx.translate(p.x, p.y);
                  ctx.beginPath();
                  ctx.arc(radius, radius, radius, 0, Math.PI * 2, true);
                  ctx.closePath();
                  ctx.fill();
                  ctx.stroke();
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
    this.layer = new CanvasTileLayer(function(tile_info, coord, zoom) {
          var ctx = tile_info.ctx;
          //ctx.clearRect(0, 0, 256, 256);
          tile_info.canvas.width = tile_info.canvas.width ;
          self.tile_data(coord.x, coord.y, zoom, function(data) {
            var tile_point = self.projection.tilePoint(coord.x, coord.y, zoom);
            if(data.features.length) {
                  var primitives = data.features;
                  for(var i = 0; i < primitives.length; ++i) {
                      var renderer = primitive_render[primitives[i].geometry.type];
                      if(renderer) {
                          self.apply_style(ctx, primitives[i].properties);
                          ctx.save();
                          renderer(ctx, coord.x, coord.y, zoom, primitives[i].geometry.coordinates);
                          ctx.restore();
                      } else {
                        console.log("no renderer for ", primitives[i].geometry.type);
                      }
                   }
            }
          });

    });
};
