"use strict";
const path = require("path");
const fileURL = require("file-url");
const childProcess = require("pn/child_process");

const phantomjsCmd = require("phantomjs-prebuilt").path;
const converterFileName = path.resolve(__dirname, "./converter.js");

// Identifier prefixes for each format.
const RESULT_IDENTIFIERS = {
          PNG: 'data:image/png;base64,',
          JPG: 'data:image/jpg;base64,'
        };

module.exports = (sourceBuffer, options) => {
    return Promise.resolve().then(() => { // catch thrown errors
        console.log('about to call phantom process')
        const cp = childProcess.execFile(phantomjsCmd, getPhantomJSArgs(options), { maxBuffer: Infinity });

        console.log('sending stdin')
        writeBufferInChunks(cp.stdin, sourceBuffer);

        console.log('returning results')
        return cp.promise.then(processResult, options.format);
    });
};

module.exports.sync = (sourceBuffer, options) => {
    const result = childProcess.spawnSync(phantomjsCmd, getPhantomJSArgs(options), {
        input: sourceBuffer.toString("utf8")
    });
    return processResult(result, options.format);
};

function getPhantomJSArgs(options = {}) {
    if (options.filename !== undefined && options.url !== undefined) {
        throw new Error("Cannot specify both filename and url options");
    }

    // Convert filename option to url option
    if (options.filename !== undefined) {
        options = Object.assign({ url: fileURL(options.filename) }, options);
        delete options.filename;
    }

    // Determine the format that has been requested.
    // If none was specified, use PNG.
    if (!options.format) {
      options.format = 'PNG';
    }

    // Normalize and validate the requested format.
    options.format = options.format.toUpperCase();
    if (['PNG', 'JPG'].indexOf(options.format) === -1) {
      console.error("Invalid file format specified. Must be png or jpg.");
      phantom.exit();
      return;
    }

    console.log(options);
    return [
        converterFileName,
        JSON.stringify(options)
    ];
}

function writeBufferInChunks(writableStream, buffer) {
    const asString = buffer.toString("utf8");

    const INCREMENT = 1024;

    writableStream.cork();
    for (let offset = 0; offset < asString.length; offset += INCREMENT) {
        writableStream.write(asString.substring(offset, offset + INCREMENT));
    }
    writableStream.end();
}

function processResult(result, format) {
    const stdout = result.stdout.toString();
    console.log('Got stdout of length: ' + stdout.length)
    console.log('head of stdout: ' + stdout.substring())
    if (stdout.startsWith(RESULT_IDENTIFIERS[format])) {
        return new Buffer(stdout.substring(RESULT_IDENTIFIERS[format].length), "base64");
    }

    if (stdout.length > 0) {
         // PhantomJS always outputs to stdout.
         throw new Error(stdout.replace(/\r/g, "").trim());
    }

    const stderr = result.stderr.toString();
    if (stderr.length > 0) {
        // But hey something else might get to stderr.
        throw new Error(stderr.replace(/\r/g, "").trim());
    }

    throw new Error("No data received from the PhantomJS child process");
}
