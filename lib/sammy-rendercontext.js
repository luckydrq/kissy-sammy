KISSY.add('sammy/rendercontext', function(S, Sammy, Node){
  var $ = Node.all
  var SammyRenderCtx = Sammy.RenderContext = function(event_context){
    this.event_context    = event_context
    this.callbacks        = []
    this.previous_content = null
    this.content          = null
    this.next_engine      = false
    this.waiting          = false
  }

  S.extend(SammyRenderCtx, {
    // The "core" of the `RenderContext` object, adds the `callback` to the
    // queue. If the context is `waiting` (meaning an async operation is happening)
    // then the callback will be executed in order, once the other operations are
    // complete. If there is no currently executing operation, the `callback`
    // is executed immediately.
    //
    // The value returned from the callback is stored in `content` for the
    // subsequent operation. If you return `false`, the queue will pause, and
    // the next callback in the queue will not be executed until `next()` is
    // called. This allows for the guaranteed order of execution while working
    // with async operations.
    //
    // If then() is passed a string instead of a function, the string is looked
    // up as a helper method on the event context.
    //
    // ### Example
    //
    //      this.get('#/', function() {
    //        // initialize the RenderContext
    //        // Even though `load()` executes async, the next `then()`
    //        // wont execute until the load finishes
    //        this.load('myfile.txt')
    //            .then(function(content) {
    //              // the first argument to then is the content of the
    //              // prev operation
    //              $('#main').html(content);
    //            });
    //      });
    //
    then: function(callback) {
      if (!S.isFunction(callback)) {
        // if a string is passed to then, assume we want to call
        // a helper on the event context in its context
        if (typeof callback === 'string' && callback in this.event_context) {
          var helper = this.event_context[callback]
          callback = function(content) {
            return helper.apply(this.event_context, [content])
          }
        } else {
          return this
        }
      }
      var context = this
      if (this.waiting) {
        this.callbacks.push(callback)
      } else {
        this.wait()
        window.setTimeout(function() {
          var returned = callback.apply(context, [context.content, context.previous_content])
          if (returned !== false) {
            context.next(returned)
          }
        }, 0)
      }
      return this
    },

    // Pause the `RenderContext` queue. Combined with `next()` allows for async
    // operations.
    //
    // ### Example
    //
    //        this.get('#/', function() {
    //          this.load('mytext.json')
    //              .then(function(content) {
    //                var context = this,
    //                    data    = JSON.parse(content);
    //                // pause execution
    //                context.wait();
    //                // post to a url
    //                $.post(data.url, {}, function(response) {
    //                  context.next(JSON.parse(response));
    //                });
    //              })
    //              .then(function(data) {
    //                // data is json from the previous post
    //                $('#message').text(data.status);
    //              });
    //        });
    wait: function() {
      this.waiting = true
    },

    // Resume the queue, setting `content` to be used in the next operation.
    // See `wait()` for an example.
    next: function(content) {
      this.waiting = false
      if (typeof content !== 'undefined') {
        this.previous_content = this.content
        this.content = content
      }
      if (this.callbacks.length > 0) {
        this.then(this.callbacks.shift())
      }
    },

    // Load a template into the context.
    // The `location` can either be a string specifying the remote path to the
    // file, a jQuery object, or a DOM element.
    //
    // No interpolation happens by default, the content is stored in
    // `content`.
    //
    // In the case of a path, unless the option `{cache: false}` is passed the
    // data is stored in the app's `templateCache()`.
    //
    // If a jQuery or DOM object is passed the `innerHTML` of the node is pulled in.
    // This is useful for nesting templates as part of the initial page load wrapped
    // in invisible elements or `<script>` tags. With template paths, the template
    // engine is looked up by the extension. For DOM/jQuery embedded templates,
    // this isnt possible, so there are a couple of options:
    //
    //  * pass an `{engine:}` option.
    //  * define the engine in the `data-engine` attribute of the passed node.
    //  * just store the raw template data and use `interpolate()` manually
    //
    // If a `callback` is passed it is executed after the template load.
    load: function(location, options, callback) {
      var context = this
      return this.then(function() {
        var should_cache, cached, is_json, location_array
        if (_isFunction(options)) {
          callback = options
          options = {}
        } else {
          options = $.extend({}, options)
        }
        if (callback) { this.then(callback) }
        if (typeof location === 'string') {
          // it's a path
          is_json      = (location.match(/\.json$/) || options.json)
          should_cache = is_json ? options.cache === true : options.cache !== false
          context.next_engine = context.event_context.engineFor(location)
          delete options.cache
          delete options.json
          if (options.engine) {
            context.next_engine = options.engine
            delete options.engine
          }
          if (should_cache && (cached = this.event_context.app.templateCache(location))) {
            return cached
          }
          this.wait()
          $.ajax($.extend({
            url: location,
            data: {},
            dataType: is_json ? 'json' : 'text',
            type: 'get',
            success: function(data) {
              if (should_cache) {
                context.event_context.app.templateCache(location, data)
              }
              context.next(data)
            }
          }, options))
          return false
        } else {
          // it's a dom/jQuery
          if (location.nodeType) {
            return location.innerHTML
          }
          if (location.selector) {
            // it's a jQuery
            context.next_engine = location.attr('data-engine')
            if (options.clone === false) {
              return location.remove()[0].innerHTML.toString()
            } else {
              return location[0].innerHTML.toString()
            }
          }
        }
      })
    },

    // Load partials
    //
    // ### Example
    //
    //      this.loadPartials({mypartial: '/path/to/partial'});
    //
    loadPartials: function(partials) {
      var name
      if(partials) {
        this.partials = this.partials || {}
        for(name in partials) {
          (function(context, name) {
            context.load(partials[name])
                   .then(function(template) {
                     this.partials[name] = template
                   })
          })(this, name)
        }
      }
      return this
    },

    // `load()` a template and then `interpolate()` it with data.
    //
    // can be called with multiple different signatures:
    //
    //      this.render(callback);
    //      this.render('/location');
    //      this.render('/location', {some: data});
    //      this.render('/location', callback);
    //      this.render('/location', {some: data}, callback);
    //      this.render('/location', {some: data}, {my: partials});
    //      this.render('/location', callback, {my: partials});
    //      this.render('/location', {some: data}, callback, {my: partials});
    //
    // ### Example
    //
    //      this.get('#/', function() {
    //        this.render('mytemplate.template', {name: 'test'});
    //      });
    //
    render: function(location, data, callback, partials) {
      if (S.isFunction(location) && !data) {
        // invoked as render(callback)
        return this.then(location)
      } else {
        if(S.isFunction(data)) {
          // invoked as render(location, callback, [partials])
          partials = callback
          callback = data
          data = null
        } else if(callback && !S.isFunction(callback)) {
          // invoked as render(location, data, partials)
          partials = callback
          callback = null
        }

        return this.loadPartials(partials)
                   .load(location)
                   .interpolate(data, location)
                   .then(callback)
      }
    },

    // `render()` the `location` with `data` and then `swap()` the
    // app's `$element` with the rendered content.
    partial: function(location, data, callback, partials) {
      if (S.isFunction(callback)) {
        // invoked as partial(location, data, callback, [partials])
        return this.render(location, data, partials).swap(callback)
      } else if (S.isFunction(data)) {
        // invoked as partial(location, callback, [partials])
        return this.render(location, {}, callback).swap(data)
      } else {
        // invoked as partial(location, data, [partials])
        return this.render(location, data, callback).swap()
      }
    },

    // defers the call of function to occur in order of the render queue.
    // The function can accept any number of arguments as long as the last
    // argument is a callback function. This is useful for putting arbitrary
    // asynchronous functions into the queue. The content passed to the
    // callback is passed as `content` to the next item in the queue.
    //
    // ### Example
    //
    //     this.send($.getJSON, '/app.json')
    //         .then(function(json) {
    //           $('#message).text(json['message']);
    //          });
    //
    //
    send: function() {
      var context = this,
          args = S.makeArray(arguments),
          fun  = args.shift()

      if (S.isArray(args[0])) { args = args[0] }

      return this.then(function(content) {
        args.push(function(response) { context.next(response) })
        context.wait()
        fun.apply(fun, args)
        return false
      })
    },

    // iterates over an array, applying the callback for each item item. the
    // callback takes the same style of arguments as `jQuery.each()` (index, item).
    // The return value of each callback is collected as a single string and stored
    // as `content` to be used in the next iteration of the `RenderContext`.
    collect: function(array, callback, now) {
      var context = this
      var coll = function() {
        if (S.isFunction(array)) {
          callback = array
          array = this.content
        }
        var contents = [], doms = false
        S.each(array, function(item, i) {
          var returned = callback.apply(context, [i, item])
          if (returned.jquery && returned.length == 1) {
            returned = returned[0]
            doms = true
          }
          contents.push(returned)
          return returned
        })
        return doms ? contents : contents.join('')
      }
      return now ? coll() : this.then(coll)
    },

    // loads a template, and then interpolates it for each item in the `data`
    // array. If a callback is passed, it will call the callback with each
    // item in the array _after_ interpolation
    renderEach: function(location, name, data, callback) {
      if (S.isArray(name)) {
        callback = data
        data = name
        name = null
      }
      return this.load(location).then(function(content) {
          var rctx = this
          if (!data) {
            data = S.isArray(this.previous_content) ? this.previous_content : []
          }
          if (callback) {
            S.each(data, function(value, i) {
              var idata = {}, engine = this.next_engine || location
              if (name) {
                idata[name] = value
              } else {
                idata = value
              }
              callback(value, rctx.event_context.interpolate(content, idata, engine))
            })
          } else {
            return this.collect(data, function(i, value) {
              var idata = {}, engine = this.next_engine || location
              if (name) {
                idata[name] = value
              } else {
                idata = value
              }
              return this.event_context.interpolate(content, idata, engine)
            }, true)
          }
      })
    },

    // uses the previous loaded `content` and the `data` object to interpolate
    // a template. `engine` defines the templating/interpolation method/engine
    // that should be used. If `engine` is not passed, the `next_engine` is
    // used. If `retain` is `true`, the final interpolated data is appended to
    // the `previous_content` instead of just replacing it.
    interpolate: function(data, engine, retain) {
      var context = this
      return this.then(function(content, prev) {
        if (!data && prev) { data = prev }
        if (this.next_engine) {
          engine = this.next_engine
          this.next_engine = false
        }
        var rendered = context.event_context.interpolate(content, data, engine, this.partials)
        return retain ? prev + rendered : rendered
      })
    },

    // Swap the return contents ensuring order. See `Application#swap`
    swap: function(callback) {
      return this.then(function(content) {
        this.event_context.swap(content, callback)
        return content
      }).trigger('changed', {})
    },

    // Same usage as `jQuery.fn.appendTo()` but uses `then()` to ensure order
    appendTo: function(selector) {
      return this.then(function(content) {
        $(selector).append(content)
      }).trigger('changed', {})
    },

    // Same usage as `jQuery.fn.prependTo()` but uses `then()` to ensure order
    prependTo: function(selector) {
      return this.then(function(content) {
        $(selector).prepend(content)
      }).trigger('changed', {})
    },

    // Replaces the `$(selector)` using `html()` with the previously loaded
    // `content`
    replace: function(selector) {
      return this.then(function(content) {
        $(selector).html(content)
      }).trigger('changed', {})
    },

    // trigger the event in the order of the event context. Same semantics
    // as `Sammy.EventContext#trigger()`. If data is omitted, `content`
    // is sent as `{content: content}`
    trigger: function(name, data) {
      return this.then(function(content) {
        if (typeof data == 'undefined') { data = {content: content} }
        this.event_context.trigger(name, data)
        return content
      });
    }

  })

  return SammyRenderCtx
}, {
  requires: ['sammy/base', 'Node']
})