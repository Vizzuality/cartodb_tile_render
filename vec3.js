function vec3(x, y, z) {
            return new _vec3(x, y, z);
        }
        function _vec3(x, y, z) {
            this.x = x;
            this.y = y;
            this.z = z;
            this.length = function() {
                return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z);
            }
        }
        var add = function(v1, v2) {
            return vec3(v1.x+v2.x, v1.y+v2.y, v1.z+v2.z);
        }
        var sub = function(v1, v2) {
            return vec3(v1.x-v2.x, v1.y-v2.y, v1.z-v2.z);
        }
        var mul = function(s, v1) {
            return vec3(s*v1.x, s*v1.y, s*v1.z);
        }
        var dot = function(v1, v2) {
            return v1.x*v2.x + v1.y*v2.y + v1.z*v2.z;
        }
        var normalize = function(v1) {
            var m = v1.length();
            return vec3(v1.x/m, v1.y/m, v1.z/m);
        }
