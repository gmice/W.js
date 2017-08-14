"use strict";

require("es6-promise").polyfill();

var idSeq = 1;

function W(parent, props) {
    this.id     = idSeq++;
    this.parent = parent;

    var children = [];
    Object.defineProperty(this, "children", {
        get: function() { return children.slice(); }
    });

    this.addChild = function(child) {
        children.push(child);
    };

    this.removeChild = function(child) {
        var index = children.indexOf(child);
        if (index !== -1) {
            children.splice(index, 1);
        }
    };

    parent && parent.addChild(this);
    props  && Object.assign(this, props);
}

W.fn = W.prototype.fn = W.prototype;

module.exports = W;
