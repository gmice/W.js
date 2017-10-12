"use strict";

var http        = require("http");

var esprima     = require("esprima");
var htmlparser  = require("htmlparser2");
var check       = require('syntax-error');

var WClass      = require("./class.js");
                  require("./event.js");
var Style       = require("./style.js");

var pageCache = {};

var reRef = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*|\[[^\]]+\])*$/;

function Page(props) {
    props && Object.assign(this, props);
}

function Scope(props) {
    this.module = {exports: {}};
    props && Object.assign(this, props);
}

Object.assign(WClass.fn, {
    // Load page into pesudo window
    load: function(page) {
        var W = this;
        return new Promise(function(resolve, reject) {
            // 1. Resolve page imports
            resolvePage(page).then(function(scope) {
                W.scope = scope;
                // 2. Apply page to the new W.scope
                return W.call(page.apply, W, scope.module.exports, null, scope.module); // FIXME: require, __filename, __dirname
            }).then(function() {
                // 3. Digest first time
                return W.digest();
            }).then(function() {
                // 4. Fire onload event
                W.fire({type: 'load', bubbles: false});
                if (W.node.ref) {
                    W.node.ref.set(W.scope.module.exports);
                }
            }).then(resolve);
        })
    },

    _class: function(s, o) {
        var a = [];
        if (s) a.push(s);
        for (var name in o) {
            if (o[name]) {
                a.push(name);
            }
        }
        return a.length ? a.join(" ") : null;
    }
});

function hash(s) {
    var h = 0;
    if (s.length === 0) return h;
    for (var i = 0; i < s.length; i++) {
        var chr = s.charCodeAt(i);
        h = ((h << 5) - h) + chr;
        h |= 0;
    }
    if (h < 0) {
        h = 0xffffffff + h + 1;
    }
    return h.toString(16);
}

function parseText(text, filterVars) {
    var from, to, exprs = [];
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
            exprs.push({repr: JSON.stringify(text.substring(0, from))});
        }

        var expr = text.substring(from + 2, to).trim();
        text = text.substring(to + 1);

        if (expr) {
            // Extract filter names from expression, eg:
            // x,FILTER1 -> FILTER1
            // x,FILTER1,FILTER2(args) -> FILTER1,FILTER2
            var ast;
            try {
                ast = esprima.parse(expr);
            } catch (e) {
                console.error(e.description + "\n" + expr.split("\n")[e.lineNumber-1] + "\n" + Array(e.column).join(" ") + "^");
                continue;
            }

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

            exprs.push({expr: true, repr: expr});
        }
    }

    if (text && text.length) {
        exprs.push({repr: JSON.stringify(text)});
    }

    return exprs;
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

function visitScript(node, ctx) {
    if (node.children && node.children.length) {
        ctx.scripts.push(node.children[0].data);
    }
}

function visitStyle(node, ctx) {
    if (node.children && node.children.length) {
        var text = node.children[0].data;
        if (node.attribs['type'] === 'text/less' && window.less) {
            window.less.render(text, function(e, output) {
                if (e) {
                    console.error(e);
                    return;
                }
                text = output.css;
            });
        }
        ctx.styles.push(text);
    }
}

