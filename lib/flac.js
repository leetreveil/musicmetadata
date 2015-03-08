'use strict';
var Calippo = require('calippo');
var common = require('./common');

module.exports = function () {
  var currentState = startState;

  return new Calippo({'objectMode': true}, function (v) {
    currentState = currentState.parse(this, v);
    return currentState.getExpectedType(this);
  })
}

var DataDecoder = function (data) {
  this.data = data;
  this.offset = 0;
}

DataDecoder.prototype.readInt32 = function () {
  var value = this.data.readUInt32LE(this.offset);
  this.offset += 4;
  return value;
}

DataDecoder.prototype.readStringUtf8 = function () {
  var len = this.readInt32();
  var value = this.data.toString('utf8', this.offset, this.offset + len);
  this.offset += len;
  return value;
};

var finishedState = {
  parse: function (parser, data) {
    return this;
  },
  getExpectedType: function (parser) {
    parser.push(null)
  }
}

var BlockDataState = function (type, length, nextStateFactory) {
  this.type = type;
  this.length = length;
  this.nextStateFactory = nextStateFactory;
}

BlockDataState.prototype.parse = function (parser, data) {
  if (this.type === 4) {
    var decoder = new DataDecoder(data);
    var vendorString = decoder.readStringUtf8();
    var commentListLength = decoder.readInt32();
    var comment;
    var split;
    var i;

    for (i = 0; i < commentListLength; i++) {
      comment = decoder.readStringUtf8();
      split = comment.split('=');
      parser.push([split[0].toUpperCase(), split[1]])
    }
  } else if (this.type === 6) {
    var picture = common.readVorbisPicture(data);
    parser.push(['METADATA_BLOCK_PICTURE', picture])
  } else if (this.type === 0) { // METADATA_BLOCK_STREAMINFO
    if (data.length < 34) return; // invalid streaminfo
    var sampleRate = common.strtokUINT24_BE.get(data, 10) >> 4;
    var totalSamples = data.readUInt32BE(14);
    var duration = totalSamples / sampleRate;
    parser.push(['duration', Math.round(duration)]);
  }
  return this.nextStateFactory();
}

BlockDataState.prototype.getExpectedType = function (parser) {
  return parser.Buffer(this.length);
}

var blockHeaderState = {
  parse: function (parser, data) {
    var header = {
      lastBlock: (data[0] & 0x80) == 0x80,
      type: data[0] & 0x7f,
      length: common.strtokUINT24_BE.get(data, 1)
    }
    var followingStateFactory = header.lastBlock ? function() {
        return finishedState;
      } : function() {
        return blockHeaderState;
      }

    return new BlockDataState(header.type, header.length, followingStateFactory);
  },
  getExpectedType: function (parser) {
    return parser.Buffer(4);
  }
}

var idState = {
  parse: function (parser, data) {
    if (data !== 'fLaC') {
      // TODO: shouldn't the param be wrapped in an array?? []
      parser.emit('error', new Error('expected flac header but was not found'))
      return startState;
    }
    return blockHeaderState;
  },
  getExpectedType: function (parser) {
    return parser.String(4);
  }
};

var startState = {
  parse: function (parser, data) {
    return idState;
  },
  getExpectedType: function (parser) {}
}
