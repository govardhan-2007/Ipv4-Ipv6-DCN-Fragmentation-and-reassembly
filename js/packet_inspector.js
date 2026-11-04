/**
 * packet_inspector.js
 * Packet Header Inspector: lists every packet of the latest simulation and draws
 * the selected packet's IPv4 header as a 32-bit-wide diagram. Selecting a field
 * shows an explanation filled in with that packet's real values.
 *
 * Every value shown comes from the simulation result (fragmentation.js). The
 * checksum shown is the real one; its validity is re-checked here.
 *
 * Public API (window.VLab.Inspector):
 *   init()          wire up click handling (called once by app.js)
 *   load(result)    build the packet list for a Fragmentation.fragmentDatagram() result
 *   select(key)     select a packet: 'orig', 'p1', 'p2', ... or 'icmp'
 *   getSelected()   key of the selected packet
 *
 * Elements from index.html: #inspector-list, #header-diagram, #field-explain.
 */
(function (root) {
  'use strict';

  var Checksum = root.VLab.Checksum;

  var DEFAULT_FIELD = 'fragoff';
  var FRAGMENTATION_FIELDS = { identification: true, flags: true, fragoff: true };

  var result = null;
  var items = [];                 // [{key, label, sub, cls, kind, packet}]
  var selectedKey = null;
  var selectedField = DEFAULT_FIELD;
  var fieldMap = {};              // field id -> explain object for the drawn packet

  function $(id) { return document.getElementById(id); }

  function el(tag, props, children) {
    var node = document.createElement(tag);
    var p = props || {};
    if (p.className) node.className = p.className;
    if (p.text !== undefined) node.textContent = p.text;
    if (p.attrs) Object.keys(p.attrs).forEach(function (k) { node.setAttribute(k, p.attrs[k]); });
    (children || []).forEach(function (c) { node.appendChild(c); });
    return node;
  }

  function hex2(b) { return ('0' + (b & 0xff).toString(16).toUpperCase()).slice(-2); }
  function hexBytes(bytes) { return Array.prototype.map.call(bytes, hex2).join(' '); }
  function colorClass(index) { return 'fc-' + (((index - 1) % 8) + 8) % 8; }

  // ---------------------------------------------------------------------
  // Field definitions for an IPv4 packet
  // Each field: {id, name, span (of 32 columns), vals[], sub, frag, bad, explain{title,text,eq}}
  // ---------------------------------------------------------------------
  function ipv4Rows(pk, kind) {
    var p = result.params;
    var o = result.original;
    var isFragment = (pk.fragmentOffset > 0 || pk.mf === 1);
    var isOriginal = (kind === 'orig');
    var valid = Checksum.verifyHeaderChecksum(pk.headerBytes);
    var sum = Checksum.onesComplementSum(pk.headerBytes);
    var endOfDatagramPayload = pk.fragmentOffset * 8 + pk.payloadLength;

    var rows = [];

    rows.push([
      { id: 'version', name: 'Version', span: 4, vals: ['4'],
        explain: { title: 'Version (4 bits)', text: 'The IP version. 4 means IPv4.' } },
      { id: 'ihl', name: 'IHL', span: 4, vals: [String(pk.ihl)], sub: pk.headerLength + ' bytes',
        explain: { title: 'IHL: Internet Header Length (4 bits)',
          text: 'The header length in 32-bit words. The value ' + pk.ihl + ' means ' + pk.ihl + ' × 4 = ' + pk.headerLength + ' bytes. ' +
            (pk.headerLength > 20 ? 'Anything above 20 bytes means IP options are present. In this lab every option is assumed to be copied into every fragment, so all fragments keep the same header length.' :
              'A 20-byte header has no options.'),
          eq: 'header length = IHL × 4 = ' + pk.ihl + ' × 4 = ' + pk.headerLength + ' bytes' } },
      { id: 'tos', name: 'Type of Service', span: 8, vals: [String(pk.tos)],
        explain: { title: 'Type of Service (8 bits)', text: 'Marks the packet\'s priority / congestion handling. It is 0 in this lab and is copied unchanged into every fragment.' } },
      { id: 'totlen', name: 'Total Length', span: 16, vals: [String(pk.totalLength)], sub: 'bytes',
        explain: { title: 'Total Length (16 bits)',
          text: 'The size of this packet: header plus payload, in bytes. ' +
            (isFragment ? 'Each fragment has its own Total Length, and it can never exceed the MTU of ' + p.mtu + '.' :
              isOriginal ? 'This is the original datagram as the source sent it (maximum possible value 65,535).' : 'The packet was small enough for the MTU of ' + p.mtu + ', so it is unchanged.'),
          eq: 'total length = header + payload = ' + pk.headerLength + ' + ' + pk.payloadLength + ' = ' + pk.totalLength } }
    ]);

    rows.push([
      { id: 'identification', name: 'Identification', span: 16, vals: [String(pk.identification)],
        sub: '0x' + ('0000' + pk.identification.toString(16).toUpperCase()).slice(-4), frag: true,
        explain: { title: 'Identification (16 bits)',
          text: 'A number chosen by the source for this datagram. Every fragment copies the same value, so the destination can tell which fragments belong together. It groups fragments using source address, destination address, protocol and this Identification.',
          eq: 'all fragments carry Identification = ' + pk.identification } },
      { id: 'flags', name: 'Flags', span: 3, vals: ['DF ' + pk.df, 'MF ' + pk.mf], frag: true,
        explain: { title: 'Flags (3 bits: reserved, DF, MF)',
          text: 'The first bit is reserved and always 0. ' +
            (pk.df === 1 ? 'DF = 1: Don\'t Fragment. Routers must not fragment this packet; if it is larger than the next link\'s MTU it is dropped and ICMP Type 3, Code 4 comes back. ' :
              'DF = 0: fragmentation is permitted. ') +
            (pk.mf === 1 ? 'MF = 1: More Fragments. Further fragments of this datagram follow this one.' :
              (pk.fragmentOffset > 0 ? 'MF = 0 with a non-zero offset: this is the final fragment, so the destination now knows the datagram\'s total payload length: ' + endOfDatagramPayload + ' bytes.' :
                'MF = 0 and offset 0: this packet is not a fragment.')),
          eq: 'bits: reserved = 0, DF = ' + pk.df + ', MF = ' + pk.mf } },
      { id: 'fragoff', name: 'Fragment Offset', span: 13, vals: [String(pk.fragmentOffset)], sub: '× 8 = byte ' + pk.byteOffset, frag: true,
        explain: { title: 'Fragment Offset (13 bits)',
          text: (pk.byteOffset === 0 ?
            'Offset 0: this packet carries the first bytes of the original payload. ' :
            'This fragment\'s payload starts at byte ' + pk.byteOffset + ' of the original payload. The field counts in 8-byte units, so it stores ' + pk.byteOffset + ' / 8 = ' + pk.fragmentOffset + '. ') +
            'It holds payload bytes ' + pk.payloadStart + ' to ' + pk.payloadEnd + '. Because units are 8 bytes, every fragment except the last must carry a multiple of 8 payload bytes.',
          eq: 'offset field = byte position / 8 = ' + pk.byteOffset + ' / 8 = ' + pk.fragmentOffset } }
    ]);

    var ttlText;
    if (isOriginal) ttlText = 'Set by the source to ' + pk.ttl + '. Each router subtracts 1.';
    else ttlText = 'The router decremented the source\'s TTL of ' + o.ttl + ' by 1, giving ' + pk.ttl + '. Changing a header field means the router must recompute the header checksum.';
    rows.push([
      { id: 'ttl', name: 'Time To Live', span: 8, vals: [String(pk.ttl)],
        explain: { title: 'Time To Live (8 bits)', text: ttlText + ' All fragments of one datagram carry the same TTL.' } },
      { id: 'protocol', name: 'Protocol', span: 8, vals: [String(pk.protocol)], sub: pk.protocolName,
        explain: { title: 'Protocol (8 bits)', text: 'Identifies the payload type: ' + pk.protocolName + ' (' + pk.protocol + '). The destination also uses it when grouping fragments.' } },
      { id: 'checksum', name: 'Header Checksum', span: 16, vals: ['0x' + ('0000' + pk.headerChecksum.toString(16).toUpperCase()).slice(-4)],
        sub: valid ? 'verifies correctly' : 'INVALID', bad: !valid,
        explain: { title: 'Header Checksum (16 bits)',
          text: 'Computed over this packet\'s header only, as the one\'s-complement of the one\'s-complement sum of all 16-bit header words, with this field set to zero. It is recomputed for every fragment because the length, offset and flag fields differ. Check: adding all header words including the checksum gives 0x' +
            sum.toString(16).toUpperCase() + (valid ? ', which means the header is valid.' : ', which is not 0xFFFF, so the header is corrupt.'),
          eq: 'sum of all 16-bit words (checksum included) = 0x' + sum.toString(16).toUpperCase() } }
    ]);

    rows.push([{ id: 'src', name: 'Source IP Address', span: 32, vals: [pk.sourceIp],
      explain: { title: 'Source IP Address (32 bits)', text: 'The sending host. It is identical in every fragment.' } }]);
    rows.push([{ id: 'dst', name: 'Destination IP Address', span: 32, vals: [pk.destinationIp],
      explain: { title: 'Destination IP Address (32 bits)', text: 'The receiving host, which is the only device that reassembles the fragments. It is identical in every fragment.' } }]);

    for (var i = 20; i < pk.headerLength; i += 4) {
      rows.push([{ id: 'options' + i, name: 'Options', span: 32, vals: [hexBytes(pk.headerBytes.slice(i, i + 4))],
        sub: (i + 4 >= pk.headerLength) ? 'NOP padding, then end of list' : 'NOP padding',
        explain: { title: 'Options (bytes ' + i + ' to ' + (i + 3) + ')',
          text: 'Option bytes shown in hex (01 = No Operation padding, 00 = End of Option List). Real IPv4 copies only options marked "copied" into every fragment. This lab assumes all options are copied, so every fragment has the same header length.' } }]);
    }

    rows.push([{ id: 'payload', name: 'Payload', span: 32,
      vals: [pk.payloadLength + ' bytes'],
      sub: 'original payload bytes ' + pk.payloadStart + ' to ' + pk.payloadEnd,
      explain: { title: 'Payload',
        text: 'This packet carries ' + pk.payloadLength + ' payload bytes: bytes ' + pk.payloadStart + ' to ' + pk.payloadEnd + ' of the original ' + result.originalPayloadSize + '-byte payload.' +
          (isOriginal ? '' : ' The payload of the whole datagram is the concatenation of all fragments in offset order (never arrival order).'),
        eq: 'payload = total length - header = ' + pk.totalLength + ' - ' + pk.headerLength + ' = ' + pk.payloadLength } }]);

    return rows;
  }

  function icmpRows(icmp) {
    var cs = '0x' + ('0000' + icmp.checksum.toString(16).toUpperCase()).slice(-4);
    return [
      [
        { id: 'icmp-type', name: 'Type', span: 8, vals: [String(icmp.type)], sub: 'Destination Unreachable',
          explain: { title: 'ICMP Type 3', text: 'Destination Unreachable. The router tells the sender that the packet could not be delivered.' } },
        { id: 'icmp-code', name: 'Code', span: 8, vals: [String(icmp.code)], sub: 'Fragmentation Needed',
          explain: { title: 'ICMP Code 4', text: 'Fragmentation Needed and DF set: the packet was larger than the next link\'s MTU but its DF flag forbade fragmenting it, so the router dropped it.' } },
        { id: 'icmp-checksum', name: 'ICMP Checksum', span: 16, vals: [cs],
          explain: { title: 'ICMP Checksum', text: 'One\'s-complement checksum over the whole ICMP message, computed the same way as the IP header checksum.' } }
      ],
      [
        { id: 'icmp-unused', name: 'Unused', span: 16, vals: ['0'],
          explain: { title: 'Unused', text: 'Reserved, set to zero.' } },
        { id: 'icmp-mtu', name: 'Next-Hop MTU', span: 16, vals: [String(icmp.nextHopMtu)], sub: 'bytes',
          explain: { title: 'Next-Hop MTU (16 bits)', text: 'The MTU of the link that rejected the packet. The sender should resend with a total size of at most ' + icmp.nextHopMtu + ' bytes. This is the basis of Path MTU Discovery.',
            eq: 'new datagram size <= ' + icmp.nextHopMtu + ' bytes' } }
      ],
      [
        { id: 'icmp-quote', name: 'Quoted data', span: 32, vals: [icmp.quotedBytes + ' bytes'], sub: 'original IP header + first 8 payload bytes',
          explain: { title: 'Quoted data', text: 'The router quotes the dropped packet\'s IP header and first 8 payload bytes so the sender can tell which of its packets was rejected.' } }
      ]
    ];
  }

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------
  function renderDiagram(rows, rawBytes, title) {
    var box = $('header-diagram');
    box.textContent = '';
    fieldMap = {};

    var wrap = el('div', { className: 'ipv4-hdr' });
    var inner = el('div', { className: 'hdr-inner' });
    var ruler = el('div', { className: 'bit-ruler', attrs: { 'aria-hidden': 'true' } });
    for (var i = 0; i < 32; i++) ruler.appendChild(el('span', { text: (i % 8 === 0 || i === 31) ? String(i) : '' }));
    inner.appendChild(ruler);

    rows.forEach(function (row) {
      var rowEl = el('div', { className: 'hdr-row' });
      row.forEach(function (f) {
        fieldMap[f.id] = f.explain;
        var btn = el('button', {
          className: 'hf' + (f.frag ? ' frag' : '') + (f.bad ? ' bad' : ''),
          attrs: { type: 'button', 'data-field': f.id, title: f.name }
        });
        btn.style.gridColumn = 'span ' + f.span;
        btn.appendChild(el('span', { className: 'name', text: f.name }));
        f.vals.forEach(function (v) { btn.appendChild(el('span', { className: 'val', text: v })); });
        if (f.sub) btn.appendChild(el('span', { className: 'name', text: f.sub }));
        rowEl.appendChild(btn);
      });
      inner.appendChild(rowEl);
    });
    wrap.appendChild(inner);
    box.appendChild(el('h2', { text: title }));
    box.appendChild(wrap);
    box.appendChild(el('p', { className: 'hint', text: 'Purple fields are the ones fragmentation uses: Identification, Flags (DF, MF) and Fragment Offset. Bits are numbered 0 to 31 across.' }));
    box.appendChild(el('p', { className: 'eq', text: 'Raw bytes (hex): ' + hexBytes(rawBytes) }));
    showField(fieldMap[selectedField] ? selectedField : (fieldMap[DEFAULT_FIELD] ? DEFAULT_FIELD : firstField()));
  }

  function firstField() { return Object.keys(fieldMap)[0]; }

  function showField(id) {
    var ex = fieldMap[id];
    var panel = $('field-explain');
    if (!ex) return;
    selectedField = id;
    Array.prototype.forEach.call(document.querySelectorAll('#header-diagram .hf'), function (b) {
      b.classList.toggle('selected', b.getAttribute('data-field') === id);
    });
    panel.textContent = '';
    panel.appendChild(el('h2', { text: ex.title }));
    panel.appendChild(el('p', { text: ex.text }));
    if (ex.eq) panel.appendChild(el('p', { className: 'eq', text: ex.eq }));
    if (FRAGMENTATION_FIELDS[id]) {
      panel.appendChild(el('p', { className: 'hint', text: 'This is a fragmentation field: compare it across the fragments in the list to see how it changes.' }));
    }
  }

  function renderList() {
    var list = $('inspector-list');
    list.textContent = '';
    items.forEach(function (it) {
      var btn = el('button', {
        className: 'insp-item ' + it.cls,
        attrs: { type: 'button', role: 'option', 'data-key': it.key, 'aria-selected': 'false' }
      });
      btn.appendChild(document.createTextNode(it.label));
      btn.appendChild(el('small', { text: it.sub }));
      list.appendChild(btn);
    });
  }

  function select(key) {
    var item = items.filter(function (i) { return i.key === key; })[0];
    if (!item) return;
    selectedKey = key;
    Array.prototype.forEach.call(document.querySelectorAll('#inspector-list .insp-item'), function (b) {
      var on = b.getAttribute('data-key') === key;
      b.classList.toggle('selected', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (item.kind === 'icmp') {
      renderDiagram(icmpRows(result.icmp), result.icmp.bytes.slice(0, 8), 'ICMP message: Destination Unreachable, Fragmentation Needed');
    } else {
      var title = item.label + ': IPv4 header (' + item.packet.headerLength + ' bytes)';
      renderDiagram(ipv4Rows(item.packet, item.kind), item.packet.headerBytes, title);
    }
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------
  function load(res) {
    result = res;
    items = [];
    if (!res || res.status === 'invalid') {
      renderList();
      $('header-diagram').textContent = '';
      return;
    }
    items.push({ key: 'orig', kind: 'orig', packet: res.original, cls: '',
      label: 'Original datagram', sub: 'size ' + res.original.totalLength + ', TTL ' + res.original.ttl + ', DF ' + res.original.df });

    if (res.status === 'fragmented') {
      res.fragments.forEach(function (f) {
        items.push({ key: 'p' + f.index, kind: 'frag', packet: f, cls: colorClass(f.index),
          label: 'Fragment ' + f.index, sub: 'offset ' + f.fragmentOffset + ', MF ' + f.mf + ', ' + f.totalLength + ' B' });
      });
    } else if (res.status === 'no-fragmentation') {
      var fw = res.packets[0];
      items.push({ key: 'p1', kind: 'fwd', packet: fw, cls: '',
        label: 'Forwarded packet', sub: 'size ' + fw.totalLength + ', TTL ' + fw.ttl });
    } else if (res.status === 'dropped-df') {
      items.push({ key: 'icmp', kind: 'icmp', packet: null, cls: 'fc-3',
        label: 'ICMP message', sub: 'Type 3, Code 4, Next-Hop MTU ' + res.icmp.nextHopMtu });
    }
    renderList();
    select(items.length > 1 ? items[1].key : items[0].key);
  }

  function init() {
    $('inspector-list').addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-key]') : null;
      if (btn) select(btn.getAttribute('data-key'));
    });
    $('header-diagram').addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-field]') : null;
      if (btn) showField(btn.getAttribute('data-field'));
    });
  }

  root.VLab = root.VLab || {};
  root.VLab.Inspector = {
    init: init,
    load: load,
    select: select,
    getSelected: function () { return selectedKey; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
