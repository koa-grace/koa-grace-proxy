'use strict';

const extend = require('util')._extend;
const Request = require('request');
const thunkify = require('thunkify');
const debug = require('debug')('koa-grace:proxy');

/**
 * request包装成promise函数
 * @param  {Object}   param    参数
 *         {Object}   param.ctx.req request
 *         {Object}   param.ctx.res response
 *         {Boolean}   param.needPipeReq 是否需要pipe request
 *         {Boolean}   param.needPipeRes 是否需要pipe response
 * @param  {Object}   options  Request配置项
 * @param  {Function} callback 回调函数
 */
function requestWap(param, options, callback) {
  // 如果ctx.request.body已经有值，说明request pipe已经结束，直接将body写入form即可
  // 另外需要把headers中的headers['content-length']删除，否则长度不符requeset不会认为当前请求已经结束
  if (param.ctx.request.body) {
    options.form = param.ctx.request.body;
    delete options.headers['content-length'];
  }

  // 获取request参数
  let opt = extend({
    uri: undefined, // 请求路径
    method: undefined, // method
    headers: undefined, // 头信息
    json: false, // 是否是json数据
    gzip: true, //是否gzip
    timeout: 15000 // 超时时间
  }, options);

  debug('proxying : ' + opt.uri);

  // 发送请求
  let ProxyServer = Request(opt, function(err, httpResponse, data) {
    if (!err) {
      debug('proxy success : ' + opt.uri);
    } else {
      debug('proxy error : ' + opt.uri, err);
      data = err;
    }
    callback(null, httpResponse, data);
  });

  // 如果ctx.request.body已经有值，说明request pipe已经结束，则不需要pipe
  if (!param.ctx.request.body) {
    param.needPipeReq = false;
  }

  if (param.ctx.req && param.needPipeReq) {
    param.ctx.req.pipe(ProxyServer);
  }

  if (param.ctx.res && param.needPipeRes) {
    ProxyServer.pipe(param.ctx.res);
  }
}

module.exports = thunkify(requestWap);
