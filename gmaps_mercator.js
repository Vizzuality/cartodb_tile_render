
  var TILE_SIZE = 256;

  function bound(value, opt_min, opt_max) {
    if (opt_min != null) value = Math.max(value, opt_min);
    if (opt_max != null) value = Math.min(value, opt_max);
    return value;
  }

  function degreesToRadians(deg) {
    return deg * (Math.PI / 180);
  }

  function radiansToDegrees(rad) {
    return rad / (Math.PI / 180);
  }

  function MercatorProjection() {
    this.pixelOrigin_ = new google.maps.Point(TILE_SIZE / 2,
        TILE_SIZE / 2);
    this.pixelsPerLonDegree_ = TILE_SIZE / 360;
    this.pixelsPerLonRadian_ = TILE_SIZE / (2 * Math.PI);
  }

var tileSize = 256;
var originShift = 2.0 * Math.PI * 6378137.0 / 2.0;
var initialResolution = 2.0 * Math.PI * 6378137.0 / tileSize;
  
    var Resolution = function( zoom ) {
        //"Resolution (meters/pixel) for given zoom level (measured at Equator)"
        //return (2 * Math.PI * 6378137) / (256 * Math.pow(2,zoom));
        return initialResolution / (Math.pow(2,zoom));
    }

    var PixelsToMeters = function(px, py, zoom) {
        //"Converts pixel coordinates in given zoom level of pyramid to EPSG:900913"
        var res = Resolution( zoom );
        var mx = px * res - originShift;
        var my = py * res - originShift;
        return [mx, my];
    }
    var LatLonToMeters = function(lat, lon ){
        var mx = lon * originShift / 180.0;
        var my = Math.log( Math.tan((90 + lat) * Math.PI / 360.0 )) / (Math.PI / 180.0);
        my = my * originShift / 180.0;
        return [mx, my];
    }
    var MetersToLatLon = function(mx, my ) {
        var lon = (mx / originShift) * 180.0;
        var lat = (my / originShift) * 180.0;
        lat = 180 / Math.PI * (2 * Math.atan( Math.exp( lat * Math.PI / 180.0)) - Math.PI / 2.0);
        return [lon, lat];
    }
    var TileBounds = function(tx, ty, zoom) {
        //"Returns bounds of the given tile in EPSG:900913 coordinates"
        var mins = PixelsToMeters( tx*tileSize, ty*tileSize, zoom );
        var maxs = PixelsToMeters( (tx+1)*tileSize, (ty+1)*tileSize, zoom );
        var minx = mins[0];
        var miny = -1*maxs[1];
        var maxx = maxs[0];
        var maxy = -1*mins[1];
        return [ minx, miny, maxx, maxy ];
    }
var TileLatLonBounds = function( tx, ty, zoom, gp) {
    //"Returns bounds of the given tile in latutude/longitude using WGS84 datum"

    var bounds = TileBounds( tx, ty, zoom);
    if (gp) {
        //return [ bounds[1], bounds[0], bounds[3], bounds[2], (bounds[3]-bounds[1])/256, (bounds[2]-bounds[0])/256];
        var xs = (bounds[3]-bounds[1])/tileSize;
        var ys = (bounds[2]-bounds[0])/tileSize;
        //return [ bounds[1] - (ys/2), bounds[0] - (xs/2), bounds[3] + (ys/2), bounds[2] + (xs/2), xs, ys];
        return [ bounds[1], bounds[0], bounds[3], bounds[2], xs, ys];
    } else {
        var mins = MetersToLatLon(bounds[0], bounds[1]);
        var minLat = mins[1];
        var minLon = mins[0];
        var maxs = MetersToLatLon(bounds[2], bounds[3]);
        var maxLat = maxs[1];
        var maxLon = maxs[0];
        return [ minLat, minLon, maxLat, maxLon ];
    }
}
    

  MercatorProjection.prototype.fromLatLngToPoint = function(latLng,
      opt_point) {
    var me = this;
    var point = opt_point || new google.maps.Point(0, 0);
    var origin = me.pixelOrigin_;

    point.x = origin.x + latLng.lng() * me.pixelsPerLonDegree_;

    // NOTE(appleton): Truncating to 0.9999 effectively limits latitude to
    // 89.189.  This is about a third of a tile past the edge of the world
    // tile.
    var siny = bound(Math.sin(degreesToRadians(latLng.lat())), -0.9999,
        0.9999);
    point.y = origin.y + 0.5 * Math.log((1 + siny) / (1 - siny)) *
        -me.pixelsPerLonRadian_;
    return point;
  };

  MercatorProjection.prototype.fromPointToLatLng = function(point) {
    var me = this;
    var origin = me.pixelOrigin_;
    var lng = (point.x - origin.x) / me.pixelsPerLonDegree_;
    var latRadians = (point.y - origin.y) / -me.pixelsPerLonRadian_;
    var lat = radiansToDegrees(2 * Math.atan(Math.exp(latRadians)) -
        Math.PI / 2);
    return new google.maps.LatLng(lat, lng);
  };

  MercatorProjection.prototype.tileBBox = function(x, y, zoom) {
    var numTiles = 1 << zoom;
    var inc = TILE_SIZE/numTiles;
    var px = x*TILE_SIZE/numTiles;
    var py = y*TILE_SIZE/numTiles;
    return [
        this.fromPointToLatLng(new google.maps.Point(px, py + inc)),
        this.fromPointToLatLng(new google.maps.Point(px + inc, py))
    ];
  };

  MercatorProjection.prototype.tilePoint = function(x, y, zoom) {
        var numTiles = 1 << zoom;
        var px = x*TILE_SIZE;
        var py = y*TILE_SIZE;
        return [px, py];
  }

  MercatorProjection.prototype.latLngToTilePoint = function(latLng, x, y, zoom) {
        var numTiles = 1 << zoom;
        var projection = this;
        var worldCoordinate = projection.fromLatLngToPoint(latLng);
        var pixelCoordinate = new google.maps.Point(
                worldCoordinate.x * numTiles,
                worldCoordinate.y * numTiles);
        var tp = this.tilePoint(x, y, zoom);
        return new google.maps.Point(
                Math.floor(pixelCoordinate.x - tp[0]),
                Math.floor(pixelCoordinate.y - tp[1]));
  }

  MercatorProjection.prototype.latLngToTile = function(latLng, zoom) {
        var numTiles = 1 << zoom;
        var projection = this;
        var worldCoordinate = projection.fromLatLngToPoint(latLng);
        var pixelCoordinate = new google.maps.Point(
                worldCoordinate.x * numTiles,
                worldCoordinate.y * numTiles);
        return new google.maps.Point(
                Math.floor(pixelCoordinate.x / TILE_SIZE),
                Math.floor(pixelCoordinate.y / TILE_SIZE));
  }
