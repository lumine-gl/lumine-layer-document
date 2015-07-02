(function(){

  var _ = require('lodash');

  module.exports = function(tiles, columns, sizes){

    var szs = sizes || {},
        SIZE_MAIN = szs.main || 'width',
        SIZE_CROSS = szs.cross || 'height';

    var maxCols, minCols;

    if(_.isNumber(columns)){
      maxCols = minCols = columns;
    }else
    if(_.has(columns, 'min') && _.has(columns, 'max')){
      maxCols = columns.max;
      minCols = columns.min;
    }else
    if(_.has(columns, 'max')) {
      maxCols = columns;
      minCols = 1;
    }

    var biggerMainSize = function(memo, tile){
      return Math.max(tile[SIZE_MAIN], memo);
    };

    var maxMainSize = _.reduce(tiles, biggerMainSize, 0);

    var sortTiles = function(tile){
      // sort by area in descending order;
      return -tile.area;
    };

    var chooseFreeRect = function(tile, bins){
      // choose first bin fit
      var result = false;
      _.every(bins, function(bin, b){
        // choose best area fit
        var fit = _.min(_.filter(bin.fRects, function(fRect){
          return fRect.cross >= tile[SIZE_CROSS] && fRect.main >= tile[SIZE_MAIN];
        }), function(fFRect){
          return fFRect.main * fFRect.cross;
        });
        if(!_.isNumber(fit)){
          result = {
            b: b,
            f:_.indexOf(bin.fRects, fit),
            rect: fit
          };
          bin.free -= tile.area;
          return false;
        }else{
          return true;
        }
      });
      return result;
    };

    var splitFilledRect = function(tile, fRect){
      var delta = {
        main: fRect.main - tile[SIZE_MAIN],
        cross: fRect.cross - tile[SIZE_CROSS]
      };
      if(delta.main > 0 && delta.cross > 0){
        // split the rectangle along the shortest axis
        if(fRect.main < fRect.cross){
          // split along main axis
          return [
            _.extend({}, fRect, {
              mp: fRect.mp + tile[SIZE_MAIN],
              main: delta.main,
              cross: tile[SIZE_CROSS]
            }),
            _.extend({}, fRect, {
              cp: fRect.cp + tile[SIZE_CROSS],
              cross: delta.cross
            })
          ];
        }else{
          // split along cross axis
          return [
            _.extend({}, fRect, {
              cp: fRect.cp + tile[SIZE_CROSS],
              cross: delta.cross,
              main: tile[SIZE_MAIN]
            }),
            _.extend({}, fRect, {
              mp: fRect.mp + tile[SIZE_MAIN],
              main: delta.main
            })
          ];
        }
      }else{
        if(delta.main > 0){
          // return the rectangle remainder along main
          return [
            _.extend({}, fRect, {
              mp: fRect.mp + tile[SIZE_MAIN],
              main: fRect.main - tile[SIZE_MAIN]
            })
          ];
        }
        else if(delta.cross > 0){
          // return the rectangle remainder along cross
          return [
            _.extend({}, fRect, {
              cp: fRect.cp + tile[SIZE_CROSS],
              cross: fRect.cross - tile[SIZE_CROSS]
            })
          ];
        }
        else {
          // return nothing
          return [];
        }
      }
    };

    var calculateBins = function(cols){
      var bins = [{
        main: maxMainSize,
        cross: cols,
        tiles: [],
        free: maxMainSize * cols,
        fRects: [{
          cp: 0,
          mp: 0,
          main: maxMainSize,
          cross: cols
        }]
      }];

      _.each(_.clone(tiles), function(tile, i){
        // Decide the free rectangle to pack this tile into
        var fit = chooseFreeRect(tile, bins);
        // If no free rectangle is found, make a new bin
        if(!fit){
          // make a new bin!
          var nexMaxMainSize = _.reduce(_.rest(tiles, i), biggerMainSize, 0);
          bins.push({
            main: nexMaxMainSize,
            cross: cols,
            tiles: [],
            free: nexMaxMainSize * cols,
            fRects: [{
              cp: 0,
              mp: 0,
              main: nexMaxMainSize,
              cross: cols
            }]
          });
          fit = chooseFreeRect(tile, bins);
        }
        if(!!fit){
          // Place it in the top left of the free rectangle found
          bins[fit.b].tiles.push(_.extend({}, tile, {cp: fit.rect.cp, mp: fit.rect.mp}));
          // Subdivide the free rectangle into remaining space along some axis
          var newRects = splitFilledRect(tile, fit.rect);
          newRects.unshift.apply(newRects, [fit.f, 1]);
          bins[fit.b].fRects.splice.apply(bins[fit.b].fRects, newRects);
        }else{
          console.log("This couldn't fit! Skipping.");
        }
      });

      return {
        bins: bins,
        freeSpace:_.reduce(bins, function(memo, bin){
          return memo + bin.free
        }, 0)
      };

    };

    var solutions = [];

    for(var c = maxCols; c >= minCols; c -= 1){
      var solution = calculateBins(c);
      solutions.push(solution);
      if(solution.freeSpace === 0){
        break;
      }
    }

    var mostEfficientSolution = _.min(solutions, function(solution){
        return solution.freeSpace;
      });

    var cMain = 0,
        solutionTiles = [];

    _.each(mostEfficientSolution.bins, function(bin, i){

      _.each(bin.tiles, function(tile, j){

        tile.mp += cMain;
        delete tile.area;
        solutionTiles.push(tile);

      });

      cMain += bin.main;

    });

    return _.extend(mostEfficientSolution, {
      tiles: solutionTiles
    });

  };

})();