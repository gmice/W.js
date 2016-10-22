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

/**********************************************************
 * DispatchHandler
 */
function DispatchHandler(ctx) {
    this.ctx = ctx;
}

DispatchHandler.prototype.onopentag = function(name) {
    var handler = this.ctx.handler;
    return handler.onopentag.apply(handler, arguments);
};

DispatchHandler.prototype.ontext = function() {
    var handler = this.ctx.handler;
    return handler.ontext.apply(handler, arguments);
};

DispatchHandler.prototype.onclosetag = function(name) {
    var handler = this.ctx.handler;
    return handler.onclosetag.apply(handler, arguments);
};

/**********************************************************
 * RootHandler
 */
function RootHandler(ctx) {
    this.ctx = ctx;
}

RootHandler.prototype.onopentag = function(name, attrs) {
    var ctx = this.ctx;

    if (name === "link" && attrs["rel"] === "import") {
        ctx.handler = new ImportHandler(this, ctx);
        return ctx.handler.onopentag.apply(ctx.handler, arguments);
    }

    if (name === "script") {
        ctx.handler = new ScriptHandler(this, ctx);
        return ctx.handler.onopentag.apply(ctx.handler, arguments);
    }

    if (name === "template" && "w-widget" in attrs) {
        ctx.handler = new WidgetHandler(this, ctx);
        return ctx.handler.onopentag.apply(ctx.handler, arguments);
    }

    ctx.handler = new HTMLHandler(this, ctx);
    return ctx.handler.onopentag.apply(ctx.handler, arguments);
};

RootHandler.prototype.ontext = function() {
    var handler = new HTMLHandler(this, this.ctx);
    handler.ontext.apply(handler, arguments);
};

RootHandler.prototype.onclosetag = function() {
    throw "Internal error";
};

/**********************************************************
 * HTMLHandler
 */
function HTMLHandler(parent, ctx) {
    this.parent = parent;
    this.ctx = ctx;
    this.outAfter = [];
    this.opened = false;
}

HTMLHandler.prototype.onopentag = function(name, attrs) {
    var ctx = this.ctx;

    if (this.opened) {
        ctx.handler = new HTMLHandler(this, ctx);
        return ctx.handler.onopentag.apply(ctx.handler, arguments);
    }

    this.opened = true;

    this.name = name;

    var out = ctx.out,
    outAfter = this.outAfter;

    var attributes = {},
    listeners = {},
    ifExpr = null,
    forExpr = null,
    varExpr = null;

    for (var attr_name in attrs) {
        var attrValue = attrs[attr_name];

        if (attr_name[attr_name.length - 1] !== ":") {
            if (attrValue.indexOf("${") !== -1) {
                var from, to, expr = "\"\"";
                while (attrValue && ((from = attrValue.indexOf("${")) !== -1)) {
                    to = from + 2;

                    var count = 1;
                    loop:
                    for (;;) {
                        switch (attrValue.charAt(to)) {
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
                                throw "Missing enclosing \"}\"";
                            }
                        }
                        to++;
                    }

                    if (from > 0) {
                        expr += "+"+JSON.stringify(attrValue.substring(0, from));
                    }

                    expr += "+_text("+attrValue.substring(from + 2, to)+")";
                    attrValue = attrValue.substring(to + 1);
                }

                if (attrValue.length) {
                    expr += "+"+JSON.stringify(attrValue);
                }

                attributes[attr_name] = Object.assign(attributes[attr_name] || {}, {expr: expr});
            } else {
                attributes[attr_name] = Object.assign(attributes[attr_name] || {}, {repr: attrValue});
            }
            continue;
        }

        switch (attr_name) {
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
                if (name === "a" && attr_name === "href:" && attrValue.startsWith("javascript:")) {
                    attributes["href"] = Object.assign(attributes["href"] || {}, {repr: "javascript:void(0)"});
                    listeners["click"] = Object.assign(listeners["click"] || {}, {after: attrValue.substring("javascript:".length)});
                    break;
                }

                if (attr_name === "value:") {
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
                if (attr_name[0] === "o" && attr_name[1] === "n") {
                    var event = attr_name.substring(2, attr_name.length - 1);
                    listeners[event] = Object.assign(listeners[event] || {}, {fn: attrValue});
                    break;
                }

                if (attr_name.length > 6 && attr_name.substring(0, 6) === "class:") {
                    attributes["class"] = attributes["class"] || {};
                    attributes["class:"+attr_name.substring(6, attr_name.length - 1)] = attrValue;
                    break;
                }

                var _attr_name = attr_name.substring(0, attr_name.length - 1);
                attributes[_attr_name] = Object.assign(attributes[_attr_name] || {}, {expr: attrValue});
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


    out.push("vnode = $ve(pvnode, \"" + name + "\", 9, {");
    for (var attr_name in attributes) {
        var def = attributes[attr_name];

        if ("expr" in def) {
            out.push("\"" + attr_name + "\": (" + def.expr + "),");
        }

        if ("repr" in def) {
            out.push("\"" + attr_name + "\": " + JSON.stringify(def.repr) + ",");
        }
    }
    out.push("});");

    for (var event_name in listeners) {
        var def = listeners[event_name];
        out.push("vnode.listeners[\"" + event_name + "\"] = function*(e) {");
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
    if (name.indexOf("-") !== -1) {
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
    if (forExpr) {
        var for_var = forExpr.trim().split(" ")[0]; // FIXME: use ast
        out.push("var " + for_var + "$index = 0;");
        out.push("for (var " + forExpr + ") {");
        out.push("(function(" + for_var + ", " + for_var + "$index) {");

        outAfter.push("})(" + for_var + ", " + for_var + "$index++);");
        outAfter.push("}");
    }
    outAfter.push("pvnode = pvnode.parent;");

    if (ifExpr) {
        outAfter.push("}");
    }
};

HTMLHandler.prototype.ontext = function(text) {
    var out = this.ctx.out,
    filterVars = this.ctx.filterVars;

    var from, to, expr;
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
                    throw "Missing enclosing \"}\"";
                }
            }
            to++;
        }

        if (from > 0) {
            out.push("vnode = $vt(pvnode, " + JSON.stringify(text.substring(0, from)) + ");");
        }

        expr = text.substring(from + 2, to);

        // Extract filter names from expression, eg:
        // x,FILTER1 -> FILTER1
        // x,FILTER1,FILTER2(args) -> FILTER1,FILTER2
        var ast = esprima.parse(expr);
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

        out.push("vnode = $vt(pvnode, " + expr + ");");

        text = text.substring(to + 1);
    }

    if (text.length) {
        out.push("vnode = $vt(pvnode, " + JSON.stringify(text) + ");");
    }
};

