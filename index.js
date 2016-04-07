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

  /**
   * 分析download请求url，
   * @param  {url} path 请求url，例如：'github:user/info'
   * @return {Object}      返回真正的url和方法
   */
  function _analyurl(path) {
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
  function _queryUrl(url, query) {
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

  return function*(next) {
    if (this.proxy) return yield next
      /**
       * proxy
       * @param {object} opt 需要并发请求的url，例如:{user1: 'local:/data/1',user2: 'local:/data/2'}
       */

    let ctx = this;
    let req = ctx.req;
    let res = ctx.res;

    function _getPath(_url) {
      let query = ctx.query;

      let urlObj = _analyurl(_url);

      // 将浏览器原请求的query注入到url中
      let url = _queryUrl(urlObj.url, query);
      let method = req.method = urlObj.method;
      // 将用户的头信息注入到headers中
      ctx.headers['user-host'] = ctx.headers.host;

      return {
        url: url,
        method: method
      }
    }

    function _getHeaders(url) {
      let result = {};
      let headers = ctx.headers || {};

      for (let item in headers) {
        if (headers.hasOwnProperty(item)) {
          result[item] = headers[item];
        }
      }

      result['user-host'] = result.host;
      result.host = url_opera.parse(url).host;

      return result;
    }

    Object.assign(this, {
      proxy: function*(opt, destObj) {
        if (!destObj) {
          destObj = ctx.backData = (ctx.backData || {});
        }

        let reqs = [];
        for (let item in opt) {
          // 将原请求的query注入到url中
          let urlObj = _getPath(opt[item]);
          let headers = _getHeaders(urlObj.url);

          reqs.push({
            destObj: destObj,
            item: item,
            url: urlObj.url,
            method: urlObj.method,
            headers: headers
          });
        }

        function* _proxy(opt) {
          let response = yield coProxy(opt.url, {
            req: req,
            res: res,
            method: opt.method,
            headers: opt.headers,
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
        let _url = _getPath(url).url;
        // 获取头信息
        let _headers = _getHeaders(_url);

        let data = yield coProxy(_url, {
          req: req,
          res: res,
          needPipeRes: true,
          headers: _headers
        });
        return data;
      },
      // TO DO：上传功能待完成
      upload: function*(url) {
        // 获取请求url
        let _url = _getPath(url).url;
        // 获取头信息
        let _headers = _getHeaders(_url);

        let data = yield coProxy(_url, {
          req: req,
          res: res,
          needPipeReq: true,
          needPipeRes: false,
          headers: _headers
        });
        return data;
      }
    });

    yield next;
  };
};

module.exports = proxy
