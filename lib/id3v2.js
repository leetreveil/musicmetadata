'use strict';
var Calippo = require('calippo');
var parser = require('./id3v2_frames');
var common = require('./common');
var BitArray = require('node-bitarray');
var equal = require('deep-equal');
var sum = require('sum-component');

module.exports = function (readDuration, fileSize) {

  var frameCount = 0;
  var audioFrameHeader;
  var bitrates = [];

  return new Calippo({'objectMode': true}, function (v) {

    // var seekFirstAudioFrame = _seekFirstAudioFrame.bind(this)
    var self = this;

    if (!v) {
      this.state = 0;
      return this.Buffer(10);
    }

    switch (this.state) {
      case 0: // header
        if (v.toString('ascii', 0, 3) !== 'ID3') {
          this.emit('error', new Error('expected id3 header but was not found'))
          this.push(null);
          return;
        }
        this.id3Header = {
          version: '2.' + v[3] + '.' + v[4],
          major: v[3],
          unsync: common.strtokBITSET.get(v, 5, 7),
          xheader: common.strtokBITSET.get(v, 5, 6),
          xindicator: common.strtokBITSET.get(v, 5, 5),
          footer: common.strtokBITSET.get(v, 5, 4),
          size: common.strtokINT32SYNCSAFE.get(v, 6)
        }
        this.state = 1;
        return this.Buffer(this.id3Header.size);

      case 1: // id3 data
        parseMetadata(v, this.id3Header).map(function (obj) {
          self.push(obj)
        })
        if (readDuration) {
          this.state = 2;
          return this.Buffer(4);
        }
        console.log('pushing null...')
        this.push(null);
        return;

      case 1.5:
        var shiftedBuffer = new Buffer(4);
        this.frameFragment.copy(shiftedBuffer, 0, 1);
        v.copy(shiftedBuffer, 3);
        v = shiftedBuffer;
        this.state = 2;

      /* falls through */
      case 2: // audio frame header

        // we have found the id3 tag at the end of the file, ignore
        if (v.slice(0, 3).toString() === 'TAG') {
          this.push(null);
          return;
        }

        var bts = BitArray.fromBuffer(v);

        var syncWordBits = bts.slice(0, 11);
        if (sum(syncWordBits) != 11) {
          // keep scanning for frame header, id3 tag may
          // have some padding (0x00) at the end
          return seekFirstAudioFrame(this);
        }

        var header = {
          'version': readMpegVersion(bts.slice(11, 13)),
          'layer': readLayer(bts.slice(13, 15)),
          'protection': !bts.__bits[15],
          'padding': !!bts.__bits[22],
          'mode': readMode(bts.slice(22, 24))
        }

        if (isNaN(header.version) || isNaN(header.layer)) {
          return seekFirstAudioFrame(this);
        }

        // mp3 files are only found in MPEG1/2 Layer 3
        if ((header.version !== 1 && header.version !== 2) || header.layer !== 3) {
          return seekFirstAudioFrame(this);
        }

        header.samples_per_frame = calcSamplesPerFrame(
          header.version, header.layer);

        header.bitrate = common.id3BitrateCalculator(
          bts.slice(16, 20), header.version, header.layer);
        if (isNaN(header.bitrate)) {
          return seekFirstAudioFrame(this);
        }

        header.sample_rate = common.samplingRateCalculator(
          bts.slice(20, 22), header.version);
        if (isNaN(header.sample_rate)) {
          return seekFirstAudioFrame(this);
        }

        header.slot_size = calcSlotSize(header.layer);

        header.sideinfo_length = calculateSideInfoLength(
          header.layer, header.mode, header.version);

        var bps = header.samples_per_frame / 8.0;
        var fsize = (bps * (header.bitrate * 1000) / header.sample_rate) +
          ((header.padding) ? header.slot_size : 0);
        header.frame_size = Math.floor(fsize);

        audioFrameHeader = header;
        frameCount++;
        bitrates.push(header.bitrate);

        // xtra header only exists in first frame
        if (frameCount === 1) {
          this.offset = header.sideinfo_length;
          this.state = 3;
          return this.Buffer(header.sideinfo_length);
        }

        // the stream is CBR if the first 3 frame bitrates are the same
        if (readDuration && fileSize && frameCount === 3 && areAllSame(bitrates)) {
          fileSize(function (size) {
            // subtract non audio stream data from duration calculation
            size = size - self.id3Header.size;
            var kbps = (header.bitrate * 1000) / 8;
            console.log('ssizeeee:', Math.round(size / kbps))
            // console.log(self)
            self.push(['duration', Math.round(size / kbps)])
            self.push(null)
            // // // cb(done());
            // // // TODO: might fail

            console.log('defering!...')
            // self.defer()
          })
          return this.DEFER;
        }

        this.state = 5;
        return this.Buffer(header.frame_size - 4);

        // // once we know the file is VBR attach listener to end of
        // // stream so we can do the duration calculation when we
        // // have counted all the frames
        // if (readDuration && frameCount === 4) {
        //   // TODO: stream doesn't exist anymore
        //   stream.once('end', function () {
        //     self.push(['duration', calcDuration(frameCount,
        //       header.samples_per_frame, header.sample_rate)])
        //     done()
        //     self.push(null)
        //   })
        // }

      case 3: // side information
        this.offset += 12;
        this.state = 4;
        return this.Buffer(12);

      case 4: // xtra / info header
        this.state = 5;
        var frameDataLeft = audioFrameHeader.frame_size - 4 - this.offset;

        var id = v.toString('ascii', 0, 4);
        if (id !== 'Xtra' && id !== 'Info' && id !== 'Xing') {
          return this.Buffer(frameDataLeft);
        }

        var bits = BitArray.fromBuffer(v.slice(4, 8));
        // frames field is not present
        if (bits.__bits[bits.__bits.length-1] !== 1) {
          return this.Buffer(frameDataLeft);
        }

        var numFrames = v.readUInt32BE(8);
        var ah = audioFrameHeader;
        this.push(['duration', calcDuration(numFrames, ah.samples_per_frame, ah.sample_rate)])
        console.log('pushing nullzzzz...')
        this.push(null)
        return;

      case 5: // skip frame data
        this.state = 2;
        return this.Buffer(4);
    }

    function seekFirstAudioFrame(ctx) {
      if (frameCount) {
        ctx.emit('error', new Error('expected frame header but was not found'))
        console.log('pushing null...')
        ctx.push(null)
        return undefined;
      }

      ctx.frameFragment = v;
      ctx.state = 1.5;
      return ctx.Buffer(1);
    }
  });
};

