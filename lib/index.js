(function(){

  var _ = require('lodash'),
      THREE = require('three');

  var RenderPass = require('lumine').Passes.RenderPass;

  var ScrollProxy = require('./scroll-proxy'),
      Layout = require('./layout');

  module.exports = function(Scene, canvas, layer){

    // Scene

    var scene = new THREE.Scene();

    // Camera

    var camera = new THREE.OrthographicCamera(0, canvas.size.width, canvas.size.height, 0, 0, 9999 * 2);
    camera.aspect = canvas.size.width / canvas.size.height;
    camera.updateProjectionMatrix();

    camera.position.z = 9999;
    camera.lookAt(new THREE.Vector3(0, 0, 0));

    // Layout

    var scrollProxy = new ScrollProxy();

    var layout = new Layout(layer.document),
        sizeNeedsUpdate = false,
        scrollNeedsUpdate = false;

    layout._layoutGeometry.on('layout', function(layout){
      scrollProxy.update(layout.bottom);
    });

    layout.start(canvas, scene, camera);

    // Listeners

    scrollProxy.on('scroll', function(y, x){
      scrollNeedsUpdate = true;
    });

    canvas.on('resize', function(){
      sizeNeedsUpdate = true;
    });

    canvas.on('render', function(delta){

      if(sizeNeedsUpdate){

        camera.right = canvas.size.width;
        camera.top = canvas.size.height;

        camera.aspect = canvas.size.width / canvas.size.height;
        camera.updateProjectionMatrix();

        layout.render(delta, true, scrollProxy.update);

        sizeNeedsUpdate = false;

      }else{

        layout.render(delta, false, scrollProxy.update);

      }

      if(scrollNeedsUpdate){

        camera.position.y = -scrollProxy.y;
        camera.position.x = scrollProxy.x;

        scrollNeedsUpdate = false;

      }

    });

    return new RenderPass(scene, camera, undefined, new THREE.Color(0xffffff), 1);

  };

})();