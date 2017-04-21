"use strict";

function NodeMark(markBeg, markEnd) {
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
    addEventListener: function(event, listener) {
        throw 'Unsupported';
    },

    appendChild: function(node) {
        var parentNode = this.markBeg.parentNode;
        node.markBeg && parentNode.insertBefore(node.markBeg, this.markEnd);
        parentNode.insertBefore(node.target, this.markEnd);
        node.markEnd && parentNode.insertBefore(node.markEnd, this.markEnd);
    },

    remove: function() {
        throw 'Unsupported';
    },

    removeAttribute: function(attrName) {
        throw 'Unsupported';
    },

    removeEventListener: function(event) {
        throw 'Unsupported';
    },

    replaceChild: function(newChild, oldChild) {
        if (newChild.markBeg || oldChild.markBeg) {
            throw 'Not Implemented';
        }
        this.markBeg.parentNode.replaceChild(newChild.target, oldChild.target);
    },

    setAttribute: function(attrName, attrValue) {
        throw 'Unsupported';
    }
});

function NodeProxy(target) {
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
        var listeners = this.listeners;
        if (listeners[event] === undefined) {
            this.target.addEventListener(event, function() {
                var listener = listeners[event];
                if (listener) {
                    return listener.apply(this, arguments);
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

    // remove: function(clean) {
    //     if (!clean) {
    //         if (this.target.remove) {
    //             this.target.remove();
    //         } else {
    //             var markBeg = this.target.markBeg, markEnd = this.target.markEnd;
    //             var node;
    //             while ((node = markBeg.nextSibling) !== markEnd) {
    //                 node.remove();
    //             }
    //         }
    //     }
    // },

    remove: function() {
        this.target.remove();
    },

    removeAttribute: function(attrName) {
        this.target.removeAttribute(attrName);
    },

    removeEventListener: function(event) {
        this.listeners[event] = undefined;
    },

    replaceChild: function(newChild, oldChild) {
        var parentNode = this.target;
        if (oldChild.markBeg || newChild.markBeg) {
            var mark = oldChild.markBeg || oldChild.target;
            if (newChild.markBeg) {
                parentNode.insertBefore(newChild.markBeg, mark);
                parentNode.insertBefore(newChild.target, mark);
                parentNode.insertBefore(newChild.markEnd, mark);
            } else {
                parentNode.insertBefore(newChild.target, mark);
            }
            oldChild.remove();
            return;
        }
        this.target.replaceChild(newChild.target, oldChild.target);
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
