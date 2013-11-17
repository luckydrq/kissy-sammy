KISSY.add('sammy/application',function(S, Sammy, Node){
  var $ = Node.all
  var QUERY_STRING_MATCHER = /\?([^#]*)?$/
  var _template_cache = {}

  var SammyApplication = function(app_function){
    var app = this
    this.routes            = {}
    this.listeners         = new Sammy.Object({})
    this.arounds           = []
    this.befores           = []
    // generate a unique namespace
    this.namespace         = (new Date()).getTime() + '-' + parseInt(Math.random() * 1000, 10)
    this.context_prototype = function() { Sammy.EventContext.apply(this, arguments) }
    this.context_prototype.prototype = new Sammy.EventContext()

    if (S.isFunction(app_function)) {
      app_function.apply(this, [this])
    }
    // set the location proxy if not defined to the default (DefaultLocationProxy)
    if (!this._location_proxy) {
      this.setLocationProxy(new Sammy.DefaultLocationProxy(this, this.run_interval_every))
    }
    if (this.debug) {
      this.bindToAllEvents(function(e, data) {
        app.log(app.toString(), e.cleaned_type, data || {})
      })
    }
  }

  S.extend(SammyApplication, {
    // the four route verbs
    ROUTE_VERBS: ['get','post','put','delete'],

    // An array of the default events triggered by the
    // application during its lifecycle
    APP_EVENTS: ['run', 'unload', 'lookup-route', 'run-route', 'route-found', 'event-context-before', 'event-context-after', 'changed', 'error', 'check-form-submission', 'redirect', 'location-changed'],

    _last_route: null,
    _location_proxy: null,
    _running: false,

    // Defines what element the application is bound to. Provide a selector
    // (parseable by `jQuery()`) and this will be used by `$element()`
    element_selector: 'body',

    // When set to true, logs all of the default events using `log()`
    debug: false,

    // When set to true, and the error() handler is not overridden, will actually
    // raise JS errors in routes (500) and when routes can't be found (404)
    raise_errors: false,

    // The time in milliseconds that the URL is queried for changes
    run_interval_every: 50,

    // if using the `DefaultLocationProxy` setting this to true will force the app to use
    // traditional hash based routing as opposed to the new HTML5 PushState support
    disable_push_state: false,

    // The default template engine to use when using `partial()` in an
    // `EventContext`. `template_engine` can either be a string that
    // corresponds to the name of a method/helper on EventContext or it can be a function
    // that takes two arguments, the content of the unrendered partial and an optional
    // JS object that contains interpolation data. Template engine is only called/referred
    // to if the extension of the partial is null or unknown. See `partial()`
    // for more information
    template_engine: null,

    // //=> Sammy.Application: body
    toString: function() {
      return 'Sammy.Application:' + this.element_selector
    },

    // returns a jQuery object of the Applications bound element.
    $element: function(selector) {
      return selector ? $(this.element_selector).one(selector) : $(this.element_selector)
    },

    // `use()` is the entry point for including Sammy plugins.
    // The first argument to use should be a function() that is evaluated
    // in the context of the current application, just like the `app_function`
    // argument to the `Sammy.Application` constructor.
    //
    // Any additional arguments are passed to the app function sequentially.
    //
    // For much more detail about plugins, check out:
    // [http://sammyjs.org/docs/plugins](http://sammyjs.org/docs/plugins)
    //
    // ### Example
    //
    //      var MyPlugin = function(app, prepend) {
    //
    //        this.helpers({
    //          myhelper: function(text) {
    //            alert(prepend + " " + text);
    //          }
    //        });
    //
    //      };
    //
    //      var app = $.sammy(function() {
    //
    //        this.use(MyPlugin, 'This is my plugin');
    //
    //        this.get('#/', function() {
    //          this.myhelper('and dont you forget it!');
    //          //=> Alerts: This is my plugin and dont you forget it!
    //        });
    //
    //      });
    //
    // If plugin is passed as a string it assumes your are trying to load
    // Sammy."Plugin". This is the preferred way of loading core Sammy plugins
    // as it allows for better error-messaging.
    //
    // ### Example
    //
    //      $.sammy(function() {
    //        this.use('Mustache'); //=> Sammy.Mustache
    //        this.use('Storage'); //=> Sammy.Storage
    //      });
    //
    use: function() {
      // flatten the arguments
      var args = S.makeArray(arguments),
          plugin = args.shift(),
          plugin_name = plugin || ''
      try {
        args.unshift(this)
        if (typeof plugin == 'string') {
          plugin_name = 'Sammy.' + plugin
          plugin = Sammy[plugin]
        }
        plugin.apply(this, args)
      } catch(e) {
        if (typeof plugin === 'undefined') {
          this.error("Plugin Error: called use() but plugin (" + plugin_name.toString() + ") is not defined", e)
        } else if (!S.isFunction(plugin)) {
          this.error("Plugin Error: called use() but '" + plugin_name.toString() + "' is not a function", e)
        } else {
          this.error("Plugin Error", e)
        }
      }
      return this
    },

    // Sets the location proxy for the current app. By default this is set to
    // a new `Sammy.DefaultLocationProxy` on initialization. However, you can set
    // the location_proxy inside you're app function to give your app a custom
    // location mechanism. See `Sammy.DefaultLocationProxy` and `Sammy.DataLocationProxy`
    // for examples.
    //
    // `setLocationProxy()` takes an initialized location proxy.
    //
    // ### Example
    //
    //        // to bind to data instead of the default hash;
    //        var app = $.sammy(function() {
    //          this.setLocationProxy(new Sammy.DataLocationProxy(this));
    //        });
    //
    setLocationProxy: function(new_proxy) {
      var original_proxy = this._location_proxy
      this._location_proxy = new_proxy
      if (this.isRunning()) {
        if (original_proxy) {
          // if there is already a location proxy, unbind it.
          original_proxy.unbind()
        }
        this._location_proxy.bind()
      }
    },

    // provide log() override for inside an app that includes the relevant application element_selector
    log: function() {
      Sammy.log.apply(Sammy, Array.prototype.concat.apply([this.element_selector],arguments))
    },

    // `route()` is the main method for defining routes within an application.
    // For great detail on routes, check out:
    // [http://sammyjs.org/docs/routes](http://sammyjs.org/docs/routes)
    //
    // This method also has aliases for each of the different verbs (eg. `get()`, `post()`, etc.)
    //
    // ### Arguments
    //
    // * `verb` A String in the set of ROUTE_VERBS or 'any'. 'any' will add routes for each
    //    of the ROUTE_VERBS. If only two arguments are passed,
    //    the first argument is the path, the second is the callback and the verb
    //    is assumed to be 'any'.
    // * `path` A Regexp or a String representing the path to match to invoke this verb.
    // * `callback` A Function that is called/evaluated when the route is run see: `runRoute()`.
    //    It is also possible to pass a string as the callback, which is looked up as the name
    //    of a method on the application.
    //
    route: function(verb, path) {
      var app = this, param_names = [], add_route, path_match, callback = Array.prototype.slice.call(arguments,2)

      // if the method signature is just (path, callback)
      // assume the verb is 'any'
      if (callback.length === 0 && S.isFunction(path)) {
        path = verb
        callback = [path]
        verb = 'any'
      }

      verb = verb.toLowerCase() // ensure verb is lower case

      // if path is a string turn it into a regex
      if (path.constructor == String) {

        // Needs to be explicitly set because IE will maintain the index unless NULL is returned,
        // which means that with two consecutive routes that contain params, the second set of params will not be found and end up in splat instead of params
        // https://developer.mozilla.org/en/Core_JavaScript_1.5_Reference/Global_Objects/RegExp/lastIndex
        PATH_NAME_MATCHER.lastIndex = 0

        // find the names
        while ((path_match = PATH_NAME_MATCHER.exec(path)) !== null) {
          param_names.push(path_match[1])
        }
        // replace with the path replacement
        path = new RegExp(path.replace(PATH_NAME_MATCHER, PATH_REPLACER) + "$")
      }
      // lookup callbacks
      S.each(callback,function(cb,i){
        if (typeof(cb) === 'string') {
          callback[i] = app[cb]
        }
      })

      add_route = function(with_verb) {
        var r = {verb: with_verb, path: path, callback: callback, param_names: param_names}
        // add route to routes array
        app.routes[with_verb] = app.routes[with_verb] || []
        // place routes in order of definition
        app.routes[with_verb].push(r)
      }

      if (verb === 'any') {
        S.each(this.ROUTE_VERBS, function(v, i) { add_route(v) })
      } else {
        add_route(verb)
      }

      // return the app
      return this
    },

    // Alias for route('get', ...)
    get: _routeWrapper('get'),

    // Alias for route('post', ...)
    post: _routeWrapper('post'),

    // Alias for route('put', ...)
    put: _routeWrapper('put'),

    // Alias for route('delete', ...)
    del: _routeWrapper('delete'),

    // Alias for route('any', ...)
    any: _routeWrapper('any'),

    // `mapRoutes` takes an array of arrays, each array being passed to route()
    // as arguments, this allows for mass definition of routes. Another benefit is
    // this makes it possible/easier to load routes via remote JSON.
    //
    // ### Example
    //
    //      var app = $.sammy(function() {
    //
    //        this.mapRoutes([
    //            ['get', '#/', function() { this.log('index'); }],
    //            // strings in callbacks are looked up as methods on the app
    //            ['post', '#/create', 'addUser'],
    //            // No verb assumes 'any' as the verb
    //            [/dowhatever/, function() { this.log(this.verb, this.path)}];
    //          ]);
    //      });
    //
    mapRoutes: function(route_array) {
      var app = this
      S.each(route_array, function(route_args, i) {
        app.route.apply(app, route_args)
      })
      return this
    },

    // A unique event namespace defined per application.
    // All events bound with `bind()` are automatically bound within this space.
    eventNamespace: function() {
      return ['sammy-app', this.namespace].join('-')
    },

    // Works just like `jQuery.fn.bind()` with a couple notable differences.
    //
    // * It binds all events to the application element
    // * All events are bound within the `eventNamespace()`
    // * Events are not actually bound until the application is started with `run()`
    // * callbacks are evaluated within the context of a Sammy.EventContext
    //
    bind: function(name, data, callback) {
      var app = this
      // build the callback
      // if the arity is 2, callback is the second argument
      if (typeof callback == 'undefined') { callback = data }
      var listener_callback =  function() {
        // pull off the context from the arguments to the callback
        var e, context, data
        e       = arguments[0]
        data    = arguments[1]
        if (data && data.context) {
          context = data.context
          delete data.context
        } else {
          context = new app.context_prototype(app, 'bind', e.type, data, e.target)
        }
        e.cleaned_type = e.type.replace(app.eventNamespace(), '')
        callback.apply(context, [e, data])
      }

      // it could be that the app element doesnt exist yet
      // so attach to the listeners array and then run()
      // will actually bind the event.
      if (!this.listeners[name]) { this.listeners[name] = [] }
      this.listeners[name].push(listener_callback)
      if (this.isRunning()) {
        // if the app is running
        // *actually* bind the event to the app element
        this._listen(name, listener_callback)
      }
      return this
    },

    // Triggers custom events defined with `bind()`
    //
    // ### Arguments
    //
    // * `name` The name of the event. Automatically prefixed with the `eventNamespace()`
    // * `data` An optional Object that can be passed to the bound callback.
    // * `context` An optional context/Object in which to execute the bound callback.
    //   If no context is supplied a the context is a new `Sammy.EventContext`
    //
    trigger: function(name, data) {
      this.$element().fire([name, this.eventNamespace()].join('.'), [data])
      return this
    },

    // Reruns the current route
    refresh: function() {
      this.last_location = null
      this.trigger('location-changed')
      return this
    },

    // Takes a single callback that is pushed on to a stack.
    // Before any route is run, the callbacks are evaluated in order within
    // the current `Sammy.EventContext`
    //
    // If any of the callbacks explicitly return false, execution of any
    // further callbacks and the route itself is halted.
    //
    // You can also provide a set of options that will define when to run this
    // before based on the route it proceeds.
    //
    // ### Example
    //
    //      var app = $.sammy(function() {
    //
    //        // will run at #/route but not at #/
    //        this.before('#/route', function() {
    //          //...
    //        });
    //
    //        // will run at #/ but not at #/route
    //        this.before({except: {path: '#/route'}}, function() {
    //          this.log('not before #/route');
    //        });
    //
    //        this.get('#/', function() {});
    //
    //        this.get('#/route', function() {});
    //
    //      });
    //
    // See `contextMatchesOptions()` for a full list of supported options
    //
    before: function(options, callback) {
      if (S.isFunction(options)) {
        callback = options
        options = {}
      }
      this.befores.push([options, callback])
      return this
    },

    // A shortcut for binding a callback to be run after a route is executed.
    // After callbacks have no guarunteed order.
    after: function(callback) {
      return this.bind('event-context-after', callback)
    },

    // Adds an around filter to the application. around filters are functions
    // that take a single argument `callback` which is the entire route
    // execution path wrapped up in a closure. This means you can decide whether
    // or not to proceed with execution by not invoking `callback` or,
    // more usefully wrapping callback inside the result of an asynchronous execution.
    //
    // ### Example
    //
    // The most common use case for around() is calling a _possibly_ async function
    // and executing the route within the functions callback:
    //
    //      var app = $.sammy(function() {
    //
    //        var current_user = false;
    //
    //        function checkLoggedIn(callback) {
    //          // /session returns a JSON representation of the logged in user
    //          // or an empty object
    //          if (!current_user) {
    //            $.getJSON('/session', function(json) {
    //              if (json.login) {
    //                // show the user as logged in
    //                current_user = json;
    //                // execute the route path
    //                callback();
    //              } else {
    //                // show the user as not logged in
    //                current_user = false;
    //                // the context of aroundFilters is an EventContext
    //                this.redirect('#/login');
    //              }
    //            });
    //          } else {
    //            // execute the route path
    //            callback();
    //          }
    //        };
    //
    //        this.around(checkLoggedIn);
    //
    //      });
    //
    around: function(callback) {
      this.arounds.push(callback)
      return this
    },

    // Adds a onComplete function to the application. onComplete functions are executed
    // at the end of a chain of route callbacks, if they call next(). Unlike after,
    // which is called as soon as the route is complete, onComplete is like a final next()
    // for all routes, and is thus run asynchronously
    //
    // ### Example
    //
    //      app.get('/chain',function(context,next) {
    //          console.log('chain1');
    //          next();
    //      },function(context,next) {
    //          console.log('chain2');
    //          next();
    //      });
    //
    //      app.get('/link',function(context,next) {
    //          console.log('link1');
    //          next();
    //      },function(context,next) {
    //          console.log('link2');
    //          next();
    //      });
    //
    //      app.onComplete(function() {
    //          console.log("Running finally");
    //      });
    //
    // If you go to '/chain', you will get the following messages:
    //
    //      chain1
    //      chain2
    //      Running onComplete
    //
    //
    // If you go to /link, you will get the following messages:
    //
    //      link1
    //      link2
    //      Running onComplete
    //
    //
    // It really comes to play when doing asynchronous:
    //
    //      app.get('/chain',function(context,next) {
    //        $.get('/my/url',function() {
    //          console.log('chain1');
    //          next();
    //        });
    //      },function(context,next) {
    //        console.log('chain2');
    //        next();
    //      });
    //
    onComplete: function(callback) {
      this._onComplete = callback
      return this
    },

    // Returns `true` if the current application is running.
    isRunning: function() {
      return this._running
    },

    // Helpers extends the EventContext prototype specific to this app.
    // This allows you to define app specific helper functions that can be used
    // whenever you're inside of an event context (templates, routes, bind).
    //
    // ### Example
    //
    //     var app = $.sammy(function() {
    //
    //       helpers({
    //         upcase: function(text) {
    //          return text.toString().toUpperCase();
    //         }
    //       });
    //
    //       get('#/', function() { with(this) {
    //         // inside of this context I can use the helpers
    //         $('#main').html(upcase($('#main').text());
    //       }});
    //
    //     });
    //
    //
    // ### Arguments
    //
    // * `extensions` An object collection of functions to extend the context.
    //
    helpers: function(extensions) {
      S.mix(this.context_prototype.prototype, extensions)
      return this
    },

    // Helper extends the event context just like `helpers()` but does it
    // a single method at a time. This is especially useful for dynamically named
    // helpers
    //
    // ### Example
    //
    //     // Trivial example that adds 3 helper methods to the context dynamically
    //     var app = $.sammy(function(app) {
    //
    //       $.each([1,2,3], function(i, num) {
    //         app.helper('helper' + num, function() {
    //           this.log("I'm helper number " + num);
    //         });
    //       });
    //
    //       this.get('#/', function() {
    //         this.helper2(); //=> I'm helper number 2
    //       });
    //     });
    //
    // ### Arguments
    //
    // * `name` The name of the method
    // * `method` The function to be added to the prototype at `name`
    //
    helper: function(name, method) {
      this.context_prototype.prototype[name] = method
      return this
    },

    // Actually starts the application's lifecycle. `run()` should be invoked
    // within a document.ready block to ensure the DOM exists before binding events, etc.
    //
    // ### Example
    //
    //     var app = $.sammy(function() { ... }); // your application
    //     $(function() { // document.ready
    //        app.run();
    //     });
    //
    // ### Arguments
    //
    // * `start_url` Optionally, a String can be passed which the App will redirect to
    //   after the events/routes have been bound.
    run: function(start_url) {
      if (this.isRunning()) { return false }
      var app = this

      // actually bind all the listeners
      S.each(this.listeners.toHash(), function(callbacks, name) {
        S.each(callbacks, function(listener_callback, i) {
          app._listen(name, listener_callback)
        })
      })

      this.trigger('run', {start_url: start_url})
      this._running = true
      // set last location
      this.last_location = null
      if (!(/\#(.+)/.test(this.getLocation())) && typeof start_url != 'undefined') {
        this.setLocation(start_url)
      }
      // check url
      this._checkLocation()
      this._location_proxy.bind()
      this.bind('location-changed', function() {
        app._checkLocation()
      })

      // bind to submit to capture post/put/delete routes
      this.bind('submit', function(e) {
        if ( !Sammy.targetIsThisWindow(e) ) { return true }
        var returned = app._checkFormSubmission($(e.target).parent('form'))
        return (returned === false) ? e.preventDefault() : false
      })

      // bind unload to body unload
      $(window).on('unload', function() {
        app.unload()
      })

      // trigger html changed
      return this.trigger('changed')
    },

    // The opposite of `run()`, un-binds all event listeners and intervals
    // `run()` Automatically binds a `onunload` event to run this when
    // the document is closed.
    unload: function() {
      if (!this.isRunning()) { return false }
      var app = this
      this.trigger('unload')
      // clear interval
      this._location_proxy.unbind()
      // unbind form submits
      this.$element().detach('submit').removeClass(app.eventNamespace())
      // unbind all events
      S.each(this.listeners.toHash() , function(listeners, name) {
        S.each(listeners, function(listener_callback, i) {
          app._unlisten(name, listener_callback)
        })
      })
      this._running = false
      return this
    },

    // Not only runs `unbind` but also destroys the app reference.
    destroy: function() {
      this.unload()
      delete Sammy.apps[this.element_selector]
      return this
    },

    // Will bind a single callback function to every event that is already
    // being listened to in the app. This includes all the `APP_EVENTS`
    // as well as any custom events defined with `bind()`.
    //
    // Used internally for debug logging.
    bindToAllEvents: function(callback) {
      var app = this
      // bind to the APP_EVENTS first
      S.each(this.APP_EVENTS, function(e, i) {
        app.bind(e, callback)
      })
      // next, bind to listener names (only if they dont exist in APP_EVENTS)
      S.each(this.listeners.keys(true), function(name, i) {
        if (S.inArray(name, app.APP_EVENTS) == -1) {
          app.bind(name, callback)
        }
      })
      return this
    },

    // Returns a copy of the given path with any query string after the hash
    // removed.
    routablePath: function(path) {
      return path.replace(QUERY_STRING_MATCHER, '')
    },

    // Given a verb and a String path, will return either a route object or false
    // if a matching route can be found within the current defined set.
    lookupRoute: function(verb, path) {
      var app = this, routed = false, i = 0, l, route
      if (typeof this.routes[verb] != 'undefined') {
        l = this.routes[verb].length
        for (; i < l; i++) {
          route = this.routes[verb][i]
          if (app.routablePath(path).match(route.path)) {
            routed = route
            break
          }
        }
      }
      return routed
    },

    // First, invokes `lookupRoute()` and if a route is found, parses the
    // possible URL params and then invokes the route's callback within a new
    // `Sammy.EventContext`. If the route can not be found, it calls
    // `notFound()`. If `raise_errors` is set to `true` and
    // the `error()` has not been overridden, it will throw an actual JS
    // error.
    //
    // You probably will never have to call this directly.
    //
    // ### Arguments
    //
    // * `verb` A String for the verb.
    // * `path` A String path to lookup.
    // * `params` An Object of Params pulled from the URI or passed directly.
    //
    // ### Returns
    //
    // Either returns the value returned by the route callback or raises a 404 Not Found error.
    //
    runRoute: function(verb, path, params, target) {
      var app = this,
          route = this.lookupRoute(verb, path),
          context,
          wrapped_route,
          arounds,
          around,
          befores,
          before,
          callback_args,
          path_params,
          final_returned

      if (this.debug) {
        this.log('runRoute', [verb, path].join(' '))
      }

      this.trigger('run-route', {verb: verb, path: path, params: params})
      if (typeof params == 'undefined') { params = {} }

      S.mix(params, this._parseQueryString(path))

      if (route) {
        this.trigger('route-found', {route: route})
        // pull out the params from the path
        if ((path_params = route.path.exec(this.routablePath(path))) !== null) {
          // first match is the full path
          path_params.shift()
          // for each of the matches
          S.each(path_params, function(param, i) {
            // if theres a matching param name
            if (route.param_names[i]) {
              // set the name to the match
              params[route.param_names[i]] = _decode(param)
            } else {
              // initialize 'splat'
              if (!params.splat) { params.splat = [] }
              params.splat.push(_decode(param))
            }
          })
        }

        // set event context
        context  = new this.context_prototype(this, verb, path, params, target)
        // ensure arrays
        arounds = this.arounds.slice(0)
        befores = this.befores.slice(0)
        // set the callback args to the context + contents of the splat
        callback_args = [context]
        if (params.splat) {
          callback_args = callback_args.concat(params.splat)
        }
        // wrap the route up with the before filters
        wrapped_route = function() {
          var returned, i, nextRoute
          while (befores.length > 0) {
            before = befores.shift()
            // check the options
            if (app.contextMatchesOptions(context, before[0])) {
              returned = before[1].apply(context, [context])
              if (returned === false) { return false }
            }
          }
          app.last_route = route
          context.trigger('event-context-before', {context: context})
          // run multiple callbacks
          if (typeof(route.callback) === "function") {
            route.callback = [route.callback]
          }
          if (route.callback && route.callback.length) {
            i = -1
            nextRoute = function() {
              i++
              if (route.callback[i]) {
                returned = route.callback[i].apply(context,callback_args)
              } else if (app._onComplete && typeof(app._onComplete === "function")) {
                app._onComplete(context)
              }
            }
            callback_args.push(nextRoute)
            nextRoute()
          }
          context.trigger('event-context-after', {context: context})
          return returned
        }
        S.each(arounds.reverse(), function(around, i) {
          var last_wrapped_route = wrapped_route
          wrapped_route = function() { return around.apply(context, [last_wrapped_route]) }
        })
        try {
          final_returned = wrapped_route()
        } catch(e) {
          this.error(['500 Error', verb, path].join(' '), e)
        }
        return final_returned
      } else {
        return this.notFound(verb, path)
      }
    },

    // Matches an object of options against an `EventContext` like object that
    // contains `path` and `verb` attributes. Internally Sammy uses this
    // for matching `before()` filters against specific options. You can set the
    // object to _only_ match certain paths or verbs, or match all paths or verbs _except_
    // those that match the options.
    //
    // ### Example
    //
    //     var app = $.sammy(),
    //         context = {verb: 'get', path: '#/mypath'};
    //
    //     // match against a path string
    //     app.contextMatchesOptions(context, '#/mypath'); //=> true
    //     app.contextMatchesOptions(context, '#/otherpath'); //=> false
    //     // equivalent to
    //     app.contextMatchesOptions(context, {only: {path:'#/mypath'}}); //=> true
    //     app.contextMatchesOptions(context, {only: {path:'#/otherpath'}}); //=> false
    //     // match against a path regexp
    //     app.contextMatchesOptions(context, /path/); //=> true
    //     app.contextMatchesOptions(context, /^path/); //=> false
    //     // match only a verb
    //     app.contextMatchesOptions(context, {only: {verb:'get'}}); //=> true
    //     app.contextMatchesOptions(context, {only: {verb:'post'}}); //=> false
    //     // match all except a verb
    //     app.contextMatchesOptions(context, {except: {verb:'post'}}); //=> true
    //     app.contextMatchesOptions(context, {except: {verb:'get'}}); //=> false
    //     // match all except a path
    //     app.contextMatchesOptions(context, {except: {path:'#/otherpath'}}); //=> true
    //     app.contextMatchesOptions(context, {except: {path:'#/mypath'}}); //=> false
    //     // match multiple paths
    //     app.contextMatchesOptions(context, {path: ['#/mypath', '#/otherpath']}); //=> true
    //     app.contextMatchesOptions(context, {path: ['#/otherpath', '#/thirdpath']}); //=> false
    //     // equivalent to
    //     app.contextMatchesOptions(context, {only: {path: ['#/mypath', '#/otherpath']}}); //=> true
    //     app.contextMatchesOptions(context, {only: {path: ['#/otherpath', '#/thirdpath']}}); //=> false
    //     // match all except multiple paths
    //     app.contextMatchesOptions(context, {except: {path: ['#/mypath', '#/otherpath']}}); //=> false
    //     app.contextMatchesOptions(context, {except: {path: ['#/otherpath', '#/thirdpath']}}); //=> true
    //
    contextMatchesOptions: function(context, match_options, positive) {
      var options = match_options
      // normalize options
      if (typeof options === 'string' || S.isRegExp(options)) {
        options = {path: options}
      }
      if (typeof positive === 'undefined') {
        positive = true
      }
      // empty options always match
      if (S.isEmptyObject(options)) {
        return true
      }
      // Do we have to match against multiple paths?
      if (S.isArray(options.path)){
        var results, numopt, opts, len
        results = []
        for (numopt = 0, len = options.path.length; numopt < len; numopt += 1) {
          opts = S.mix({}, options, {path: options.path[numopt]})
          results.push(this.contextMatchesOptions(context, opts))
        }
        var matched = S.inArray(true, results) > -1 ? true : false
        return positive ? matched : !matched
      }
      if (options.only) {
        return this.contextMatchesOptions(context, options.only, true)
      } else if (options.except) {
        return this.contextMatchesOptions(context, options.except, false)
      }
      var path_matched = true, verb_matched = true
      if (options.path) {
        if (!S.isRegExp(options.path)) {
          options.path = new RegExp(options.path.toString() + '$')
        }
        path_matched = options.path.test(context.path)
      }
      if (options.verb) {
        if(typeof options.verb === 'string') {
          verb_matched = options.verb === context.verb
        } else {
          verb_matched = options.verb.indexOf(context.verb) > -1
        }
      }
      return positive ? (verb_matched && path_matched) : !(verb_matched && path_matched)
    },

    // Delegates to the `location_proxy` to get the current location.
    // See `Sammy.DefaultLocationProxy` for more info on location proxies.
    getLocation: function() {
      return this._location_proxy.getLocation()
    },

    // Delegates to the `location_proxy` to set the current location.
    // See `Sammy.DefaultLocationProxy` for more info on location proxies.
    //
    // ### Arguments
    //
    // * `new_location` A new location string (e.g. '#/')
    //
    setLocation: function(new_location) {
      return this._location_proxy.setLocation(new_location)
    },

    // Swaps the content of `$element()` with `content`
    // You can override this method to provide an alternate swap behavior
    // for `EventContext.partial()`.
    //
    // ### Example
    //
    //      var app = $.sammy(function() {
    //
    //        // implements a 'fade out'/'fade in'
    //        this.swap = function(content, callback) {
    //          var context = this;
    //          context.$element().fadeOut('slow', function() {
    //            context.$element().html(content);
    //            context.$element().fadeIn('slow', function() {
    //              if (callback) {
    //                callback.apply();
    //              }
    //            });
    //          });
    //        };
    //
    //      });
    //
    swap: function(content, callback) {
      var $el = this.$element().html(content)
      if (S.isFunction(callback)) { callback(content) }
      return $el
    },

    // a simple global cache for templates. Uses the same semantics as
    // `Sammy.Cache` and `Sammy.Storage` so can easily be replaced with
    // a persistent storage that lasts beyond the current request.
    templateCache: function(key, value) {
      if (typeof value != 'undefined') {
        return _template_cache[key] = value
      } else {
        return _template_cache[key]
      }
    },

    // clear the templateCache
    clearTemplateCache: function() {
      return (_template_cache = {})
    },

    // This throws a '404 Not Found' error by invoking `error()`.
    // Override this method or `error()` to provide custom
    // 404 behavior (i.e redirecting to / or showing a warning)
    notFound: function(verb, path) {
      var ret = this.error(['404 Not Found', verb, path].join(' '))
      return (verb === 'get') ? ret : true
    },

    // The base error handler takes a string `message` and an `Error`
    // object. If `raise_errors` is set to `true` on the app level,
    // this will re-throw the error to the browser. Otherwise it will send the error
    // to `log()`. Override this method to provide custom error handling
    // e.g logging to a server side component or displaying some feedback to the
    // user.
    error: function(message, original_error) {
      if (!original_error) { original_error = new Error() }
      original_error.message = [message, original_error.message].join(' ')
      this.trigger('error', {message: original_error.message, error: original_error})
      if (this.raise_errors) {
        throw(original_error)
      } else {
        this.log(original_error.message, original_error)
      }
    },

    _checkLocation: function() {
      var location, returned
      // get current location
      location = this.getLocation()
      // compare to see if hash has changed
      if (!this.last_location || this.last_location[0] != 'get' || this.last_location[1] != location) {
        // reset last location
        this.last_location = ['get', location]
        // lookup route for current hash
        returned = this.runRoute('get', location)
      }
      return returned
    },

    _getFormVerb: function(form) {
      var $form = $(form), verb, $_method
      $_method = $form.all('input[name="_method"]')
      if ($_method.length > 0) { verb = $_method.val() }
      if (!verb) { verb = $form[0].getAttribute('method') }
      if (!verb || verb === '') { verb = 'get' }
      return S.trim(verb.toString().toLowerCase())
    },

    _checkFormSubmission: function(form) {
      var $form, path, verb, params, returned
      this.trigger('check-form-submission', {form: form})
      $form = $(form)
      path  = $form.attr('action') || ''
      verb  = this._getFormVerb($form)

      if (this.debug) {
        this.log('_checkFormSubmission', $form, path, verb)
      }

      if (verb === 'get') {
        params = this._serializeFormParams($form)
        if (params !== '') { path += '?' + params }
        this.setLocation(path)
        returned = false
      } else {
        params = S.mix({}, this._parseFormParams($form))
        returned = this.runRoute(verb, path, params, form.get(0))
      }
      return (typeof returned == 'undefined') ? false : returned
    },

    _serializeFormParams: function($form) {
       var queryString = "",
         fields = $form.serializeArray(),
         i
       if (fields.length > 0) {
         queryString = this._encodeFormPair(fields[0].name, fields[0].value)
         for (i = 1; i < fields.length; i++) {
           queryString = queryString + "&" + this._encodeFormPair(fields[i].name, fields[i].value)
         }
       }
       return queryString
    },

    _encodeFormPair: function(name, value){
      return _encode(name) + "=" + _encode(value)
    },

    _parseFormParams: function($form) {
      var params = {},
          form_fields = $form.serializeArray(),
          i
      for (i = 0; i < form_fields.length; i++) {
        params = this._parseParamPair(params, form_fields[i].name, form_fields[i].value)
      }
      return params
    },

    _parseQueryString: function(path) {
      var params = {}, parts, pairs, pair, i

      parts = path.match(QUERY_STRING_MATCHER)
      if (parts && parts[1]) {
        pairs = parts[1].split('&')
        for (i = 0; i < pairs.length; i++) {
          pair = pairs[i].split('=')
          params = this._parseParamPair(params, _decode(pair[0]), _decode(pair[1] || ""))
        }
      }
      return params
    },

    _parseParamPair: function(params, key, value) {
      if (typeof params[key] !== 'undefined') {
        if (S.isArray(params[key])) {
          params[key].push(value)
        } else {
          params[key] = [params[key], value]
        }
      } else {
        params[key] = value
      }
      return params
    },

    _listen: function(name, callback) {
      return this.$element().on([name, this.eventNamespace()].join('.'), callback)
    },

    _unlisten: function(name, callback) {
      return this.$element().detach([name, this.eventNamespace()].join('.'), callback)
    }
  })

  return SammyApplication

}, {
  requires: ['sammy/base', 'node', 'sizzle']
})