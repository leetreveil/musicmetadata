'use strict';
var fs = require('fs');
var util = require('util');
var Calippo = require('calippo');
var common = require('./common');
var sum = require('sum-component');
var bun = require('bun');


module.exports = function (readDuration) {
  var sampleRate = 0;

  // top level parser that handles the parsing of pages
  var top = new Calippo({'objectMode': true}, function (v) {
    // console.log('tv', v)
    if (!v) {
      this.state = 0;
      return this.Buffer(27);
    }

    switch (this.state) {
      case 0: // header
        this.header = {
          type: v.toString('ascii', 0, 4),
          version: v[4],
          packet_flag: v[5],
          pcm_sample_pos: (v.readUInt32LE(10) << 32) + v.readUInt32LE(6),
          stream_serial_num: v.readUInt32LE(14),
          page_number: v.readUInt32LE(18),
          check_sum: v.readUInt32LE(22),
          segments: v[26]
        }
        if (this.header.type !== 'OggS') {
          this.emit('error', new Error('expected ogg header but was not found'))
          return
        }
        this.state++;
        return this.Buffer(this.header.segments);

      case 1: // segments
        this.state++;
        return this.Buffer(sum(v));

      case 2: // page data
        // console.log(v.slice(0, 7).toString())
        this.push(new Buffer(v))
        this.state = 0;
        return this.Buffer(27);
    }
  })
  .on('end', function () {
    if (readDuration) {
      bottom.push(['duration', Math.floor(this.header.pcm_sample_pos / sampleRate)])
      bottom.push(null)
      this.push(null)
    }
  })
  // Second level parser that handles the parsing of metadata.
  // The top level parser emits data that this parser should
  // handle.
  var bottom = new Calippo(function (v) {
    if (!v) {
      this.commentsRead = 0;
      this.state = 0;
      return this.Buffer(7);
    }

    // console.log(v.toString())

    switch (this.state) {
      case 0: // type
        if (v.toString() === '\x01vorbis') {
          this.state = 6;
          return this.Buffer(23);
        } else if (v.toString() === '\x03vorbis') {
          this.state++;
          return this.readUInt32LE;
        } else {
          this.emit('error',
            new Error('expected vorbis header but found something else: ' + v.toString()))
          return;
        }
        break;

      case 1: // vendor length
        this.state++;
        return this.String(v);

      case 2: // vendor string
        this.state++;
        return this.readUInt32LE;

      case 3: // user comment list length
        this.commentsLength = v;
        // no metadata, stop parsing
        if (this.commentsLength === 0) {
          return;
        }
        this.state++;
        return this.readUInt32LE;

      case 4: // comment length
        this.state++;
        return this.String(v);

      case 5: // comment
        this.commentsRead++;
        var idx = v.indexOf('=');
        var key = v.slice(0, idx).toUpperCase();
        var value = v.slice(idx+1);

        if (key === 'METADATA_BLOCK_PICTURE') {
          value = common.readVorbisPicture(new Buffer(value, 'base64'));
        }
        // cl(key, value)
        this.push([key, value])

        if (this.commentsRead === this.commentsLength) {
          if (!readDuration) {
            console.log('pushing null....')
            this.push(null)
          }
          return
        }

        this.state--; // back to comment length
        return this.readUInt32LE;

      case 6: // vorbis info
        var info = {
          'version': v.readUInt32LE(0),
          'channel_mode': v.readUInt8(4),
          'sample_rate': v.readUInt32LE(5),
          'bitrate_nominal': v.readUInt32LE(13)
        }
        sampleRate = info.sample_rate;
        this.state = 0;
        return this.Buffer(7);
    }
  })

  return bun([top, bottom])
}
