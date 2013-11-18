KISSY.add('sammy/eventcontext', function(S, Sammy, SammyObject, JSON){
  var SammyEvtCtx = Sammy.EventContext = function(app, verb, path, params, target) {
    this.app    = app
    this.verb   = verb
    this.path   = path
    this.params = new SammyObject(params)
    this.target = target
  }

  S.extend(SammyEvtCtx, {
    // A shortcut to the app's `$element()`
    $element: function() {
      return this.app.$element(S.makeArray(arguments).shift())
    },

    // Look up a templating engine within the current app and context.
    // `engine` can be one of the following:
    //
    // * a function: should conform to `function(content, data) { return interpolated; }`
    // * a template path: 'template.ejs', looks up the extension to match to
    //   the `ejs()` helper
    // * a string referring to the helper: "mustache" => `mustache()`
    //
    // If no engine is found, use the app's default `template_engine`
    //
    engineFor: function(engine) {
      var context = this, engine_match
      // if path is actually an engine function just return it
      if (S.isFunction(engine)) { return engine }
      // lookup engine name by path extension
      engine = (engine || context.app.template_engine).toString()
      if ((engine_match = engine.match(/\.([^\.\?\#]+)$/))) {
        engine = engine_match[1]
      }
      // set the engine to the default template engine if no match is found
      if (engine && S.isFunction(context[engine])) {
        return context[engine]
      }

      if (context.app.template_engine) {
        return this.engineFor(context.app.template_engine)
      }
      return function(content, data) { return content }
    },

    // using the template `engine` found with `engineFor()`, interpolate the
    // `data` into `content`
    interpolate: function(content, data, engine, partials) {
      return this.engineFor(engine).apply(this, [content, data, partials])
    },

    // Create and return a `Sammy.RenderContext` calling `render()` on it.
    // Loads the template and interpolate the data, however does not actual
    // place it in the DOM.
    //
    // ### Example
    //
    //      // mytemplate.mustache <div class="name">{{name}}</div>
    //      render('mytemplate.mustache', {name: 'quirkey'});
    //      // sets the `content` to <div class="name">quirkey</div>
    //      render('mytemplate.mustache', {name: 'quirkey'})
    //        .appendTo('ul');
    //      // appends the rendered content to $('ul')
    //
    render: function(location, data, callback, partials) {
      return new Sammy.RenderContext(this).render(location, data, callback, partials)
    },

    // Create and return a `Sammy.RenderContext` calling `renderEach()` on it.
    // Loads the template and interpolates the data for each item,
    // however does not actual place it in the DOM.
    //
    // ### Example
    //
    //      // mytemplate.mustache <div class="name">{{name}}</div>
    //      renderEach('mytemplate.mustache', [{name: 'quirkey'}, {name: 'endor'}])
    //      // sets the `content` to <div class="name">quirkey</div><div class="name">endor</div>
    //      renderEach('mytemplate.mustache', [{name: 'quirkey'}, {name: 'endor'}]).appendTo('ul');
    //      // appends the rendered content to $('ul')
    //
    renderEach: function(location, name, data, callback) {
      return new Sammy.RenderContext(this).renderEach(location, name, data, callback)
    },

    // create a new `Sammy.RenderContext` calling `load()` with `location` and
    // `options`. Called without interpolation or placement, this allows for
    // preloading/caching the templates.
    load: function(location, options, callback) {
      return new Sammy.RenderContext(this).load(location, options, callback)
    },

    // create a new `Sammy.RenderContext` calling `loadPartials()` with `partials`.
    loadPartials: function(partials) {
      return new Sammy.RenderContext(this).loadPartials(partials)
    },

    // `render()` the `location` with `data` and then `swap()` the
    // app's `$element` with the rendered content.
    partial: function(location, data, callback, partials) {
      return new Sammy.RenderContext(this).partial(location, data, callback, partials)
    },

    // create a new `Sammy.RenderContext` calling `send()` with an arbitrary
    // function
    send: function() {
      var rctx = new Sammy.RenderContext(this);
      return rctx.send.apply(rctx, arguments);
    },

    // Changes the location of the current window. If `to` begins with
    // '#' it only changes the document's hash. If passed more than 1 argument
    // redirect will join them together with forward slashes.
    //
    // ### Example
    //
    //      redirect('#/other/route');
    //      // equivalent to
    //      redirect('#', 'other', 'route');
    //
    redirect: function() {
      var to, args = S.makeArray(arguments),
          current_location = this.app.getLocation(),
          l = args.length;
      if (l > 1) {
        var i = 0, paths = [], pairs = [], params = {}, has_params = false
        for (; i < l; i++) {
          if (typeof args[i] == 'string') {
            paths.push(args[i])
          } else {
            S.mix(params, args[i])
            has_params = true
          }
        }
        to = paths.join('/')
        if (has_params) {
          for (var k in params) {
            pairs.push(this.app._encodeFormPair(k, params[k]))
          }
          to += '?' + pairs.join('&')
        }
      } else {
        to = args[0]
      }
      this.trigger('redirect', {to: to})
      this.app.last_location = [this.verb, this.path]
      this.app.setLocation(to)
      if (new RegExp(to).test(current_location)) {
        this.app.trigger('location-changed')
      }
    },

    // Triggers events on `app` within the current context.
    trigger: function(name, data) {
      if (typeof data == 'undefined') { data = {} }
      if (!data.context) { data.context = this }
      return this.app.trigger(name, data)
    },

    // A shortcut to app's `eventNamespace()`
    eventNamespace: function() {
      return this.app.eventNamespace()
    },

    // A shortcut to app's `swap()`
    swap: function(contents, callback) {
      return this.app.swap(contents, callback)
    },

    // Raises a possible `notFound()` error for the current path.
    notFound: function() {
      return this.app.notFound(this.verb, this.path)
    },

    // Default JSON parsing uses jQuery's `parseJSON()`. Include `Sammy.JSON`
    // plugin for the more conformant "crockford special".
    json: function(string) {
      return JSON.parse(string)
    },

    // //=> Sammy.EventContext: get #/ {}
    toString: function() {
      return "Sammy.EventContext: " + [this.verb, this.path, this.params].join(' ')
    }

  })

  return SammyEvtCtx
}, {
  requires: ['sammy/base', 'sammy/object', 'json']
})