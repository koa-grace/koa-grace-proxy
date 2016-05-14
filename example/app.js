'use strict';

var koa = require('koa');
var bodyparser = require('koa-bodyparser');
var cobody = require('co-body');
var proxy = require('..');

var app = koa();

// 配置api
app.use(proxy(app, {
  github: 'https://avatars.githubusercontent.com/',
  local: 'http://127.0.0.1:3000/',
  test: 'http://192.168.1.10:10086/'
}, {
  timeout: 15000 // 超时时间
}));

app.use(function*() {
  let data;

  // 数据请求
  switch (this.path) {
    case '/favicon.ico':
      this.body = " ";
      break;
    case '/data/1':
      this.body = {
        user_id: '111111',
        cookie: this.cookies.get('test')
      }
      this.cookies.set('test1', 'test1');
      this.cookies.set('test2', 'test2');
      break;

    case '/data/2':
      this.body = {
        user_id: '222222'
      }
      this.cookies.set('test2', 'test2')
      break;

    case '/fetch':
      yield this.fetch('http://127.0.0.1:3000/data/1');
      break;

    case '/data/post':
      let body;
      if (this.req.headers['content-type'] == 'application/json') {
        body = yield cobody.json(this.req);
      } else {
        body = yield cobody.form(this.req);
      }

      this.body = {
        user_id: '444444',
        body: body
      };

      this.cookies.set('cookie_test4_1', 'test4_1');
      this.cookies.set('cookie_test4_2', 'test4_2');
      break;

    case '/data/aj_post':
      yield this.proxy({
        local: 'local:post:data/post',
        test: 'test:post:auth/send_sms_code'
      })
      this.body = this.backData;
      break;

    default:
      this.cookies.set('test', 'test');
      // 代理数据
      yield this.proxy({
        data1: 'http://127.0.0.1:3000/data/1',
        data2: 'http://127.0.0.1:3000/data/2',
        data3: 'http://test'
      });


      this.body = `
<script src="http://apps.bdimg.com/libs/jquery/2.1.4/jquery.min.js" ></script>
<body><pre>${JSON.stringify(this.backData,null,'  ')}</pre></body>'
<script>
$.ajax({
      url: '/data/aj_post',
      data: '{"test4":"test4"}',
      method: 'post',
      contentType: 'application/json',
      success: function(data) {
        console.log(data);
      }
  });
  
$.post('/data/aj_post',{test:'test',test1:'test1'},function(data) {
  console.log(data);
});
  
$.get('/data/aj_post',{test:'test',test1:'test1'},function(data) {
  console.log(data);
});
</script>
`;
      break;
  }


  console.log('request done');
});

app.listen(3000, function() {
  console.log('Listening on 3000!');
});
