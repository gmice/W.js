"use strict";

var http        = require("http");

var esprima     = require("esprima");
var htmlparser  = require("htmlparser2");
var check       = require('syntax-error');

var WClass      = require("./class.js");
                  require("./event.js");

var pageCache = {};

function Page(props) {
    props && Object.assign(this, props);
}

function Scope(props) {
    props && Object.assign(this, props);
}

// Load page into pesudo window
WClass.fn.load = function(page) {
    var W = this;
    return new Promise(function(resolve, reject) {
        // 1. Resolve page imports
        resolvePage(page).then(function(scope) {
            W.scope = scope;
            // 2. Apply page to the new W.scope
            return W.call(page.apply, W);
        }).then(function() {
            // 3. Digest first time
            return W.digest();
        }).then(function() {
            // 4. Fire onload event
            W.fire("load", null, false);
        }).then(resolve);
    });
};

function parseText(text, filterVars) {
    var from, to, expr = [];
    while (text && ((from = text.indexOf("${")) !== -1)) {
        to = from + 2;

        var count = 1;
        loop:
        for (;;) {
            switch (text.charAt(to)) {
                case "{": {
                    count++;
                    break;
                }
                case "}": {
                    count--;
                    if (count === 0) {
                        break loop;
                    }
                    break;
                }
                case "": {
                    throw "missing enclosing \"}\"";
                }
            }
            to++;
        }

        if (from > 0) {
            expr.push({repr: JSON.stringify(text.substring(0, from))});
        }

        var e = text.substring(from + 2, to);

        // Extract filter names from expression, eg:
        // x,FILTER1 -> FILTER1
        // x,FILTER1,FILTER2(args) -> FILTER1,FILTER2
        var ast = esprima.parse(e);
        if (ast.body[0].type === "ExpressionStatement" &&
        ast.body[0].expression.type === "SequenceExpression") {
            var expressions = ast.body[0].expression.expressions;
            for (var i = 1; i < expressions.length; i++) {
                var exprNode = expressions[i];
                var filterName;

                if (exprNode.type === "Identifier") {
                    filterName = exprNode.name;
                }

                if (exprNode.type === "CallExpression" && exprNode.callee.type === "Identifier") {
                    filterName = exprNode.callee.name;
                }

                if (filterName) {
                    filterVars[filterName] = true;
                }
            }
        }

        expr.push({expr: true, repr: text.substring(from + 2, to)});
        text = text.substring(to + 1);
    }

    if (text && text.length) {
        expr.push({repr: JSON.stringify(text)});
    }

    return expr;
}

function visitChildren(node, ctx) {
    for (var i = 0; i < node.children.length; i++) {
        var childNode = node.children[i];
        switch (childNode.type) {
            case "tag": {
                visitTag(childNode, ctx);
                break;
            }
            case "text": {
                visitText(childNode, ctx);
                break;
            }
        }
    }
}

