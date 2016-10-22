"use strict";

function NodeMark(W, markBeg, markEnd) {
    this.W       = W;
    this.markBeg = markBeg;
    this.markEnd = markEnd;
}

Object.defineProperty(NodeMark.prototype, 'content', {
    set: function(content) {
        var node;
        while ((node = this.markBeg.nextSibling) !== this.markEnd) {
            node.remove();
        }
        this.markBeg.parentNode.insertBefore(content, this.markEnd);
    },
    enumerable: true,
    configurable: false
});

Object.assign(NodeMark.prototype, {
    appendChild: function(node) {
        var parentNode = this.markBeg.parentNode;
        node.markBeg && parentNode.insertBefore(node.markBeg, this.markEnd);
        parentNode.insertBefore(node.target, this.markEnd);
        node.markEnd && parentNode.insertBefore(node.markEnd, this.markEnd);
    },

    replaceChild: function(new_child, old_child) {
        if (new_child.markBeg || old_child.markBeg) {
            throw "Not Implemented";
        }
        this.markBeg.parentNode.replaceChild(new_child.target, old_child.target);
    }
});

function NodeProxy(W, target) {
    this.W         = W;
    this.target    = target;
    this.listeners = {};
}

Object.defineProperty(NodeProxy.prototype, 'textContent', {
    get: function() { return this.target.textContent; },
    set: function(textContent) { this.target.textContent = textContent; },
    enumerable: true,
    configurable: false
});

Object.assign(NodeProxy.prototype, {
    addEventListener: function(event, listener) {
        var W = this.W, listeners = this.listeners;
        if (!(event in listeners)) {
            this.target.addEventListener(event, function(e) {
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
        listeners[event] = listener;
    },

    appendChild: function(node) {
        var parentNode = this.target;
        node.markBeg && parentNode.appendChild(node.markBeg);
        parentNode.appendChild(node.target);
        node.markBeg && parentNode.appendChild(node.markEnd);
    },

    remove: function(clean) {
        if (!clean) {
            if (this.target.remove) {
                this.target.remove();
            } else {
                var markBeg = this.target.markBeg, markEnd = this.target.markEnd;
                var node;
                while ((node = markBeg.nextSibling) !== markEnd) {
                    node.remove();
                }
            }
        }
    },

    removeAttribute: function(attrName) {
        this.target.removeAttribute(attrName);
    },

    removeEventListener: function(event, listener) {
        this.listeners[event] = null;
    },

    replaceChild: function(new_child, old_child) {
        var parentNode = this.target;
        if (old_child.markBeg || new_child.markBeg) {
            var mark = old_child.markBeg || old_child.target;
            if (new_child.markBeg) {
                parentNode.insertBefore(new_child.markBeg, mark);
                parentNode.insertBefore(new_child.target, mark);
                parentNode.insertBefore(new_child.markEnd, mark);
            } else {
                parentNode.insertBefore(new_child.target, mark);
            }
            old_child.remove();
            return;
        }
        this.target.replaceChild(new_child.target, old_child.target);
    },

    setAttribute: function(attrName, attrValue) {
        var isProp = (attrName === "value" && attrName in this.target); // FIXME: 支持其他属性
        if (isProp) {
            var value = (attrValue == null || attrValue === false) ? null : attrValue;
            if (this.target.hasAttribute(attrName)) {
                if (this.target[attrName] !== value) {
                    this.target[attrName] = value;
                }
            } else {
                if (value != null && value !== false) {
                    this.target.setAttribute(attrName, attrValue);
                }
            }
            return;
        }

        if (attrValue == null || attrValue === false) {
            this.target.removeAttribute(attrName);
        } else {
            this.target.setAttribute(attrName, attrValue);
        }
    }
});

module.exports = {
    NodeMark:   NodeMark,
    NodeProxy:  NodeProxy
};
