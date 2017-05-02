"use strict";

var WClass = require("./class.js");
var filter = require("./filter.js");
var Page = require("./page.js");

var SLICE = [].slice;

function createAppendCursor(parent) {
    return function(node) {
        parent.appendChild(node);
    };
}

function createInsertBeforeCursor(ref) {
    var parent = ref.parentNode;
    return function(node) {
        parent.insertBefore(node, ref);
    };
}

// ============================================================================
// VNode
function VNode() {}
var abstract = function() { throw 'abstract'; };
Object.assign(VNode.prototype, {
    attach:  abstract,
    detach:  abstract,
    merge:   abstract,
    replace: abstract
});

// ============================================================================
// VBody
function VBody(W) {
    this.W        = W;
    this.children = [];
}

VBody.prototype = new VNode();
Object.assign(VBody.prototype, {
    attach: function(cursor) {
        this.cursor = cursor;
        for (var i = 0; i < this.children.length; i++) {
            this.children[i].attach(cursor);
        }
    },

    detach: function() {
        // FIXME: better way? for performance
        for (var i = 0; i < this.children.length; i++) {
            this.children[i].detach();
        }
    },

    merge: function(that) {
        var n = Math.max(this.children.length, that.children.length);
        for (var i = 0; i < n; i++) {
            var _this = this.children[i];
            var _that = that.children[i];

            if (_this === undefined) {
                _this = this.children[i] = _that;
                _this.parent = this;
                _this.attach(this.cursor);
                continue;
            }

            if (_that === undefined) {
                _this.detach();
                continue;
            }

            if (_this.name !== _that.name) {
                _this.replace(_that);
                _this = this.children[i] = _that;
                _this.parent = this;
                continue;
            }

            _this.merge(_that);
        }

        this.children.length = that.children.length;
    }
});

// ============================================================================
// VElement
function VElement(W, name, type, attributes, parent) {
    this.W          = W;
    this.name       = name;
    this.type       = type;
    this.attributes = attributes;
    this.children   = [];
    this.listeners  = {};
    this.parent     = parent;
    parent && parent.children.push(this);
}

VElement.prototype = new VNode();
Object.assign(VElement.prototype, {
    attach: function(cursor) {
        var W = this.W;
        var node = this.node = document.createElement(this.name);
        cursor(node);

        if (this.ref) {
            this.ref.set(node);
        }

        var attributes = this.attributes;
        for (var attrName in attributes) {
            var attrValue = attributes[attrName];
            if (attrValue != null) {
                node.setAttribute(attrName, attributes[attrName]);
            }
        }

        var listeners = this.listeners;
        for (var event in listeners) {
            node.addEventListener(event, wrapListener(W, this, event));
        }

        if (this.children.length) {
            var _cursor = createAppendCursor(node);
            for (var i = 0; i < this.children.length; i++) {
                this.children[i].attach(_cursor);
            }
        }
    },

    detach: function() {
        if (this.node) {
            if (this.ref) {
                this.ref.del();
            }
            // TODO: recursive detach?
            this.node.remove();
            this.node = null;
        }
    },

    merge: function(that) {
        var W = this.W;
        var node = this.node;

        // Merge attributes
        for (var attrName in this.attributes) {
            if (attrName in that.attributes) {
                var attrValue = that.attributes[attrName];
                if (this.attributes[attrName] !== attrValue) {
                    var isProp = (attrName === "value" && attrName in node); // FIXME: Support more properties
                    if (isProp) {
                        var value = (attrValue == null || attrValue === false) ? null : attrValue;
                        if (node.hasAttribute(attrName)) {
                            if (node[attrName] !== value) {
                                node[attrName] = value;
                            }
                        } else {
                            if (value != null && value !== false) {
                                node.setAttribute(attrName, attrValue);
                            }
                        }
                    } else {
                        if (attrValue == null || attrValue === false) {
                            node.removeAttribute(attrName);
                        } else {
                            node.setAttribute(attrName, attrValue);
                        }
                    }
                }
            } else {
                node.removeAttribute(attrName);
            }
        }
        for (var attrName in that.attributes) {
            if (attrName in this.attributes) {
                continue;
            }
            var attrValue = that.attributes[attrName];
            if (attrValue == null || attrValue === false) {
                node.removeAttribute(attrName);
            } else {
                node.setAttribute(attrName, attrValue);
            }
        }
        this.attributes = that.attributes;

        // Merge events
        for (var event in that.listeners) {
            if (event in this.listeners) {
                continue;
            }
            node.addEventListener(event, wrapListener(W, this, event));
        }
        this.listeners = that.listeners;

        // Merge children
        var cursor;
        var n = Math.max(this.children.length, that.children.length);
        for (var i = 0; i < n; i++) {
            var _this = this.children[i];
            var _that = that.children[i];

            if (_this === undefined) {
                cursor = cursor || createAppendCursor(node);
                _this = this.children[i] = _that;
                _this.parent = this;
                _this.attach(cursor);
                continue;
            }

            if (_that === undefined) {
                _this.detach();
                continue;
            }

            if (_this.name !== _that.name) {
                _this.replace(_that);
                _this = this.children[i] = _that;
                _this.parent = this;
                continue;
            }

            _this.merge(_that);
        }

        this.children.length = that.children.length;
    },

    replace: function(that) {
        that.attach(createInsertBeforeCursor(this.node));
        this.detach(); // FIXME: ref?
    }
});