function visitTag(node, ctx) {
    var out = ctx.out;

    var attributes = {};
    var listeners = {};
    var ifExpr = null;
    var forExpr = null;
    var varExpr = null;
    var fixIndent = false;

    for (var attrName in node.attribs) {
        var attrValue = node.attribs[attrName];

        if (attrName === "-") {
            fixIndent = true;
            continue;
        }

        if (attrName[attrName.length - 1] !== ":") {
            if (attrValue.indexOf("${") !== -1) {
                var expr = parseText(attrValue, ctx.filterVars);
                attributes[attrName] = Object.assign(attributes[attrName] || {}, {expr: expr.map(function(s) {
                    return s.expr ? "$t(" + s.repr +")" : s.repr;
                }).join("+")});
            } else {
                attributes[attrName] = Object.assign(attributes[attrName] || {}, {repr: attrValue});
            }
            continue;
        }

        switch (attrName) {
            case "for:": {
                forExpr = attrValue;
                break;
            }
            case "if:": {
                ifExpr = attrValue;
                break;
            }
            case "var:": {
                varExpr = attrValue;
                break;
            }
            case "href:":
            case "value:": {
                if (name === "a" && attrName === "href:" && attrValue.startsWith("javascript:")) {
                    attributes["href"] = Object.assign(attributes["href"] || {}, {repr: "javascript:void(0)"});
                    listeners["click"] = Object.assign(listeners["click"] || {}, {after: attrValue.substring("javascript:".length)});
                    break;
                }

                if (attrName === "value:") {
                    attributes["value"] = Object.assign(attributes["href"] || {}, {expr: attrValue});
                    if (/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*|\[[^\]]+\])*$/.test(attrValue)) { // FIXME: Util function
                        if (name === "input" || name === "textarea") {
                            listeners["input"] = Object.assign(listeners["input"] || {}, {before: attrValue + " = e.target.value"});
                        } else if (name === "select") {
                            listeners["change"] = Object.assign(listeners["change"] || {}, {before: attrValue + " = e.target.value"});
                        }
                    }
                    break;
                }
            }
            default: {
                if (attrName[0] === "o" && attrName[1] === "n") {
                    var event = attrName.substring(2, attrName.length - 1);
                    listeners[event] = Object.assign(listeners[event] || {}, {fn: attrValue});
                    break;
                }

                if (attrName.length > 6 && attrName.substring(0, 6) === "class:") {
                    attributes["class"] = attributes["class"] || {};
                    attributes["class:"+attrName.substring(6, attrName.length - 1)] = attrValue;
                    break;
                }

                attrName = attrName.substring(0, attrName.length - 1);
                attributes[attrName] = Object.assign(attributes[attrName] || {}, {expr: attrValue});
            }
        }
    }

    if (ifExpr) {
        out.push("if (" + ifExpr + ") {");
    }

    if (varExpr) {
        out.push("var " + varExpr + ";");
    }

    if ("class" in attributes) {
        var def = attributes["class"];
        var expr;

        if ("expr" in def) {
            expr = def.expr;
        }

        if ("repr" in def) {
            expr = JSON.stringify(def.repr);
        }

        for (var attrName in attributes) {
            if (!attrName.startsWith("class:")) {
                continue;
            }
            expr += "+(("+attributes[attrName]+")?"+JSON.stringify(" "+attrName.substring(6))+":\"\")"
            delete attributes[attrName];
        }

        attributes["class"] = {expr: expr};
    }

    out.push("vnode = $ve(pvnode, \"" + node.name + "\", 9, {");
    for (var attrName in attributes) {
        var def = attributes[attrName];
        if ("expr" in def) {
            out.push("\"" + attrName + "\": (" + def.expr + "),");
        }
        if ("repr" in def) {
            out.push("\"" + attrName + "\": " + JSON.stringify(def.repr) + ",");
        }
    }
    out.push("});");event

    for (var event in listeners) {
        var def = listeners[event];
        out.push("vnode.listeners[\"" + event + "\"] = function*(e) {");
        if (def.before) {
            out.push(def.before + ";");
        }
        if (def.fn) {
            out.push(def.fn + ";");
        }
        if (def.after) {
            out.push(def.after + ";");
        }
        out.push("};");
    }

    // FIXME: Better check for widgets
    if (node.name.indexOf("-") !== -1) {
        out.push("vnode.listeners[\"emit\"] = (function(vnode) {");
        out.push("return function(e) {");

        var shouldDigest = false;

        for (var attrName in attributes) {
            var def = attributes[attrName];
            out.push("vnode.attributes[\"" + attrName + "\"] = e.detail[\"" + attrName + "\"];");

            if ("expr" in def) {
                if (/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*|\[[^\]]+\])*$/.test(def.expr)) {
                    shouldDigest = true;
                    out.push(def.expr + " = e.detail[\"" + attrName + "\"];");
                }
            }
        }

        if (shouldDigest) {
            out.push("W.digest();");
        }

        out.push("};");
        out.push("})(vnode);");
    }

    out.push("pvnode = vnode;");

    var ctxNext = Object.assign({}, ctx);
    if (fixIndent) {
        ctxNext.fixIndent++;

        var firstChild = node.children[0];
        if (firstChild && firstChild.type === "text" && firstChild.data.startsWith("\n")) {
            firstChild.data = firstChild.data.substring(1);
        }

        var lastChild = node.children[node.children.length - 1];
        if (lastChild && lastChild.type === "text") {
            var index = lastChild.data.lastIndexOf("\n");
            if (index !== -1) {
                lastChild.data = lastChild.data.substring(0, index+1);
            }
        }
    }

    if (forExpr) {
        var forVar = forExpr.trim().split(" ")[0]; // FIXME: use ast
        out.push("var " + forVar + "$index = 0;");
        out.push("for (var " + forExpr + ") {");
        out.push("(function(" + forVar + ", " + forVar + "$index) {");
        visitChildren(node, ctxNext);
        out.push("})(" + forVar + ", " + forVar + "$index++);");
        out.push("}");
    } else {
        visitChildren(node, ctxNext);
    }
    out.push("pvnode = pvnode.parent;");

    if (ifExpr) {
        out.push("}");
    }
}

