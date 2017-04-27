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

        it("${val,HTML}", function(done) {
            W.js("#main", "${val,HTML}<script>var val=\"<button>OK</button>\";</script>").on("load", function() {
                try {
                    expect($("#main button").length).to.be(1);
                    done();
                } catch (e) {
                    done(e);
                }
            });
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

        // it("attr=\"a\" attr:=\"'b'\"", function(done) {
        //     W.js("#main", "<div class=\"a\" class:=\"'b'\"></div>").on("load", function() {
        //         try {
        //             expect(html("#main")).to.be("<div class=\"b\"></div>");
        //             done();
        //         } catch (e) {
        //             done(e);
        //         }
        //     });
        // });

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

        it("ref:", function(done) {
            (function(W) {
                W.on("load", function() {
                    try {
                        expect(W.state.x.nodeName).to.be("DIV");
                        done();
                    } catch (e) {
                        done(e);
                    }
                });
            })(W.js("#main", "<div ref:=\"x\"></div><script>var x;</script>"));
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

        it("add/remove", function(done) {
            (function(W) {
                W.on("load", function() {
                    try {
                        expect(html("#main")).to.be("<ul><li>1</li><li>2</li><li>3</li></ul>");
                        W.state.arr.push(4);
                        W.digest();
                        expect(html("#main")).to.be("<ul><li>1</li><li>2</li><li>3</li><li>4</li></ul>");
                        W.state.arr.length = 2;
                        W.digest();
                        expect(html("#main")).to.be("<ul><li>1</li><li>2</li></ul>");
                        done();
                    } catch (e) {
                        done(e);
                    }
                });
            })(W.js("#main", "<ul for:=\"x of arr\"><li>${x}</li></ul><script>var arr=[1,2,3];</script>"));
        });

        it("merge attribute", function(done) {
            (function(W) {
                W.on("load", function() {
                    try {
                        expect(html("#main")).to.be("<div id=\"a\"></div>");
                        W.state.id = 'b';
                        W.digest();
                        expect(html("#main")).to.be("<div id=\"b\"></div>");
                        W.state.id = 'c';
                        W.digest();
                        expect(html("#main")).to.be("<div id=\"c\"></div>");
                        done();
                    } catch (e) {
                        done(e);
                    }
                });
            })(W.js("#main", "<div id:=\"id\"></div><script>var id='a';</script>"));
        });

        it("merge node", function(done) {
            (function(W) {
                W.on("load", function() {
                    try {
                        expect(html("#main")).to.be("<a></a>");
                        W.state.a = false;
                        W.state.b = true;
                        W.digest();
                        expect(html("#main")).to.be("<b></b>");
                        W.state.a = true;
                        W.state.b = false;
                        W.digest();
                        expect(html("#main")).to.be("<a></a>");
                        done();
                    } catch (e) {
                        done(e);
                    }
                });
            })(W.js("#main", "<a if:=\"a\"></a><b if:=\"b\"></b><script>var a = true, b = false;</script>"));
        });

        it("merge html", function(done) {
            (function(W) {
                W.on("load", function() {
                    try {
                        expect(html("#main")).to.be("<div><a></a></div>");
                        W.state.x = '<b></b>';
                        W.digest();
                        expect(html("#main")).to.be("<div><b></b></div>");
                        W.state.x = '<a><b></b></a>';
                        W.digest();
                        expect(html("#main")).to.be("<div><a><b></b></a></div>");
                        done();
                    } catch (e) {
                        done(e);
                    }
                });
            })(W.js("#main", "<div>${x,HTML}</div><script>var x = '<a></a>';</script>"));
        });
    });

    describe("Widget", function() {
        it("href", function(done) {
            W.js.definePage("hello.html", "Hello W.js");
            W.js("#main", "<w href=\"hello.html\"></w>").on("load", function() {
                window.setTimeout(function() {
                    try {
                        expect(html("#main")).to.be("Hello W.js");
                        done();
                    } catch (e) {
                        done(e);
                    }
                }, 100);
            });
        });

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

        it("merge", function(done) {
            W.js.definePage("widget/ww-hello.html", [
                "<template w-widget>"+
                    "<ww-hello name:=\"name\"></ww-hello>"+
                "</template>"+
                "Hello ${name}"+
                "<script>"+
                "var name;"+
                "</script>"].join(""));
            (function(W) {
                W.on("load", function() {
                    try {
                        expect(html("#main")).to.be("Hello W.js");
                        W.state.x = 'W.js after digest';
                        W.digest();
                        expect(html("#main")).to.be("Hello W.js after digest");
                        done();
                    } catch (e) {
                        done(e);
                    }
                });
            })(W.js("#main", "<link rel=\"import\" href=\"widget/ww-hello.html\"><ww-hello name=\"${x}\"></ww-hello><script>var x = 'W.js';</script>"));
        });

        it("export", function(done) {
            W.js.definePage("widget/ww-hello.html", [
                "<template w-widget>"+
                    "<ww-hello name:=\"name\"></ww-hello>"+
                "</template>"+
                "Hello ${name}"+
                "<script>"+
                "var name;"+
                "exports.getName = function() { return name; };"+
                "</script>"].join(""));
            (function(W) {
                W.on("load", function() {
                    try {
                        expect(W.state.ref.getName()).to.be("W.js");
                        done();
                    } catch (e) {
                        done(e);
                    }
                });
            })(W.js("#main", "<link rel=\"import\" href=\"widget/ww-hello.html\"><ww-hello ref:=\"ref\" name=\"${x}\"></ww-hello><script>var x = 'W.js';var ref;</script>"));
        });
    });

    describe("Misc", function() {
        it("Ignore whitespaces", function(done) {
            W.js("#main", "<w for:=\"c of [1,2,3]\" ->\n\t<button>${c}</button>\n</w>").on("load", function() {
                try {
                    expect(html("#main")).to.be("<button>1</button><button>2</button><button>3</button>");
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });
    });
});
