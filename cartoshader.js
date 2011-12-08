
function CartoShader(shader) {
    this.compiled = {};
    this.compile(shader)
}

CartoShader.prototype.compile = function(shader) {
    if(typeof shader === 'string') {
        shader = eval("(function() { return " + shader +"; })()");
    }
    var mapper = {
        'point-color': 'fillStyle',
        'line-color': 'strokeStyle',
        'line-width': 'lineWidth',
        'polygon-fill': 'fillStyle'
    };
    for(var attr in shader) {
        var c = mapper[attr];
        if(c) {
            this.compiled[c] = eval("(function() { return shader[attr]; })();");
        }
    }
}

CartoShader.prototype.apply = function(canvas_ctx, data) {
    var shader = this.compiled;
    for(var attr in shader) {
        var fn = shader[attr];
        if(typeof fn === 'function') {
            fn = fn(data);
        } 
        canvas_ctx[attr] = fn;
    }
};

function assert(cond) {
    if(!cond) console.log('FAIL');
}
function shader_test() {
    var c = new CartoShader({
        'point-color': '#FFF',
        'line-color': function(data) {
            return data.color;
        },
        'line-width': '1',
        'polygon-fill': '#00F'
    });
    assert(typeof c.compiled['fillStyle']  === 'string');
    assert(typeof c.compiled['strokeStyle']  === 'function');
}
