(function(){

  var _ = require('lodash'),
      now = require('lumine-now');

  var methods = {
    grow: require('./method-grow')
  };

  var key = function(tile){
    return tile.region + '.' + tile.index;
  };

  var MAX_TIME = 200,
      DOCUMENT = null;

  function calculateBoxesFromPack(pack, measures, pageCursor){

    var hSpan = function(h){
      return h * measures.colWidth + Math.max(0, (h - 1) * measures.hGutter)
    };

    var vSpan = function(v){
      return v * measures.rowHeight + Math.max(0, (v - 1) * measures.vGutter)
    };

    var maxY = 0;

    var boxes = {};

    _.each(pack.tiles, function(tile){

      var top = pageCursor + tile.mp * (measures.rowHeight + measures.vGutter),
          left = measures.colX + tile.cp * (measures.colWidth + measures.hGutter),
          y = measures.canvasSize.height - top,
          h = vSpan(tile[1]),
          w = hSpan(tile[0]);

      maxY = Math.max(maxY, top + h);

      boxes[key(tile)] = {
        x: left,
        y: y,
        w: w,
        h: h,
        index: tile.index,
        region: tile.region
      };

    });

    return {
      boxes: boxes,
      maxY: maxY
    }

  }

  function calculateLayout(options){

    var sTime = now(),
        packs = options.packs || null,
        canvasSize = options.canvasSize;

    var boxes = {},
        breakpoints = {min: 0, max: Infinity},
        rem = DOCUMENT.typography.base,
        pageCursor = 0,
        regionCursors = {};

    // Extend module types with useful data

    if(!options.packs){ // only needed if we're packing anew
      _.each(DOCUMENT['module-types'], function(type, typeName){

        DOCUMENT['module-types'][typeName]['_area-extrema'] = {min: Infinity, max: 0};
        var ae = DOCUMENT['module-types'][typeName]['_area-extrema'];

        _.each(type.sizes, function(size, i){
          var area = size[0] * size[1];

          DOCUMENT['module-types'][typeName].sizes[i][2] = area;

          ae.min = Math.min(ae.min, area);
          ae.max = Math.max(ae.max, area);
        });

      });
    }

    // Prepare region cursors

    _.each(_.keys(DOCUMENT.modules), function(region){
      regionCursors[region] = 0;
    });

    // Lay out each segment

    _.each(DOCUMENT.segments, function(segment, i){

      if(_.has(segment, 'page')){

        var measures = {},
            page = DOCUMENT['page-types'][segment.page];

        // Horizontal cadence

        var maxCols = page['max-groups'] * page['col-groups'],
            minCols = (page['min-groups'] || 1) * page['col-groups'];

        measures.allHMargins = 2 * page['min-horizontal-margin'] * rem;
        measures.colMinWidth = page.columns['min-width'] * rem;
        measures.colMaxWidth = page.columns['max-width'] * rem;
        measures.hGutter = page.columns.gutter * rem;

        measures.maxPageWidth = maxCols * measures.colMaxWidth
          + (maxCols - 1) * measures.hGutter
          + measures.allHMargins;
        //measures.minPageWidth = page['min-columns'] * measures.colMinWidth
        //  + (maxCols - 1) * measures.hGutter
        //  + measures.allMargins;
        measures.pageWidth = Math.min(canvasSize.width, measures.maxPageWidth);

        measures.pageX = Math.floor((canvasSize.width - measures.pageWidth) / 2);
        measures.colX = measures.pageX + measures.allHMargins / 2;

        var colGroupMinWidth = page['col-groups'] * measures.colMinWidth + Math.max(0, page['col-groups'] - 1) * measures.hGutter;

        measures.nCols = Math.min(
          Math.max(
            minCols,
            Math.floor((measures.pageWidth - measures.allHMargins + measures.hGutter) / (colGroupMinWidth + measures.hGutter)) * page['col-groups']
          ),
          maxCols
        );

        measures.colWidth = ((measures.nCols - 1) * measures.hGutter + measures.allHMargins - measures.pageWidth) / -measures.nCols;

        // Vertical cadence

        measures.topGutter = page['top-gutter'] * rem;
        measures.vGutter = page.rows.gutter * rem;
        measures.rowHeight = page.rows.height * rem;

        // Layout constants

        if(!options.packs) { // only needed if we're packing anew
          measures.areaExtrema = _.reduce(DOCUMENT.modules[segment.region], function (memo, mod, i) {
            memo.min = memo.min + DOCUMENT['module-types'][mod.type]['_area-extrema'].min;
            memo.max = memo.max + DOCUMENT['module-types'][mod.type]['_area-extrema'].max;
            return memo;
          }, {min: 0, max: 0});
        }

        measures.maxArea = maxCols * page['max-rows'];

        measures.canvasSize = canvasSize;

        pageCursor += measures.topGutter;

        // Add to breakpoints beyond which this doesn't work

        var nextGroup = measures.nCols + page['col-groups'];

        if(nextGroup <= maxCols){
          breakpoints.max = Math.min( breakpoints.max,
            measures.allHMargins + nextGroup * measures.colMinWidth + (nextGroup - 1) * measures.hGutter
          );
        }

        if(measures.nCols > minCols){
          breakpoints.min = Math.max( breakpoints.min,
            measures.allHMargins + measures.nCols * measures.colMinWidth + (measures.nCols - 1) * measures.hGutter
          );
        }

        // Decide layout

        if(!packs){
          packs = [];
        }

        if(!packs[i]){
          packs[i] = methods.grow(DOCUMENT, segment.region, measures, regionCursors[segment.region], pageCursor, sTime, MAX_TIME);
        }

        var solution = calculateBoxesFromPack(packs[i], measures, pageCursor);

        regionCursors[segment.region] += packs[i].tiles.length;

        pageCursor = solution.maxY + measures.vGutter;

        _.extend(boxes, solution.boxes);

      }

    });

    // console.log( 'Layout took', (now() - sTime).toFixed(2), 'ms to calculate.' );

    var results = {
      boxes: boxes,
      bottom: pageCursor
    };

    if(!options.packs){
      results.packs = packs;
      results.breakpoints = breakpoints;
    }

    return results;

  }

  function updateDocument(change){
    var path = change.path.split('.');
    eval('DOCUMENT["' + path.join('"]["') + '"]=' + change.value);
    postMessage( { document: true } );
  }

  onmessage = function(e){
    if(_.has(e.data, 'document')){
      DOCUMENT = e.data.document;
      postMessage( { document: true } );
    }else
    if(_.has(e.data, 'change')){
      updateDocument(e.data.change);
    }
    else{
      postMessage( calculateLayout(e.data) );
    }
  };

})();