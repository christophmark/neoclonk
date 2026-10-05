// Legacy Planet logs contain Windows-1252; Emscripten's default UTF-8 decoder
// warns on umlauts. Decode only the console presentation boundary, never scripts.
(function () {
  function sink(error) {
    var bytes = [];
    return function (value) {
      if (value !== null && value !== 10 && value !== 0) { bytes.push(value); return; }
      if (!bytes.length) return;
      var data = Uint8Array.from(bytes), line;
      bytes.length = 0;
      try { line = new TextDecoder('utf-8', { fatal: true }).decode(data); }
      catch (_) { line = new TextDecoder('windows-1252').decode(data); }
      var print = error ? Module['printErr'] : Module['print'];
      if (print) print(line); else (error ? console.error : console.log)(line);
    };
  }
  Module['stdout'] = sink(false);
  Module['stderr'] = sink(true);
})();