HTMLHandler.prototype.onclosetag = function(name) {
    var ctx = this.ctx;
    if (this.outAfter.length) {
        for (var i = 0; i < this.outAfter.length; i++) {
            ctx.out.push(this.outAfter[i]);
        }
    }
    ctx.handler = this.parent;
};

/**********************************************************
 * ImportHandler
 */
function ImportHandler(parent, ctx) {
    this.parent = parent;
    this.ctx = ctx;
}

ImportHandler.prototype.onopentag = function(name, attrs) {
    if (attrs["href"]) {
        this.ctx.imports.push(attrs["href"]);
    }
    // TODO(minhao.jin): Throw error
};

ImportHandler.prototype.ontext = function(text) {
    // EMPTY
};

ImportHandler.prototype.onclosetag = function(name) {
    this.ctx.handler = this.parent;
};

/**********************************************************
 * ScriptHandler
 */
function ScriptHandler(parent, ctx) {
    this.parent = parent;
    this.ctx = ctx;
}

ScriptHandler.prototype.onopentag = function(name, attrs) {
    // EMPTY
};

ScriptHandler.prototype.ontext = function(text) {
    this.ctx.script += text;
};

ScriptHandler.prototype.onclosetag = function(name) {
    this.ctx.handler = this.parent;
};

/**********************************************************
 * WidgetHandler
 */
function WidgetHandler(parent, ctx) {
    this.parent = parent;
    this.ctx = ctx;
}

WidgetHandler.prototype.onopentag = function(name, attrs) {
    if (name === "template") {
        return;
    }

    var ctx = this.ctx;
    if (this.name === undefined) {
        if (name.indexOf("-") === -1) {
            throw "Invalid name: " + name;
        }
        this.name = name;

        var out = [];
        out.push("W._widget_digest = function() {");
        out.push("var $detail = {};");
        for (var attrName in attrs) {
            var attrValue = attrs[attrName];
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
        for (var attrName in attrs) {
            var attrValue = attrs[attrName];
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

        this.script = out.join("\n");

        /*
        var out = this.out;
        out.push("function _setAttribute(attrName, attrValue) {");
        out.push("switch(attrName) {")

        for (var attrName in attrs) {
            if (attrName[attrName.length - 1] !== ":") {
                continue;
            }
            out.push("case "+attrName+" {");
            out.push(attrs[attrName]+" = attrValue;");
            out.push("break;");
            out.push("}");
        }

        out.push("default: return;");
        out.push("}");
        */
    }
};

WidgetHandler.prototype.ontext = function(text) {
    // EMPTY
};

WidgetHandler.prototype.onclosetag = function(name) {
    if (name === "template") {
        this.ctx.widget = {
            name: this.name,
            script: this.script
        };
        this.ctx.handler = this.parent;
    }
};

function compile(content, href) {
    var ctx = {
        out:            [],
        out_pst_stack:  [],
        script:         "",
        filterVars:     {},
        imports:        []
    };

    var out = ctx.out;
    out.push("exports.apply = function*(W) {");
    out.push("W.scope.render = function render(pvnode) {");
    out.push("var $ve = W._createVElement.bind(W), $vt = W._createVTextNode.bind(W);");
    out.push("var vnode;");

    var filterVarsPlaceholderIndex = out.length;
    out.push("/*FILTERS*/"); // Placeholder for filters

    out.push("function _text(s) { return s == null ? '': s; }")

    ctx.handler = new RootHandler(ctx);

    var parser = new htmlparser.Parser(new DispatchHandler(ctx), {decodeEntities: true});
    parser.write(content);
    parser.end();

    // Declare filter variables
    var filterNames = Object.keys(ctx.filterVars);
    if (filterNames.length) {
        out[filterVarsPlaceholderIndex] += (
            "var " +
            filterNames.map(function(name) {return name+"=W.filter(\""+name+"\")";}).join(",") +
            ";"
        );
    }

    out.push("}; //render");

    out.push("Object.defineProperty(W, 'state', {");
    out.push("configurable: true,");
    out.push("get: function() {");
    if (ctx.script.length) {
        var vars = [];
        var ast = esprima.parse("(function*(W) {"+ctx.script+"})");

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

    if (ctx.script.length) {
        out.push("//--------------------------------------------------------------------------------");
        out.push(ctx.script);
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
