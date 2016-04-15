'use strict';

const extend = require('util')._extend;
const Request = require('request');
const thunkify = require('thunkify');
const debug = require('debug')('koa-grace:proxy');

function requestWap(url, opt, callback) {
  let option = extend({
    req: undefined, // request
    res: undefined, // response
    method: undefined, // method
    needPipeReq: true, // 是否需要同步request
    needPipeRes: false, // 是否需要同步request
    json: false, // 是否是json数据
    headers: undefined, // 是否是json数据
    gzip: true
  }, opt);

  let ProxyServer = Request({
    uri: url,
    method: option.method,
    headers: option.headers,
    json: option.json,
    gzip: option.gzip
  }, function(err, httpResponse, data) {
    // DEBUG
    if(!err){
      debug('proxy success : ' + url);
    }else{
      debug('proxy error : ' + url , err);
      data = err;
    }

    callback(null, httpResponse, data);
  });

  if (option.req && option.needPipeReq) {
    option.req.pipe(ProxyServer);
  }

  if (option.res && option.needPipeRes) {
    ProxyServer.pipe(option.res);
  }
}

module.exports = thunkify(requestWap)
