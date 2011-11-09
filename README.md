
cartodb vector render on canvas with css support
================================================

this code tries to show how to render vector tiles on HTML5 canvas over google maps with some css. The style is applied on client side so you don't need mapnik on the server side.

take it as a prototype: there is no error checking, no performance/memory optimization... you know, enjoy.

This demo uses cartodb as tile server

** demo **

http://javisantana.github.com/cartodb_tile_render/example.html


** quickstart **

        map = new google.maps.Map(document.getElementById('map_canvas'),
                mapOptions);

        var cartodb = new CartoDB({
                user: 'jatorre',
                table: 'ny_districts',
                columns: ['num_stops_normalized'],
                css: "{ $c: Math.min(255, 255*$num_stops_normalized/10.0).toFixed(0); polygon-fill: rgb($c, $c, $c); line-color: #F0F; }"
        });

        map.overlayMapTypes.insertAt(0, cartodb.layer);


