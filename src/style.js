"use strict";

var postcss = require("postcss");
var parser = require("postcss-selector-parser");

function transform(css, styleAttr) {
    styleAttr = styleAttr.replace(":", "\\:");
    var processor = parser(function(selectors) {
        selectors.each(function(selector) {
            selector.each(function(node) {
                if (node.type === "combinator") {
                    selector.insertBefore(node, parser.attribute({attribute: styleAttr}));
                }
            });
            selector.append(parser.attribute({attribute: styleAttr}));
        });
    });

    var root = postcss.parse(css);
    root.walkRules(function(rule) {
        rule.selector = processor.process(rule.selector).result;
    });
    return root.toString();
}

module.exports = {
    transform: transform
};