// ============================================================================
// VTextNode
function VTextNode(W, text, filters, parent) {
    this.W       = W;
    this.text    = text;
    this.filters = filters;
    this.isPure  = filters ? filter.isPure(filters) : true;
    this.parent  = parent;
    parent && parent.children.push(this);
}

Object.assign(VTextNode.prototype, {
    name: "#text",
    type: 3,

    attach: function(cursor) {
        var content = this.filters ? filter.apply(this.text, this.filters) : this.text;
        var node = this.node = createTextNode(content);
        cursor(node);
    },

    detach: function() {
        this.node.remove();
        this.node = null;
    },

    merge: function(that) {
        if (!this.isPure || this.text !== that.text) {
            var text = this.text = that.text;

            // FIXME: this.filters != that.filters ?
            if (that.filters) {
                text = filter.apply(text, that.filters);
            }

            var content = text == null ? '' : text;
            this.node.textContent = content;
        }
    },

    replace: function(that) {
        that.attach(createInsertBeforeCursor(this.node));
        this.detach();
    }
});

// ============================================================================
// VHTMLNode
function VHTMLNode(W, html, filters, parent) {
    this.W       = W;
    this.html    = html;
    this.filters = filters;
    this.isPure  = filters ? filter.isPure(filters) : true;
    this.parent  = parent;
    parent && parent.children.push(this);
}

Object.assign(VHTMLNode.prototype, {
    name: "#document-fragment",
    type: 11,

    attach: function(cursor) {
        var html = this.filters ? filter.apply(this.html, this.filters) : this.html;
        var node = createTemplate(html);
        this.markBeg = node.content.firstChild;
        this.markEnd = node.content.lastChild;
        cursor(node.content);
    },

    merge: function(that) {
        if (!this.isPure || this.html !== that.html) {
            var html = this.html = that.html;

            // FIXME: this.filters != that.filters ?
            if (that.filters) {
                html = filter.apply(html, that.filters);
            }

            var tpl = createTemplate(html);
            var markBeg = tpl.content.firstChild;
            var markEnd = tpl.content.lastChild;
            this.markBeg.parentNode.insertBefore(tpl.content, this.markBeg);

            var node;
            while ((node = this.markEnd.previousSibling) !== this.markBeg) {
                node.remove();
            }
            this.markBeg.remove();
            this.markEnd.remove();

            this.markBeg = markBeg;
            this.markEnd = markEnd;
        }
    }
});

// ============================================================================
// WElement
function WElement(W, attributes, parent) {
    this.W          = W;
    this.attributes = attributes;
    this.children   = [];
    this.parent     = parent;
    parent && parent.children.push(this);
}

WElement.prototype = new VNode();