function visitText(node, ctx) {
    var text = node.data;

    if (ctx.fixIndent) {
        text = text.split("\n").map(function(line) {
            for (var i = 0; i < ctx.fixIndent; i++) {
                if (line.startsWith("\t")) {
                    line = line.substring(1);
                    continue;
                }
                if (line.startsWith("    ")) {
                    line = line.substring(4);
                    continue;
                }
                break;
            }
            return line;
        }).join("\n");
    }

    var out = ctx.out;
    var filterVars = ctx.filterVars;

    var expr = parseText(text, filterVars);
    for (var i = 0; i < expr.length; i++) {
        out.push("vnode = $vt(pvnode, " + expr[i].repr + ");");
    }
}

function visitWidget(node, ctx) {
    node = node.children[0];
    while (node && node.type !== "tag") {
        node = node.next;
    }
    if (!node) return;

    var out = [];
    out.push("W._widget_digest = function() {");
    out.push("var $detail = {};");
    for (var attrName in node.attribs) {
        var attrValue = node.attribs[attrName];
        if (attrName[attrName.length - 1] !== ":") {
            continue;
        }
        attrName = attrName.substring(0, attrName.length-1);

        if (attrName.startsWith("on")) {
            out.push(attrValue+" = W.node.listeners[\""+attrName.substring(2)+"\"];");
        } else {
            out.push("$detail[\""+attrName+"\"] = "+attrValue+";");
            out.push(attrValue+" = W.node.attributes[\""+attrName+"\"];");
        }
    }
    out.push("W.fire(\"widget-digest\", $detail);");
    out.push("};");

    out.push("W._widget_emit = function() {");
    for (var attrName in node.attribs) {
        var attrValue = node.attribs[attrName];
        if (attrName[attrName.length - 1] !== ":") {
            continue;
        }
        attrName = attrName.substring(0, attrName.length-1);

        if (attrName.startsWith("on")) {
            continue;
        }
        out.push("W.node.attributes[\""+attrName+"\"] = "+attrValue+ ";");
    }
    out.push("};");

    out.push("W._widget_digest();");

    ctx.widget = {
        name: node.name,
        script: out.join("\n")
    };
}

function compile(content, href) {
    var handler = new htmlparser.DomHandler();
    var parser = new htmlparser.Parser(handler, {decodeEntities: true});
    parser.write(content);
    parser.end();

    var ctx = {
        out:            [],
        scripts:        [],
        filterVars:     {},
        imports:        [],
        fixIndent:      0
    };

    var dom = handler.dom;
    for (var i = 0; i < dom.length; i++) {
        var node = dom[i];
        switch (node.type) {
            case "script": {
                ctx.scripts.push(node.children[0].data);
                break;
            }
            case "tag": {
                if (node.name === "link" && node.attribs["rel"] === "import") {
                    if (node.attribs["href"]) {
                        ctx.imports.push(node.attribs["href"]);
                    }
                    continue;
                }

                if (node.name === "template" && "w-widget" in node.attribs) {
                    visitWidget(node, ctx);
                    continue;
                }

                visitTag(node, ctx);
                break;
            }
            case "text": {
                visitText(node, ctx);
                break;
            }
            default: {
                throw "unsupported node type: " + node.type;
            }
        }
    }

    var out = [];
    out.push("exports.apply = function*(W) {");
    out.push("W.scope.render = function render(pvnode) {");
    out.push("var $ve = W._createVElement.bind(W), $vt = W._createVTextNode.bind(W), $t = W._text;");
    out.push("var vnode;");

    // Declare filter variables
    var filterNames = Object.keys(ctx.filterVars);
    if (filterNames.length) {
        out.push(
            "var " +
            filterNames.map(function(name) {return name+"=W.filter(\""+name+"\")";}).join(",") +
            ";"
        );
    }

    out = out.concat(ctx.out);

    out.push("}; //render");

    out.push("Object.defineProperty(W, 'state', {");
    out.push("configurable: true,");
    out.push("get: function() {");
    if (ctx.scripts.length) {
        var vars = [];
        var ast = esprima.parse("(function*(W) {"+ctx.scripts.join("\n\n")+"})");

        // ast: Program
        //   .body[0]: ExpressionStatement
        //     .expression: FunctionExpression
        //       .body: BlockStatement
        var body = ast.body[0].expression.body.body;

        for (var i = 0; i < body.length; i++) {
            var node = body[i];
            if (node.type === "VariableDeclaration") {
                vars = vars.concat(node.declarations.map(function(decl) {
                    return decl.id.name;
                }));
            }
        }

        out.push("return {");
        for (var i = 0; i < vars.length; i++) {
            out.push("get "+vars[i]+"() {return "+vars[i]+";},");
            out.push("set "+vars[i]+"(_"+vars[i]+") {"+vars[i]+"=_"+vars[i]+";},");
        }
        out.push("};");
    }
    out.push("}");
    out.push("});");

    out.push("W.scope.eval = function(script) { return eval(script); };");

    // FIXME: Refactor widget
    if (ctx.widget) {
        out.push(ctx.widget.script);
    }

    if (ctx.scripts.length) {
        out.push("//--------------------------------------------------------------------------------");
        out.push(ctx.scripts.join("\n\n"));
        out.push("//--------------------------------------------------------------------------------");
    }

    out.push("};");
    out.push("exports.href = "+JSON.stringify(href)+";");
    out.push("exports.imports = "+JSON.stringify(ctx.imports)+";");

    if (ctx.widget) {
        out.push("exports.widget = "+JSON.stringify({name: ctx.widget.name})+";");
    }

    out.push("//# sourceURL="+href);
    out.push("");

    return out.join("\n");
}

