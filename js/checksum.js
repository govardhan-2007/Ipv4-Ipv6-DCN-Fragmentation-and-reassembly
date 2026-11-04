/**
 * checksum.js
 * IPv4 header checksum (RFC 791 / RFC 1071) and small IP-address helpers.
 *
 * Pure logic: no DOM access, so it can be loaded in the browser (classic
 * <script>, attaches to window.VLab) and in Node (module.exports) for tests.
 */
(function (root) {
  'use strict';

  var CHECKSUM_OFFSET = 10; // Header checksum occupies bytes 10 and 11 of the IPv4 header.

  /**
   * Sum 16-bit big-endian words using one's-complement arithmetic
   * (carry bits are folded back into the low 16 bits).
   * If the byte count is odd, the last byte is padded with a zero byte.
   * @param {ArrayLike<number>} bytes
   * @returns {number} 16-bit one's-complement sum (not yet inverted)
   */
  function onesComplementSum(bytes) {
    var sum = 0;
    for (var i = 0; i < bytes.length; i += 2) {
      var high = bytes[i] & 0xff;
      var low = (i + 1 < bytes.length) ? (bytes[i + 1] & 0xff) : 0;
      sum += (high << 8) | low;
      // Fold the carry immediately so the sum never grows beyond 17 bits.
      sum = (sum & 0xffff) + (sum >>> 16);
    }
    // One more fold in case the last addition produced a carry.
    sum = (sum & 0xffff) + (sum >>> 16);
    return sum & 0xffff;
  }

  /**
   * Compute the IPv4 header checksum.
   * Checksum = ~(one's-complement sum of all 16-bit header words),
   * computed with the checksum field itself treated as zero.
   * The input array is NOT modified.
   * @param {ArrayLike<number>} headerBytes complete header (IHL * 4 bytes)
   * @returns {number} 16-bit checksum
   */
  function computeHeaderChecksum(headerBytes) {
    var copy = Array.prototype.slice.call(headerBytes);
    copy[CHECKSUM_OFFSET] = 0;
    copy[CHECKSUM_OFFSET + 1] = 0;
    return (~onesComplementSum(copy)) & 0xffff;
  }

  /**
   * Verify a received header. Summing every word INCLUDING the stored
   * checksum must give 0xFFFF for an uncorrupted header.
   * @param {ArrayLike<number>} headerBytes
   * @returns {boolean}
   */
  function verifyHeaderChecksum(headerBytes) {
    return onesComplementSum(headerBytes) === 0xffff;
  }

  /**
   * Write a checksum into bytes 10-11 of a header (returns a new array).
   * @param {ArrayLike<number>} headerBytes
   * @param {number} checksum 16-bit value
   * @returns {number[]}
   */
  function withChecksum(headerBytes, checksum) {
    var copy = Array.prototype.slice.call(headerBytes);
    copy[CHECKSUM_OFFSET] = (checksum >>> 8) & 0xff;
    copy[CHECKSUM_OFFSET + 1] = checksum & 0xff;
    return copy;
  }

  /**
   * Convert dotted-decimal IPv4 text to 4 bytes.
   * @param {string} ip e.g. "192.168.1.10"
   * @returns {number[]}
   * @throws {Error} if the address is not a valid IPv4 address
   */
  function ipToBytes(ip) {
    var parts = String(ip).split('.');
    if (parts.length !== 4) {
      throw new Error('Invalid IPv4 address: ' + ip);
    }
    return parts.map(function (p) {
      if (!/^\d{1,3}$/.test(p) || Number(p) > 255) {
        throw new Error('Invalid IPv4 address: ' + ip);
      }
      return Number(p);
    });
  }

  /**
   * Convert 4 bytes to dotted-decimal text.
   * @param {ArrayLike<number>} bytes
   * @returns {string}
   */
  function bytesToIp(bytes) {
    return [bytes[0], bytes[1], bytes[2], bytes[3]].join('.');
  }

  /**
   * Format a 16-bit value as "0xABCD".
   * @param {number} value
   * @returns {string}
   */
  function toHex16(value) {
    var hex = (value & 0xffff).toString(16).toUpperCase();
    return '0x' + ('0000' + hex).slice(-4);
  }

  var api = {
    CHECKSUM_OFFSET: CHECKSUM_OFFSET,
    onesComplementSum: onesComplementSum,
    computeHeaderChecksum: computeHeaderChecksum,
    verifyHeaderChecksum: verifyHeaderChecksum,
    withChecksum: withChecksum,
    ipToBytes: ipToBytes,
    bytesToIp: bytesToIp,
    toHex16: toHex16
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.VLab = root.VLab || {};
  root.VLab.Checksum = api;
})(typeof window !== 'undefined' ? window : globalThis);
