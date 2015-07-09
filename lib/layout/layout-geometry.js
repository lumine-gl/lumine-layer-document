(function(){

  var THREE = require('three'),
      _ = require('lodash'),
      oo = require('object.observe'),
      observed = require('observed'),
      EE = require('events').EventEmitter,
      inherits = require('util').inherits;

  var CalculateLayoutWorker = require('./calculate-layout.worker.js'),
      pruneLDoc = require('./prune-ldoc');

  var Tween = require('lumine-tween'),
      now = require("lumine-now");

  var Z_INDEX = 0,
      LPROP = {
        box:        '_lumine_box',
        oCorners:   '_lumine_corners_from_origin',
        tCorners:   '_lumine_corners_translation',
        quaternion: '_lumine_transform_quaternion',
        translate:  '_lumine_transform_translate',
        scale:      '_lumine_transform_scale'
      },
      LTWEEN = {
        corners:    '_lumine_corners_tween',
        quaternion: '_lumine_transform_quaternion_tween',
        translate:  '_lumine_transform_translate_tween',
        scale:      '_lumine_transform_scale_tween'
      };

  function LayoutGeometry(LDoc){

    this.layoutWorker = new CalculateLayoutWorker();

    this._lDoc = LDoc;
    this._lDocEmitter = observed(this._lDoc);

    this.layoutWorker.postMessage({
      document: pruneLDoc(this._lDoc) // remember: this is cloned and won't stay up-to-date
    });

    this._lDocEmitter.on('change', function(change){
      this._hasDocument = false;
      this.layoutWorker.postMessage({
        change: _.pick(change, ['path', 'value'])
      });
    }.bind(this));

    this.layoutWorker.onmessage = this._calculate.bind(this);

    this.waiting = false;

    this._canvasSize = null;

    this._hasDocument = false;

    _.each(LTWEEN, function(tween){
      this[tween] = new Tween({
        duration: 200
      });
    }.bind(this));

    EE.call(this);

  }

  inherits(LayoutGeometry, EE);

  /**
   * Returns a collection of planes anew from boxes.
   * @param boxes
   */
  LayoutGeometry.prototype.makePlanes = function(boxes){
    var self = this;

    this._planes = {};

    _.each(boxes, function(box, k){

      if(!this._planes[k]) this._planes[k] = new THREE.PlaneBufferGeometry();

      this._planes[k][LPROP.oCorners] = [];
      this._planes[k][LPROP.tCorners] = new THREE.Vector3();

      // for quaternion, use `Quaternion.slerp` for interpolation
      this._planes[k][LPROP.quaternion] = new THREE.Quaternion();

      // for translation and scale, use `Vector3.lerp` or `.lerpVectors` for interpolation
      this._planes[k][LPROP.translate]  = new THREE.Vector3(0, 0, 0);
      this._planes[k][LPROP.scale]      = new THREE.Vector3(1, 1, 1);

      var c = new THREE.Color(self._lDoc.modules[box.region][box.index].fill);

      this._planes[k].addAttribute('color', new THREE.BufferAttribute( new Float32Array(4 * 3), 3 ));

      for(var j = 0; j < 4; ++j){

        this._planes[k].getAttribute('color').array[j * 3    ] = c.r;
        this._planes[k].getAttribute('color').array[j * 3 + 1] = c.g;
        this._planes[k].getAttribute('color').array[j * 3 + 2] = c.b;

      }

      this._planes[k].getAttribute('color').needsUpdate = true;

    }.bind(this));

    this.updatePlanes(boxes);

  };

  /**
   * Updates a plane's position buffers based on `_lumine_corners` and potentially other factors in the future.
   * @param plane
   * @private
   */
  LayoutGeometry.prototype._updatePlane = function(plane){

    var t = plane[LPROP.translate].clone().add(plane[LPROP.tCorners]),
        m = new THREE.Matrix4().compose(t, plane[LPROP.quaternion], plane[LPROP.scale]);

    var transformedCoords = m.applyToVector3Array(_.clone(plane[LPROP.oCorners]));

    _.each(transformedCoords, function(coord, i){
      plane.getAttribute('position').array[i] = coord;
    });

    plane.getAttribute('position').needsUpdate = true;
    plane.computeBoundingSphere();

  };

  /**
   * Updates the positions of planes' vertices directly from boxes.
   * @param boxes
   */
  LayoutGeometry.prototype.updatePlanes = function(boxes){
    var self = this;

    _.each(boxes, function(box, k){

      this._planes[k][LPROP.box] = box;

      for(var j = 0; j < 4; ++j){

        this._planes[k][LPROP.oCorners][j * 3    ] = ((j % 2 === 0) ? box.w/-2 : box.w/2);
        this._planes[k][LPROP.oCorners][j * 3 + 1] = ((j < 2) ? box.h/2 : box.h/-2);
        this._planes[k][LPROP.oCorners][j * 3 + 2] = Z_INDEX;

        this._planes[k][LPROP.tCorners].x = box.x + box.w / 2;
        this._planes[k][LPROP.tCorners].y = box.y - box.h / 2;

      }

      self._updatePlane(this._planes[k]);

    }.bind(this));

  };

  /**
   * Produces from- and to-layouts for tweening, filling in any missing boxes.
   * @param fromLayout
   * @param toLayout
   * @returns {{from: *, to: *}}
   */
  var layoutFromTo = function(fromLayout, toLayout){

    var toKeys = _.keys(toLayout.boxes),
        fromKeys = _.keys(fromLayout.boxes),
        added = _.difference(toKeys, fromKeys),
        removed = _.difference(fromKeys, toKeys);

    _.each(added, function(k){
      fromLayout.boxes[k] = _.extend({}, toLayout.boxes[k], {
        w: 0,
        h: 0,
        x: toLayout.boxes[k].x + (toLayout.boxes[k].w / 2),
        y: toLayout.boxes[k].y - (toLayout.boxes[k].h / 2)
      })
    });

    _.each(removed, function(k){
      toLayout.boxes[k] = _.extend({}, fromLayout.boxes[k], {
        w: 0,
        h: 0,
        x: fromLayout.boxes[k].x + (fromLayout.boxes[k].w / 2),
        y: fromLayout.boxes[k].y - (fromLayout.boxes[k].h / 2)
      })
    });

    return {
      from: fromLayout,
      to: toLayout
    };

  };

  LayoutGeometry.prototype.updatePlanesLayout = function(oldLayout, newLayout, cb) {

    if(newLayout.packs || this[LTWEEN.corners].tweening){
      // set new destination coordinates for tweening
      if(this[LTWEEN.corners].tweening){
        // update destination if we're already tweening
        this[LTWEEN.corners].update(newLayout);
      }else{
        // start tweening if we're not already tweening
        // this is where you diff boxes that have been added or removed
        this[LTWEEN.corners].start(now(), layoutFromTo(oldLayout, newLayout), cb);
      }
    }else{
      // just update the geometry
      cb(newLayout);
      this.updatePlanes(newLayout.boxes);
    }

  };

  /**
   * Updates the positions of planes' vertices between two sets of positions.
   * @param progress
   * @param updateScrollProxy
   * @private
   */
  LayoutGeometry.prototype._interpolatePlanes = function(progress, updateScrollProxy){

    var toBoxes = this[LTWEEN.corners].to.boxes,
        fromBoxes = this[LTWEEN.corners].from.boxes;

    _.each(toBoxes, function(box, k){

      var pW = fromBoxes[k].w + progress * (toBoxes[k].w - fromBoxes[k].w),
          pH = fromBoxes[k].h + progress * (toBoxes[k].h - fromBoxes[k].h),
          pX = fromBoxes[k].x + progress * (toBoxes[k].x - fromBoxes[k].x),
          pY = fromBoxes[k].y + progress * (toBoxes[k].y - fromBoxes[k].y);

      this._planes[k][LPROP.tCorners].x = pX + pW / 2;
      this._planes[k][LPROP.tCorners].y = pY - pH / 2;

      for(var j = 0; j < 4; ++j){

        this._planes[k][LPROP.oCorners][j * 3    ] = ((j % 2 === 0) ? pW/-2 : pW/2);
        this._planes[k][LPROP.oCorners][j * 3 + 1] = ((j < 2) ? pH/2 : pH/-2);

        this._updatePlane(this._planes[k]);

      }

    }.bind(this));

    if(_.isFunction(updateScrollProxy)){
      updateScrollProxy(
        this[LTWEEN.corners].from.bottom + progress * (this[LTWEEN.corners].to.bottom - this[LTWEEN.corners].from.bottom)
      );
    }

  };

  LayoutGeometry.prototype.updateQuaternion = function(k, q){

    this._planes[k][LPROP.quaternion] = q;
    this._updatePlane(this._planes[k]);

  };

  LayoutGeometry.prototype._interpolateTween = function(tween, progress){

    // TODO: implement

  };

  /**
   * Internal function for responding to the output of the layout calculation worker.
   * @param e
   * @private
   */
  LayoutGeometry.prototype._calculate = function(e){

    if(_.has(e.data, 'document')){

      this._hasDocument = e.data.document;
      this.calculate(undefined, true);

    }else{

      var layout = e.data;

      if(layout.packs) this.packs = layout.packs;

      // set up media query

      var query = ['screen'];

      if(layout.breakpoints){

        if(layout.breakpoints.min > 0){
          query.push( '(min-width: ' + (layout.breakpoints.min) + 'px)' );
        }

        if(layout.breakpoints.max < Infinity){
          query.push( '(max-width: ' + (layout.breakpoints.max) + 'px)' );
        }

        query = query.join(' and ');

        this.mediaQuery = matchMedia(query);

      }

      // ready for callback

      this.emit('layout', layout);

      this.waiting = false;

    }
  };

  /**
   * Uses the layout calculation worker to calculate a layout. Calls `cb` when calculation is complete.
   * @param canvasSize
   * @param refreshPacks
   */
  LayoutGeometry.prototype.calculate = function(canvasSize, refreshPacks){

    // this._sTime = now();

    this._canvasSize = canvasSize || this._canvasSize;

    if(!this.waiting && this._hasDocument){

      this.waiting = true;

      this.layoutWorker.postMessage({
        packs: this.mediaQuery && this.mediaQuery.matches && !refreshPacks ? this.packs : null,
        canvasSize: this._canvasSize
      });

    }

  };

  LayoutGeometry.prototype.render = function(delta, updateScrollProxy){

    _.each(LTWEEN, function(tween){

      if(this[tween].tweening){
        var progress = this[tween].tick(delta);

        if(tween === LTWEEN.corners) {
          this._interpolatePlanes(progress, updateScrollProxy);
        }else{
          this._interpolateTween(tween, progress);
        }

      }

    }.bind(this));

  };

  module.exports = LayoutGeometry;

})();