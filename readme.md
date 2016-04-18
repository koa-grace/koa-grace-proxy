## koa-grace-proxy

KOA-grace绑定数据的中间件

### Install

    $ npm install koa-grace-proxy --save

### Usage

```
proxy(app, options)
```
- app: {Object} koa instance.
- options: {Object|String->root}
  - api: {String} api配置项，例如local对应http://localhost:3000，则为：api:{local:'http://localhost:3000'}

**app.js**

```
'use strict';

var koa = require('koa');
var proxy = require('..');

var app = koa();

// 配置api
app.use(proxy(app, {
  api : {
    github : 'https://avatars.githubusercontent.com/'
  }
}));

app.use(function*() {
  let data ;

  // 数据请求
  if(this.path == '/data/1'){
    this.body = {
      user_id:'111111'
    }
    return;
  }else if(this.path == '/data/2'){
    this.body = {
      user_id:'222222'
    }
    return;
  }


  // 代理数据
  yield this.proxy({
    data1 : 'http://127.0.0.1:3000/data/1',
    data2 : 'http://127.0.0.1:3000/data/2',
  });
  this.body = this.backData || 'test';

  // 代理请求
  // yield this.proxy('github:u/1962352?v=3');
  // yield this.proxy('http://127.0.0.1:9080/bg_3_s.jpg');
  // data = yield this.proxy('http://test.mlsfe.biz/home');

  console.log('request done');
});

app.listen(3000, function() {
  console.log('Listening on 3000!');
});
```

### Test

    npm test

### License

MIT