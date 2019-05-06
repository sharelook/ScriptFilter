/*
 * test filter api
 * @author Li Guangming
 */

const localStorage = {};

function testMockResponse(args) {
    var body = '<h1>' + (new Date().toGMTString()) + '</h1>';
    args.response('HTTP/1.1 200 OK\r\nContent-Type: text/html;chatset=utf-8\r\nContent-Length: ' + body.length + '\r\n\r\n' + body);
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
    if (args.url.indexOf('http://baidu.com/robots.txt') === 0) {
        testMockResponse(args);
        return true;
    }
    return null;
}

/*
 * Release filter values.
 * @param {string}: http request UUID
 */
function scriptFilterFree(uuid) {
    console.log('free ' + uuid);
    delete localStorage[uuid];
}
