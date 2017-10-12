var fs = require("fs");
var gulp = require("gulp");
var browserify = require("browserify");

gulp.task("default", function() {
    try {
        fs.mkdirSync("dist");
    } catch (e) {
        if (e.code !== 'EEXIST') {
            throw e;
        }
    }
    return browserify({entries: "src/index.js"})
        .ignore("less")
        .bundle()
        .pipe(fs.createWriteStream("dist/W.js"));
});
