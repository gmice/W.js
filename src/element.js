"use strict";

var WClass = require("./class.js");
var Page = require("./page.js");

var CACHE = {};

function WElement(W) {
    this.W          = W;
    this.attributes = {};
    this.children   = [];
    this.listeners  = {};
    this.mark_beg   = document.createComment('');
    this.mark_end   = document.createComment('');

    var _target = document.createDocumentFragment();
    var self = this;
    Object.defineProperty(this, 'target', {
        get: function() {
            if (this.target_mark_beg === undefined) {
                for (var i = 0; i < self.children.length; i++) {
                    var child = self.children[i];
                    child.mark_beg && _target.appendChild(child.mark_beg);
                    _target.appendChild(child.target);
                    child.mark_end && _target.appendChild(child.mark_end);
                }
            }
            return _target;
        }
    });
}

Object.assign(WElement.prototype, {
    addEventListener: function(event, listener) {
        var W = this.W, listeners = this.listeners;
        listeners[event] = listener;

        var node = this;
        if (node.Wc) {
            node.Wc.on(event, function(e) {
                var listener = listeners[event];
                if (listener) {
                    W.call(listener, e).then(function(ret) {
                        if (ret === undefined || ret) {
                            W.digest();
                        }
                    });
                }
            });
        }
    },

    appendChild: function(node) {
        this.children.push(node);
        var mark_end = this.target_mark_end || this.mark_end;
        if (mark_end.parentNode) {
            if (node.mark_beg || node.mark_end) {
                throw "Not Implemented";
            }
            mark_end.parentNode.insertBefore(node.target, mark_end);
        }
    },

    remove: function(clean) {
        if (this.target_mark_beg) {
            clean = false;
            var entry = CACHE[this.attributes['name']];
            if (entry.source === this) {
                delete entry.source;
            }
        }

        for (var i = 0; i < this.children.length; i++) {
            this.children[i].remove(clean);
        }

        var node = this;
        if (node.Wc) {
            node.Wc.destroy();
            node.Wc = undefined;
        }
    },

    removeAttribute: function(attr_name) {
        delete this.attributes[attr_name];
    },

    removeEventListener: function(event, listener) {
        delete this.listeners[event];
    },

    replaceChild: function(newChild, oldChild) {
        var i = this.children.indexOf(oldChild);
        if (i === -1) {
            return;
        }
        this.children[i] = newChild;
        var mark_end = this.target_mark_end || this.mark_end;
        if (mark_end.parentNode) {
            if (newChild.mark_beg || newChild.mark_end) {
                throw "Not Implemented";
            }
            mark_end.parentNode.replaceChild(newChild.target, oldChild.target);
        }
    },

    setAttribute: function(attr_name, attr_value) {
        this.attributes[attr_name] = attr_value;

        if (attr_name === "href") {
            var node = this;

            if (node.Wc) {
                node.Wc.destroy();
                node.Wc = undefined;
            }

            if (attr_value) {
                // if (attr_value[0] === "#") {
                //     attr_value = attr_value.substring(1);
                //     var entry = CACHE[attr_value];
                //     if (entry === undefined) {
                //         entry = CACHE[attr_value] = { target: this };
                //     } else {
                //         if (entry.target && entry.target !== this) {
                //             throw "Duplicated <w href=\"#" + attr_value + "\">";
                //         }
                //         entry.target = this;
                //         if (entry.source) {
                //             debugger;
                //         }
                //     }
                //     return;
                // }

                // FIXME
                var Wc = node.Wc = new WClass(node.W, {node: node});

                // FIXME
                for (var event in node.listeners) {
                    Wc.on(event, function(e) {
                        var listener = listeners[event];
                        if (listener) {
                            node.W.call(listener, e).then(function(ret) {
                                if (ret === undefined || ret) {
                                    node.W.digest();
                                }
                            });
                        }
                    });
                }

                var href = attr_value, index = href.indexOf("?");
                if (index !== -1) {
                    Wc._params = {};
                    var parts = href.substring(index + 1).split("&");
                    for (var i = 0; i < parts.length; i++) {
                        var pair = parts[i].split("=");
                        Wc._params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
                    }

                    href = href.substring(0, index);
                }
                Page.load(href).then(function(page) {
                    Wc.load(page);
                });
            }
            return;
        }

        // if (attr_name === "name") {
        //     var entry = CACHE[attr_value];
        //     if (entry === undefined) {
        //         entry = CACHE[attr_value] = { source: this };
        //     } else {
        //         if (entry.source && entry.source !== this) {
        //             throw "Duplicated <w name=\"" + attr_value + "\">";
        //         }
        //         entry.source = this;
        //         if (entry.target) { // FIXME
        //             this.target_mark_beg = entry.target.mark_beg;
        //             this.target_mark_end = entry.target.mark_end;
        //         }
        //     }
        // }
    }
});

module.exports = WElement;