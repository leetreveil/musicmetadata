var path = require('path')
var mm = require('..')
var fs = require('fs')
var test = require('tape')

test('audio-frame-header-bug', function (t) {
  t.plan(3)

  var sample = (process.browser) ?
    new window.Blob([fs.readFileSync(__dirname + '/samples/audio-frame-header-bug.mp3')])
    : fs.createReadStream(path.join(__dirname, '/samples/audio-frame-header-bug.mp3'))

  mm(sample, function (err, result) {
    t.error(err)
    t.strictEqual(result.duration, 200.59591666666665)
    t.end()
  }, function (cb) {
    fs.stat(sample.path, function (err, stats) {
      t.error(err)
      cb(stats.size)
    })
  })

})
