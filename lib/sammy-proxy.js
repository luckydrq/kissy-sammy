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
          proxy.is_native = true
          window.clearInterval(lp._interval)
          lp._interval = null
        }
        app.trigger('location-changed')
      })
      if (_has_history && !app.disable_push_state) {
        // bind to popstate
        $(window).on('popstate.' + this.app.eventNamespace(), function(e) {
          app.trigger('location-changed')
        })
        // bind to link clicks that have routes
        $(document).delegate('click.history-' + this.app.eventNamespace(), 'a', function (e) {
          if (e.isDefaultPrevented() || e.metaKey || e.ctrlKey) {
            return
          }
          var full_path = lp.fullPath(this),
            // Get anchor's host name in a cross browser compatible way.
            // IE looses hostname property when setting href in JS
            // with a relative URL, e.g. a.setAttribute('href',"/whatever").
            // Circumvent this problem by creating a new link with given URL and
            // querying that for a hostname.
            hostname = this.hostname ? this.hostname : function (a) {
              var l = document.createElement("a")
              l.href = a.href
              return l.hostname
            }(this)

          if (hostname == window.location.hostname &&
              app.lookupRoute('get', full_path) &&
              Sammy.targetIsThisWindow(e)) {
            e.preventDefault()
            proxy.setLocation(full_path)
            return false
          }
        })
      }
      if (!lp._bindings) {
        lp._bindings = 0
      }
      lp._bindings++
    },

    // unbind the proxy events from the current app
    unbind: function() {
      $(window).detach('hashchange.' + this.app.eventNamespace())
      $(window).detach('popstate.' + this.app.eventNamespace())
      $(document).undelegate('click.history-' + this.app.eventNamespace(), 'a')
      Sammy.DefaultLocationProxy._bindings--
      if (Sammy.DefaultLocationProxy._bindings <= 0) {
        window.clearInterval(Sammy.DefaultLocationProxy._interval)
        Sammy.DefaultLocationProxy._interval = null
      }
    },

    // get the current location from the hash.
    getLocation: function() {
      return Sammy.DefaultLocationProxy.fullPath(window.location)
    },

    // set the current location to `new_location`
    setLocation: function(new_location) {
      if (/^([^#\/]|$)/.test(new_location)) { // non-prefixed url
        if (_has_history && !this.app.disable_push_state) {
          new_location = '/' + new_location
        } else {
          new_location = '#!/' + new_location
        }
      }
      if (new_location != this.getLocation()) {
        // HTML5 History exists and new_location is a full path
        if (_has_history && !this.app.disable_push_state && /^\//.test(new_location)) {
          history.pushState({ path: new_location }, window.title, new_location)
          this.app.trigger('location-changed')
        } else {
          return (window.location = new_location)
        }
      }
    },

    _startPolling: function(every) {
      // set up interval
      var proxy = this
      if (!Sammy.DefaultLocationProxy._interval) {
        if (!every) { every = 10 }
        var hashCheck = function() {
          var current_location = proxy.getLocation()
          if (typeof Sammy.DefaultLocationProxy._last_location == 'undefined' ||
            current_location != Sammy.DefaultLocationProxy._last_location) {
            window.setTimeout(function() {
              $(window).fire('hashchange', [true])
            }, 0)
          }
          Sammy.DefaultLocationProxy._last_location = current_location
        }
        hashCheck()
        Sammy.DefaultLocationProxy._interval = window.setInterval(hashCheck, every)
      }
    }

  }, {
    fullPath: function(location_obj){
      // Bypass the `window.location.hash` attribute.  If a question mark
      // appears in the hash IE6 will strip it and all of the following
      // characters from `window.location.hash`.
      var matches = location_obj.toString().match(/^[^#]*(#.+)$/)
      var hash = matches ? matches[1] : ''
      return [location_obj.pathname, location_obj.search, hash].join('')
    }
  })

  Sammy.DefaultLocationProxy = SammyProxy

  return SammyProxy

}, {
  requires:['sammy/base', 'node']
})