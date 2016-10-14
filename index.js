'use strict';

const http = require('http');
const querystring = require('querystring');
const url_opera = require('url');
const coProxy = require('./lib/co-proxy');
const raven = require('raven');

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

    // 如果配置了allowShowApi而且页面的URL以__data__结尾则命中debug模式
    let isDebug = options.allowShowApi && /__data__$/.test(ctx.req.url);

    Object.assign(this, {
      proxy: function*(opt, config) {
        config = config || {}

        let destObj = config.dest;
        if (!destObj) { destObj = ctx.backData = (ctx.backData || {}) }

        let reqs = [];
        if (typeof opt == 'string') {
          destObj = ctx;
          reqs.push({ _url: opt, _dest: 'body' })
        } else {
          for (let item in opt) {
            reqs.push({ _url: opt[item], _dest: item });
          }
        }

        function* _proxy(opt) {
          // 分析当前proxy请求的URL
          let realReq = setRequest(ctx, opt._url);

          let response = yield coProxy({
            ctx: ctx,
            needPipeRes: false
          }, Object.assign({}, options, {
            uri: realReq.url,
            method: realReq.method,
            headers: realReq.headers,
            json: true
          }, config.conf));

          // 将获取到的数据注入到上下文的destObj参数中
          destObj[opt._dest] = response[1];

          // 设置cookie
          let proxyResponse = response[0] || {};
          let proxyHeaders = proxyResponse.headers;
          setResCookies(ctx, proxyHeaders)

          // 获取后端api配置
          isDebug && setApiOpt(ctx, realReq.url, response[1], proxyResponse.headers);

          return destObj;
        }

        // 并发异步数据请求
        return yield reqs.map(_proxy);
      },
      /**
       * 从其他server通过http的方式拉取资源
       * @param {String} url           请求url
       * @yield {Object} 返回数据 
       */
      fetch: function*(url, config) {
        config = config || {}

        // 获取头信息
        let realReq = setRequest(ctx, url);

        let data = yield coProxy({
          ctx: ctx,
          needPipeRes: true,
        }, Object.assign({}, options, {
          uri: realReq.url,
          method: realReq.method,
          headers: realReq.headers,
          timeout: undefined,
          gzip: false,
          encoding: null
        }, config.conf));

        // 设置头信息
        // let resHeaders = data[0] && data[0].headers || {};
        // for (let item in resHeaders) {
        //   if (resHeaders.hasOwnProperty(item)) {
        //     ctx.set(item, resHeaders[item])
        //   }
        // }

        return data;
      }
    });

    yield next;

    // debug模式下，返回后端api数据
    if (isDebug && ctx.__back__) {
      ctx.body = ctx.__back__
    }
  };


  /**
   * 根据分析proxy url的结果和当前的req来分析最终的url/method/头信息
   * @param {Object} ctx koa上下文
   * @param {Object} path 请求路径
   */
  function setRequest(ctx, path) {
    let headers = ctx.headers || {};
    let query = ctx.query;

    // 获取实际要请求的method和url
    let urlObj = analyUrl(ctx, path);
    let method = urlObj.method;
    let url = addQuery(urlObj.url, query);

    // 复制一份头信息
    let result = {};
    for (let item in headers) {
      if (headers.hasOwnProperty(item)) {
        result[item] = headers[item];
      }
    }

    // 配置host，先把当前用户host存入user-host,然后把请求host赋值给headers
    result['user-host'] = result.host;
    result.host = url_opera.parse(url).host;

    // 由于字段参数发生改变，content-length不再可信删除content-length字段
    delete result['content-length'];

    // 如果用户请求为POST，但proxy为GET，则删除头信息中不必要的字段
    if (ctx.method == 'POST' && method == 'GET') {
      delete result['content-type'];
    }

    return {
      method: method,
      url: url,
      headers: result
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
        url = fixUrl(api[urlReg[0]], urlReg[1]);
        method = ctx.method;
        break;
      case 3:
        url = fixUrl(api[urlReg[0]], urlReg[2]);
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
   * 将api配置和path拼合成一个真正的URL
   * @param  {String} api  api配置
   * @param  {String} path 请求路径 
   * @return {String}      完整的请求路径
   */
  function fixUrl(api, path) {
    if (!api || !path) return;

    let startSlash = /^\/*/;
    let endSlash = /\/*$/;

    return api.replace(endSlash, '/') + path.replace(startSlash, '')
  }

  /**
   * 合并参数
   * @param  {String} url   URL
   * @param  {Object} query 当前请求的query
   * @return {String}       返回URL      
   */
  function addQuery(url, query) {
    let urlObj = url_opera.parse(url);
    let urlQue = querystring.parse(urlObj.query);
    query = query || {};
    // 把页面url中的请求参数和数据连接中的请求参数合并
    urlQue = Object.assign({}, query, urlQue);

    // 把合并之后参数进行stringify，作为新的参数
    let queStr = querystring.stringify(urlQue);
    let urlStr = urlObj.protocol + '//' + urlObj.host + urlObj.pathname;

    urlStr += queStr ? ('?' + queStr) : '';

    return urlStr;
  }

  /**
   ********** TODO: 可以优化 *********
   * 设置response cookie
   * @param {object} res     response
   * @param {object} headers 头信息
   */
  function setResCookies(ctx, headers) {
    if (!headers || !validateCookies(headers['set-cookie'])) {
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

  /**
   * 检查cookie的合法性
   * @param  {Array} cookies  cookies字段数组
   * @return {Boolean}        是否合法
   */
  function validateCookies(cookies) {
    if (!cookies || !cookies.length || 0 >= cookies.length) {
      return false
    }

    if (!cookies[0]) {
      return false
    }

    return true
  }

  /**
   * 保存后端api配置信息
   * @param  {Object} ctx  koa 上下文
   * @param  {String} url  api URL
   * @param  {Object} data api 数据
   * * @param  {Object} headers 返回头信息
   * @return {}
   */
  function setApiOpt(ctx, url, data, headers) {
    // 保存后端api配置
    ctx.__back__ = ctx.__back__ || {};

    ctx.__back__[url] = {
      url: url,
      data: data,
      headers: headers
    }

    return
  }
};

module.exports = proxy;
