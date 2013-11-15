KISSY.add('sammy/base', function(S, Application, Node){
  var loggers = []

  var Sammy = function() {
    var args = S.makeArray(arguments), app, selector
    Sammy.apps = Sammy.apps || {}

    if (args.length === 0 || args[0] && S.isFunction(args[0])) { // Sammy()
      return Sammy.apply(Sammy, ['body'].concat(args))
    } else if (typeof (selector = args.shift()) == 'string') { // Sammy('#main')
      app = Sammy.apps[selector] || new Application()
      app.element_selector = selector
      if (args.length > 0) {
        S.each(args, function(plugin, i) {
          app.use(plugin)
        })
      }
      // if the selector changes make sure the reference in Sammy.apps changes
      if (app.element_selector != selector) {
        delete Sammy.apps[selector]
      }
      Sammy.apps[app.element_selector] = app
      return app
    }
  }

  S.mix(Sammy, {
    VERSION: '0.7.4',

    // Add to the global logger pool. Takes a function that accepts an
    // unknown number of arguments and should print them or send them somewhere
    // The first argument is always a timestamp.
    addlogger: function(logger){
      loggers.push(logger)
    },

    log: function(){
      var args = S.makeArray(arguments)
      args.unshift("[" + Date() + "]")
      S.each(loggers, function(logger, i) {
        logger.apply(Sammy, args);
      })
    },

    targetIsThisWindow: function(event){
      var targetWindow = Node(event.target).attr('target')
      if ( !targetWindow || targetWindow === window.name || targetWindow === '_self' ) { return true }
      if ( targetWindow === '_blank' ) { return false }
      if ( targetWindow === 'top' && window === window.top ) { return true }
      return false
    },

    makeArray: S.makeArray,

    isFunction: S.isFunction,

    isArray: S.isArray

  })

  Sammy.addlogger(function(){
    S.log(arguments)
  })

  return Sammy

}, {
  requires: ['sammy/app','node']
})