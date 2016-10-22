"use strict";

var WClass = require("./class.js");
var Page   = require("./page.js");

var WGlobal;

function load(document, template) {
    var markBeg = document.createComment("");
    var markEnd = document.createComment("");
    template.parentNode.insertBefore(markBeg, template);
    template.parentNode.insertBefore(markEnd, template);
    template.remove();

    var W = new WClass(WGlobal, {
        node: {
            markBeg: markBeg,
            markEnd: markEnd
        }
    });

    var href = template.getAttribute("w-app");
    if (href) {
        Page.load(href).then(function(page) {
            W.load(page);
        });
        return;
    }

    var page = Page.compile(template.innerHTML);
    W.load(page);
}

function loadInner(document, selector, content) {
    var element = document.querySelector(selector);
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }

    var markBeg = document.createComment("");
    var markEnd = document.createComment("");
    element.appendChild(markBeg);
    element.appendChild(markEnd);

    var W = new WClass(WGlobal, {
        node: {
            markBeg: markBeg,
            markEnd: markEnd
        }
    });
    var page = Page.compile(content);

    W.load(page);

    return W;
}

module.exports = function(W, window, document) {
    WGlobal = window.W = W;
    WGlobal.js = Object.assign(
        function(selector, content) {
            return loadInner(document, selector, content);
        },
        WGlobal.js, {
            definePage: Page.define,
            reloadPage: Page.reload
        }
    );

    document.addEventListener("DOMContentLoaded", function() {
        var templates = document.querySelectorAll("template[w-app]");
        for (var i = 0; i < templates.length; i++) {
            load(document, templates[i]);
        }
    }, false);
};
