'use strict';

const extend = require('util')._extend;
const Request = require('request');
const thunkify = require('thunkify');
const debug = require('debug')('koa-grace:proxy');

/**
 * request包装成promise函数
 * @param  {Object}   param    参数
 *         {Object}   param.req request
 *         {Object}   param.res response
 *         {Boolean}   param.needPipeReq 是否需要pipe request
 *         {Boolean}   param.needPipeRes 是否需要pipe response
 * @param  {Object}   options  Request配置项
 * @param  {Function} callback 回调函数
 */
function requestWap(param, options, callback) {
  let opt = extend({
    uri: undefined, // 请求路径
    method: undefined, // method
    headers: undefined, // 头信息
    json: false, // 是否是json数据
    gzip: true, //是否gzip
    timeout: 15000 // 超时时间
  }, options);

  let ProxyServer = Request(opt, function(err, httpResponse, data) {
    if(!err){
      debug('proxy success : ' + opt.uri);
    }else{
      debug('proxy error : ' + opt.uri , err);
      data = err;
    }
    callback(null, httpResponse, data);
  });

  if (param.req && param.needPipeReq) {
    param.req.pipe(ProxyServer);
  }

  if (param.res && param.needPipeRes) {
    ProxyServer.pipe(param.res);
  }
}

module.exports = thunkify(requestWap)
