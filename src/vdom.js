"use strict";

var WClass = require("./class.js");
var WElement = require("./element.js");
var WWidgetElement = require("./widget.js");
var dom = require("./dom.js");
var filter = require("./filter.js");
var page = require("./page.js");

var SLICE = [].slice;

var NodeMark = dom.NodeMark;
var NodeProxy = dom.NodeProxy;

function VBody(W) {
    this.W        = W;
    this.children = [];
}

Object.assign(VBody.prototype, {
    merge: function(vbody_that) {
        var node = this.node, vbody_this = this;

        var n = Math.max(vbody_this.children.length, vbody_that.children.length);
        for (var i = 0; i < n; i++) {
            var child_vnode_this = vbody_this.children[i];
            var child_vnode_that = vbody_that.children[i];

            if (child_vnode_this === undefined) {
                node.appendChild(child_vnode_that.toNode());
                child_vnode_this = vbody_this.children[i] = child_vnode_that;
                child_vnode_this.parent = vbody_this;
                continue;
            }

            if (child_vnode_that === undefined) {
                child_vnode_this.remove();
                continue;
            }

            if (child_vnode_this.name !== child_vnode_that.name) {
                node.replaceChild(child_vnode_that.toNode(), child_vnode_this.node);
                child_vnode_this.remove();
                child_vnode_this = vbody_this.children[i] = child_vnode_that;
                child_vnode_this.parent = vbody_this;
                continue;
            }

            child_vnode_this.merge(child_vnode_that);
        }

        vbody_this.children.length = vbody_that.children.length;
    },

    remove: function() {
        for (var i = 0; i < this.children.length; i++) {
            this.children[i].remove(true);
        }

        var markBeg = this.node.markBeg, markEnd = this.node.markEnd;
        var node;
        while ((node = markBeg.nextSibling) !== markEnd) {
            node.remove();
        }
    },

    toNode: function(markBeg, markEnd) {
        var node = this.node = new NodeMark(markBeg, markEnd);

        for (var i = 0; i < this.children.length; i++) {
            var childNode = this.children[i].toNode()
            node.appendChild(childNode);
        }

        return node;
    }
});

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

Object.assign(VElement.prototype, {
    merge: function(vnodeThat) {
        var W = this.W;
        var node = this.node, vnodeThis = this;
        var diff = false;

        // Merge attributes
        for (var attrName in vnodeThis.attributes) {
            if (attrName in vnodeThat.attributes) {
                var attrValue = vnodeThat.attributes[attrName];
                if (vnodeThis.attributes[attrName] !== attrValue) {
                    node.setAttribute(attrName, attrValue);
                    diff = true;
                }
            } else {
                node.removeAttribute(attrName);
                diff = true;
            }
        }
        for (var attrName in vnodeThat.attributes) {
            if (attrName in vnodeThis.attributes) {
                continue;
            }
            node.setAttribute(attrName, vnodeThat.attributes[attrName]);
            diff = true;
        }
        vnodeThis.attributes = vnodeThat.attributes;

        // Merge events
        for (var eventName in vnodeThis.listeners) {
            node.removeEventListener(eventName);
        }
        for (var eventName in vnodeThat.listeners) {
            node.addEventListener(eventName, W._wrapListener(vnodeThat.listeners[eventName]));
        }

        // Merge children
        var n = Math.max(vnodeThis.children.length, vnodeThat.children.length);
        for (var i = 0; i < n; i++) {
            var _vnodeThis = vnodeThis.children[i];
            var _vnodeThat = vnodeThat.children[i];

            if (_vnodeThis === undefined) {
                node.appendChild(_vnodeThat.toNode());
                _vnodeThis = vnodeThis.children[i] = _vnodeThat;
                _vnodeThis.parent = vnodeThis;
                diff = true;
                continue;
            }

            if (_vnodeThat === undefined) {
                _vnodeThis.remove();
                diff = true;
                continue;
            }

            if (_vnodeThis.name !== _vnodeThat.name) {
                node.replaceChild(_vnodeThat.toNode(), _vnodeThis.node);
                _vnodeThis.remove();
                _vnodeThis = vnodeThis.children[i] = _vnodeThat;
                _vnodeThis.parent = vnodeThis;
                diff = true;
                continue;
            }

            diff = _vnodeThis.merge(_vnodeThat) || diff;
        }

        vnodeThis.children.length = vnodeThat.children.length;

        // FIXME
        if (diff && node instanceof WWidgetElement) {
            node.children.length = vnodeThis.children.length;
            var Wc = node.Wc;
            if (Wc && Wc._widget_digest) {
                Wc._widget_digest();
            }
        }

        return diff;
    },

    remove: function(clean) {
        for (var i = 0; i < this.children.length; i++) {
            this.children[i].remove(clean);
        }
        this.node.remove(clean);
    },

    toNode: function() {
        var W = this.W;
        var node = this.node = createElement(W, this.name);

        var attributes = this.attributes;
        for (var attrName in attributes) {
            node.setAttribute(attrName, attributes[attrName]);
        }

        var listeners = this.listeners;
        for (var eventName in listeners) {
            node.addEventListener(eventName, W._wrapListener(listeners[eventName]));
        }

        for (var i = 0; i < this.children.length; i++) {
            node.appendChild(this.children[i].toNode());
        }

        return node;
    }
});