function compilePage(content, href) {
    var script = compile(content, href);

    // FIXME: only for debug
    var err = check(script, href);
    if (err) {
        console.error('ERROR DETECTED' + Array(62).join('!'));
        console.error(err);
        console.error(Array(76).join('-'));
    }

    var page = new Page({script: script});
    var module = {exports: page};
    new Function("exports,require,module,__filename,__dirname", script)
        .call(null, module.exports, require, module); // FIXME: require?

    return page;
}

function definePage(pages) {
    if (typeof pages === "string") {
        var href = pages, content = arguments[1];
        pages = {};
        pages[href] = content;
    }

    for (var href in pages) {
        var page = pages[href];
        if (typeof page === "string") {
            pageCache[href] = compilePage(page, href);
        } else {
            pageCache[href] = page;
        }
    }
}

var DEFAULT_LOAD_OPTIONS = {
    useCache: true
};

function loadPage(href, options) {
    options = Object.assign({}, DEFAULT_LOAD_OPTIONS, options);

    return new Promise(function(resolve, reject) {
        if (options.useCache && href in pageCache) {
            resolve(pageCache[href]);
            return;
        }

        http.get(href, function(res) {
            var body = "";
            res.on("data", function(d) {
                body += d;
            });
            res.on("end", function() {
                var page = compilePage(body, href); // FIXME: cache?
                resolve(page);
            });
        });
    });
}

function reloadPage(href) {
    loadPage(href, {useCache: false}).then(function(page) {
        var remains = window.W.children; // FIXME: Ref to window?
        while (remains.length) {
            var W = remains.shift();

            if (W.scope.page.href !== href) {
                remains = remains.concat(W.children);
                continue;
            }

            var from = page.script.indexOf("function render");
            var to = page.script.indexOf("; //render", from);
            var script = page.script.substring(from, to);

            W.scope.render = W.scope.eval("("+script+")");
            W.digest();
            remains = remains.concat(W.children);
        }
    });
}

function resolvePage(page) {
    return new Promise(function(resolve, reject) {
        if (page.imports.length) {
            return Promise.all(page.imports.map(function(href) {
                return loadPage(href);
            })).then(function() {
                var imports = {};
                for (var i = 0; i < arguments[0].length; i++) {
                    var widget = arguments[0][i];
                    imports[widget.widget.name] = widget;
                }
                resolve(new Scope({page: page, imports: imports}));
            });
        } else {
            resolve(new Scope({page: page}));
        }
    });
}

module.exports = {
    compile: compilePage,
    define: definePage,
    load: loadPage,
    reload: reloadPage,
    Page: Page
};
