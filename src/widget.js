var WClass = require("./class.js");

function WWidgetElement(W, name) {
    this.W          = W;
    this.name       = name;
    this.attributes = {};
    this.children   = [];
    this.listeners  = {};
    this.markBeg    = document.createComment("");
    this.markEnd    = document.createComment("");
    this.target     = document.createDocumentFragment();

    var scope = W.scope;
    if (scope.imports && scope.imports[name]) {
        var widget = scope.imports[name];
        var Wc = this.Wc = new WClass(W, {node: this});
        scope.promises.push(Wc.load(widget));
        return;
    }

    // TODO: fallback?
    throw "Widget "+this.name+" is not imported";
}

Object.assign(WWidgetElement.prototype, {
    addEventListener: function(event, listener) {
        var W = this.W;
        this.listeners[event] = function(e) {
            return new Promise(function(resolve, reject) {
                W.call(listener, e).then(function() {
                    resolve();
                    W.digest();
                });
            });
        };
    },

    appendChild: function(node) {
        this.children.push(node);
    },

    remove: function(clean) {
        if (this.Wc) {
            this.Wc.destroy();
            this.Wc = undefined;
        }
    },

    removeAttribute: function(attrName) {
        delete this.attributes[attrName];
    },

    removeEventListener: function(event, listener) {
        delete this.listeners[event];
    },

    setAttribute: function(attrName, attrValue) {
        this.attributes[attrName] = attrValue;
    }
});

module.exports = WWidgetElement;