function VTextNode(W, text, filters, parent) {
    this.W       = W;
    this.text    = text;
    this.filters = filters;
    this.isHTML  = filters ? filter.isHTML(filters) : false;
    this.isPure  = filters ? filter.isPure(filters) : true;
    this.parent  = parent;
    parent && parent.children.push(this);
}

Object.assign(VTextNode.prototype, {
    name: "#text",
    type: 3,

    merge: function(vnodeThat) {
        var node = this.node, vnodeThis = this;
        if (!this.isPure || vnodeThis.text !== vnodeThat.text) {
            var text = vnodeThis.text = vnodeThat.text;

            // FIXME: vnodeThis.filters != vnodeThat.filters ?
            if (vnodeThat.filters) {
                text = filter.apply(text, vnodeThat.filters);
            }

            var content = text == null ? '' : text;
            if (this.isHTML) {
                var tpl = document.createElement('template');
                tpl.innerHTML = content;
                node.content = tpl.content;
            } else {
                node.textContent = content;
            }

            return true;
        }
        return false;
    },

    remove: function(clean) {
        this.node.remove(clean);
    },

    toNode: function() {
        var content = this.filters ? filter.apply(this.text, this.filters) : this.text;
        var node = this.node = this.isHTML ? createHTMLNode(content) : createTextNode(content);
        return node;
    }
});

function createElement(W, name) {
    if (name.indexOf("-") !== -1) {
        return new WWidgetElement(W, name);
    }

    if (name === "w") {
        return new WElement(W);
    }

    return new NodeProxy(document.createElement(name));
}

function createHTMLNode(html) {
    var tpl = document.createElement('template');
    tpl.innerHTML = '<!---->' + (html == null ? '' : html) + '<!---->';
    var tplContent = tpl.content;
    return new NodeMark(tplContent.childNodes[0], tplContent.childNodes[tplContent.childNodes.length - 1]);
}

function createTextNode(text) {
    return new NodeProxy(document.createTextNode(text == null ? '' : text));
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
            scope.nbody = vbody.toNode(W.node.markBeg, W.node.markEnd);
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

        // FIXME: Very bad smell, need refactor
        /*
        if (W._new_w_elements.length) {
            var newWElements = W._new_w_elements.slice();
            W._digest_promise = new Promise(function(resolve, reject) {
                var count = newWElements.length;
                for (var i = 0; i < newWElements.length; i++) {
                    newWElements[i].initialize();
                    if (newWElements[i].Wc) {
                        newWElements[i].Wc.once("load", function() {
                            if (--count === 0) {
                                delete W._digest_promise;
                                resolve();
                            }
                        });
                    } else {
                        --count;
                    }
                }

                if (count === 0) {
                    delete W._digest_promise;
                    resolve();
                }
            });
        }
        */
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
        return new VElement(this, name, type, attributes, parent);
    },

    _createVTextNode: function(parent, text) {
        return new VTextNode(this, text, arguments.length > 2 ? SLICE.call(arguments, 2) : null, parent);
    },

    _text: function(text) {
        if (arguments.length === 1) {
            return text == null ? '' : text;
        } else {
            return filter.apply(text, SLICE.call(arguments, 1));
        }
    },

    _wrapListener: function(listener) {
        var W = this;
        return function(e) {
            W.call(listener, e).then(function(ret) {
                if (ret === undefined || ret) {
                    W.digest();
                }
            });
        };
    }
});

module.exports = {
    VBody:      VBody,
    VElement:   VElement,
    VTextNode:  VTextNode
};