function visitTag(node, ctx) {
    var out = ctx.out;

    var attributes = {};
    var listeners = {};
    var ifExpr = null;
    var forExpr = null;
    var refExpr = null;
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
            case "ref:": {
                refExpr = attrValue;
                break;
            }
            case "var:": {
                varExpr = attrValue;
                break;
            }
            case "checked:": {
                attributes["checked"] = Object.assign(attributes["checked"] || {}, {expr: "((" + attrValue + ") ? \"checked\" : null)"});
                if (reRef.test(attrValue)) {
                    listeners["change"] = Object.assign(listeners["change"] || {}, {before: attrValue + " = e.target.checked"});
                    if (node.attribs["type"] === "radio") {
                        listeners["change:radio"] = listeners["change"]
                    }
                }
                break;
            }
            case "disabled:":
            case "multiple:":
            case "selected:": {
                attrName = attrName.substring(0, attrName.length - 1);
                attributes[attrName] = Object.assign(attributes[attrName] || {}, {expr: "((" + attrValue + ") ? \"" + attrName + "\" : null)"});
                break;
            }
            case "href:":
            case "value:": {
                var name = node.name;

                if (name === "a" && attrName === "href:" && attrValue.startsWith("javascript:")) {
                    attributes["href"] = Object.assign(attributes["href"] || {}, {repr: "javascript:void(0)"});
                    listeners["click"] = Object.assign(listeners["click"] || {}, {after: attrValue.substring("javascript:".length)});
                    break;
                }

                if (attrName === "value:") {
                    attributes["value"] = Object.assign(attributes["value"] || {}, {expr: attrValue});
                    if (reRef.test(attrValue)) {
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

    if (ctx.styleAttr) {
        attributes[ctx.styleAttr] = {repr: ""};
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

        var exprs = [];
        for (var attrName in attributes) {
            if (!attrName.startsWith("class:")) {
                continue;
            }
            exprs.push(JSON.stringify(attrName.substring(6)) + ":(" + attributes[attrName] + ")");
            delete attributes[attrName];
        }

        if (exprs.length) {
            attributes["class"] = {expr: "$class((" + expr + "),{" + exprs.join(",") + "})"};
        } else {
            attributes["class"] = {expr: expr};
        }
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
    out.push("});");

    if (refExpr) {
        out.push("vnode.ref = {");
        out.push("set: function($ref) { " + refExpr + " = $ref; },");
        out.push("del: function($ref) { if ($ref === " + refExpr + ") " + refExpr + " = undefined; }");
        out.push("};");
    }

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
                if (reRef.test(def.expr)) {
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
        var firstChild = node.children[0];
        if (firstChild && firstChild.type === "text" && firstChild.data.trim() === "") {
            node.children.shift();
        }

        var lastChild = node.children[node.children.length - 1];
        if (lastChild && lastChild.type === "text" && lastChild.data.trim() === "") {
            node.children.pop();
        }
    }

    if (forExpr) {
        var forVar = forExpr.trim().split(/ |=/)[0]; // FIXME: use ast
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
    var out = ctx.out;
    var filterVars = ctx.filterVars;

    var expr = parseText(node.data, filterVars);
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
        var ref = node.attribs[attrName];
        if (attrName[attrName.length - 1] !== ":" || !reRef.test(ref)) {
            console.warn("Bad format, ignore widget attribute " + attrName + "=\"" + ref + "\"");
            continue;
        }
        attrName = attrName.substring(0, attrName.length-1);

        if (attrName.startsWith("on")) {
            var eventName = attrName.substring(2);
            out.push(ref+' = W.node.listeners["'+eventName+'"];');
        } else {
            out.push("$detail[\""+attrName+"\"] = "+ref+";");
            out.push(ref+' = W.node.attributes["'+attrName+'"];');
        }
    }

    if (node.children && node.children.length) {
        var _node = node.children[0];
        var pass = false;
        if (_node.type === "text") {
            var data = _node.data.trim();
            if (data === "") {
                pass = true; // Ignore blank text node
            } else if (data.startsWith("${") && data.endsWith("}")) {
                var ref = data.substring(2, data.length - 1);
                if (reRef.test(ref)) {
                    out.push(ref+" = W.node.children[0].text;");
                    pass = true;
                }
            }
        }
        if (!pass) {
            console.warn("Unexpected widget node: ", _node);
        }
    }

    out.push("return $detail;");
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
    var ctx = {
        out:        [],
        scripts:    [],
        styles:     [],
        filterVars: {},
        imports:    []
    };

    var dom;
    if (typeof content === 'string') {
        var handler = new htmlparser.DomHandler();
        var parser = new htmlparser.Parser(handler, {decodeEntities: true});
        parser.write(content);
        parser.end();
        dom = handler.dom;
    } else {
        dom = content;
    }

    dom.forEach(function(node) {
        if (node.type === "script") {
            visitScript(node, ctx);
            return;
        }
        if (node.type === "style" || (node.type === "tag" && node.name === "link" && node.attribs["rel"] === "stylesheet")) {
            visitStyle(node, ctx);
            return;
        }
    });

    if (ctx.styles.length) {
        var style = ctx.styles.join("\n\n");
        var styleAttr = ctx.styleAttr = "style:" + hash(style);
        style = Style.transform(style, styleAttr);
        ctx.out.push("vnode = $ve(pvnode, \"style\", 9, {});");
        ctx.out.push("pvnode = vnode;");
        ctx.out.push("vnode = $vt(pvnode, " + JSON.stringify(style) + ");");
        ctx.out.push("pvnode = pvnode.parent;");
    }

    for (var i = 0; i < dom.length; i++) {
        var node = dom[i];
        switch (node.type) {
            case "tag": {
                if (node.name === "link") {
                    if (node.attribs["rel"] === "import") {
                        if (node.attribs["href"]) {
                            ctx.imports.push(node.attribs["href"]);
                        }
                        continue;
                    }
                    if (node.attribs["rel"] === "stylesheet") {
                        continue;
                    }
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
                // Ignore comment/script/style ...
            }
        }
    }

    var out = [];
    out.push("\"use strict\";");
    out.push("exports.apply = function*(W, exports, require, module, __filename, __dirname) {");
    out.push("W.scope.render = function render(pvnode) {");
    out.push("var $ve    = W._createVElement.bind(W);");
    out.push("var $vt    = W._createVTextNode.bind(W);");
    out.push("var $t     = W._text;");
    out.push("var $class = W._class;");
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

    // FIXME
    out.push("W.scope.eval = function(script) { return eval(script); };");

    // FIXME: Refactor widget
    if (ctx.widget) {
        out.push(ctx.widget.script);
    }

    if (ctx.scripts.length) {
        var script = ctx.scripts.join("\n\n");
        out.push("/** hash " + hash(script) + " **/");
        out.push("//--------------------------------------------------------------------------------");
        out.push(script);
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
    fetch: function(href) {
        return new Promise(function(resolve, reject) {
            http.get('/'+href, function(res) {
                var body = "";
                res.on("data", function(d) {
                    body += d;
                });
                res.on("end", function() {
                    resolve(body);
                });
            });
        });
    },
    useCache: true
};

function loadPage(href, options) {
    options = Object.assign({}, DEFAULT_LOAD_OPTIONS, options);

    return new Promise(function(resolve, reject) {
        if (options.useCache && href in pageCache) {
            resolve(pageCache[href]);
            return;
        }

        options.fetch(href).then(function(content) {
            var handler = new htmlparser.DomHandler();
            var parser = new htmlparser.Parser(handler, {decodeEntities: true});
            parser.write(content);
            parser.end();

            var promises = [];

            var dom = handler.dom;
            for (var i = 0; i < dom.length; i++) {
                var node = dom[i];
                if (node.type === "tag" && node.name === "link" && node.attribs["rel"] === "stylesheet") {
                    var _href = node.attribs["href"];
                    if (_href) {
                        promises.push(loadStyleSheet(node, options));
                    }
                }
            }

            Promise.all(promises).then(function() {
                var page = compilePage(dom, href); // FIXME: cache?
                resolve(page);
            });
        });
    });
}

function loadStyleSheet(node, options) {
    return options.fetch(node.attribs["href"]).then(function(data) {
        if (node.attribs['type'] === 'text/less' && window.less) {
            return window.less.render(data).then(function(output) {
                node.children = [{
                    data: output.css
                }];
            });
        }

        node.children = [{
            data: data
        }];
    });
}

var DEFAULT_RELOAD_OPTIONS = {
    fetch: DEFAULT_LOAD_OPTIONS.fetch,
    useCache: false
};

function reloadPage(href, options) {
    options = Object.assign({}, DEFAULT_RELOAD_OPTIONS, options);

    var rootW = options.W || window.W;
    loadPage(href, {fetch: options.fetch, useCache: options.useCache}).then(function(page) {
        var remains = rootW.children;
        while (remains.length) {
            var W = remains.shift();

            if (!W.scope || W.scope.page.href !== href) {
                remains = remains.concat(W.children);
                continue;
            }

            var re = /\/\*\* hash (.*) \*\*\//;
            var hashOld = (re.exec(W.scope.page.script) || [])[1];
            var hashNew = (re.exec(page.script) || [])[1];
            if (hashOld === hashNew && hashNew !== undefined) {
                var from = page.script.indexOf("function render");
                var to = page.script.indexOf("; //render", from);
                var script = page.script.substring(from, to);

                W.scope.render = W.scope.eval("("+script+")");
                W.digest();

                remains = remains.concat(W.children);
            } else {
                var scope = W.scope;
                if (scope) {
                    delete W.scope;
                    scope.mbody && scope.mbody.detach();
                }
                W.load(page);
            }
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
    // preprocess: preprocessPage,
    reload: reloadPage,
    Page: Page
};
