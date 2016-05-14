'use strict';

const http = require('http');
const querystring = require('querystring');
const url_opera = require('url');
const extend = require('util')._extend;
const coProxy = require('./lib/co-proxy');

/**
 * 
 * @param  {string} app     context
 * @param  {object} api     api配置项
 * @param  {object} options request配置项
 * @return {function}
 */
function proxy(app, api, options) {

  api = api || {};
  options = options || {};

  return function*(next) {
    if (this.proxy) return yield next
      /**
       * proxy
       * @param {object} opt 需要并发请求的url，例如:{user1: 'local:/data/1',user2: 'local:/data/2'}
       */
    let ctx = this;
    let req = ctx.req;
    let res = ctx.res;

    Object.assign(this, {
      proxy: function*(opt, destObj) {
        if (!destObj) {
          destObj = ctx.backData = (ctx.backData || {});
        }

        let reqs = [];
        for (let item in opt) {
          // 分析当前proxy请求的URL
          let urlObj = analyUrl(ctx, opt[item]);
          let realReq = setRequest(ctx, urlObj);

          reqs.push({
            destObj: destObj,
            item: item,
            url: realReq.url,
            method: realReq.method,
            headers: realReq.headers,
            needPipeReq: realReq.needPipeReq
          });
        }

        function* _proxy(opt) {
          let response = yield coProxy({
            ctx: ctx,
            needPipeReq: opt.needPipeReq,
            needPipeRes: false
          }, extend(options, {
            uri: opt.url,
            method: opt.method,
            headers: opt.headers,
            json: true
          }));

          // 将获取到的数据注入到上下文的destObj参数中
          opt.destObj[opt.item] = response[1];

          // 设置cookie
          let proxyResponse = response[0] || {};
          let proxyHeaders = proxyResponse.headers;
          setResCookies(ctx, proxyHeaders)

          return opt.destObj;
        }

        // 并发异步数据请求
        let result = yield reqs.map(_proxy);

        return result;
      },
      /**
       * 从其他server通过http的方式拉取资源
       * @param {String} url           请求url
       * @yield {Object} 返回数据 
       */
      fetch: function*(url) {
        // 获取请求url
        let urlObj = analyUrl(ctx, url);
        // 获取头信息
        let realReq = setRequest(ctx, urlObj);

        let data = yield coProxy({
          ctx: ctx,
          needPipeReq: false,
          needPipeRes: true,
        }, extend(options, {
          uri: realReq.url,
          method: realReq.method,
          headers: realReq.headers,
          timeout: undefined
        }));

        return data;
      }
    });

    yield next;
  };


  /**
   * 根据分析proxy url的结果和当前的req来分析最终的url/method/头信息
   * @param {Object} ctx koa上下文
   * @param {Object} urlObj {url:'',method:''}
   */
  function setRequest(ctx, urlObj) {
    let headers = ctx.headers || {};
    let query = ctx.query;

    let result = {};
    for (let item in headers) {
      if (headers.hasOwnProperty(item)) {
        result[item] = headers[item];
      }
    }

    // 获取实际要请求的method和url
    let method = urlObj.method;
    let url = queryUrl(urlObj.url, query);

    // 配置host，先把当前用户host存入user-host,然后把请求host赋值给headers
    result['user-host'] = result.host;
    result.host = url_opera.parse(url).host;

    let needPipeReq = true;
    // 如果用户请求为POST，但proxy为GET，则删除头信息中不必要的字段
    if (ctx.method == 'POST' && method == 'GET') {
      delete result['content-type'];
      delete result['content-length'];

      needPipeReq = false;
    }

    return {
      method: method,
      url: url,
      headers: result,
      needPipeReq: needPipeReq
    };
  }

  /**
   * 分析当前proxy请求url，
   * @param  {url} path 请求url，例如：'github:user/info'
   * @return {Object}      返回真正的url和方法
   */
  function analyUrl(ctx, path) {
    let url, method;

    let isUrl = /^(http:\/\/|https:\/\/)/;
    let urlReg;

    if (isUrl.test(path)) {
      urlReg = [path]
    } else {
      urlReg = path.split(':');
    }

    switch (urlReg.length) {
      case 1:
        url = urlReg[0];
        method = ctx.method;
        break
      case 2:
        url = api[urlReg[0]] + urlReg[1];
        method = ctx.method;
        break;
      case 3:
        url = api[urlReg[0]] + urlReg[2];
        method = urlReg[1].toUpperCase()
        break;
      default:
        throw 'wrong proxy url path!';
    }
    return {
      url: url,
      method: method
    }
  }

  /**
   * 合并参数
   * @param  {String} url   URL
   * @param  {Object} query 当前请求的query
   * @return {String}       返回URL      
   */
  function queryUrl(url, query) {
    let urlObj = url_opera.parse(url);
    let urlQue = querystring.parse(urlObj.query);
    query = query || {};
    // 把页面url中的请求参数和数据连接中的请求参数合并
    urlQue = extend(query, urlQue);

    // 把合并之后参数进行stringify，作为新的参数
    let queStr = querystring.stringify(urlQue);
    let urlStr = urlObj.protocol + '//' + urlObj.host + urlObj.pathname;

    urlStr += queStr ? ('?' + queStr) : '';

    return urlStr;
  }

  /**
   * 设置response cookie
   * @param {object} res     response
   * @param {object} headers 头信息
   */
  function setResCookies(ctx, headers) {
    if (!headers || !headers['set-cookie']) {
      return
    }

    let cookies = headers['set-cookie'];

    ctx.res._headers = ctx.res._headers || {};
    ctx.res._headerNames = ctx.res._headerNames || {};

    // 以下set-cookie的方案参见nodejs源码：https://github.com/nodejs/node/blob/master/lib/_http_outgoing.js#L353-L359
    // 设置头字段中set-cookie为对应cookie
    ctx.res._headers['set-cookie'] = ctx.res._headers['set-cookie'] || [];
    ctx.res._headers['set-cookie'] = ctx.res._headers['set-cookie'].concat(cookies);

    // 设置头字段set-cookie的名称为set-cookie
    ctx.res._headerNames['set-cookie'] = 'set-cookie';
  }
};

module.exports = proxy;