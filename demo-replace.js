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
            var headers = ['HTTP/' + info.versionMajor + '.' + info.versionMinor + ' ' + info.statusCode + ' ' + info.statusMessage];
            for (var i = 0; i < info.headers.length; i += 2) {
                var key = info.headers[i].toLowerCase();
                if (key == 'content-length') {
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
            var body = this.chunk.substr(offset, length).replace(/Baiduspider/, 'badxxxxx!!!');
            var size = body.length.toString(16);
            var header = this.chunk.substr(0, offset);
            this.chunk = header + size + '\r\n' + body + '\r\n';
            this.offset = offset + size.length + 4 + body.length;
            this.end = this.chunk.length;
        };

        parser.onMessageComplete = function(info) {
            this.chunk += '0\r\n\r\n';
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
    if (args.url.indexOf('https://www.baidu.com/robots.txt') === 0) {
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
function scriptFilterFree(id) {
    console.log('free ' + id);
    delete localStorage[id];
}