# Test Coverage Analysis for musicmetadata

This document analyzes the current test coverage and identifies areas that need improvement.

## Executive Summary

The musicmetadata library has **33 test files** covering the main functionality for parsing audio metadata across multiple formats. However, there are significant gaps in error handling, edge case coverage, and unit testing of internal functions.

---

## Current Test Coverage Overview

### Format Parser Coverage

| Format | Parser File | Test Files | Coverage Status |
|--------|-------------|------------|-----------------|
| ID3v1 | `lib/id3v1.js` | 1 test | Basic happy path only |
| ID3v2 | `lib/id3v2.js`, `lib/id3v2_frames.js` | 8 tests | Good for common frames |
| M4A/MP4 | `lib/id4.js` | 3 tests | Basic coverage |
| OGG Vorbis | `lib/ogg.js` | 2 tests | Good |
| FLAC | `lib/flac.js` | 1 test | Basic coverage |
| ASF/WMA | `lib/asf.js` | 1 test | Basic coverage |
| Monkey's Audio | `lib/monkeysaudio.js` | 1 test | Basic coverage |

### Utility Coverage

| Module | Test Files | Coverage Status |
|--------|------------|-----------------|
| `common.js` | 4 tests | Partial - many functions untested |
| `browser.js` | 0 tests | **No direct tests** |
| `windows1252decoder.js` | 0 tests | **No direct tests** |
| `index.js` | Integration only | No unit tests |

---

## Areas Requiring Improved Test Coverage

### 1. Error Handling (HIGH PRIORITY)

Almost all error paths are untested. The following error conditions need tests:

#### `lib/index.js`
- **Line 23-24**: `fs.stat` failure on stream with path
- **Line 29-31**: Missing fileSize for non-file streams when duration is requested
- **Line 74**: Empty stream error ("Could not read any data from this stream")
- **Line 81**: Unexpected stream close ("Unexpected end of stream")

**Suggested test file**: `test/test-error-handling.js`

```javascript
// Example test cases needed:
test('should error when stream has no data', ...)
test('should error on unexpected stream close', ...)
test('should error when duration requested without fileSize on non-file stream', ...)
```

#### `lib/id3v2.js`
- **Line 20**: Invalid ID3 header ("expected id3 header but was not found")
- **Line 174**: Expected frame header not found after initial frames
- **Line 270**: Unsupported header version

**Suggested test file**: `test/test-id3v2-errors.js`

#### `lib/asf.js`
- **Line 35**: Invalid ASF header
- **Line 161**: Unexpected value type in extended content

#### `lib/ogg.js`
- **Line 46**: Invalid OGG header
- **Line 83**: Non-vorbis header in OGG stream

#### `lib/flac.js`
- **Line 103**: Invalid FLAC header
- **Line 65**: Invalid/short streaminfo block

#### `lib/id3v1.js`
- **Line 13**: No TAG marker found at end of file

#### `lib/monkeysaudio.js`
- **Line 53**: Invalid MAC header
- **Line 101**: Missing APETAGEX footer

#### `lib/common.js`
- **Line 103**: Odd-length buffer in `swapBytes()`
- **Line 139**: Unsupported encoding in `decodeString()`

---

### 2. Browser Adapter (HIGH PRIORITY)

`lib/browser.js` has **zero direct tests**. The following need testing:

- ArrayBuffer input handling (lines 40-53)
- FileList error case (line 31)
- Invalid File/Blob error case (lines 33-35)
- Stream input piping (lines 27-29)
- File size callback mechanism (lines 21-25)

**Suggested test file**: `test/test-browser.js` (requires browser environment or mocking)

---

### 3. Windows-1252 Decoder (MEDIUM PRIORITY)

`lib/windows1252decoder.js` has no direct unit tests.

**Needs testing**:
- Standard ASCII characters (0x00-0x7F)
- Windows-1252 specific characters (0x80-0xFF)
- **Line 31**: Invalid encoding error case (null code point)
- Surrogate pair handling for code points > 0xFFFF

**Suggested test file**: `test/test-windows1252decoder.js`

---

### 4. Duration Calculation Edge Cases (MEDIUM PRIORITY)

The ID3v2 parser has multiple untested duration calculation paths:

#### `lib/id3v2.js`
- **Lines 118-127**: CBR (Constant Bit Rate) detection and duration calculation
- **Lines 132-138**: VBR (Variable Bit Rate) duration calculation via frame counting
- **Lines 152-165**: Xing/Info header parsing for VBR files

**Suggested test file**: `test/test-id3v2-duration-vbr.js`

Test cases needed:
- CBR file with 3 identical bitrate frames
- VBR file requiring frame-by-frame counting
- File with Xing header
- File with Info header
- File with Xtra header

---

### 5. Audio Frame Header Variations (MEDIUM PRIORITY)

`lib/id3v2.js` has complex audio header parsing with many branches:

#### MPEG Versions
- Version 1 (tested)
- Version 2 (needs more tests)
- Version 2.5 (untested)

#### Layers
- Layer 3 (tested - MP3)
- Layer 2 (untested)
- Layer 1 (untested)

