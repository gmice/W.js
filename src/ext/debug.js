"use strict";

module.exports = function(W) {
    W.to = function(selector) {
        var elem;
        if (typeof selector === "string") {
            elem = document.querySelector(selector);
        } else if (selector instanceof HTMLElement) {
            elem = selector;
        } else {
            return;
        }

        var elem = document.querySelectorAll(selector);
        var result = [];

        if (elems.length) {
            var parent = W._nbody.mark_beg.parentNode;

            loop:
            for (var i = 0; i < elems.length; i++) {
                var elem = elems[i];
                if (parent.contains(elem)) {
                    for (var node = W._nbody.mark_beg.nextSibling; node !== W._nbody.mark_end; node = node.nextSibling) {
                        if (node.nodeType !== 1) continue;
                        if (node.contains(elem)) {
                            result.push(elem);
                            continue loop;
                        }
                    }
                }
            }
        }
        return result;
    };
};