function areAllSame (array) {
  var first = array[0];
  return array.every(function (element) {
    return element === first;
  });
}

function calcDuration (numFrames, samplesPerFrame, sampleRate) {
  return Math.round(numFrames * (samplesPerFrame / sampleRate));
}

function parseMetadata (data, header) {
  var offset = 0;
  var frames = [];

  if (header.xheader) {
    offset += data.readUInt32BE(0);
  }

  while (true) {
    if (offset === data.length) break;
    var frameHeaderBytes = data.slice(offset, offset += getFrameHeaderLength(header.major));
    var frameHeader = readFrameHeader(frameHeaderBytes, header.major);

    // Last frame. Check first char is a letter, bit of defensive programming  
    if (frameHeader.id === '' || frameHeader.id === '\u0000\u0000\u0000\u0000' ||
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(frameHeader.id[0]) === -1) {
      break;
    }

    var frameDataBytes = data.slice(offset, offset += frameHeader.length);
    var frameData = readFrameData(frameDataBytes, frameHeader, header.major);
    for (var pos in frameData) {
      if (frameData.hasOwnProperty(pos)) {
        frames.push([frameHeader.id, frameData[pos]])
      }
    }
  }
  return frames;
}

function readFrameData (v, frameHeader, majorVer) {
  switch (majorVer) {
    case 2:
      return parser.readData(v, frameHeader.id, null, majorVer);
    case 3:
    case 4:
      if (frameHeader.flags.format.unsync) {
        v = common.removeUnsyncBytes(v);
      }
      if (frameHeader.flags.format.data_length_indicator) {
        v = v.slice(4, v.length);
      }
      return parser.readData(v, frameHeader.id, frameHeader.flags, majorVer);
  }
}

