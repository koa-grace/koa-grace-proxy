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
    // json: option.json, // TODO json为true时：{"code":0,"message":"","data":{"account":"23","ttl":604792,"name":"\u718a\u4f1f\u70c8","email":"xiongweilie@qufenqi.com","mobile":"18101318121","permissions":[{"name":"\u6d4f\u89c8\u6587\u6863","regex":"#"}],"depts":[{"dept_id":"34","dept_code":"222","dept_name":"\u6280\u672f\u90e8","dept_flag":"0"}],"isAuthor":"1","isAdmin":"1","team":"fe"}} 这类数据会有问题
    gzip: option.gzip
  }, function(err, httpResponse, data) {
    debug('proxy success : ' + url);

    if (option.json) {
      let parseData;
      try {
        parseData = JSON.parse(data);
      } catch (err) {
        debug('proxy parse failed : json parse error :' + data);
      }
      data = parseData;
    }

    callback(err, httpResponse, data);
  });

  ProxyServer.on('error', function(err) {
    debug('proxy error : ' + err, err);
  })

  if (option.req && option.needPipeReq) {
    option.req.pipe(ProxyServer);
  }

  if (option.res && option.needPipeRes) {
    ProxyServer.pipe(option.res);
  }
}

module.exports = thunkify(requestWap)
