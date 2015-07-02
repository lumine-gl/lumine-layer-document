(function(){

  var _ = require('lodash');

  var pack = require('./pack'),
      now = require('lumine-now');

  module.exports = function(LDoc, region, measures, regionCursor, pageCursor, sTime, MAX_TIME){

    var modules = LDoc.modules[region];

    var solution = [],
        solutionArea = 0,
        keepGoing = true;

    var packSolution = function(){
      return pack(_.map(solution, function(size, i){
        var index = i + regionCursor;
        return {
          0: LDoc['module-types'][modules[index].type].sizes[size][0],
          1: LDoc['module-types'][modules[index].type].sizes[size][1],
          area: LDoc['module-types'][modules[index].type].sizes[size][2],
          index: index,
          region: region
        }
      }), measures.nCols, { main: '1', cross: '0' });
    };

    // Shrink any oversized modules and cut out modules that won't fit inside the maxArea

    var i, s, cSizes;

    for(i = 0; i < modules.length - regionCursor; ++i){

      cSizes = LDoc['module-types'][modules[i + regionCursor].type].sizes;
      s = modules[i + regionCursor].salience;

      while(s >= 0 && cSizes[s][0] > measures.nCols){ --s; } // use the nearest template that fits if this one is too wide

      if(solutionArea + cSizes[s][2] <= measures.maxArea){
        solution[i] = s;
        solutionArea += cSizes[solution[i]][2];
      }else{
        break;
      }

    }

    // Adjust the sizes

    var c, d, dAreaDelta,
        // try packing as-is and see how much space we need to fill
        remaining = packSolution().freeSpace;

    do{

      if(remaining === 0){
        keepGoing = false;
      }else{

        dAreaDelta = null;

        for(c = 0; c < solution.length; ++c){
          cSizes = LDoc['module-types'][modules[c + regionCursor].type].sizes;

          // search for a size for this template that fits well

          d = solution[c] + 1;

          // the following block finds the next size that will fit

          if (d < cSizes.length && cSizes[d][2] - cSizes[solution[c]][2] <= remaining) {
            dAreaDelta = cSizes[d][2] - cSizes[solution[c]][2];
            solution[c] = d;
          }

          // the following block finds the largest that will fit – this sometimes breaks the layout

          //for(d = solution[c] + 1; d < cSizes.length; ++d) {
          //
          //  if (cSizes[d][2] - cSizes[solution[c]][2] <= remaining) {
          //    dAreaDelta = cSizes[d][2] - cSizes[solution[c]][2];
          //    solution[c] = d;
          //  }else{
          //    break;
          //  }
          //
          //}

          if(_.isNumber(dAreaDelta)) {
            solutionArea += dAreaDelta;
            remaining -= dAreaDelta;
            break;
          }

          if(c + 1 === solution.length){ // no more adjustments could be made
            keepGoing = false;
            break;
          }

        }

      }

      if(now() - sTime >= MAX_TIME) {
        console.warn( "Couldn't find an optimal solution in time; max time is set to", MAX_TIME, 'ms.' );
        keepGoing = false;
      }

    }while(keepGoing);

    // Now pack the rectangles with the augmented solution

    return packSolution();

  };

})();