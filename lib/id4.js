'use strict';
var Calippo = require('calippo');
var common = require('./common');

module.exports = function (readDuration) {

  return new Calippo({'objectMode': true}, function (v) {

    // the very first thing we expect to see is the first atom's length
    if (!v) {
      this.metaAtomsTotalLength = 0;
      this.state = 0;
      return this.readUInt32BE;
    }

    switch (this.state) {
      case -1: // skip
        this.state = 0;
        return this.readUInt32BE;

      case 0: // atom length
        this.atomLength = v;
        this.state++;
        return this.String(4, 'binary')

      case 1: // atom name
        this.atomName = v;

        // meta has 4 bytes padding at the start (skip)
        if (v === 'meta') {
          this.state = -1; // what to do for skip?
          return this.Buffer(4);
        }

        if (readDuration) {
          if (v === 'mdhd') {
            this.state = 3;
            return this.Buffer(this.atomLength - 8);
          }
        }

        if (!~CONTAINER_ATOMS.indexOf(v)) {
          // whats the num for ilst?
          this.state = (this.atomContainer === 'ilst') ? 2 : -1;
          return this.Buffer(this.atomLength - 8);
        }

        // dig into container atoms
        this.atomContainer = v;
        this.atomContainerLength = this.atomLength;
        this.state--;
        return this.readUInt32BE;

      case 2: // ilst atom
        this.metaAtomsTotalLength += this.atomLength;
        var result = processMetaAtom(v, this.atomName, this.atomLength - 8);
        if (result.length > 0) {
          for (var i = 0; i < result.length; i++) {
            this.push([this.atomName, result[i]])
          }
        }

        // we can stop processing atoms once we get to the end of the ilst atom
        if (this.metaAtomsTotalLength >= this.atomContainerLength - 8) {
          this.push(null);
          return;
        }

        this.state = 0;
        return this.readUInt32BE;

      case 3: // mdhd atom
        // TODO: support version 1
        var sampleRate = v.readUInt32BE(12);
        var duration = v.readUInt32BE(16);
        this.push(['duration', Math.floor(duration / sampleRate)])
        this.state = 0;
        return this.readUInt32BE;
    }

    // if we ever get this this point something bad has happened
    this.emit('error', new Error('error parsing'))
    return
  })
}

function processMetaAtom (data, atomName, atomLength) {
  var result = [];
  var offset = 0;

  // ignore proprietary iTunes atoms (for now)
  if (atomName === '----') return result;

  while (offset < atomLength) {
    var length = data.readUInt32BE(offset);
    var type = TYPES[data.readUInt32BE(offset + 8)];

    var content = processMetaDataAtom(data.slice(offset + 12, offset + length), type, atomName);

    result.push(content);
    offset += length;
  }

  return result;

  function processMetaDataAtom (data, type, atomName) {
    switch (type) {
      case 'text':
        return data.toString('utf8', 4);

      case 'uint8':
        if (atomName === 'gnre') {
          var genreInt = data.readUInt8(5);
          return common.GENRES[genreInt - 1];
        }
        if (atomName === 'trkn' || atomName === 'disk') {
          return data[7] + '/' + data[9];
        }
        return data.readUInt8(4);

      case 'jpeg':
      case 'png':
        return {
          format: 'image/' + type,
          data: data.slice(4)
        };
    }
  }
}

var TYPES = {
  '0': 'uint8',
  '1': 'text',
  '13': 'jpeg',
  '14': 'png',
  '21': 'uint8'
}

var CONTAINER_ATOMS = ['moov', 'udta', 'meta', 'ilst', 'trak', 'mdia'];