#### Channel Modes
- Stereo (tested)
- Joint stereo (needs verification)
- Dual channel (untested)
- Mono (untested)

**Suggested test file**: `test/test-audio-frame-variations.js`

---

### 6. ID3v2 Frame Types (MEDIUM PRIORITY)

#### Currently Tested Frames
- T* (text frames) ✓
- APIC/PIC (pictures) ✓
- COMM/COM (comments) ✓
- USLT/ULT (unsync lyrics) ✓
- SYLT (sync lyrics) ✓
- UFID (unique file ID) ✓

#### Untested Frame Types in `lib/id3v2_frames.js`
- **PCNT/CNT** (play count) - code exists at lines 58-61
- Multiple values in T* frames with null separators (ID3v2.4 spec)

**Suggested test file**: `test/test-id3v2-frame-types.js`

---

### 7. Utility Functions in `common.js` (MEDIUM PRIORITY)

#### Untested Functions
- **`sum()`** (line 91-98): Used but not directly tested
- **`strtokBITSET`** (lines 167-172): Used but not directly tested with edge cases
- **`strtokINT32SYNCSAFE`** (lines 174-180): Not directly tested

#### Partially Tested Functions
- **`parseGenre()`** (lines 142-159): Tested but edge cases missing:
  - Empty string input
  - Only parentheses: "()"
  - Nested parentheses
  - Out-of-range genre numbers
  - Mixed text and numbers: "Rock (17)"

- **`readVorbisPicture()`** (lines 35-56): Tested via integration but not directly

**Suggested test file**: `test/test-common-utils.js`

---

### 8. Edge Cases in Main Parser (LOW PRIORITY)

#### `lib/index.js`

- **`cleanupTrack()`** (lines 202-208):
  - TODO at line 199: "a string of 1of1 would fail to be converted"
  - Needs tests for: "1of1", "1 of 10", "track 1", malformed inputs

- **`cleanupPicture()`** (lines 210-220):
  - Missing format case (line 217 defaults to 'jpg')
  - MIME types: "image/jpeg", "image/png", "image/gif"
  - Non-standard formats

- **`lookupAlias()`** (lines 167-197):
  - Case insensitivity verification
  - Unmapped tags

---

### 9. Integration Tests (LOW PRIORITY)

#### Missing Integration Scenarios
1. **Concurrent parsing**: Multiple files parsed simultaneously
2. **Large files**: Files with many frames/tags
3. **Corrupt/truncated files**: Partial data handling
4. **Mixed tag types**: Files with both ID3v1 and ID3v2
5. **Empty metadata**: Files with tag structure but no actual data
6. **Unusual padding**: Large padding areas in ID3v2 tags

**Suggested test file**: `test/test-integration-edge-cases.js`

---

### 10. ID4/M4A Parser (LOW PRIORITY)

#### `lib/id4.js` Untested Paths
- **Line 74**: TODO comment mentions version 1 mdhd atoms not supported
- **Line 92**: Proprietary '----' atoms (currently ignored)
- Nested container atom traversal edge cases
- Unknown atom type handling

---

## Recommended Priority Order

1. **Error handling tests** - Most critical for production stability
2. **Browser adapter tests** - Zero coverage currently
3. **Windows-1252 decoder tests** - Important for encoding support
4. **VBR/CBR duration tests** - Common use case, complex logic
5. **Audio frame variations** - Important for format compatibility
6. **Common utility unit tests** - Foundation for other tests
7. **Edge case integration tests** - Robustness improvements

---

## Testing Infrastructure Suggestions

### 1. Add Code Coverage Tooling
Currently no coverage reporting is configured. Recommended setup:

```json
{
  "devDependencies": {
    "nyc": "^15.0.0"
  },
  "scripts": {
    "coverage": "nyc tape test/test-*.js",
    "coverage:report": "nyc report --reporter=html"
  }
}
```

### 2. Create Test Fixtures for Error Cases
Many error tests require malformed files. Create:
- `test/samples/malformed/` directory
- Truncated versions of valid files
- Files with invalid headers
- Files with corrupt data blocks

### 3. Add Mock/Stub Support for Browser Tests
For testing `browser.js`:
- Mock `window.Blob`, `window.File`, `window.FileList`
- Use `jsdom` or similar for browser environment simulation

---

## Summary Statistics

| Category | Tested | Untested | Coverage |
|----------|--------|----------|----------|
| Format Parsers | 7/7 | 0 | 100% (basic) |
| Error Paths | ~5 | ~20+ | ~20% |
| Utility Functions | 4/10 | 6 | ~40% |
| Browser Code | 0/5 | 5 | 0% |
| Edge Cases | ~10 | ~15 | ~40% |

**Overall Estimated Coverage**: ~60-65% of code paths

---

## Conclusion

While the library has good basic coverage for happy-path scenarios across all supported formats, there are significant gaps in:

1. Error handling and failure scenarios
2. Browser-specific code
3. Edge cases in parsing logic
4. Duration calculation paths
5. Less common audio formats and frame types

Addressing these gaps would significantly improve the library's robustness and reliability in production environments.
