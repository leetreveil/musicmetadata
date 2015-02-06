'use strict';
var events = require('events');
var common = require('./common');
var strtok = require('strtok2');
var through = require('through')
var extend = require('xtend')
var fs = require('fs')

var MusicMetadata = module.exports = function (stream, opts) {
  opts = opts || {};
  var emitter = new events.EventEmitter();

  var fsize = function (cb) {
    if (stream.hasOwnProperty('path')) {
      fs.stat(stream.path, function (err, stats) {
        if (err) throw err;
        cb(stats.size);
      });
    } else if (stream.hasOwnProperty('fileSize')) {
      stream.fileSize(cb)
    } else if (opts.fileSize) {
      process.nextTick(function() {
        cb(opts.fileSize);
      });
    } else if (opts.duration) {
      emitter.emit(
        'done',
        new Error('for non file streams, specify the size of the stream with a fileSize option'));
    }
  }

  // pipe to an internal stream so we aren't fucking
  // with the stream passed to us by our users
  var istream = stream.pipe(through(null, null, {autoDestroy: false}));

  var evs = [];

  var hasReadData = false;
  istream.once('data', function (result) {
    hasReadData = true;
    var parser = common.getParserForMediaType(headerTypes, result);
    parser(istream, function (event, value) {
      if (value === null) return;
      var alias = lookupAlias(event);
      evs.push([event, value, alias])
      if (event !== alias) {
        emitter.emit(event, value);
      }
    }, done, opts.hasOwnProperty('duration'), fsize);
    // re-emitting the first data chunk so the
    // parser picks the stream up from the start
    istream.emit('data', result);
  });

  istream.on('end', function () {
    if (!hasReadData) {
      done(new Error('Could not read any data from this stream'))
    }
  })

  istream.on('close', onClose);

  function onClose () {
    done(new Error('Unexpected end of stream'));
  }

  function done (exception) {
    istream.removeListener('close', onClose);

    function nmap (llst, callback) {
      return llst.map(function (obj) {
        return callback.apply(undefined, obj)
      })
    }

    function nreduce (llst, callback, initialValue) {
      return llst.reduce(function (out, obj) {
        return callback.apply(undefined, [out].concat(obj))
      }, initialValue)
    }
    // cleanup all aliased events 
    var out = nmap(evs, function (ev, val, alias) {
      if (alias === 'picture') {
        return [alias, cleanupPicture(val)]
      }
      if (alias === 'genre') {
        return [alias, common.parseGenre(val)]
      }
      if (alias === 'track' || alias === 'disk') {
        return [alias, cleanupTrack(val)]
      }
      if (ev === 'TRACKTOTAL' || ev === 'DISCTOTAL') {
        var cleaned = parseInt(val, 10)
        if (isNaN(cleaned)) cleaned = 0
        return [ev, cleaned]
      }
      if (alias) {
        return [alias, val];
      } else {
        return [ev, val];
      }
    })
    // reduce all duplicated events down to arrays
    out = nreduce(out, function (out, ev, val) {
      if (ev === 'title' || ev === 'album' ||  ev === 'year' ||
          ev === 'duration' || ev === 'track' || ev === 'disk') {
        out[ev] = val;
      } else if (!out.hasOwnProperty(ev)) {
        out[ev] = [val]
      } else {
        out[ev].push(val)
      }
      return out;
    }, {})
    // remove all non aliased events
    var aliases = mappings.map(function (l) { return l[0] }) + ['TRACKTOTAL', 'DISCTOTAL'];
    for (var p in out) {
      if (aliases.indexOf(p) === -1) {
        delete out[p]
      }
    }
    // add 'of' to track
    if (out.hasOwnProperty('TRACKTOTAL')) {
      if (out.hasOwnProperty('track')) {
        out.track.of = out.TRACKTOTAL[0]
      }
      delete out.TRACKTOTAL
    }
    // add 'of' to dick
    if (out.hasOwnProperty('DISCTOTAL')) {
      if (out.hasOwnProperty('disk')) {
        out.disk.of = out.DISCTOTAL[0]
      }
      delete out.DISCTOTAL
    }
    // emit all aliased events
    for (var z in out) {
      emitter.emit(z, out[z])
    }
    // emit metadata event
    if (Object.keys(out).length > 0) {
      var defaults = {
        title: '',
        artist: [],
        albumartist: [],
        album: '',
        year: '',
        track: { no: 0, of: 0 },
        genre: [],
        disk: { no: 0, of: 0 },
        picture: [],
        duration: 0
      }
      // add any missing defaults to the metadata object
      var xtended = extend(defaults, out)
      for (var key in xtended) {
        if (!defaults.hasOwnProperty(key)) {
          delete xtended[key]
        }
      }
      emitter.emit('metadata', xtended)
    }

    emitter.emit('done', exception);
    return strtok.DONE;
  }

  return emitter;
}