function readFrameHeader (v, majorVer) {
  var header = {};
  switch (majorVer) {
    case 2:
      header.id = v.toString('ascii', 0, 3);
      header.length = common.strtokUINT24_BE.get(v, 3, 6);
      break;
    case 3:
      header.id = v.toString('ascii', 0, 4);
      header.length = v.readUInt32BE(4, 8);
      header.flags = readFrameFlags(v.slice(8, 10));
      break;
    case 4:
      header.id = v.toString('ascii', 0, 4);
      header.length = common.strtokINT32SYNCSAFE.get(v, 4, 8);
      header.flags = readFrameFlags(v.slice(8, 10));
      break;
  }
  return header;
}

function getFrameHeaderLength (majorVer) {
  switch (majorVer) {
    case 2:
      return 6;
    case 3:
    case 4:
      return 10;
    default:
      throw new Error('header version is incorrect') // TODO: need to emit header upstream
  }
}

function readFrameFlags (b) {
  return {
    status: {
      tag_alter_preservation: common.strtokBITSET.get(b, 0, 6),
      file_alter_preservation: common.strtokBITSET.get(b, 0, 5),
      read_only: common.strtokBITSET.get(b, 0, 4)
    },
    format: {
      grouping_identity: common.strtokBITSET.get(b, 1, 7),
      compression: common.strtokBITSET.get(b, 1, 3),
      encryption: common.strtokBITSET.get(b, 1, 2),
      unsync: common.strtokBITSET.get(b, 1, 1),
      data_length_indicator: common.strtokBITSET.get(b, 1, 0)
    }
  }
}

function readMpegVersion (bits) {
  if (equal(bits, [0, 0])) {
    return 2.5;
  } else if (equal(bits, [0, 1])) {
    return 'reserved';
  } else if (equal(bits, [1, 0])) {
    return 2;
  } else if (equal(bits, [1, 1])) {
    return 1;
  }
}

function readLayer (bits) {
  if (equal(bits, [0, 0])) {
    return 'reserved';
  } else if (equal(bits, [0, 1])) {
    return 3;
  } else if (equal(bits, [1, 0])) {
    return 2;
  } else if (equal(bits, [1, 1])) {
    return 1;
  }
}

function readMode (bits) {
  if (equal(bits, [0, 0])) {
    return 'stereo';
  } else if (equal(bits, [0, 1])) {
    return 'joint_stereo';
  } else if (equal(bits, [1, 0])) {
    return 'dual_channel';
  } else if (equal(bits, [1, 1])) {
    return 'mono';
  }
}

function calcSamplesPerFrame (version, layer) {
  if (layer === 1) return 384;
  if (layer === 2) return 1152;
  if (layer === 3 && version === 1) return 1152;
  if (layer === 3 && (version === 2 || version === 2.5)) return 576;
}

function calculateSideInfoLength (layer, mode, version) {
  if (layer !== 3) return 2;
  if (['stereo', 'joint_stereo', 'dual_channel'].indexOf(mode) >= 0) {
    if (version === 1) {
      return 32;
    } else if (version === 2 || version === 2.5) {
      return 17;
    }
  } else if (mode === 'mono') {
    if (version === 1) {
      return 17;
    } else if (version === 2 || version === 2.5) {
      return 9;
    }
  }
}

function calcSlotSize (layer) {
  if (layer === 0) return 'reserved';
  if (layer === 1) return 4;
  if (layer === 2) return 1;
  if (layer === 3) return 1;
}
