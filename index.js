var re = /[^]*\/\*\n([^]*)\*\/\}$/;
var examples = {
    hello: (function() {/*
<h1>Hello ${msg}</h1>

<script>
var msg = "W.js";
</script>
*/}).toString().match(re)[1],

    bind: (function() {/*
<label>Say hello to</label>
<input type="text" class="form-control" value:="name">

<h1>Hello ${name}</h1>

<script>
var name = "yourname";
</script>
*/}).toString().match(re)[1],

    loop: (function() {/*
<ul for:="x of arr">
    <li if:="x!=3">${x}</li>
</ul>

<script>
var arr = [1, 2, 3, 4, 5];
</script>
*/}).toString().match(re)[1],

    event: (function() {/*
<button onclick:="color='red'" class="btn btn-default">RED</button>
<button onclick:="color='green'" class="btn btn-default">GREEN</button>
<button onclick:="color='blue'" class="btn btn-default">BLUE</button>

<h1>Hello <span style="color:${color}">COLOR</span></h1>

<script>
var color = "black";
</script>
*/}).toString().match(re)[1],

    widget: [(function() {/*
<link rel="import" href="my-hello.html">

<my-hello name="${msg}"></my-hello>

<script>
var msg = "from main.html";
</script>
*/}).toString().match(re)[1], ['my-hello.html', (function() {/*
<template w-widget>
    <my-hello name:="x"></my-hello>
</template>

<h1>Hello ${x}</h1>

<script>
var x;
</script>
*/}).toString().match(re)[1]]],

    ref: (function() {/*
<div class="input-group">
    <input ref:="$input" type="text" class="form-control" value="Some text...">
    <span class="input-group-btn">
        <button onclick:="$input.select()" class="btn btn-default">Select!</button>
    </span>
</div>

<script>
var $input;
</script>
*/}).toString().match(re)[1],
};

function loadExample(name) {
    var example = examples[name];
    return loadPages((example instanceof Array ? example : [example]).map(function(ex) {
        if (typeof ex === "string") {
            return {href: "main.html", content: ex};
        } else {
            return {href: ex[0], content: ex[1]};
        }
    }));
    // window.source = window.sessionStorage.source = samples[name];
    // cm.setValue(window.source);
    // W.js.reloadPage("var://source");
}

var cm;
var current;

function loadPages(pages) {
    window.sessionStorage.clear();
    window.sessionStorage._pages = JSON.stringify(pages.map(function(page) { return page.href; }));

    var $ul = $("#pages");
    $ul.empty();
    for (var i = 0; i < pages.length; i++) {
        var href = pages[i].href;
        var content = pages[i].content;

        window.sessionStorage[href] = content;

        W.js.definePage(href, content);

        var $li = $("<li>").append($("<a href=\"#\">").text(href));
        if (i == 0) {
            current = href;
            cm.setValue(content);
            $li.addClass("active");
        }
        $li.click((function(href) {
            return function() {
                $ul.find("li.active").removeClass("active");
                current = href;
                cm.setValue(window.sessionStorage[href]);
                $(this).addClass("active");
            };
        })(href));
        $ul.append($li);
    }
    $ul.append($("<li>").append($("<a>").text("+")));
}

$(function() {
    cm = CodeMirror.fromTextArea(document.getElementById("code"), {
        mode: "htmlmixed",
        lineNumbers: true,
        lineWrapping: true
    });

    cm.on("change", function() {
        var content = window.sessionStorage[current] = cm.getValue();
        W.js.definePage(current, content);
        W.js.reloadPage(current, {useCache: true});
    });

    if (window.sessionStorage.length) {
        loadPages(JSON.parse(window.sessionStorage._pages).map(function(href) {
            return {href: href, content: window.sessionStorage[href]};
        }));
    } else {
        loadExample('hello');
    }

    W.js("#main", "<w href=\"main.html\"></w>");
});
