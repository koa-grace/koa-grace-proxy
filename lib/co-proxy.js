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
    timeout: 15000, // 超时时间
    form: undefined // post参数，默认为undefined
  }, options);

  /**
   * 获取要输出到error.log的信息
   * @param  {Object}  startTime 请求初始时间
   * @param  {String}  duration  请求间隔时间
   * @param  {Number}  status    响应状态
   * @param  {Boolean} isWarning 是否是warning
   * @return {String}            输出到error.log的信息
   */
  function errLogInfo(startTime, duration, status) {
    // 页面url
    let pageUrl = param.ctx.request && param.ctx.request.href || '-';
    // 接口url
    let interfaceUrl = opt.uri || '-';
    // 发起请求的系统时间
    startTime = startTime || '-';
    // 接口的请求时长
    duration = duration || '-';
    // 响应状态
    status = status || '-';
    // UA
    let ua = opt.headers && opt.headers['user-agent'] || '-';
    // IP
    let ip = (param.ctx.headers && param.ctx.headers['x-forwarded-for'] || param.ctx.ip || '::ffff:-').replace('::ffff:', '');

    return `| ${pageUrl} | ${interfaceUrl} | ${startTime} | ${duration} | ${status} | ${ua} | ${ip} |`
  }

  debug('proxying : ' + opt.uri);

  // 发送请求
  let ProxyServer = _createReq();

  // 如果ctx.req.readable是可读的而且当前请求不为GET
  // 则可以pipe
  if (param.ctx.req.readable && param.ctx.method !== 'GET') {
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
      let status = httpResponse && httpResponse.statusCode || 'NULL',
        duration = (new Date() - startTime) + 'ms',
        info = { status: status, duration: duration };

      // 请求出错
      if (err) {
        error(`proxy error : ${errLogInfo(startTime, duration, status)}`, err);
        err.status = status;
        err.duration = duration;
        callback(null, httpResponse, data || err);
        return;
      }

      // 没有报错，且有正常的返回数据
      if (!err && data) {
        // 如果从发起请求到返回结果的时间超过临界，标注为error
        if (+(duration.slice(0, -2)) > 500) {
          let e = new Error('Response time is too long');
          error(`proxy warning : ${errLogInfo(startTime, duration, status, true)}`,  e)
        }

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
        let err = new Error(`No response!`)
        error(`proxy error : ${errLogInfo(startTime, duration, status)}`, err);

        callback(null, httpResponse, data || {
          code: 'NULL',
          message: 'No response data!'
        });
      }
    });
  }
}

module.exports = thunkify(requestWap);
