(function(){

  var EE = require('events').EventEmitter,
      inherits = require('util').inherits;

  var _update = function(bottom){
    if(this._bottom !== bottom){
      this.el.style.height = bottom + 'px';
      this._bottom = bottom;
    }
  };

  function ScrollProxy(){

    this.el = document.querySelector('.scroll-proxy');
    this._bottom = null;

    document.addEventListener('scroll', this.scroll.bind(this), true);

    EE.call(this);

    this.update = _update.bind(this);

    this.scroll();

  }

  inherits(ScrollProxy, EE);

  ScrollProxy.prototype.scroll = function(){
    this.y = window.scrollY;
    this.x = window.scrollX;

    this.emit('scroll', window.scrollY, window.scrollX);
  };

  module.exports = ScrollProxy;

})();