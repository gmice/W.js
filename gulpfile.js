var fs = require("fs");
var gulp = require("gulp");
var browserify = require("browserify");

gulp.task("default", function() {
    return browserify({entries: "src/index.js"})
        .bundle()
        .pipe(fs.createWriteStream("dist/w.js"));
});
