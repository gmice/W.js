function html(selector) {
    var s = $(selector).html();
    s = s.replace(/<!---->/g, "");
    return s;
}

describe("W.js", function() {
    describe("Hello", function() {
        it("Hello W.js", function(done) {
            W.js("#main", "Hello W.js").on("load", function() {
                try {
                    expect(html("#main")).to.be("Hello W.js");
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });
    });

    describe("Text", function() {
        it("${\"const\"}", function(done) {
            W.js("#main", "${\"const\"}").on("load", function() {
                try {
                    expect(html("#main")).to.be("const");
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });

        it("${variable}", function(done) {
            W.js("#main", "${variable}<script>var variable=\"variable\";</script>").on("load", function() {
                try {
                    expect(html("#main")).to.be("variable");
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });

        it("${\"expr\"+ession}", function(done) {
            W.js("#main", "${\"expr\"+ession}<script>var ession=\"ession\";</script>").on("load", function() {
                try {
                    expect(html("#main")).to.be("expression");
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });

        it("${mul}-${ti}-${ple}", function(done) {
            W.js("#main", "${mul}-${ti}-${ple}<script>var mul=\"mul\",ti=\"ti\",ple=\"ple\";</script>").on("load", function() {
                try {
                    expect(html("#main")).to.be("mul-ti-ple");
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });
    });

    describe("Filter", function() {
        it("${val,JSON}", function(done) {
            W.js("#main", "${val,JSON}<script>var val=\"val\";</script>").on("load", function() {
                try {
                    expect(html("#main")).to.be(JSON.stringify("val"));
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });

        it("${val,JSON,JSON}", function(done) {
            W.js("#main", "${val,JSON,JSON}<script>var val=\"val\";</script>").on("load", function() {
                try {
                    expect(html("#main")).to.be(JSON.stringify(JSON.stringify("val")));
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });

        it("${val,CUSTOM}", function(done) {
            W.filter("CUSTOM", function(s) {
                return "---"+s+"---";
            });
            W.js("#main", "${val,CUSTOM}<script>var val=\"val\";</script>").on("load", function() {
                try {
                    expect(html("#main")).to.be("---val---");
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });

        it("${val,CUSTOM('---')}", function(done) {
            W.filter("CUSTOM", function(t) {
                return function(s) {
                    return t+s+t;
                };
            });
            W.js("#main", "${val,CUSTOM('---')}<script>var val=\"val\";</script>").on("load", function() {
                try {
                    expect(html("#main")).to.be("---val---");
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });

        it("${val,PURE}", function(done) {
            var n = 1;
            W.filter("PURE", function(s) {
                return n+":"+s;
            }, {pure: true});
            (function(W) {
                W.on("load", function() {
                    try {
                        expect(html("#main")).to.be("1:val");
                        n = 2;
                        W.digest();
                        expect(html("#main")).to.be("1:val");
                        done();
                    } catch (e) {
                        done(e);
                    }
                });
            })(W.js("#main", "${val,PURE}<script>var val=\"val\";</script>"));
        });

        it("${val,IMPURE}", function(done) {
            var n = 1;
            W.filter("IMPURE", function(s) {
                return n+":"+s;
            }, {pure: false});
            (function(W) {
                W.on("load", function() {
                    try {
                        expect(html("#main")).to.be("1:val");
                        n = 2;
                        W.digest();
                        expect(html("#main")).to.be("2:val");
                        done();
                    } catch (e) {
                        done(e);
                    }
                });
            })(W.js("#main", "${val,IMPURE}<script>var val=\"val\";</script>"));
        });
    });

    describe("Directive", function() {
        it("attr:", function(done) {
            W.js("#main", "<div data-a:=\"'a'\" data-b:=\"'b'\"></div>").on("load", function() {
                try {
                    expect(html("#main")).to.be("<div data-a=\"a\" data-b=\"b\"></div>");
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });

        it("attr=\"a\" attr:=\"'b'\"", function(done) {
            W.js("#main", "<div class=\"a\" class:=\"'b'\"></div>").on("load", function() {
                try {
                    expect(html("#main")).to.be("<div class=\"b\"></div>");
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });

        it("attr=\"a\" attr:=\"null\"", function(done) {
            W.js("#main", "<div class=\"a\" class:=\"null\"></div>").on("load", function() {
                try {
                    expect(html("#main")).to.be("<div class=\"a\"></div>");
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });

        it("attr=\"a ${'b'} c\"", function(done) {
            W.js("#main", "<div class=\"a ${'b'} c\"></div>").on("load", function() {
                try {
                    expect(html("#main")).to.be("<div class=\"a b c\"></div>");
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });

        it("if:", function(done) {
            W.js("#main", "<div if:=\"true\">true</div><div if:=\"false\">false</div>").on("load", function() {
                try {
                    expect(html("#main")).to.be("<div>true</div>");
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });

        it("for:", function(done) {
            W.js("#main", "<ul for:=\"c of [1,2,3]\"><li>${c}-${c$index}</li></ul>").on("load", function() {
                try {
                    expect(html("#main")).to.be("<ul><li>1-0</li><li>2-1</li><li>3-2</li></ul>");
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });

        it("class:x:", function(done) {
            W.js("#main", "<div class=\"a\" class:b:=\"true\" class:c:=\"false\"></div>").on("load", function() {
                try {
                    expect(html("#main")).to.be("<div class=\"a b\"></div>");
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });

        it("onclick:", function(done) {
            window._done = done;
            W.js("#main", "<div onclick:=\"f()\"></div><script>var f = window._done;delete window._done;</script>").on("load", function() {
                $("#main>div").click();
            });
        });
    });

    describe("Digest", function() {
        it("${v}", function(done) {
            (function(W) {
                W.on("load", function() {
                    try {
                        expect(html("#main")).to.be("a");
                        W.state.v = 'b';
                        W.digest();
                        expect(html("#main")).to.be("b");
                        done();
                    } catch (e) {
                        done(e);
                    }
                });
            })(W.js("#main", "${v}<script>var v='a';</script>"));
        });

        it("${v,JSON}", function(done) {
            (function(W) {
                W.on("load", function() {
                    try {
                        expect(html("#main")).to.be(JSON.stringify("a"));
                        W.state.v = 'b';
                        W.digest();
                        expect(html("#main")).to.be(JSON.stringify("b"));
                        done();
                    } catch (e) {
                        done(e);
                    }
                });
            })(W.js("#main", "${v,JSON}<script>var v='a';</script>"));
        });
    });

    describe("Widget", function() {
        it("<ww-hello>", function(done) {
            W.js.definePage("widget/ww-hello.html", "<template w-widget><ww-hello></ww-hello></template>Hello W.js");
            W.js("#main", "<link rel=\"import\" href=\"widget/ww-hello.html\"><ww-hello></ww-hello>").on("load", function() {
                try {
                    expect(html("#main")).to.be("Hello W.js");
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });

        it("<ww-hello name=\"W.js\">", function(done) {
            W.js.definePage("widget/ww-hello.html", [
                "<template w-widget>"+
                    "<ww-hello name:=\"name\"></ww-hello>"+
                "</template>"+
                "Hello ${name}"+
                "<script>"+
                "var name;"+
                "</script>"].join(""));
            W.js("#main", "<link rel=\"import\" href=\"widget/ww-hello.html\"><ww-hello name=\"W.js\"></ww-hello>").on("load", function() {
                try {
                    expect(html("#main")).to.be("Hello W.js");
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });
    });
});
