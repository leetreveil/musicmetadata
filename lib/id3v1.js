'use strict';
var through2 = require('through2');
var common = require('./common');

module.exports = function (readDuration) {

  var bufs = []

  return through2({ objectMode: true},
    function (data, encoding, callback) {
      bufs.push(data)
      callback()
    },
    function (callback) {
      var buffer = Buffer.concat(bufs)
      var offset = buffer.length - 128;

      var header = buffer.toString('ascii', offset, offset += 3);
      if (header !== 'TAG') {
        this.emit('error', new Error('Could not find metadata header'));
        // this.push(null)
        return;
      }

      var title = buffer.toString('ascii', offset, offset += 30);
      this.push(['title', title.trim().replace(/\x00/g, '')]);

      var artist = buffer.toString('ascii', offset, offset += 30);
      this.push(['artist', artist.trim().replace(/\x00/g, '')]);

      var album = buffer.toString('ascii', offset, offset += 30);
      this.push(['album', album.trim().replace(/\x00/g, '')]);

      var year = buffer.toString('ascii', offset, offset += 4);
      this.push(['year', year.trim().replace(/\x00/g, '')]);

      var comment = buffer.toString('ascii', offset, offset += 28);
      this.push(['comment', comment.trim().replace(/\x00/g, '')]);

      var track = buffer[buffer.length - 2];
      this.push(['track', track]);

      if (buffer[buffer.length - 1] in common.GENRES) {
        var genre = common.GENRES[buffer[buffer.length - 1]];
        this.push(['genre', genre]);
      }
      this.push(null)
      callback()
    }
  )
}
