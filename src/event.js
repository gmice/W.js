"use strict";

var WClass = require("./class.js");

var SLICE = [].slice;

var scripts = {};
function _import(src) {
    if (src in scripts) {
        return Promise.resolve(scripts[src]);
    }

    var promise = scripts[src] = new Promise(function(resolve, reject) {
        var s = document.createElement('script');
        s.setAttribute('type', 'text/javascript');
        s.setAttribute('src', src);
        s.onload = function() {
            scripts[src] = null; // FIXME
            resolve();
        };

        document.getElementsByTagName('head')[0].appendChild(s);
    });
    return promise;
}

function dispatchEvent(W, e) {
    var listeners = W._event_listeners;
    if (listeners) {
        var _listeners = listeners[e.type];
        if (_listeners && _listeners.length) {
            return Promise.all(_listeners.map(function(listener) {
                return W.call(listener, e);
            })).then(function() {
                e.handled = true;
                if (!e.defaultPrevented && W.scope) {
                    W.digest();
                }
            });
        }
    }
    return Promise.resolve();
}

Object.assign(WClass.fn, {
    $: function(selector) {
        var W = this, elems = document.querySelectorAll(selector);
        var result = [];

        if (elems.length) {
            var markBeg = W.node.markBeg,
                markEnd = W.node.markEnd,
                parent  = markBeg.parentNode;

            loop:
            for (var i = 0; i < elems.length; i++) {
                var elem = elems[i];
                if (parent.contains(elem)) {
                    for (var node = markBeg.nextSibling; node !== markEnd; node = node.nextSibling) {
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
    },

    call: function(fn) {
        var W = this;

        var args = SLICE.call(arguments, 1);

        if ("GeneratorFunction" === (fn.constructor.displayName || fn.constructor.name)) {
            var gtor = fn.apply(W, args);

            if (W._calling === undefined) {
                W._calling = [];
            }

            var canceled = false;
            var fnCancel;

            var promise = new Promise(function(resolve, reject) {
                function _resolve(value) {
                    W._calling.splice(W._calling.indexOf(promise), 1);
                    resolve(value);
                }

                function _reject(value) {
                    W._calling.splice(W._calling.indexOf(promise), 1);
                    reject(value);
                }

                function do_next() {
                    if (canceled) {
                        _reject("Canceled");
                        return;
                    }

                    var next;
                    try {
                        next = gtor.next.apply(gtor, arguments);
                    } catch (e) {
                        _reject(e);
                        return;
                    }

                    handle_next(next);
                }

                function handle_next(next) {
                    if (next.done) {
                        _resolve(next.value);
                        return;
                    }

                    var value = next.value;
                    if (value instanceof Promise) {
                        if (value.cancel instanceof Function) {
                            fnCancel = value.cancel.bind(value);
                        }

                        value.then(do_next, function(e) {
                            var next;
                            try {
                                next = gtor.throw(e);
                            } catch (e1) {
                                W.fire("error", e1);
                                return;
                            }

                            handle_next(next);
                        });
                        return;
                    }

                    throw "Expect Promise, but got: " + value;
                }

                do_next();
            });

            promise.cancel = function() {
                canceled = true;
                if (fnCancel) {
                    fnCancel();
                }
            }

            W._calling.push(promise);
            return promise;
        } else {
            return Promise.resolve(fn.apply(W, args));
        }
    },

    close: function(detail) {
        var W = this;
        W.fire("close", detail);
    },

    destroy: function() {
        var W = this;
        W.fire({
            type: 'unload',
            bubbles: false
        });

        if (W.parent) {
            W.parent.removeChild(W);
        }

        if (W._calling) {
            for (var i = 0; i < W._calling.length; i++) {
                W._calling[i].cancel();
            }
        }

        var scope = W.scope;
        if (scope) {
            delete W.scope;
            scope.mbody && scope.mbody.detach();
        }
    },

    emit: function() {
        var W = this;
        W._widget_emit();

        if (W.node.listeners && W.node.listeners["emit"]) {
            var e = new Event("emit");
            e.detail = W.node.attributes;
            W.node.listeners["emit"](e); // FIXME: listener应绑定this到对应的W
        }
    },

    fire: function(event, detail) {
        if (typeof event !== 'object') {
            event = {type: event, detail: detail};
        }

        var e = new CustomEvent(event.type, {
            detail: event.detail,
            bubbles: false,
            cancelable: true
        });

        var W = this;
        e.W = W;
        e.defaultHandler = event.defaultHandler;
        e.handled = false;

        var p;
        if (event.bubbles || event.bubbles === undefined) {
            var dispatch = function() {
                return dispatchEvent(W, e).then(function() {
                    W = W.parent;
                    if (W) {
                        return dispatch();
                    }
                });
            };
            p = dispatch();
        } else {
            p = dispatchEvent(W, e);
        }
        p.then(function() {
            e.defaultHandler && e.defaultHandler(e); // FIXME: preventDefault?
        });

        return W;
    },

    main: function(fn) {
        var W = this;

        // FIXME: For compatible, to be removed
        if (arguments.length === 2) {
            var dependencies = arguments[0],
                factory = arguments[1];
            W._initialize = function() {
                var deps = SLICE.call(dependencies);
                var next = function() {
                    var dep = deps.shift();
                    if (dep) {
                        _import(dep).then(next);
                        return;
                    }

                    W.call(factory).then(function(ret) {
                        if (ret === undefined || ret) {
                            W.digest();
                        }
                    });
                };
                next();
            };
            return;
        }

        W._initialize = function() {
            return W.call(fn).then(function(ret) {
                if (ret === undefined || ret) {
                    W.digest();
                }
            });
        };
    },

    minimize: function(detail) {
        var W = this;
        W.fire("minimize", detail);
    },

    on: function(event, listener) {
        var W = this;
        var listeners = W._event_listeners;
        if (listeners === undefined) {
            W._event_listeners = {};
            W._event_listeners[event] = [listener];
        } else {
            var _listeners = listeners[event];
            if (_listeners === undefined) {
                listeners[event] = [listener];
            } else {
                _listeners.push(listener);
            }
        }
        return W;
    },

    once: function(event, listener) {
        var W = this;
        var fn = function() {
            try {
                return listener.apply(this, arguments);
            } finally {
                var _listeners = W._event_listeners[event];
                _listeners.splice(_listeners.indexOf(fn), 1);
            }
        };
        W.on(event, fn);
    },

    open: function(name) {
        var W = this;
        return new Promise(function(resolve, reject) {
            W.fire("open", {
                name: name,
                onclose: resolve
            });
        });
    },

    param: function(name) {
        var W = this;
        return W._params && W._params[name];
    },

    reload: function() {
        var W = this, scope = W.scope, page = scope.page;
        if (!page) {
            // NOP
            return;
        }

        W.fire({
            type: 'unload',
            bubbles: false
        });

        if (W._calling) {
            for (var i = 0; i < W._calling.length; i++) {
                W._calling[i].cancel();
            }
        }

        if (scope) {
            delete W.scope;
            scope.mbody && scope.mbody.detach();
        }

        W.load(page);
    },

    setInterval: function(fn, interval) {
        var W = this, lock;
        var handle = window.setInterval(function() {
            if (lock) {
                return;
            } else {
                lock = true;
                W.call(fn).then(function(ret) {
                    lock = false;
                    if (ret === undefined || ret) {
                        W.digest();
                    }
                }, function(e) {
                    lock = false;
                    throw e;
                });
            }
        }, interval);

        W.on("unload", function() {
            window.clearInterval(handle);
        });

        return handle;
    },

    setTimeout: function(fn, timeout) {
        var W = this;
        var handle = window.setTimeout(function() {
            W.call(fn).then(function(ret) {
                if (ret === undefined || ret) {
                    W.digest();
                }
            });
        }, timeout);

        W.on("unload", function() {
            window.clearTimeout(handle);
        });

        return handle;
    },

    sleep: function(ms) {
        var handle;
        var promise = new Promise(function(resolve, reject) {
            handle = window.setTimeout(resolve, ms);
        });
        promise.cancel = function() {
            window.clearTimeout(handle);
        };
        return promise;
    },

    which: function(elem) {
        var W = this, scope = W.scope;

        var children = W.children;
        for (var i = 0; i < children.length; i++) {
            var w = children[i].which(elem);
            if (w) return w;
        }

        var markBeg = W.node.markBeg,
            markEnd = W.node.markEnd,
            parent = markBeg.parentNode;
        if (parent.contains(elem)) {
            for (var node = markBeg.nextSibling; node !== markEnd; node = node.nextSibling) {
                if (node.nodeType !== 1) continue;
                if (node.contains(elem)) {
                    return W;
                }
            }
        }

        return null;
    }
});