var mappings = [
    ['title', 'TIT2', 'TT2', '©nam', 'TITLE', 'Title'],
    ['artist', 'TPE1', 'TP1', '©ART', 'ARTIST', 'Author'],
    ['albumartist', 'TPE2', 'TP2', 'aART', 'ALBUMARTIST', 'ENSEMBLE', 'WM/AlbumArtist'],
    ['album', 'TALB', 'TAL', '©alb', 'ALBUM', 'WM/AlbumTitle'],
    ['year', 'TDRC', 'TYER', 'TYE', '©day', 'DATE', 'Year', 'WM/Year'],
    ['comment', 'COMM', 'COM', '©cmt', 'COMMENT'],
    ['track', 'TRCK', 'TRK', 'trkn', 'TRACKNUMBER', 'Track', 'WM/TrackNumber'],
    ['disk', 'TPOS', 'TPA', 'disk', 'DISCNUMBER', 'Disk'],
    ['genre', 'TCON', 'TCO', '©gen', 'gnre', 'GENRE', 'WM/Genre'],
    ['picture', 'APIC', 'PIC', 'covr', 'METADATA_BLOCK_PICTURE', 'Cover Art (Front)',
      'Cover Art (Back)'],
    ['composer', 'TCOM', 'TCM', '©wrt', 'COMPOSER'],
    ['duration']
  ]

function lookupAlias (event) {
  // mappings for common metadata types(id3v2.3, id3v2.2, id4, vorbis, APEv2)
  return mappings.reduce(function (a, b) {
    if (a !== undefined) return a

    var hasAlias = b.map(function (val) {
      return val.toUpperCase()
    }).indexOf(event.toUpperCase())

    if (hasAlias > -1) {
      return b[0]
    }
  }, undefined)
}


// TODO: a string of 1of1 would fail to be converted
// converts 1/10 to no : 1, of : 10
// or 1 to no : 1, of : 0
function cleanupTrack (origVal) {
  var split = origVal.toString().split('/');
  return {
    no: parseInt(split[0], 10) || 0,
    of: parseInt(split[1], 10) || 0
  }
}

function cleanupPicture (picture) {
  var newFormat;
  if (picture.format) {
    var split = picture.format.toLowerCase().split('/');
    newFormat = (split.length > 1) ? split[1] : split[0];
    if (newFormat === 'jpeg') newFormat = 'jpg';
  } else {
    newFormat = 'jpg';
  }
  return { format: newFormat, data: picture.data }
}

var headerTypes = [
  {
    buf: common.asfGuidBuf,
    tag: require('./asf'),
  },
  {
    buf: new Buffer('ID3'),
    tag: require('./id3v2'),
  },
  {
    buf: new Buffer('ftypM4A'),
    tag: require('./id4'),
    offset: 4,
  },
  {
    buf: new Buffer('ftypmp42'),
    tag: require('./id4'),
    offset: 4,
  },
  {
    buf: new Buffer('OggS'),
    tag: require('./ogg'),
  },
  {
    buf: new Buffer('fLaC'),
    tag: require('./flac'),
  },
  {
    buf: new Buffer('MAC'),
    tag: require('./monkeysaudio'),
  },
];
