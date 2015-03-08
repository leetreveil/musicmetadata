'use strict';
var common = require('./common');
var through2 = require('through2');

module.exports = function (readDuration) {

  var bufs = []

  return through2({ objectMode: true},
    function (data, encoding, callback) {
      bufs.push(data)
      callback()
    },
    function (callback) {
      console.log('in ze cb')
      var buffer = Buffer.concat(bufs)
      var offset = buffer.length - 32;

      if ('APETAGEX' !== buffer.toString('utf8', offset, offset += 8)) {
        this.emit('error', new Error('expected APE header but wasn\'t found'))
        this.push(null)
        return;
      }

      var footer = {
        version: buffer.readUInt32LE(offset, offset + 4),
        size: buffer.readUInt32LE(offset + 4, offset + 8),
        count: buffer.readUInt32LE(offset + 8, offset + 12)
      }

      //go 'back' to where the 'tags' start
      offset = buffer.length - footer.size;

      for (var i = 0; i < footer.count; i++) {
        var size = buffer.readUInt32LE(offset, offset += 4);
        var flags = buffer.readUInt32LE(offset, offset += 4);
        var kind = (flags & 6) >> 1;

        var zero = common.findZero(buffer, offset, buffer.length);
        var key = buffer.toString('ascii', offset, zero);
        offset = zero + 1;

        if (kind === 0) { // utf-8 textstring
          var value = buffer.toString('utf8', offset, offset += size);
          var values = value.split(/\x00/g);

          var self = this;
          /*jshint loopfunc:true */
          values.forEach(function (val) {
            self.push([key, val])
          })
        } else if (kind === 1) { //binary (probably artwork)
          if (key === 'Cover Art (Front)' || key === 'Cover Art (Back)') {
            var picData = buffer.slice(offset, offset + size);

            var off = 0;
            zero = common.findZero(picData, off, picData.length);
            var description = picData.toString('utf8', off, zero);
            off = zero + 1;

            var picture = {
              description: description,
              data: picData.slice(off)
            };

            offset += size;
            this.push([key, picture])
          }
        }
      }
      this.push(null)
      callback()
    }
  )
}
