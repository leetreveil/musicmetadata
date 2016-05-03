var path = require('path')
var fs = require('fs')
var mm = require('..')
var test = require('tape')

test('should be able to read id3v2 files with lyrics', function (t) {
  t.plan(2)

  var sample = (process.browser) ?
    new window.Blob([fs.readFileSync(__dirname + '/samples/id3v2-lyrics.mp3')])
    : fs.createReadStream(path.join(__dirname, '/samples/id3v2-lyrics.mp3'))

  mm(sample, function (err, result) {
    t.error(err)
    t.equal(result.lyrics.length, 142, 'lyrics.length')
    t.end()
  })
})
