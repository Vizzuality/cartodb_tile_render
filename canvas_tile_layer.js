
function CanvasTileLayer(canvas_setup) {
    this.tileSize = new google.maps.Size(256,256);
    this.maxZoom = 19;
    this.name = "Tile #s";
    this.alt = "Canvas tile layer";
    this.tiles = {};
    this.canvas_setup = canvas_setup;
}


// create a tile with a canvas element
CanvasTileLayer.prototype.create_tile_canvas = function(coord, zoom, ownerDocument) {

    // create canvas and reset style
    var canvas = ownerDocument.createElement('canvas');
    canvas.style.border  = "none";
    canvas.style.margin  = "0";
    canvas.style.padding = "0";

    // prepare canvas and context sizes
    var ctx    = canvas.getContext('2d');
    ctx.width  = canvas.width = this.tileSize.width;
    ctx.height = canvas.height = this.tileSize.height;

    //set unique id
    var tile_id = coord.x + '_' + coord.y + '_' + zoom;
    canvas.setAttribute('id', tile_id);

    if (tile_id in this.tiles)
        delete this.tiles[tile_id];

    this.tiles[tile_id] = {canvas: canvas, ctx: ctx, coord: coord, zoom: zoom};

    // custom setup
    if (this.canvas_setup)
        this.canvas_setup(this.tiles[tile_id], coord, zoom);

    return canvas;
}


CanvasTileLayer.prototype.redraw= function() {
    for(var t in this.tiles) {
        var tile = this.tiles[t];
        this.canvas_setup(tile, tile.coord, tile.zoom);
    }
};
// could be called directly...
CanvasTileLayer.prototype.getTile = function(coord, zoom, ownerDocument) {
    return this.create_tile_canvas(coord, zoom, ownerDocument);
};

CanvasTileLayer.prototype.releaseTile = function(tile) {
    var id = tile.getAttribute('id');
    delete this.tiles[id];
};
