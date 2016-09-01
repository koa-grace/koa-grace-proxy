'use strict';

exports.upload = function*() {
	console.log('~~~~~~~~~~~');
  yield this.upload();
  this.body = { code: 0 }
}
exports.upload.__method__ = 'all';

exports.form_upload = function*() {
  yield this.proxy('local:test/upload');
}
exports.form_upload.__method__ = 'all';

exports.form = function*() {
  this.body = '' +
    '<form action="/test/form_upload" enctype="multipart/form-data" method="post">' +
    '<input type="text" name="title"><br>' +
    '<input type="file" name="upload1" multiple="multiple"><br>' +
    '<input type="file" name="upload2" multiple="multiple"><br>' +
    '<input type="submit" value="Upload">' +
    '</form>';
}


exports.single = function*() {
  yield this.proxy('local:test/data_1')
}

exports.redirect = function*() {
  this.redirect('/test/data_1')
}

exports.redirect_test = function*() {
  yield this.proxy('local:test/redirect')
}

exports.data_1 = function*() {
  this.body = {
    user_id: '111111',
    cookie: this.cookies.get('test')
  }
  this.cookies.set('test1', 'test1');
  this.cookies.set('test2', 'test2');

}

exports.data_2 = function*() {
  this.body = {
    user_id: '222222'
  }
  this.cookies.set('test2', 'test2')

}

exports.fetch = function*() {
  yield this.fetch('http://127.0.0.1:3000/test/data_1');
}

exports.fetch_img = function*(){
  yield this.fetch('https://www.baidu.com/img/bd_logo1.png');
}

exports.data_post = function*() {
  this.body = {
    user_id: '444444',
    body: this.request.body || '没有post参数'
  };

  this.cookies.set('cookie_test4_1', 'test4_1');
  this.cookies.set('cookie_test4_2', 'test4_2');
}
exports.data_post.__method__ = 'all';

exports.data_aj_post = function*() {
  yield this.proxy({
    local: 'local:post:test/data_post',
    test: 'test:post:auth/send_sms_code'
  })
  this.body = this.backData;
}
exports.data_aj_post.__method__ = 'all';

exports.timeout = function*(){
  function getData() {
    return function(callback) {
      setTimeout(function() {

        callback(0, {
          message: 'this is a timeout test!'
        });
      }, 16000)
    }
  }

  var data = yield getData();

  this.body = data;
}
exports.data_timeout = function*(){
  yield this.proxy('http://127.0.0.1:3000/test/timeout', {
    conf: {
      timeout: 20000
    }
  })
}

exports.index = function*() {
  this.cookies.set('test', 'test');
  // 代理数据
  yield this.proxy({
    data1: 'http://127.0.0.1:3000/test/data_1',
    data2: 'http://127.0.0.1:3000/test/data_2',
    data3: 'http://test'
  });


  this.body = `
<script src="http://apps.bdimg.com/libs/jquery/2.1.4/jquery.min.js" ></script>
<body><pre>${JSON.stringify(this.backData,null,'  ')}</pre></body>'
<script>
$.ajax({
      url: '/test/data_aj_post',
      data: '{"test4":"test4"}',
      method: 'post',
      contentType: 'application/json',
      success: function(data) {
        console.log(data);
      }
  });

$.post('/test/data_aj_post',{test:'test',test1:'test1'},function(data) {
  console.log(data);
});

$.get('/test/data_aj_post',{test:'test',test1:'test1'},function(data) {
  console.log(data);
});

$.get('/test/data_timeout',function(data) {
  console.log(data);
});
</script>
`
}
