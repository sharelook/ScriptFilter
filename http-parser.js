/*jshint node:true */
/*
Copyright (c) 2015 Tim Caswell (https://github.com/creationix) and other contributors. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var console = (function() {

    function isObjectObject(o) {
        return Object.prototype.toString.call(o) === '[object Object]';
    }

    function isPlainObject(o) {
        var ctor, prot;

        if (isObjectObject(o) === false) {
            return false;
        }

        // If has modified constructor
        ctor = o.constructor;
        if (typeof ctor !== 'function') {
            return false;
        }

        // If has modified prototype
        prot = ctor.prototype;
        if (isObjectObject(prot) === false) {
            return false;
        }

        // If constructor does not have an Object-specific method
        if (prot.hasOwnProperty('isPrototypeOf') === false) {
            return false;
        }

        // Most likely a plain Object
        return true;
    }

    function jsPrint() {
        if (arguments.length == 0) {
            print('');
        } else if (arguments.length == 1) {
            if (isPlainObject(arguments[0])) {
                print(JSON.stringify(arguments[0], function(k, v) {
                    return typeof v === 'function' ? v.toString() : v
                }, 4));
            } else {
                print(arguments[0]);
            }
        } else {
            print(JSON.stringify(Array.from(arguments), function(k, v) {
                return typeof v === 'function' ? v.toString() : v
            }, 4));
        }
    }

    return {
        log: jsPrint,
        info: jsPrint,
        error: jsPrint,
        debug: jsPrint,
        warn: jsPrint
    };
})();

var HTTPParser = (function(global) {
    function parseErrorCode(code) {
        var err = new Error('Parse Error');
        err.code = code;
        return err;
    }

    function HTTPParser(type) {
        if (!(this instanceof HTTPParser)) {
            return new HTTPParser(type);
        }
        this.type = type;
        this.state = type + '_LINE';
        this.info = {
            headers: [],
            upgrade: false
        };
        this.trailers = [];
        this.line = '';
        this.isChunked = false;
        this.connection = '';
        this.headerSize = 0; // for preventing too big headers
        this.body_bytes = null;
        this.hadError = false;
    }

    HTTPParser.maxHeaderSize = 80 * 1024; // maxHeaderSize (in bytes) is configurable, but 80kb by default;
    HTTPParser.REQUEST = 'REQUEST';
    HTTPParser.RESPONSE = 'RESPONSE';
    var kOnHeaders = HTTPParser.kOnHeaders = 0;
    var kOnHeadersComplete = HTTPParser.kOnHeadersComplete = 1;
    var kOnBody = HTTPParser.kOnBody = 2;
    var kOnMessageComplete = HTTPParser.kOnMessageComplete = 3;

    // Some handler stubs, needed for compatibility
    HTTPParser.prototype[kOnHeaders] =
        HTTPParser.prototype[kOnHeadersComplete] =
        HTTPParser.prototype[kOnBody] =
        HTTPParser.prototype[kOnMessageComplete] = function() {};

    HTTPParser.prototype.reinitialize = HTTPParser;

    var headerState = {
        REQUEST_LINE: true,
        RESPONSE_LINE: true,
        HEADER: true
    };

    HTTPParser.prototype.execute = function(chunk, start, length) {
        if (!(this instanceof HTTPParser)) {
            throw new TypeError('not a HTTPParser');
        }

        // backward compat to node < 0.11.4
        // Note: the start and length params were removed in newer version
        start = start || 0;
        length = typeof length === 'number' ? length : chunk.length;

        this.chunk = chunk;
        this.offset = start;
        this.end = start + length;

        try {
            while (this.offset < this.end) {
                if (this[this.state]()) {
                    break;
                }
            }
        } catch (err) {
            console.log(err);
            this.hadError = true;
            return {
                length: 0,
                err: err
            };
        }

        if (chunk != this.chunk) {
            chunk = this.chunk;
        } else {
            chunk = null;
        }

        this.chunk = null;

        length = this.offset - start;
        if (headerState[this.state]) {
            this.headerSize += length;
            if (this.headerSize > HTTPParser.maxHeaderSize) {
                return new Error('max header size exceeded');
            }
        }

        return {
            length: length,
            chunk: chunk
        };
    };

    var stateFinishAllowed = {
        REQUEST_LINE: true,
        RESPONSE_LINE: true,
        BODY_RAW: true
    };

    HTTPParser.prototype.finish = function() {
        if (this.hadError) {
            return;
        }
        if (!stateFinishAllowed[this.state]) {
            return new Error('invalid state for EOF');
        }
        if (this.state === 'BODY_RAW') {
            this[kOnMessageComplete]();
        }
    };

    // These three methods are used for an internal speed optimization, and it also
    // works if theses are noops. Basically consume() asks us to read the bytes
    // ourselves, but if we don't do it we get them through execute().

    HTTPParser.prototype.nextRequest = function() {
        this[kOnMessageComplete]();
        this.reinitialize(this.type);
    };

    HTTPParser.prototype.consumeLine = function() {
        var end = this.end,
            chunk = this.chunk;
        for (var i = this.offset; i < end; i++) {
            if (chunk.charAt(i) === '\n') { // \n
                var line = this.line + chunk.substring(this.offset, i);
                if (line.charAt(line.length - 1) === '\r') {
                    line = line.substr(0, line.length - 1);
                }
                this.line = '';
                this.offset = i + 1;
                return line;
            }
        }
        //line split over multiple chunks
        this.line += chunk.substring(this.offset, this.end);
        this.offset = this.end;
    };

    var headerExp = /^([^: \t]+):[ \t]*((?:.*[^ \t])|)/;
    var headerContinueExp = /^[ \t]+(.*[^ \t])/;
    HTTPParser.prototype.parseHeader = function(line, headers) {
        if (line.indexOf('\r') !== -1) {
            throw parseErrorCode('HPE_LF_EXPECTED');
        }

        var match = headerExp.exec(line);
        var k = match && match[1];
        if (k) { // skip empty string (malformed header)
            headers.push(k);
            headers.push(match[2]);
        } else {
            var matchContinue = headerContinueExp.exec(line);
            if (matchContinue && headers.length) {
                if (headers[headers.length - 1]) {
                    headers[headers.length - 1] += ' ';
                }
                headers[headers.length - 1] += matchContinue[1];
            }
        }
    };

    var requestExp = /^([A-Z-]+) ([^ ]+) HTTP\/(\d)\.(\d)$/;
    HTTPParser.prototype.REQUEST_LINE = function() {
        var line = this.consumeLine();
        if (!line) {
            return;
        }
        var match = requestExp.exec(line);
        if (match === null) {
            throw parseErrorCode('HPE_INVALID_CONSTANT');
        }
        this.info.method = match[1];
        this.info.url = match[2];
        this.info.versionMajor = +match[3];
        this.info.versionMinor = +match[4];
        this.body_bytes = 0;
        this.state = 'HEADER';
    };

    var responseExp = /^HTTP\/(\d)\.(\d) (\d{3}) ?(.*)$/;
    HTTPParser.prototype.RESPONSE_LINE = function() {
        var line = this.consumeLine();
        if (!line) {
            return;
        }
        var match = responseExp.exec(line);
        if (match === null) {
            throw parseErrorCode('HPE_INVALID_CONSTANT');
        }
        this.info.versionMajor = +match[1];
        this.info.versionMinor = +match[2];
        var statusCode = this.info.statusCode = +match[3];
        this.info.statusMessage = match[4];
        // Implied zero length.
        if ((statusCode / 100 | 0) === 1 || statusCode === 204 || statusCode === 304) {
            this.body_bytes = 0;
        }
        this.state = 'HEADER';
    };

    HTTPParser.prototype.shouldKeepAlive = function() {
        if (this.info.versionMajor > 0 && this.info.versionMinor > 0) {
            if (this.connection.indexOf('close') !== -1) {
                return false;
            }
        } else if (this.connection.indexOf('keep-alive') === -1) {
            return false;
        }
        if (this.body_bytes !== null || this.isChunked) { // || skipBody
            return true;
        }
        return false;
    };

    HTTPParser.prototype.HEADER = function() {
        var line = this.consumeLine();
        if (line === undefined) {
            return;
        }
        var info = this.info;
        if (line) {
            this.parseHeader(line, info.headers);
        } else {
            var headers = info.headers;
            var hasContentLength = false;
            var currentContentLengthValue;
            var hasUpgradeHeader = false;
            for (var i = 0; i < headers.length; i += 2) {
                switch (headers[i].toLowerCase()) {
                    case 'transfer-encoding':
                        this.isChunked = headers[i + 1].toLowerCase() === 'chunked';
                        break;
                    case 'content-length':
                        currentContentLengthValue = +headers[i + 1];
                        if (hasContentLength) {
                            // Fix duplicate Content-Length header with same values.
                            // Throw error only if values are different.
                            // Known issues:
                            // https://github.com/request/request/issues/2091#issuecomment-328715113
                            // https://github.com/nodejs/node/issues/6517#issuecomment-216263771
                            if (currentContentLengthValue !== this.body_bytes) {
                                throw parseErrorCode('HPE_UNEXPECTED_CONTENT_LENGTH');
                            }
                        } else {
                            hasContentLength = true;
                            this.body_bytes = currentContentLengthValue;
                        }
                        break;
                    case 'connection':
                        this.connection += headers[i + 1].toLowerCase();
                        break;
                    case 'upgrade':
                        hasUpgradeHeader = true;
                        break;
                }
            }

            // if both isChunked and hasContentLength, isChunked wins
            // This is required so the body is parsed using the chunked method, and matches
            // Chrome's behavior.  We could, maybe, ignore them both (would get chunked
            // encoding into the body), and/or disable shouldKeepAlive to be more
            // resilient.
            if (this.isChunked && hasContentLength) {
                hasContentLength = false;
                this.body_bytes = null;
            }

            // Logic from https://github.com/nodejs/http-parser/blob/921d5585515a153fa00e411cf144280c59b41f90/http_parser.c#L1727-L1737
            // "For responses, "Upgrade: foo" and "Connection: upgrade" are
            //   mandatory only when it is a 101 Switching Protocols response,
            //   otherwise it is purely informational, to announce support.
            if (hasUpgradeHeader && this.connection.indexOf('upgrade') != -1) {
                info.upgrade = this.type === HTTPParser.REQUEST || info.statusCode === 101;
            } else {
                info.upgrade = info.method === 'CONNECT';
            }

            info.shouldKeepAlive = this.shouldKeepAlive();
            //problem which also exists in original node: we should know skipBody before calling onHeadersComplete
            var skipBody = this[kOnHeadersComplete](info);
            if (skipBody === 2) {
                this.nextRequest();
                return true;
            } else if (this.isChunked && !skipBody) {
                this.state = 'BODY_CHUNKHEAD';
            } else if (skipBody || this.body_bytes === 0) {
                this.nextRequest();
                // For older versions of node (v6.x and older?), that return skipBody=1 or skipBody=true,
                //   need this "return true;" if it's an upgrade request.
                return info.upgrade;
            } else if (this.body_bytes === null) {
                this.state = 'BODY_RAW';
            } else {
                this.state = 'BODY_SIZED';
            }
        }
    };

    HTTPParser.prototype.BODY_CHUNKHEAD = function() {
        var line = this.consumeLine();
        if (line === undefined) {
            return;
        }
        this.body_bytes = parseInt(line, 16);
        if (!this.body_bytes) {
            this.state = 'BODY_CHUNKTRAILERS';
        } else {
            this.state = 'BODY_CHUNK';
        }
    };

    HTTPParser.prototype.BODY_CHUNK = function() {
        var length = Math.min(this.end - this.offset, this.body_bytes);
        this[kOnBody](this.chunk, this.offset, length);
        this.offset += length;
        this.body_bytes -= length;
        if (!this.body_bytes) {
            this.state = 'BODY_CHUNKEMPTYLINE';
        }
    };

    HTTPParser.prototype.BODY_CHUNKEMPTYLINE = function() {
        var line = this.consumeLine();
        if (line === undefined) {
            return;
        }
        this.state = 'BODY_CHUNKHEAD';
    };

    HTTPParser.prototype.BODY_CHUNKTRAILERS = function() {
        var line = this.consumeLine();
        if (line === undefined) {
            return;
        }
        if (line) {
            this.parseHeader(line, this.trailers);
        } else {
            if (this.trailers.length) {
                this[kOnHeaders](this.trailers, '');
            }
            this.nextRequest();
        }
    };

    HTTPParser.prototype.BODY_RAW = function() {
        var length = this.end - this.offset;
        this[kOnBody](this.chunk, this.offset, length);
        this.offset = this.end;
    };

    HTTPParser.prototype.BODY_SIZED = function() {
        var length = Math.min(this.end - this.offset, this.body_bytes);
        this[kOnBody](this.chunk, this.offset, length);
        this.offset += length;
        this.body_bytes -= length;
        if (!this.body_bytes) {
            this.nextRequest();
        }
    };

    // backward compat to node < 0.11.6
    ['Headers', 'HeadersComplete', 'Body', 'MessageComplete'].forEach(function(name) {
        var k = HTTPParser['kOn' + name];
        Object.defineProperty(HTTPParser.prototype, 'on' + name, {
            get: function() {
                return this[k];
            },
            set: function(to) {
                // hack for backward compatibility
                return (this[k] = to);
            }
        });
    });
    return HTTPParser;
})(this);
