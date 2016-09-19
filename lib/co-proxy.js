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
  let ProxyServer = _createReq();

  // 如果ctx.request.body已经有值，说明request pipe已经结束，则不需要pipe
  if (param.ctx.req.readable) {
    param.ctx.req.pipe(ProxyServer);
  }

  if (param.needPipeRes) {
    ProxyServer.pipe(param.ctx.res);
    // pipe response到body中
    //  more at:https://github.com/request/request/issues/887#issuecomment-53965077
    // 在文件很大的情况下以下这种方式会有问题：
    // param.ctx.body = ProxyServer.pipe(Stream.PassThrough());
  }


  // 重试配置：允许重试，且能重试的次数
  // 设为0则为不允许重试
  let retryNum = 1;

  /**
   * 创建请求
   * @return {Object} 请求对象
   */
  function _createReq() {
    let startTime = new Date();
    return Request(opt, (err, httpResponse, data) => {
      let status = httpResponse && httpResponse.statusCode || '', duration = (new Date() - startTime) + 'ms', info = { status: status, duration: duration };
      // 请求出错
      if (err) {
        err.status = status;
        err.duration = duration;
        error('proxy error : ' + opt.uri, err);
        param.ravenClient && param.ravenClient.captureException(err);
        callback(null, httpResponse, data || err);
        return;
      }

      // 没有报错，且有正常的返回数据
      if (!err && data) {
        debug('proxy success : ' + opt.uri, info);
        callback(null, httpResponse, data);
        return;
      }

      // 没有报错，但是也没有正常返回的数据
      // 根据重试配置进行重试
      if (retryNum > 0) {
        debug(`proxy retry: Request ${opt.uri} no response, retry ${retryNum} times!`, info);
        retryNum--;
        return _createReq()
      } else {
        error(`proxy error: Request ${opt.uri} no response!`, info);

        callback(null, httpResponse, data || {
          code: 'NULL',
          message: 'No response data!'
        });
      }
    });
  }
}

module.exports = thunkify(requestWap);
