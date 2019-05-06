/*
 * test filter api
 * @author Li Guangming
 */

const localStorage = {};

function testFilterResponse(args) {
    if (!localStorage[args.uuid]) {
        localStorage[args.uuid] = {};
    }

    var parser = localStorage[args.uuid][args.type];

    if (parser) {
        return parser.execute(args.data);
    }

    parser = localStorage[args.uuid][args.type] = new HTTPParser(args.type);

    if (args.type == 'REQUEST') {
        parser.onHeadersComplete = function(info) {
            var headers = [info.method + ' ' + info.url + ' HTTP/1.0'];
            for (var i = 0; i < info.headers.length; i += 2) {
                var key = info.headers[i].toLowerCase();
                if (key == 'content-encoding') {
                    headers.push(info.headers[i] + ': identity');
                } else if (key == 'accept-encoding') {
                    headers.push(info.headers[i] + ': identity');
                } else {
                    var value = info.headers[i + 1];
                    headers.push(info.headers[i] + ': ' + value);
                }
            }
            var header = headers.join('\r\n') + '\r\n\r\n';
            if (this.offset < this.end) {
                this.chunk = header + this.chunk.substring(this.offset, this.end);
                this.offset = header.length;
            } else {
                this.chunk = header;
            }
            return true; // skip body parse
        }
    } else {
        parser.onHeadersComplete = function(info) {
            var response_line = 'HTTP/' + info.versionMajor + '.' + info.versionMinor + ' ' + info.statusCode;
            if (info.statusMessage) {
                response_line += ' ' + info.statusMessage;
            }

            this.chunked = false;

            var headers = [response_line];
            for (var i = 0; i < info.headers.length; i += 2) {
                var key = info.headers[i].toLowerCase();
                if (key === 'content-length' || key === 'transfer-encoding') {
                    this.chunked = true;
                    headers.push('Transfer-Encoding: chunked');
                } else {
                    var value = info.headers[i + 1];
                    headers.push(info.headers[i] + ': ' + value);
                }
            }

            var header = headers.join('\r\n') + '\r\n\r\n';

            if (this.offset < this.end) {
                this.chunk = header + this.chunk.substring(this.offset, this.end);
            } else {
                this.chunk = header;
            }

            this.end = this.chunk.length;
            this.offset = header.length;
        }

        parser.onBody = function(chunk, offset, length) {
            /* TODO: stream replace */
            var extra = chunk.substring(offset + length + (this.isChunked ? 2 : 0)) || "";

            if (this.isChunked) {
                var size = length.toString(16).length + 2;
                chunk = chunk.substr(0, offset - size) + chunk.substring(offset, this.end);
                offset -= size;
                this.end -= size;
            }

            var header = chunk.substr(0, offset);
            var body = chunk.substr(offset, length).replace(/Disallow/g, 'Allow');

            if (this.chunked) {
                var size = body.length.toString(16);
                chunk = header + size + '\r\n' + body + '\r\n' + extra;
                this.offset = offset + size.length + 4 + body.length;
                if (this.isChunked) {
                    this.body_bytes = body.length;
                }
            } else {
                chunk = header + body + extra;
                this.offset = offset + body.length;
            }

            this.chunk = chunk;
            this.end = chunk.length;
        };

        parser.onMessageComplete = function(info) {
            if (this.chunked) {
                this.chunk += '0\r\n\r\n';
            }
        }
    }

    return parser.execute(args.data);
}

/**
 * Filter HTTP request and response.
 * @param {object}: arguments
 *                  args.type:      REQUEST or RESPONSE
 *                  args.uuid:      http request UUID
 *                  args.url:       http request url
 *                  args.data:      http raw data
 *                  args.response:  function(data){}
 *                  args.encoding:  1:ascii or 4:utf-8
 * @returns {string|boolean|undefined|null} string: return modified data,
                                            boolean: close connection,
                                            undefined: do not modify data,
                                            null: quit script filter
 */
function scriptFilterExecute(args) {
    console.log('filter ' + args.uuid);
    console.log('url ' + args.url);
    if (args.url.indexOf('baidu.com/robots.txt') !== -1) {
        var result = testFilterResponse(args);
        if (result.chunk) {
            return result.chunk;
        }
    } else {
        return null;
    }
}

/*
 * Release filter values.
 * @param {string}: http request UUID
 */
function scriptFilterFree(uuid) {
    console.log('free ' + uuid);
    delete localStorage[uuid];
}
