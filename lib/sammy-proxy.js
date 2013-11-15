KISSY.add('sammy/proxy', function(S, Sammy){
  var $ = S.all
  var _has_history = !!(window.history && history.pushState)

  var SammyProxy = function(app, run_interval_every){
    this.app = app
    // set is native to false and start the poller immediately
    this.is_native = false
    this.has_history = _has_history
    this._startPolling(run_interval_every)
  }

  S.extend(SammyProxy, {
    // bind the proxy events to the current app.
    bind: function() {
      var proxy = this, app = this.app, lp = Sammy.DefaultLocationProxy
      $(window).on('hashchange.' + this.app.eventNamespace(), function(e, non_native) {
        // if we receive a native hash change event, set the proxy accordingly
        // and stop polling
        if (proxy.is_native === false && !non_native) {
          proxy.is_native = true;
          window.clearInterval(lp._interval);
          lp._interval = null;
        }
        app.trigger('location-changed');
      });
      if (_has_history && !app.disable_push_state) {
        // bind to popstate
        $(window).on('popstate.' + this.app.eventNamespace(), function(e) {
          app.trigger('location-changed')
        });
        // bind to link clicks that have routes
        $(document).delegate('click.history-' + this.app.eventNamespace(), 'a', function (e) {
          if (e.isDefaultPrevented() || e.metaKey || e.ctrlKey) {
            return;
          }
          var full_path = lp.fullPath(this),
            // Get anchor's host name in a cross browser compatible way.
            // IE looses hostname property when setting href in JS
            // with a relative URL, e.g. a.setAttribute('href',"/whatever").
            // Circumvent this problem by creating a new link with given URL and
            // querying that for a hostname.
            hostname = this.hostname ? this.hostname : function (a) {
              var l = document.createElement("a");
              l.href = a.href;
              return l.hostname;
            }(this);

          if (hostname == window.location.hostname &&
              app.lookupRoute('get', full_path) &&
              Sammy.targetIsThisWindow(e)) {
            e.preventDefault();
            proxy.setLocation(full_path);
            return false;
          }
        });
      }
      if (!lp._bindings) {
        lp._bindings = 0;
      }
      lp._bindings++;
    },
  })

  S.mix(SammyProxy, {
    fullPath: function(location_obj){
      // Bypass the `window.location.hash` attribute.  If a question mark
      // appears in the hash IE6 will strip it and all of the following
      // characters from `window.location.hash`.
      var matches = location_obj.toString().match(/^[^#]*(#.+)$/)
      var hash = matches ? matches[1] : ''
      return [location_obj.pathname, location_obj.search, hash].join('')
    }
  })

  S.mix(Sammy, {
    DefaultLocationProxy: SammyProxy
  })

  return SammyProxy

}, {
  requires:['sammy/base', 'node']
})