'use strict'
var common = require('./common')
var strtok = require('strtok2')

module.exports = function (stream, callback, done) {
  var bufs = []

  // TODO: need to be able to parse the tag if its at the start of the file
  stream.on('data', function (data) {
    bufs.push(data)
  })

  common.streamOnRealEnd(stream, function () {

    // buffer.concat impl
    var len = 0;
    for (var i = 0; i < bufs.length; i++) {
      len += bufs[i].length;
    }

    var buffer = new Uint8Array(len)
    var pos = 0;
    for (var buf of bufs) {
      buffer.set(buf, pos)
      pos += buf.length
    }

    // var buffer = Buffer.concat(bufs)
    var offset = buffer.length - 32

    // console.log()

    if (String.fromCharCode.apply(null, buffer.slice(offset, offset += 8)) !== 'APETAGEX') {
      done(new Error("expected APE header but wasn't found"))
    }

    var dv = new DataView(buffer.buffer)

    var footer = {
      version: dv.getUint32(offset, true),
      size: dv.getUint32(offset + 4, true),
      count: dv.getUint32(offset + 8, true)
    }

    // go 'back' to where the 'tags' start
    offset = buffer.length - footer.size

    for (var i = 0; i < footer.count; i++) {
      var size = dv.getUint32(offset, true)
      offset += 4

      var flags = dv.getUint32(offset, true)
      offset += 4
      var kind = (flags & 6) >> 1

      var zero = common.findZero(buffer, offset, buffer.length)
      var key = String.fromCharCode.apply(null, buffer.slice(offset, zero))
      offset = zero + 1

      // console.log(size, flags, kind, key)

      if (kind === 0) { // utf-8 textstring
        // var value = buffer.toString('utf8', offset, offset += size)
        var value = String.fromCharCode.apply(null, buffer.slice(offset, offset += size))
        // console.log(value)
        var values = value.split(/\x00/g)

        /*jshint loopfunc:true */
        values.forEach(function (val) {
          callback(key, val)
        })
      } else if (kind === 1) { // binary (probably artwork)
        if (key === 'Cover Art (Front)' || key === 'Cover Art (Back)') {
          var picData = buffer.slice(offset, offset + size)

          var off = 0
          zero = common.findZero(picData, off, picData.length)
          // var description = picData.toString('utf8', off, zero)
          var description = String.fromCharCode.apply(null, picData.slice(off, zero))
          off = zero + 1

          var picture = {
            description: description,
            data: picData.slice(off)
          }

          offset += size
          callback(key, picture)
        }
      }
    }
    return done()
  })
}
