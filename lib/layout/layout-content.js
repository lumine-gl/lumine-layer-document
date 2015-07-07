(function(){

  var _ = require('lodash'),
      async = require('async'),
      THREE = require('three'),
      Canvas = require('lumine').Canvas;

  var SHADER_MAP = 'tDiffuse';

  function LayoutContent(LDoc, lumine, renderer){

    this._lDoc = LDoc;
    this._lumine = lumine;
    this._renderer = renderer;

    this._canvases = {};

  }

  LayoutContent.prototype.setMaps = function(boxes, density, meshes, cb){

    _.each(boxes, function(box, k){

      if(_.has(this._lDoc.modules[box.region][box.index], 'scene')){

        var sceneOpts = this._lDoc.modules[box.region][box.index].scene;

        meshes[k].material = new THREE.ShaderMaterial({
          uniforms: THREE.UniformsUtils.clone(this._lumine.Shaders.copy.uniforms),
          vertexShader: this._lumine.Shaders.copy.vertexShader,
          fragmentShader: this._lumine.Shaders.copy.fragmentShader,
          transparent: true
        });

        if(!_.has(this._canvases, k)){

          var scene = new this._lumine.Scenes[sceneOpts.type](null, this._lumine, _.extend({canvas: {
            width: Math.floor(box.w * density),
            height: Math.floor(box.h * density),
            renderer: this._renderer
          }}, sceneOpts));

          this._canvases[k] = scene.canvas;

          meshes[k].material.uniforms[SHADER_MAP].value = this._canvases[k].composer.writeBuffer;
          meshes[k].material.needsUpdate = true;

          // TODO: remove this when done debugging
          //this._canvases[k].composer.passes[0].renderToScreen = true;

        }else{

          this._canvases[k].setSize(box.w, box.h, density);
          this._canvases[k].needsResize = true;

        }

      }

    }.bind(this));

  };

  LayoutContent.prototype.render = function(delta){

    _.each(this._canvases, function(canvas, k){

      canvas.render(delta);

    });

  };

  module.exports = LayoutContent;

})();