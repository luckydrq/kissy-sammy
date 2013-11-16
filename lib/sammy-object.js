KISSY.add('sammy/object', function(S, Sammy){
  var _escapeHTML = function(s) {
    return String(s).replace(/&(?!\w+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  var SammyObject = function(obj){
    return S.mix(this, obj || {})
  }

  S.extend(SammyObject, {
    // Escape HTML in string, use in templates to prevent script injection.
    // Also aliased as `h()`
    escapeHTML: _escapeHTML,
    h: _escapeHTML,

    // Returns a copy of the object with Functions removed.
    toHash: function() {
      var json = {}
      S.each(this, function(v,k) {
        if (!S.isFunction(v)) {
          json[k] = v
        }
      })
      return json
    },

    // Renders a simple HTML version of this Objects attributes.
    // Does not render functions.
    // For example. Given this Sammy.Object:
    //
    //     var s = new Sammy.Object({first_name: 'Sammy', last_name: 'Davis Jr.'});
    //     s.toHTML()
    //     //=> '<strong>first_name</strong> Sammy<br /><strong>last_name</strong> Davis Jr.<br />'
    //
    toHTML: function() {
      var display = ""
      S.each(this, function(v, k) {
        if (!S.isFunction(v)) {
          display += "<strong>" + k + "</strong> " + v + "<br />"
        }
      })
      return display
    },

    // Returns an array of keys for this object. If `attributes_only`
    // is true will not return keys that map to a `function()`
    keys: function(attributes_only) {
      var keys = []
      for (var property in this) {
        if (!S.isFunction(this[property]) || !attributes_only) {
          keys.push(property)
        }
      }
      return keys
    },

    // Checks if the object has a value at `key` and that the value is not empty
    has: function(key) {
      return this[key] && S.trim(this[key].toString()) !== ''
    },

    // convenience method to join as many arguments as you want
    // by the first argument - useful for making paths
    join: function() {
      var args = S.makeArray(arguments)
      var delimiter = args.shift()
      return args.join(delimiter)
    },

    // Shortcut to Sammy.log
    log: function() {
      Sammy.log.apply(Sammy, arguments);
    },

    // Returns a string representation of this object.
    // if `include_functions` is true, it will also toString() the
    // methods of this object. By default only prints the attributes.
    toString: function(include_functions) {
      var s = []
      S.each(this, function(v, k) {
        if (!S.isFunction(v) || include_functions) {
          s.push('"' + k + '": ' + v.toString())
        }
      });
      return "Sammy.Object: {" + s.join(',') + "}"
    }

  })

  Sammy.Object = SammyObject

  return SammyObject

}, {
  requires: ['sammy/base']
})