(function(){

  var THREE = require('three'),
      _ = require('lodash');

  var now = require('lumine-now');

  var LayoutGeometry = require('./layout-geometry'),
      LayoutContent = require('./layout-content');

  function Layout(LDoc){

    this._lDoc = LDoc;

    this._layoutGeometry = new LayoutGeometry(LDoc);
    this._layoutContent = new LayoutContent(LDoc);

    this._layoutMaterial = new THREE.MeshBasicMaterial({
      vertexColors: THREE.VertexColors,
      side: THREE.DoubleSide,
      transparent: true
    });

    this._planeMeshes = {};

    this._canvasSize = null;

    this._raycaster = new THREE.Raycaster();

  }

  /**
   * Calculates the initial layout
   * @param canvas - Lumine.Canvas instance
   * @param scene - the scene to add geometry to
   * @param camera - camera, whose position is needed for dispatching events
   */
  Layout.prototype.start = function(canvas, scene, camera){
    var self = this;

    this._canvas = canvas;

    this._layoutGeometry.once('layout', function(layout){

      self._layout = layout;

      self._layoutGeometry.makePlanes(self._layout.boxes);

      _.each(self._layout.boxes, function(box, k){

        var material = self._layoutMaterial.clone();

        self._planeMeshes[k] = new THREE.Mesh(self._layoutGeometry._planes[k], material);

        _.extend(self._planeMeshes[k], { _lumine_region: box.region, _lumine_index: box.index });

        scene.add( self._planeMeshes[k] );

      }.bind(this));

      self._layoutContent.setMaps(self._layout.boxes, self._canvas.density, self._planeMeshes);

      self._layoutGeometry.on('layout', self._updateLayout.bind(self));

    });

    this._layoutGeometry.calculate(this._canvas.size, true);

    if(this._lDoc['module-events']){
      _.each(this._lDoc['module-events'], function(listener, event){

        self._canvas.el.addEventListener(event, function(e){

          e.document = self._lDoc;
          e.layout = self;

          self._raycaster.setFromCamera( new THREE.Vector2(
            2 * (e.clientX / window.innerWidth) - 1,
            1 - 2 * ( e.clientY / window.innerHeight )
          ), camera );

          e.intersects = _.map(self._raycaster.intersectObjects( scene.children ), function(intersection, i){
            return {
              mesh: intersection.object,
              module: self._lDoc.modules[intersection.object._lumine_region][intersection.object._lumine_index],
              key: [intersection.object._lumine_region, intersection.object._lumine_index].join('.'),
              point: intersection.point
            }
          });

          listener.call(self, e);

        });

      });
    }

  };

  Layout.prototype._updateMapsNow = function(canvasDensity){
    this._layoutContent.setMaps(this._layout.boxes, canvasDensity, this._planeMeshes);
  };

  Layout.prototype._updateMaps = _.throttle(Layout.prototype._updateMapsNow, 100);

  /**
   * Updates the layout – used to respond to LayoutGeometry's `layout` event.
   * @param layout
   * @private
   */
  Layout.prototype._updateLayout = function(layout){
    var self = this;

    this._updateMaps(self._canvas.density);

    this._layoutGeometry.updatePlanesLayout(this._layout, layout, function(toLayout){
      this._layout = toLayout;
      this._updateMapsNow(self._canvas.density);
    }.bind(this));

  };

  /**
   * Updates the geometry on render or resize (if an update is needed)
   * @param delta – the number of milliseconds elapsed since the last update
   * @param update - whether to recalculate the layout
   * @param [updateScrollProxy] {function} - the function to call with the latest bottom value
   */
  Layout.prototype.render = function(delta, update, updateScrollProxy){

    if(update){
      // recalculate the layout
      this._layoutGeometry.calculate(this._canvas.size);
    }

    this._layoutGeometry.render(delta, updateScrollProxy);

  };

  module.exports = Layout;

})();