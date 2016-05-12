'use strict';

var koa = require('koa');
var bodyparser = require('koa-bodyparser');
var proxy = require('..');

var app = koa();

app.use(bodyparser());

// 配置api
app.use(proxy(app, {
  github: 'https://avatars.githubusercontent.com/',
  local: 'http://127.0.0.1:3000/'
}, {
  timeout: 15000 // 超时时间
}));

app.use(function*() {
  let data;

  // 数据请求
  if (this.path == '/data/1') {

    this.body = {
      user_id: '111111',
      cookie: this.cookies.get('test')
    }
    this.cookies.set('test1', 'test1');
    this.cookies.set('test2', 'test2');
    return;
  } else if (this.path == '/data/2') {
    this.body = {
      user_id: '222222'
    }
    this.cookies.set('test2', 'test2')
    return;
  }  else if (this.path == '/data/4') {

    this.body = {
      user_id: '444444',
      body: this.request.body
    }
    this.cookies.set('test4', 'test4')
    return;
  } else if (this.path == '/fetch') {
    yield this.fetch('http://127.0.0.1:3000/data/1');
    return;
  } else {
    this.cookies.set('test', 'test');
  }

  // 代理数据
  yield this.proxy({
    data1: 'http://127.0.0.1:3000/data/1',
    data2: 'http://127.0.0.1:3000/data/2',
    data3: 'http://test',
    data4: 'local:post:data/4'
  });



  this.body = this.backData || 'test';

  this.body.post = this.request.body;

  // 代理请求
  // yield this.download('github:u/1962352?v=3');
  // yield this.download('http://127.0.0.1:9080/bg_3_s.jpg');
  // data = yield this.download('http://test.mlsfe.biz/home');

  console.log('request done');
});

app.listen(3000, function() {
  console.log('Listening on 3000!');
});
