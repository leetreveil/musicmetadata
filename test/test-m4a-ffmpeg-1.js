var path = require('path')
var fs = require('fs')
var mm = require('..')
var test = require('prova')

test('error handling', function (t) {
  t.plan(1)

  var sample = (process.browser) ?
    new window.Blob([fs.readFileSync(__dirname + '/samples/Simpsons01x01.m4a')])
    : fs.createReadStream(path.join(__dirname, '/samples/Simpsons01x01.m4a'))

  // sample.on('data', function (result) {
  //   console.log('foo', result.length)
  // })

  mm(sample, function (err) {
    console.log(err)
    t.error(err)
    t.end()
  })
})
