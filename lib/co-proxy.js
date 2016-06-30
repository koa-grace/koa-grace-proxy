'use strict';

const Stream = require('stream');
const Request = require('request');
const thunkify = require('thunkify');
const debug = require('debug')('koa-grace:proxy');
const error = require('debug')('koa-grace-error:proxy');


/**
 * request包装成promise函数
 * @param  {Object}   param    参数
 *         {Object}   param.ctx.req request
 *         {Object}   param.ctx.res response
 *         {Boolean}   param.needPipeRes 是否需要pipe response
 * @param  {Object}   options  Request配置项
 * @param  {Function} callback 回调函数
 */
function requestWap(param, options, callback) {
  // 获取request参数
  let opt = Object.assign({
    uri: undefined, // 请求路径
    method: undefined, // method
    headers: undefined, // 头信息
    json: false, // 是否是json数据
    gzip: true, //是否gzip
    timeout: 15000 // 超时时间
  }, {
    form: param.ctx.request.body
  }, options);

  debug('proxying : ' + opt.uri);

  // 发送请求
  let ProxyServer = Request(opt, function(err, httpResponse, data) {
    if (!err && data) {
      debug('proxy success : ' + opt.uri);
    } else {
      err = err || new Error('THE REQUEST NO RESPONSE!');
      error('proxy error : ' + opt.uri, err);
      data = err;
    }

    // 如果有报错且有错误捕获方法
    if (err && param.ravenClient) {
      param.ravenClient && param.ravenClient.captureException(err);
    }

    callback(null, httpResponse, data);
  });

  // 如果ctx.request.body已经有值，说明request pipe已经结束，则不需要pipe
  if (param.ctx.req.readable) {
    param.ctx.req.pipe(ProxyServer);
  }

  if (param.needPipeRes) {
    ProxyServer.pipe(param.ctx.res);
    // pipe response到body中 ，more at:https://github.com/request/request/issues/887#issuecomment-53965077
    // 在文件很大的情况下以下这种方式会有问题：
    // param.ctx.body = ProxyServer.pipe(Stream.PassThrough());
  }
}

module.exports = thunkify(requestWap);