Object.assign(WElement.prototype, {
    type: 1,

    attach: function(cursor) {
        cursor(this.markBeg || (this.markBeg = document.createComment("")));
        cursor(this.markEnd || (this.markEnd = document.createComment("")));

        if ("href" in this.attributes) {
            this._load(this.attributes.href);
            return;
        }

        if (this.children.length) {
            for (var i = 0; i < this.children.length; i++) {
                this.children[i].attach(cursor);
            }
        }
    },

    detach: function() {
        if (this.Wc) {
            this.Wc.destroy();
            this.Wc = null;
        }

        if (this.children.length) {
            for (var i = 0; i < this.children.length; i++) {
                this.children[i].detach();
            }
        }

        this.markBeg.remove();
        this.markEnd.remove();
    },

    merge: function(that) {
        if ("href" in this.attributes) {
            if (this.attributes.href !== that.attributes.href) {
                this._load(that.attributes.href);
            }
            this.attributes = that.attributes;
            return;
        }
        this.attributes = that.attributes;

        // Merge children
        var cursor;
        var n = Math.max(this.children.length, that.children.length);
        for (var i = 0; i < n; i++) {
            var _this = this.children[i];
            var _that = that.children[i];

            if (_this === undefined) {
                cursor = cursor || createInsertBeforeCursor(this.markEnd);
                _this = this.children[i] = _that;
                _this.parent = this;
                _this.attach(cursor);
                continue;
            }

            if (_that === undefined) {
                _this.detach();
                continue;
            }

            if (_this.name !== _that.name) {
                _this.replace(_that);
                _this = this.children[i] = _that;
                _this.parent = this;
                continue;
            }

            _this.merge(_that);
        }

        this.children.length = that.children.length;
    },

    _load: function(href) {
        if (this.Wc) {
            this.Wc.destroy();
            this.Wc = null;
        }

        if (!href) {
            return;
        }

        var W = this.W;

        // FIXME
        var Wc = this.Wc = new WClass(W, {node: this});

        // FIXME
        var listeners = this.listeners;
        for (var event in listeners) {
            Wc.on(event, wrapListener(W, this, event));
        }

        var index = href.indexOf("?");
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
});

// ============================================================================
// WWidgetElement
function WWidgetElement(W, name, attributes, parent) {
    this.W          = W;
    this.name       = name;
    this.attributes = attributes;
    this.children   = [];
    this.listeners  = {};
    this.parent     = parent;
    parent && parent.children.push(this);
}

WWidgetElement.prototype = new VNode();

Object.assign(WWidgetElement.prototype, {
    type: 1,

    attach: function(cursor) {
        cursor(this.markBeg = document.createComment(""));
        cursor(this.markEnd = document.createComment(""));

        var W = this.W;
        var name = this.name;
        var scope = W.scope;
        if (scope.imports && scope.imports[name]) {
            var widget = this.widget = scope.imports[name];
            var Wc = this.Wc = new WClass(W, {node: this});
            scope.promises.push(Wc.load(widget)); // FIXME
            return;
        }

        // TODO: fallback?
        throw "widget "+name+" is not imported";
    },

    detach: function() {
        if (this.Wc) {
            this.Wc.destroy();
            this.Wc = null;
        }
    },

    merge: function(that) {
        var W = this.W;
        var node = this.node;
        var diff = false;

        // Merge attributes
        for (var attrName in this.attributes) {
            if (attrName in that.attributes) {
                var attrValue = that.attributes[attrName];
                if (this.attributes[attrName] !== attrValue) {
                    diff = true;
                    break;
                }
            } else {
                diff = true;
                break;
            }
        }
        for (var attrName in that.attributes) {
            if (attrName in this.attributes) {
                continue;
            }
            diff = true;
            break;
        }
        this.attributes = that.attributes;

        // Merge events
        this.listeners = that.listeners;

        // Merge children
        this.children = that.children;

        if (diff) {
            var Wc = this.Wc;
            if (Wc && Wc._widget_digest) {
                Wc._widget_digest();
            }
        }
    }
});

function createTemplate(html) {
    var tpl = document.createElement('template');
    tpl.innerHTML = '<!---->' + (html == null ? '' : html) + '<!---->';
    return tpl;
}

function createTextNode(text) {
    return document.createTextNode(text == null ? '' : text);
}

function clearText(node) {
    if (node.type === 3) {
        node.text = null;
        return;
    }

    if (node.children) {
        for (var i = 0; i < node.children.length; i++) {
            clearText(node.children[i]);
        }
    }
}

function wrapListener(W, vnode, event) {
    var fn = function(e) {
        var listener = vnode.listeners[event];
        if (listener) {
            W.call(listener, e).then(function(ret) {
                if (ret === undefined || ret) {
                    W.digest();
                }
            });
        } else {
            this.removeEventListener(event, fn);
        }
    };
    return fn;
}

Object.assign(WClass.fn, {
    digest: function(options) {
        var W = this, scope = W.scope;

        if (scope == null) {
            return Promise.resolve();
        }

        var vbody = new VBody(W);

        if (options && options.clearText && scope.mbody) {
            clearText(scope.mbody);
        }

        // Render new virtual DOM
        scope.render(vbody);

        scope.promises = [];

        if (scope.mbody === undefined) {
            // First time
            // 1. Create actual DOM elements
            // 2. Attach actual DOM elements to virtual DOM elements, make virtual DOM mirror of actual DOM
            scope.mbody = vbody;
            vbody.attach(createInsertBeforeCursor(W.node.markEnd));
        } else {
            // Not first time
            // Merge modification of virtual DOM to actual DOM
            scope.mbody.merge(vbody);
        }

        if (scope.promises.length) {
            return Promise.all(scope.promises);
        }
        delete scope.promises;

        return Promise.resolve();
    },

    digestAll: function(options) {
        options = Object.assign({
            clearText: false
        }, options);

        var remains = window.W.children;
        while (remains.length) {
            var W = remains.shift();
            W.digest(options);
            remains = remains.concat(W.children);
        }
    },

    _createVElement: function(parent, name, type, attributes) {
        if (name === "w") {
            return new WElement(this, attributes, parent);
        }

        if (name.indexOf("-") !== -1) {
            return new WWidgetElement(this, name, attributes, parent);
        }

        return new VElement(this, name, type, attributes, parent);
    },

    // FIXME: rename
    _createVTextNode: function(parent, text) {
        if (arguments.length > 2) {
            var filters = SLICE.call(arguments, 2);
            if (filter.isHTML(filters)) {
                return new VHTMLNode(this, text, filters, parent);
            } else {
                return new VTextNode(this, text, filters, parent);
            }
        } else {
            return new VTextNode(this, text, null, parent);
        }
    },

    _text: function(text) {
        if (arguments.length === 1) {
            return text == null ? '' : text;
        } else {
            return filter.apply(text, SLICE.call(arguments, 1));
        }
    }
});

module.exports = {
    VBody:      VBody,
    VElement:   VElement,
    VTextNode:  VTextNode
};
