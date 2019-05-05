# ScriptFilter
Shadowrocket script-filter.js

### Enable script filter for rule:
    DOMAIN,example.com,DIRECT,script-filter
    DOMAIN,example.net,PROXY,script-filter
    
### Enable script filter for url rewrite:

    ^http://example.com/robots.txt _ direct script-filter
    ^http://example.net/robots.txt _ proxy script-filter
    

## Script Filter API

### scriptFilterExecute(args)

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
    }

### scriptFilterFree(uuid)

    /*
     * Release filter values.
     * @param {string}: http request UUID
     */
    function scriptFilterFree(uuid) {
        console.log('free ' + uuid);
    }
