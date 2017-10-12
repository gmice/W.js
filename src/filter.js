"use strict";

var WClass = require("./class.js");

var filters = {};

function Filter(fn, options) {
    var filter = function() {
        return Filter(fn.apply(null, arguments), options);
    };
    filter.fn = fn;
    Object.assign(filter, options);
    return filter;
}

function apply(text, filters) {
    for (var i = 0; i < filters.length; i++) {
        var filter = filters[i];
        if (filter) {
            text = filters[i].fn(text);
        }
    }
    return text;
}

function get(name) {
    return filters[name];
}

function isHTML(filters) {
    for (var i = 0; i < filters.length; i++) {
        var filter = filters[i];
        if (filter && filter.html) {
            return true;
        }
    }
    return false;
}

function isPure(filters) {
    for (var i = 0; i < filters.length; i++) {
        var filter = filters[i];
        if (!filter || !filter.pure) {
            return false;
        }
    }
    return true;
}

function remove(name) {
    delete filters[name];
}

function set(name, fn, options) {
    filters[name] = Filter(fn, Object.assign({html: false, pure: true}, options));
}

set("HTML", function(s){return s;}, {html: true});
set("JSON", function(s){return JSON.stringify(s);}, {pure: false});

WClass.fn.filter = function(name, fn, options) {
    if (arguments.length === 1) {
        return get(name);
    } else {
        return set(name, fn, options);
    }
};

module.exports = {
    apply:  apply,
    get:    get,
    isHTML: isHTML,
    isPure: isPure,
    remove: remove,
    set:    set
};
