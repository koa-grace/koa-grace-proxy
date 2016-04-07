'use strict';

const querystring = require('querystring');
const url_opera = require('url');
const extend = require('util')._extend;
const coProxy = require('./lib/co-proxy');

/**
 * 
 * @param  {string} app     context
 * @param  {object} options 配置项
 *         {object} options.api api配置项，例如local对应http://localhost:3000，则为：api:{local:'http://localhost:3000'}
 * @return {function}
 */
function proxy(app, options) {

  let api = options.api;

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
          let urlObj = analyUrl(opt[item]);
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
          let response = yield coProxy(opt.url, {
            req: req,
            res: res,
            method: opt.method,
            headers: opt.headers,
            needPipeReq: opt.needPipeReq,
            json: true
          });

          // 将获取到的数据注入到上下文的destObj参数中
          opt.destObj[opt.item] = response[1];

          return opt.destObj;
        }

        // 并发异步数据请求
        let result = yield reqs.map(_proxy);

        return result;
      },
      download: function*(url) {
        // 获取请求url
        let urlObj = analyUrl(url);
        // 获取头信息
        let realReq = setRequest(ctx, urlObj);

        let data = yield coProxy(realReq.url, {
          req: req,
          res: res,
          needPipeReq: false,
          needPipeRes: true,
          headers: realReq.headers
        });
        return data;
      },
      // TO DO：上传功能待完成
      upload: function*(url) {
        // 获取请求url
        let urlObj = analyUrl(url);
        // 获取头信息
        let realReq = setRequest(ctx, urlObj);

        let data = yield coProxy(realReq.url, {
          req: req,
          res: res,
          needPipeReq: true,
          needPipeRes: false,
          headers: realReq.headers
        });
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
      result['content-type'] = undefined;
      result['content-length'] = undefined;

      needPipeReq = false;
    }
    /*else if(ctx.method == 'GET' && method == 'POST'){
      needPipeReq = true;
    }else{

    }*/

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
  function analyUrl(path) {
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
        method = 'GET';
        break
      case 2:
        url = api[urlReg[0]] + urlReg[1];
        method = 'GET';
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
};

module.exports = proxy
