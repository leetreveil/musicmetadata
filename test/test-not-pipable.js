var mm = require('..')
var test = require('tape')

test('non-pipable', function (t) {
  t.plan(3)

  var url = 'https://upload.wikimedia.org/wikipedia/en/4/45/ACDC_-_Back_In_Black-sample.ogg'

  mm(url, function (err, result) {
    t.notEqual(err, undefined)
    t.equal(err.toString(), 'TypeError: stream.pipe is not a function')
    t.equal(result, undefined)
  })
})
