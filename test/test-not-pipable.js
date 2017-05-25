var mm = require('..')
var test = require('tape')

test('non-pipable', function (t) {
  t.plan(3)

  mm('https://upload.wikimedia.org/wikipedia/en/4/45/ACDC_-_Back_In_Black-sample.ogg', function (err, result) {
    t.notEqual(err, undefined)
    t.equal(err.toString(), 'TypeError: stream.pipe is not a function')
    t.equal(result, undefined)
  })
})
