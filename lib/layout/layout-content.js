(function(){

  var _ = require('lodash'),
      async = require('async'),
      THREE = require('three'),
      Typeform = require('typeform');

  var CONCURRENCY = 8;

  function LayoutContent(LDoc){
    var self = this;

    this._lDoc = LDoc;
    this._queue = [];

    this._tf_ready = false;

    this._tf = new Typeform({
      concurrency: CONCURRENCY,
      log: true
    });

    this._tf.start(function(){

      _.each(self._queue, function(queued){
        return queued();
      });

      self._tf_ready = true;

    });

  }

  LayoutContent.prototype.getMap = function(box, density, cb){
    var self = this,
        args = arguments;

    var content = this._lDoc.modules[box.region][box.index].content,
        css = this._lDoc.modules[box.region][box.index].css;

    if(this._tf_ready){

      this._tf.render(
        content,
        {
          width: box.w,
          height: box.h,
          density: density
        },
        css,
        cb
      );

    }else{
      this._queue.push(function(){
        return self.getMap.apply(self, args);
      });
    }
  };

  LayoutContent.prototype.setMap = function(box, density, geometry, material, cb){

    this.getMap(box, density, function(err, canvas, u, v){

      var imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);

      // imageData.data = new Uint8Array(imageData.data);

      for(var w = 0; w < 8; ++w){
        if((w % 2) === 0){
          // x or u
          if((w / 2) % 2 !== 0){
            geometry.getAttribute('uv').array[w] = u;
          }
        }else{
          // y or v
          if(w > 3){
            geometry.getAttribute('uv').array[w] = 1 - v;
          }
        }
      }

      geometry.getAttribute('uv').needsUpdate = true;

      if(!material.map){
        material.map = new THREE.DataTexture(new Uint8Array(imageData.data), canvas.width, canvas.height, THREE.RGBAFormat);
      }else{
        material.map.image.data = new Uint8Array(imageData.data);
        material.map.image.width = canvas.width;
        material.map.image.height = canvas.height;
      }

      material.map.needsUpdate = true;
      material.needsUpdate = true;

      if(_.isFunction(cb)) cb(null);

    });

  };

  LayoutContent.prototype.setMaps = function(boxes, density, meshes, cb){

    var tasks = [];

    _.each(boxes, function(box, k){

      if(_.has(this._lDoc.modules[box.region][box.index], 'content')){

        meshes[k].material.vertexColors = THREE.NoColors;

        tasks.push(function(done){
          this.setMap(boxes[k], density, meshes[k].geometry, meshes[k].material, done);
        }.bind(this));

      }

    }.bind(this));

    async.parallelLimit(tasks, CONCURRENCY, cb);

  };

  module.exports = LayoutContent;

})();