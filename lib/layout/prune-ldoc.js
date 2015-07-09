(function(){

  var _ = require('lodash');

  var LDOC_ALLOWED_KEYS = [
    'typography',
    'segments',
    'module-types',
    'page-types'
  ];

  var MODULE_ALLOWED_KEYS = [
    'fill',
    'type',
    'salience'
  ];

  module.exports = function(lDoc){

    var result = _.pick(lDoc, LDOC_ALLOWED_KEYS);

    result.modules = {};

    _.each(lDoc.modules, function(modules, region){

      result.modules[region] = _.map(modules, function(module){
        return _.pick(module, MODULE_ALLOWED_KEYS);
      });

    });

    return result;

  };

})();