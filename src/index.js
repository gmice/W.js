"use strict";

var WClass = require("./class.js");
var conf = require("./conf.js");
var vdom = require("./vdom.js"); // FIXME: W.digest?

var W = new WClass(null, {js: conf});

if (process.browser) {
    require("./browser.js")(W, window, document);
    require("./ext/debug.js")(window.W);
}

module.exports = {
    page: require("./page.js")
};
